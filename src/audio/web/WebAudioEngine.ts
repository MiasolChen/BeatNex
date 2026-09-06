import { DRUM_IDS, type DrumId, type Pattern } from '../../core/pattern/types'
import { absoluteStepTime, patternDuration, positionAtTime, stepsPerPattern, stepsPerBar } from '../../core/timing/musicTime'
import type {
  AudioEngine,
  DrumKit,
  EngineDiagnostics,
  EngineSnapshot,
  EngineStatus,
  PlaybackPosition,
  PlaybackRequest,
  TrackMix,
  TrainingMix,
  TrainingProgram,
} from '../types'

const LOOK_AHEAD_SECONDS = 0.12
const POLL_INTERVAL_MS = 25
const START_DELAY_SECONDS = 0.08

const defaultMix = (): TrackMix => ({ muted: false, solo: false, focused: false, volume: 0.82 })
type PreviousTimeline = {
  request: PlaybackRequest
  musicStartedAt: number
  cycleOffset: number
  elapsedOffset: number
  resumeAt: number
  endingAt?: number
  until: number
}

export class WebAudioEngine implements AudioEngine {
  private context?: AudioContext
  private master?: GainNode
  private buffers = new Map<DrumId, AudioBuffer>()
  private gains = new Map<DrumId, GainNode>()
  private mixes = new Map<DrumId, TrackMix>(DRUM_IDS.map((drum) => [drum, defaultMix()]))
  private trainingMix?: TrainingMix
  private pendingTrainingMix?: TrainingMix
  private hasPendingTrainingMix = false
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
  private cycleOffset = 0
  private pausedMusicOffset = 0
  private program?: TrainingProgram
  private endingAt?: number
  private elapsedOffset = 0
  private resumeAt = 0
  private startGeneration = 0
  private graphGeneration = 0
  private preparation?: Promise<void>
  private previousTimeline?: PreviousTimeline
  private diagnostics: EngineDiagnostics = this.emptyDiagnostics()

  prepare(kit: DrumKit): Promise<void> {
    if (this.preparation) return this.preparation
    const generation = this.graphGeneration
    const pending = this.prepareGraph(kit, generation).finally(() => {
      if (this.preparation === pending) this.preparation = undefined
    })
    this.preparation = pending
    return pending
  }

  private async prepareGraph(kit: DrumKit, generation: number) {
    if (this.context?.state === 'closed') this.resetAudioGraph()
    if (this.status === 'ready' || this.status === 'playing' || this.status === 'paused') return
    if (this.context && this.context.state !== 'closed' && this.buffers.size === DRUM_IDS.length) {
      // A cached graph needs no second resume here. start() owns resume errors,
      // cancellation and paused-position preservation for every playback request.
      this.error = undefined
      this.setStatus('ready')
      return
    }
    this.error = undefined
    this.setStatus('loading')
    try {
      this.context ??= new AudioContext({ latencyHint: 'interactive' })
      const context = this.context
      context.onstatechange = () => {
        if (context !== this.context || this.status !== 'playing' || context.state === 'running') return
        this.error = '声音已中断，点击继续播放'
        this.pause()
      }
      await context.resume()
      if (generation !== this.graphGeneration || context !== this.context) return
      this.master ??= context.createGain()
      this.master.gain.value = 0.92
      this.master.connect(context.destination)

      const entries = await Promise.all(DRUM_IDS.map(async (drum) => {
        const response = await fetch(kit[drum], { cache: 'force-cache' })
        if (!response.ok) throw new Error(`${drum} 加载失败（HTTP ${response.status}）`)
        const buffer = await context.decodeAudioData(await response.arrayBuffer())
        return [drum, buffer] as const
      }))
      if (generation !== this.graphGeneration || context !== this.context) return
      this.buffers = new Map(entries)
      for (const drum of DRUM_IDS) {
        const gain = context.createGain()
        gain.connect(this.master)
        this.gains.set(drum, gain)
      }
      this.applyMix()
      this.setStatus('ready')
    } catch (cause) {
      if (generation !== this.graphGeneration) return
      this.error = cause instanceof Error ? cause.message : '音频素材无法加载'
      this.setStatus('error')
      throw cause
    }
  }

  async start(request: PlaybackRequest) {
    if (!this.context || this.buffers.size !== DRUM_IDS.length) throw new Error('鼓组尚未准备完成')
    const context = this.context
    const generation = ++this.startGeneration
    try {
      await context.resume()
      if (generation !== this.startGeneration || context !== this.context) return
      if (context.state !== 'running') throw new Error('声音未能开启，请再次点击播放')
    } catch (cause) {
      if (generation !== this.startGeneration || context !== this.context) return
      this.error = cause instanceof Error ? cause.message : '声音未能开启，请再次点击播放'
      this.setStatus(this.status === 'paused' ? 'paused' : 'error')
      throw cause
    }
    if (generation !== this.startGeneration || context !== this.context) return
    if (this.status === 'playing') return
    this.error = undefined
    const wasPaused = this.status === 'paused'
    if (wasPaused && this.request && this.request.bpm !== request.bpm) {
      const previousOffset = this.pausedMusicOffset
      this.pausedMusicOffset *= this.request.bpm / request.bpm
      this.elapsedOffset += Math.max(0, previousOffset) - Math.max(0, this.pausedMusicOffset)
    }
    const activeRequest = wasPaused && this.request
      ? { ...request, countIn: this.request.countIn }
      : request
    this.request = activeRequest
    this.previousTimeline = undefined
    this.pendingRequest = undefined
    this.cancelSchedule()
    const now = this.context.currentTime
    const countInSteps = activeRequest.countIn ? stepsPerBar(activeRequest.pattern) : 0
    const stepSeconds = 60 / activeRequest.bpm / activeRequest.pattern.subdivision

    if (wasPaused) {
      this.resumeAt = now + START_DELAY_SECONDS
      this.musicStartedAt = now + START_DELAY_SECONDS - this.pausedMusicOffset
      this.countInStartedAt = this.musicStartedAt - countInSteps * stepSeconds
      this.nextAbsoluteStep = Math.ceil(this.pausedMusicOffset / stepSeconds)
    } else {
      this.resumeAt = 0
      this.countInStartedAt = now + START_DELAY_SECONDS
      this.musicStartedAt = this.countInStartedAt + countInSteps * stepSeconds
      this.nextAbsoluteStep = -countInSteps
      this.cycleOffset = 0
      this.pausedMusicOffset = 0
      this.elapsedOffset = 0
      this.endingAt = undefined
      this.diagnostics = this.emptyDiagnostics()
    }
    this.updateEndingTime()
    if (this.program?.length) {
      const cycle = this.cycleOffset + Math.floor(Math.max(0, this.pausedMusicOffset) / patternDuration(activeRequest.pattern, activeRequest.bpm))
      this.trainingMix = this.phaseAtCycle(cycle)?.mix
      this.applyMix()
    }
    this.setStatus('playing')
    this.schedule()
    if (this.getPosition().status === 'playing') this.timer = window.setInterval(() => this.schedule(), POLL_INTERVAL_MS)
  }

  pause() {
    this.startGeneration += 1
    if (this.status !== 'playing' || !this.context || !this.request) return
    const previous = this.previousTimeline
    if (previous && this.context.currentTime < previous.until) {
      this.request = previous.request
      this.musicStartedAt = previous.musicStartedAt
      this.cycleOffset = previous.cycleOffset
      this.elapsedOffset = previous.elapsedOffset
      this.resumeAt = previous.resumeAt
      this.endingAt = previous.endingAt
    }
    this.previousTimeline = undefined
    this.pendingRequest = undefined
    const offset = Math.min(Math.max(this.context.currentTime, this.resumeAt), this.endingAt ?? Infinity) - this.musicStartedAt
    this.pausedMusicOffset = offset
    this.cancelSchedule()
    this.setStatus('paused')
  }

  stop() {
    this.startGeneration += 1
    this.cancelSchedule()
    this.pausedMusicOffset = 0
    this.elapsedOffset = 0
    this.endingAt = undefined
    this.nextAbsoluteStep = 0
    this.cycleOffset = 0
    this.pendingRequest = undefined
    this.previousTimeline = undefined
    this.error = undefined
    this.setStatus('stopped')
  }

  setProgram(program?: TrainingProgram) {
    this.program = program
    if (program?.length) this.setTrainingMix(this.phaseAtCycle(this.getPosition().cycle)?.mix ?? program[0].mix)
    else this.setTrainingMix(undefined)
    this.updateEndingTime()
  }

  update(request: Omit<PlaybackRequest, 'countIn'>) {
    if (!this.request) return
    if (this.status !== 'playing') {
      if (this.status === 'paused') {
        const previousOffset = this.pausedMusicOffset
        this.pausedMusicOffset *= this.request.bpm / request.bpm
        this.elapsedOffset += Math.max(0, previousOffset) - Math.max(0, this.pausedMusicOffset)
      }
      this.request = { ...request, countIn: false }
      this.updateEndingTime()
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

  setTrainingMix(mix?: TrainingMix, timing: 'immediate' | 'next-bar' = 'immediate') {
    if (timing === 'next-bar' && this.status === 'playing') {
      this.pendingTrainingMix = mix
      this.hasPendingTrainingMix = true
      return
    }
    this.trainingMix = mix
    this.pendingTrainingMix = undefined
    this.hasPendingTrainingMix = false
    this.applyMix()
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
          step: Math.floor(progress * stepsPerBar(this.request.pattern)),
          cycle: 0,
          progress,
          isCountIn: true,
          elapsed: 0,
        }
      }
      const position = positionAtTime(this.request.pattern, this.request.bpm, 0, this.pausedMusicOffset)
      return { status: this.status, ...position, cycle: position.cycle + this.cycleOffset, elapsed: position.elapsed + this.elapsedOffset, isCountIn: false }
    }
    // Scheduling can commit the next bar's audio up to 120 ms early. The UI and
    // recording clock continue reading the old timeline until that audio starts.
    const previous = this.previousTimeline
    if (previous && this.context.currentTime < previous.until) {
      const now = Math.min(Math.max(this.context.currentTime, previous.resumeAt), previous.endingAt ?? Infinity)
      const position = positionAtTime(previous.request.pattern, previous.request.bpm, previous.musicStartedAt, now)
      return { status: this.status, ...position, cycle: position.cycle + previous.cycleOffset, elapsed: position.elapsed + previous.elapsedOffset, isCountIn: false }
    }
    const now = Math.min(Math.max(this.context.currentTime, this.resumeAt), this.endingAt ?? Infinity)
    if (now < this.musicStartedAt) {
      const countInDuration = this.musicStartedAt - this.countInStartedAt
      const progress = countInDuration ? Math.max(0, now - this.countInStartedAt) / countInDuration : 0
      const step = Math.max(0, Math.floor(progress * stepsPerBar(this.request.pattern)))
      return { status: this.status, step, cycle: 0, progress, isCountIn: true, elapsed: 0 }
    }
    const position = positionAtTime(this.request.pattern, this.request.bpm, this.musicStartedAt, now)
    return { status: this.status, ...position, cycle: position.cycle + this.cycleOffset, elapsed: position.elapsed + this.elapsedOffset, isCountIn: false }
  }

  getSnapshot(): EngineSnapshot {
    return { ...this.getPosition(), error: this.error, diagnostics: { ...this.diagnostics } }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose() {
    this.startGeneration += 1
    this.graphGeneration += 1
    this.preparation = undefined
    this.cancelSchedule()
    const context = this.context
    if (context) context.onstatechange = null
    this.resetAudioGraph()
    if (context?.state !== 'closed') void context?.close().catch(() => {})
    this.listeners.clear()
  }

  private schedule() {
    const context = this.context
    let request = this.request
    if (!context || !request || this.status !== 'playing') return
    if (this.previousTimeline && context.currentTime >= this.previousTimeline.until) this.previousTimeline = undefined
    if (this.endingAt !== undefined && context.currentTime >= this.endingAt) {
      this.pausedMusicOffset = this.endingAt - this.musicStartedAt
      this.cancelSchedule()
      this.setStatus('paused')
      return
    }
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
      if (this.program?.length && this.nextAbsoluteStep >= 0) {
        const cycle = this.cycleOffset + Math.floor(this.nextAbsoluteStep / patternSteps)
        const phase = this.phaseAtCycle(cycle)
        if (!phase) break
        if (this.nextAbsoluteStep % patternSteps === 0) this.applyMix(time)
      }

      if (this.nextAbsoluteStep < 0) {
        if (this.nextAbsoluteStep % request.pattern.subdivision === 0) this.play('closedHat', 72, time)
      } else {
        const step = this.nextAbsoluteStep % patternSteps
        const isBarBoundary = step === 0 && this.nextAbsoluteStep > 0
        if (isBarBoundary && this.pendingRequest) {
          const boundaryTime = time
          if (boundaryTime > context.currentTime) {
            this.previousTimeline = {
              request, musicStartedAt: this.musicStartedAt, cycleOffset: this.cycleOffset,
              elapsedOffset: this.elapsedOffset, resumeAt: this.resumeAt,
              endingAt: this.endingAt, until: boundaryTime,
            }
          }
          this.cycleOffset += this.nextAbsoluteStep / patternSteps
          request = { ...this.pendingRequest, countIn: false }
          this.request = request
          this.pendingRequest = undefined
          this.elapsedOffset += Math.max(0, boundaryTime - this.musicStartedAt)
          this.musicStartedAt = boundaryTime
          this.nextAbsoluteStep = 0
          patternSteps = stepsPerPattern(request.pattern)
          this.cancelScheduledSources(boundaryTime)
          this.updateEndingTime()
        }
        if (isBarBoundary && this.hasPendingTrainingMix) {
          this.trainingMix = this.pendingTrainingMix
          this.pendingTrainingMix = undefined
          this.hasPendingTrainingMix = false
          this.applyMix(time)
        }
        this.schedulePatternStep(request.pattern, this.nextAbsoluteStep % patternSteps, time)
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
    // Queue the cutoff in Web Audio itself so a throttled UI timer cannot leave
    // the final sample ringing beyond the route's exact musical boundary.
    if (this.endingAt !== undefined) source.stop(this.endingAt)
  }

  private phaseAtCycle(cycle: number) {
    let boundary = 0
    return this.program?.find(phase => { boundary += phase.bars; return cycle < boundary })
  }

  private updateEndingTime() {
    if (!this.program?.length || !this.request) { this.endingAt = undefined; return }
    const bars = this.program.reduce((sum, phase) => sum + phase.bars, 0)
    this.endingAt = this.musicStartedAt + (bars - this.cycleOffset) * patternDuration(this.request.pattern, this.request.bpm)
  }

  private applyMix(atTime = this.context?.currentTime ?? 0, restoreBoundary = true) {
    if (!this.context) return
    const previous = this.previousTimeline && atTime < this.previousTimeline.until ? this.previousTimeline : undefined
    const request = previous?.request ?? this.request
    const musicStartedAt = previous?.musicStartedAt ?? this.musicStartedAt
    const cycleOffset = previous?.cycleOffset ?? this.cycleOffset
    const resumeAt = previous?.resumeAt ?? this.resumeAt
    const programMix = this.program?.length && request
      ? this.phaseAtCycle(cycleOffset + positionAtTime(request.pattern, request.bpm, musicStartedAt, Math.max(atTime, resumeAt)).cycle)?.mix
      : undefined
    const trainingMix = this.program?.length && request ? programMix : this.trainingMix
    const values = [...this.mixes.values()]
    const hasSolo = values.some(({ solo }) => solo)
    const hasFocus = values.some(({ focused, muted, solo }) => focused && !muted && (!hasSolo || solo))
    for (const [drum, mix] of this.mixes) {
      const isTarget = trainingMix?.targets?.includes(drum) ?? (drum === trainingMix?.target)
      const trainingAudible = trainingMix?.mode === 'solo'
        ? isTarget
        : trainingMix?.mode === 'mute-target'
          ? !isTarget
          : true
      // Arrangement switches remain authoritative; training targets only alter
      // emphasis and never resurrect a muted track from a saved combination.
      const manualAudible = !mix.muted && (!hasSolo || mix.solo)
      const audible = trainingAudible && manualAudible
      const trainingFocusScale = (trainingMix?.mode === 'focus' && !isTarget) || (trainingMix?.mode === 'weaken' && isTarget) ? 0.18 : 1
      const manualFocusScale = trainingMix ? 1 : hasFocus && !mix.focused ? 0.18 : 1
      const focusScale = trainingFocusScale * manualFocusScale
      const target = audible ? mix.volume * focusScale : 0
      const gain = this.gains.get(drum)?.gain
      if (!gain) continue
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(atTime)
      else gain.cancelScheduledValues(atTime)
      gain.setTargetAtTime(target, atTime, 0.012)
    }
    // A live target/arrangement change cancels gain automation from now onward.
    // Restore an imminent program boundary that the scheduler may already have
    // passed, using the latest targets, without applying that future phase early.
    if (restoreBoundary && request && this.program?.length && this.status === 'playing' && atTime <= this.context.currentTime) {
      const duration = patternDuration(request.pattern, request.bpm)
      const cycle = this.getPosition().cycle + 1
      const boundary = musicStartedAt + (cycle - cycleOffset) * duration
      if (boundary > this.context.currentTime && boundary < this.context.currentTime + LOOK_AHEAD_SECONDS && this.phaseAtCycle(cycle)) {
        this.applyMix(boundary, false)
      }
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

  private resetAudioGraph() {
    this.context = undefined
    this.master = undefined
    this.buffers.clear()
    this.gains.clear()
    this.activeSources.clear()
    this.openHatSources.clear()
    this.request = undefined
    this.pendingRequest = undefined
    this.previousTimeline = undefined
    this.trainingMix = undefined
    this.pendingTrainingMix = undefined
    this.hasPendingTrainingMix = false
    this.cycleOffset = 0
    this.endingAt = undefined
    this.elapsedOffset = 0
    this.resumeAt = 0
    this.status = 'idle'
  }
}
