import { DRUM_IDS, type DrumId, type Pattern } from '../../core/pattern/types'
import { absoluteStepTime, patternDuration, positionAtTime, stepsPerPattern } from '../../core/timing/musicTime'
import type {
  AudioEngine,
  DrumKit,
  EngineDiagnostics,
  EngineSnapshot,
  EngineStatus,
  PlaybackPosition,
  PlaybackRequest,
  TrackMix,
} from '../types'

const LOOK_AHEAD_SECONDS = 0.12
const POLL_INTERVAL_MS = 25
const START_DELAY_SECONDS = 0.08

const defaultMix = (): TrackMix => ({ muted: false, solo: false, focused: false, volume: 0.82 })

export class WebAudioEngine implements AudioEngine {
  private context?: AudioContext
  private master?: GainNode
  private buffers = new Map<DrumId, AudioBuffer>()
  private gains = new Map<DrumId, GainNode>()
  private mixes = new Map<DrumId, TrackMix>(DRUM_IDS.map((drum) => [drum, defaultMix()]))
  private activeSources = new Set<AudioBufferSourceNode>()
  private openHatSources = new Set<AudioBufferSourceNode>()
  private listeners = new Set<() => void>()
  private timer?: number
  private request?: PlaybackRequest
  private pendingRequest?: Omit<PlaybackRequest, 'countIn'>
  private status: EngineStatus = 'idle'
  private error?: string
  private musicStartedAt = 0
  private countInStartedAt = 0
  private nextAbsoluteStep = 0
  private pausedMusicOffset = 0
  private diagnostics: EngineDiagnostics = this.emptyDiagnostics()

  async prepare(kit: DrumKit) {
    if (this.status === 'ready' || this.status === 'playing' || this.status === 'paused') return
    if (this.context && this.context.state !== 'closed' && this.buffers.size === DRUM_IDS.length) {
      await this.context.resume()
      this.setStatus('ready')
      return
    }
    this.setStatus('loading')
    this.error = undefined
    try {
      this.context ??= new AudioContext({ latencyHint: 'interactive' })
      await this.context.resume()
      this.master ??= this.context.createGain()
      this.master.gain.value = 0.92
      this.master.connect(this.context.destination)

      const entries = await Promise.all(DRUM_IDS.map(async (drum) => {
        const response = await fetch(kit[drum], { cache: 'force-cache' })
        if (!response.ok) throw new Error(`${drum} 加载失败（HTTP ${response.status}）`)
        const buffer = await this.context!.decodeAudioData(await response.arrayBuffer())
        return [drum, buffer] as const
      }))
      this.buffers = new Map(entries)
      for (const drum of DRUM_IDS) {
        const gain = this.context.createGain()
        gain.connect(this.master)
        this.gains.set(drum, gain)
      }
      this.applyMix()
      this.setStatus('ready')
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : '音频素材无法加载'
      this.setStatus('error')
      throw cause
    }
  }

  async start(request: PlaybackRequest) {
    if (!this.context || this.buffers.size !== DRUM_IDS.length) throw new Error('鼓组尚未准备完成')
    await this.context.resume()
    if (this.status === 'playing') return
    const wasPaused = this.status === 'paused'
    const activeRequest = wasPaused && this.request
      ? { ...request, countIn: this.request.countIn }
      : request
    this.request = activeRequest
    this.pendingRequest = undefined
    this.cancelSchedule()
    const now = this.context.currentTime
    const countInSteps = activeRequest.countIn ? activeRequest.pattern.beatsPerBar * activeRequest.pattern.subdivision : 0
    const stepSeconds = 60 / activeRequest.bpm / activeRequest.pattern.subdivision

    if (wasPaused) {
      this.musicStartedAt = now + START_DELAY_SECONDS - this.pausedMusicOffset
      this.countInStartedAt = this.musicStartedAt - countInSteps * stepSeconds
      this.nextAbsoluteStep = Math.ceil(this.pausedMusicOffset / stepSeconds)
    } else {
      this.countInStartedAt = now + START_DELAY_SECONDS
      this.musicStartedAt = this.countInStartedAt + countInSteps * stepSeconds
      this.nextAbsoluteStep = -countInSteps
      this.pausedMusicOffset = 0
      this.diagnostics = this.emptyDiagnostics()
    }
    this.setStatus('playing')
    this.schedule()
    this.timer = window.setInterval(() => this.schedule(), POLL_INTERVAL_MS)
  }

  pause() {
    if (this.status !== 'playing' || !this.context || !this.request) return
    const offset = this.context.currentTime - this.musicStartedAt
    this.pausedMusicOffset = offset < 0
      ? offset
      : offset % patternDuration(this.request.pattern, this.request.bpm)
    this.cancelSchedule()
    this.setStatus('paused')
  }

  stop() {
    this.cancelSchedule()
    this.pausedMusicOffset = 0
    this.nextAbsoluteStep = 0
    this.pendingRequest = undefined
    this.setStatus('stopped')
  }

  update(request: Omit<PlaybackRequest, 'countIn'>) {
    if (!this.request) return
    if (this.status !== 'playing') {
      this.request = { ...request, countIn: false }
      this.emit()
      return
    }
    this.pendingRequest = request
  }

  setTrackMix(drum: DrumId, mix: TrackMix) {
    this.mixes.set(drum, { ...mix, volume: Math.min(1, Math.max(0, mix.volume)) })
    this.applyMix()
    this.emit()
  }

  getPosition(): PlaybackPosition {
    if (!this.context || !this.request || ['idle', 'loading', 'ready', 'stopped', 'error'].includes(this.status)) {
      return { status: this.status, step: 0, cycle: 0, progress: 0, isCountIn: false, elapsed: 0 }
    }
    if (this.status === 'paused') {
      if (this.pausedMusicOffset < 0) {
        const countInDuration = this.musicStartedAt - this.countInStartedAt
        const progress = countInDuration
          ? Math.min(1, Math.max(0, (countInDuration + this.pausedMusicOffset) / countInDuration))
          : 0
        return {
          status: this.status,
          step: Math.floor(progress * this.request.pattern.beatsPerBar * this.request.pattern.subdivision),
          cycle: 0,
          progress,
          isCountIn: true,
          elapsed: 0,
        }
      }
      const position = positionAtTime(this.request.pattern, this.request.bpm, 0, this.pausedMusicOffset)
      return { status: this.status, ...position, isCountIn: false }
    }
    const now = this.context.currentTime
    if (now < this.musicStartedAt) {
      const countInDuration = this.musicStartedAt - this.countInStartedAt
      const progress = countInDuration ? Math.max(0, now - this.countInStartedAt) / countInDuration : 0
      const step = Math.max(0, Math.floor(progress * this.request.pattern.beatsPerBar * this.request.pattern.subdivision))
      return { status: this.status, step, cycle: 0, progress, isCountIn: true, elapsed: 0 }
    }
    return { status: this.status, ...positionAtTime(this.request.pattern, this.request.bpm, this.musicStartedAt, now), isCountIn: false }
  }

  getSnapshot(): EngineSnapshot {
    return { ...this.getPosition(), error: this.error, diagnostics: { ...this.diagnostics } }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose() {
    this.cancelSchedule()
    if (this.context?.state !== 'closed') void this.context?.close()
    this.listeners.clear()
  }

  private schedule() {
    const context = this.context
    let request = this.request
    if (!context || !request || this.status !== 'playing') return
    const horizon = context.currentTime + LOOK_AHEAD_SECONDS
    let patternSteps = stepsPerPattern(request.pattern)

    // A throttled timer must never replay every event it missed. Keep the
    // transport on the absolute AudioContext timeline and resume from the
    // first step that can still be scheduled in the future.
    const firstSchedulableStep = Math.ceil(
      (context.currentTime - this.musicStartedAt) /
      (60 / request.bpm / request.pattern.subdivision),
    )
    if (firstSchedulableStep > this.nextAbsoluteStep) {
      this.diagnostics.skippedSteps += firstSchedulableStep - this.nextAbsoluteStep
      this.nextAbsoluteStep = firstSchedulableStep
    }

    while (true) {
      const time = absoluteStepTime(this.musicStartedAt, this.nextAbsoluteStep, request.bpm, request.pattern.subdivision)
      if (time >= horizon) break

      if (this.nextAbsoluteStep < 0) {
        if (this.nextAbsoluteStep % request.pattern.subdivision === 0) this.play('closedHat', 72, time)
      } else {
        const step = this.nextAbsoluteStep % patternSteps
        if (step === 0 && this.nextAbsoluteStep > 0 && this.pendingRequest) {
          const boundaryTime = time
          request = { ...this.pendingRequest, countIn: false }
          this.request = request
          this.pendingRequest = undefined
          this.musicStartedAt = boundaryTime
          this.nextAbsoluteStep = 0
          patternSteps = stepsPerPattern(request.pattern)
          this.cancelScheduledSources(boundaryTime)
        }
        this.schedulePatternStep(request.pattern, step, time)
      }
      this.nextAbsoluteStep += 1
    }
  }

  private schedulePatternStep(pattern: Pattern, step: number, time: number) {
    for (const track of pattern.tracks) {
      const hit = track.hits.find((candidate) => candidate.step === step)
      if (hit && hit.velocity > 0) this.play(track.drum, hit.velocity, time)
    }
  }

  private play(drum: DrumId, velocity: number, time: number) {
    const context = this.context
    const buffer = this.buffers.get(drum)
    const trackGain = this.gains.get(drum)
    if (!context || !buffer || !trackGain) return

    if (drum === 'closedHat') {
      for (const source of this.openHatSources) {
        try { source.stop(time) } catch { /* source already ended */ }
      }
      this.openHatSources.clear()
    }
    const source = context.createBufferSource()
    const velocityGain = context.createGain()
    velocityGain.gain.value = velocity / 100
    source.buffer = buffer
    source.connect(velocityGain).connect(trackGain)
    source.onended = () => {
      this.activeSources.delete(source)
      this.openHatSources.delete(source)
      source.disconnect()
      velocityGain.disconnect()
    }
    this.activeSources.add(source)
    if (drum === 'openHat') this.openHatSources.add(source)
    const leadMs = Math.max(0, (time - context.currentTime) * 1_000)
    this.diagnostics.scheduledHits += 1
    this.diagnostics.minScheduleLeadMs = this.diagnostics.minScheduleLeadMs === null
      ? leadMs
      : Math.min(this.diagnostics.minScheduleLeadMs, leadMs)
    this.diagnostics.maxScheduleLeadMs = this.diagnostics.maxScheduleLeadMs === null
      ? leadMs
      : Math.max(this.diagnostics.maxScheduleLeadMs, leadMs)
    source.start(time)
  }

  private applyMix() {
    if (!this.context) return
    const values = [...this.mixes.values()]
    const hasSolo = values.some(({ solo }) => solo)
    const hasFocus = values.some(({ focused }) => focused)
    for (const [drum, mix] of this.mixes) {
      const audible = !mix.muted && (!hasSolo || mix.solo)
      const focusScale = hasFocus && !mix.focused ? 0.18 : 1
      const target = audible ? mix.volume * focusScale : 0
      this.gains.get(drum)?.gain.setTargetAtTime(target, this.context.currentTime, 0.012)
    }
  }

  private cancelSchedule() {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = undefined
    this.cancelScheduledSources(this.context?.currentTime ?? 0)
  }

  private cancelScheduledSources(time: number) {
    for (const source of this.activeSources) {
      try { source.stop(time) } catch { /* source already ended */ }
    }
    this.activeSources.clear()
    this.openHatSources.clear()
  }

  private setStatus(status: EngineStatus) {
    this.status = status
    this.emit()
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }

  private emptyDiagnostics(): EngineDiagnostics {
    return {
      scheduledHits: 0,
      skippedSteps: 0,
      minScheduleLeadMs: null,
      maxScheduleLeadMs: null,
    }
  }
}
