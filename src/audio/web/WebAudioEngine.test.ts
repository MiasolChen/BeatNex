import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BOOM_BAP_PATTERNS } from '../../core/pattern/fixtures'
import { withSubdivision } from '../../core/pattern/editor'
import { DRUM_IDS, type DrumId, type Pattern } from '../../core/pattern/types'
import { callPhrase, callProgram } from '../../core/training/callResponse'
import type { DrumKit } from '../types'
import { WebAudioEngine } from './WebAudioEngine'

class FakeAudioParam {
  value = 1
  targets: Array<{ value: number; time: number; constant: number }> = []
  values: Array<{ value: number; time: number }> = []
  heldAt: number[] = []
  cancelledAt: number[] = []
  setValueAtTime(value: number, time: number) { this.value = value; this.values.push({ value, time }) }
  cancelAndHoldAtTime(time: number) { this.heldAt.push(time) }
  cancelScheduledValues(time: number) { this.cancelledAt.push(time) }
  setTargetAtTime(value: number, time: number, constant: number) {
    this.targets.push({ value, time, constant })
  }
}

class FakeGain {
  gain = new FakeAudioParam()
  target?: FakeGain
  constructor(readonly drum?: DrumId) {}
  connect(target?: FakeGain) { this.target = target; return target ?? this }
  disconnect() {}
}

type StartRecord = { drum?: DrumId; scheduledAt: number; time: number; viaMaster: boolean }
type StopRecord = { drum?: DrumId; time?: number }

class FakeSource {
  buffer = {}
  onended?: () => void
  target?: FakeGain
  constructor(private readonly context: FakeAudioContext) {}
  connect(target: FakeGain) { this.target = target; return target }
  disconnect() {}
  start(time: number) {
    this.context.starts.push({
      drum: this.target?.target?.drum,
      scheduledAt: this.context.currentTime,
      time,
      viaMaster: this.target?.target?.drum === undefined,
    })
  }
  stop(time?: number) {
    this.context.stops.push({ drum: this.target?.target?.drum, time })
    if (time === undefined || time <= this.context.currentTime) this.onended?.()
  }
}

class FakeAudioContext {
  currentTime = 0
  destination = {}
  state: AudioContextState = 'running'
  onstatechange: (() => void) | null = null
  starts: StartRecord[] = []
  stops: StopRecord[] = []
  trackGains = new Map<DrumId, FakeGain>()
  private gainCount = 0
  async resume() {}
  async close() { this.state = 'closed' }
  createGain() {
    const drum = this.gainCount >= 1 && this.gainCount <= DRUM_IDS.length
      ? DRUM_IDS[this.gainCount - 1]
      : undefined
    this.gainCount += 1
    const gain = new FakeGain(drum)
    if (drum) this.trackGains.set(drum, gain)
    return gain
  }
  createBufferSource() { return new FakeSource(this) }
  async decodeAudioData() { return {} }
}

const kit: DrumKit = {
  kick: '/kick.wav', snare: '/snare.wav',
  closedHat: '/closed-hat.wav', openHat: '/open-hat.wav',
}

describe('WebAudioEngine loading', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('exposes a failed asset and can retry the full kit', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    let shouldFail = true
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (shouldFail && url.includes('kick')) return { ok: false, status: 404 }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
    }))
    const engine = new WebAudioEngine()

    await expect(engine.prepare(kit)).rejects.toThrow('kick 加载失败')
    expect(engine.getSnapshot()).toMatchObject({ status: 'error', error: 'kick 加载失败（HTTP 404）' })

    shouldFail = false
    await expect(engine.prepare(kit)).resolves.toBeUndefined()
    expect(engine.getSnapshot().status).toBe('ready')
    engine.dispose()
  })

  it('rebuilds its audio graph after a development lifecycle disposal', async () => {
    const contexts: FakeAudioContext[] = []
    vi.stubGlobal('AudioContext', class {
      constructor() {
        const next = new FakeAudioContext()
        contexts.push(next)
        return next
      }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })))
    const engine = new WebAudioEngine()

    await engine.prepare(kit)
    engine.dispose()
    await engine.prepare(kit)

    expect(contexts).toHaveLength(2)
    expect(engine.getSnapshot().status).toBe('ready')
    engine.dispose()
  })

  it('shares a pending preparation instead of downloading and connecting two graphs', async () => {
    const context = new FakeAudioContext()
    const gains = vi.spyOn(context, 'createGain')
    vi.stubGlobal('AudioContext', class { constructor() { return context } })
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const fetcher = vi.fn(async () => {
      await gate
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
    })
    vi.stubGlobal('fetch', fetcher)
    const engine = new WebAudioEngine()
    const first = engine.prepare(kit)
    const second = engine.prepare(kit)
    expect(first).toBe(second)
    await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(4)
    release()
    await Promise.all([first, second])
    expect(gains).toHaveBeenCalledTimes(5)
    expect(context.trackGains.size).toBe(4)
    engine.dispose()
  })

  it('discards a disposed lifecycle preparation when a new graph finishes first', async () => {
    const contexts: FakeAudioContext[] = []
    vi.stubGlobal('AudioContext', class {
      constructor() { const context = new FakeAudioContext(); contexts.push(context); return context }
    })
    let releaseOld!: () => void
    const gate = new Promise<void>(resolve => { releaseOld = resolve })
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (calls++ < 4) await gate
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
    }))
    const engine = new WebAudioEngine()
    const oldPreparation = engine.prepare(kit)
    await Promise.resolve()
    engine.dispose()
    await engine.prepare(kit)
    expect(contexts).toHaveLength(2)
    expect(engine.getSnapshot().status).toBe('ready')
    releaseOld()
    await oldPreparation
    expect(contexts[0].state).toBe('closed')
    expect(contexts[0].trackGains.size).toBe(0)
    expect(contexts[1].trackGains.size).toBe(4)
    expect(engine.getSnapshot()).toMatchObject({ status: 'ready', error: undefined })
    engine.dispose()
  })
})

describe('WebAudioEngine scheduling and mixing', () => {
  let context: FakeAudioContext
  let tick: () => void

  beforeEach(() => {
    context = new FakeAudioContext()
    vi.stubGlobal('AudioContext', class {
      constructor() { return context }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })))
    vi.stubGlobal('window', {
      setInterval: vi.fn((callback: () => void) => { tick = callback; return 1 }),
      clearInterval: vi.fn(),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([80, 100, 120])('keeps a 10 minute transport on the absolute clock at %i BPM', async (bpm) => {
    const engine = new WebAudioEngine()
    const pattern = BOOM_BAP_PATTERNS[0]
    await engine.prepare(kit)
    await engine.start({ pattern, bpm, countIn: true })

    const musicStart = 0.08 + 60 / bpm * pattern.beatsPerBar
    for (let time = 0.1; time <= musicStart + 600.2; time += 0.1) {
      context.currentTime = time
      tick()
    }

    expect(context.starts.length).toBeGreaterThan(1_000)
    expect(context.starts.every(({ scheduledAt, time }) => time >= scheduledAt - 1e-9)).toBe(true)
    const eventKeys = context.starts.map(({ drum, time }) => `${drum}:${time.toFixed(9)}`)
    expect(new Set(eventKeys).size).toBe(eventKeys.length)

    context.currentTime = musicStart + 600
    expect(engine.getPosition()).toMatchObject({
      cycle: Math.floor(600 / (60 / bpm * pattern.beatsPerBar)),
      step: 0,
      isCountIn: false,
    })
    expect(engine.getPosition().progress).toBeCloseTo(0, 8)
    expect(engine.getSnapshot().diagnostics).toMatchObject({
      scheduledHits: context.starts.length,
      skippedSteps: 0,
    })
    expect(engine.getSnapshot().diagnostics.minScheduleLeadMs).toBeGreaterThanOrEqual(0)
    expect(engine.getSnapshot().diagnostics.maxScheduleLeadMs).toBeLessThanOrEqual(120)
    engine.dispose()
  })

  it('skips expired steps after a delayed scheduler tick instead of replaying a burst', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.starts.length = 0

    context.currentTime = 5
    tick()

    expect(context.starts.length).toBeGreaterThan(0)
    expect(context.starts.every(({ scheduledAt, time }) => time >= scheduledAt)).toBe(true)
    expect(engine.getSnapshot().diagnostics.skippedSteps).toBeGreaterThan(0)
    engine.dispose()
  })

  it('derives the visual position from the same audio clock and changes gain without restarting transport', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 100, countIn: false })
    const initialIntervalCalls = vi.mocked(window.setInterval).mock.calls.length

    context.currentTime = 1.13
    expect(engine.getPosition()).toMatchObject({ step: 7, cycle: 0, isCountIn: false })

    engine.setTrackMix('kick', { muted: false, solo: false, focused: true, volume: 0.82 })
    expect(context.trackGains.get('kick')?.gain.targets.at(-1)?.value).toBeCloseTo(0.82)
    expect(context.trackGains.get('snare')?.gain.targets.at(-1)?.value).toBeCloseTo(0.82 * 0.18)
    expect(context.trackGains.get('kick')?.gain.heldAt.at(-1)).toBe(context.currentTime)

    engine.setTrackMix('snare', { muted: true, solo: false, focused: false, volume: 0.82 })
    expect(context.trackGains.get('snare')?.gain.targets.at(-1)?.value).toBe(0)
    expect(vi.mocked(window.setInterval).mock.calls.length).toBe(initialIntervalCalls)
    expect(engine.getSnapshot().status).toBe('playing')
    engine.dispose()
  })

  it('resolves Solo, Mute, and Focus combinations without interrupting the transport', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 100, countIn: false })
    const intervalCalls = vi.mocked(window.setInterval).mock.calls.length

    engine.setTrackMix('kick', { muted: false, solo: true, focused: false, volume: 0.75 })
    expect(context.trackGains.get('kick')?.gain.targets.at(-1)?.value).toBeCloseTo(0.75)
    expect(context.trackGains.get('snare')?.gain.targets.at(-1)?.value).toBe(0)

    engine.setTrackMix('kick', { muted: false, solo: true, focused: true, volume: 0.75 })
    engine.setTrackMix('snare', { muted: false, solo: true, focused: false, volume: 0.5 })
    expect(context.trackGains.get('kick')?.gain.targets.at(-1)?.value).toBeCloseTo(0.75)
    expect(context.trackGains.get('snare')?.gain.targets.at(-1)?.value).toBeCloseTo(0.5 * 0.18)

    engine.setTrackMix('kick', { muted: true, solo: true, focused: true, volume: 0.75 })
    expect(context.trackGains.get('kick')?.gain.targets.at(-1)?.value).toBe(0)
    expect(context.trackGains.get('snare')?.gain.targets.at(-1)?.value).toBeCloseTo(0.5)
    expect(vi.mocked(window.setInterval).mock.calls.length).toBe(intervalCalls)
    expect(engine.getSnapshot().status).toBe('playing')
    engine.dispose()
  })

  it('applies guided training mixes at the next full bar boundary', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 100, countIn: false })

    engine.setTrainingMix({ mode: 'solo', target: 'kick' }, 'next-bar')
    context.currentTime = 2.37
    tick()

    expect(context.trackGains.get('kick')?.gain.targets.at(-1)).toMatchObject({ value: 0.82, time: 2.48 })
    expect(context.trackGains.get('snare')?.gain.targets.at(-1)).toMatchObject({ value: 0, time: 2.48 })
    expect(context.trackGains.get('closedHat')?.gain.targets.at(-1)).toMatchObject({ value: 0, time: 2.48 })
    expect(engine.getSnapshot().status).toBe('playing')
    engine.dispose()
  })

  it('resumes the exact paused fraction of a beat without replaying earlier hits or counting paused time', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })

    context.currentTime = 5.31
    engine.pause()
    const paused = engine.getPosition()
    expect(paused).toMatchObject({ status: 'paused', cycle: 2, step: 9 })
    expect(paused.elapsed).toBeCloseTo(5.23)
    expect(paused.progress).toBeCloseTo(0.615)

    context.currentTime = 100
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 100.08
    const resumed = engine.getPosition()
    expect(resumed).toMatchObject({ status: 'playing', cycle: 2, step: 9 })
    expect(resumed.elapsed).toBeCloseTo(paused.elapsed)
    expect(resumed.progress).toBeCloseTo(paused.progress)
    context.currentTime = 100.18
    tick()
    expect(context.starts.filter(start => start.scheduledAt >= 100).every(start => start.time >= 100.10 - 1e-9)).toBe(true)
    expect(engine.getPosition().elapsed).toBeCloseTo(5.33)
    engine.dispose()
  })

  it('keeps the paused position frozen during the resume scheduling lead time', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 1.33
    engine.pause()
    const paused = engine.getPosition()
    context.currentTime = 50
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    expect(engine.getPosition().elapsed).toBeCloseTo(paused.elapsed)
    expect(engine.getPosition().step).toBe(paused.step)
    engine.dispose()
  })

  it('preserves actual accumulated practice time when the tempo changes while paused', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 60, countIn: false })
    context.currentTime = 2.58
    engine.pause()
    const paused = engine.getPosition()
    engine.update({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120 })
    expect(engine.getPosition().progress).toBeCloseTo(paused.progress)
    expect(engine.getPosition().elapsed).toBeCloseTo(2.5)
    context.currentTime = 50
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 50.58
    expect(engine.getPosition().elapsed).toBeCloseTo(3)
    engine.dispose()
  })

  it('commits a subdivision and BPM change at a real bar, then preserves position through pause', async () => {
    const engine = new WebAudioEngine()
    const original = { ...BOOM_BAP_PATTERNS[0], bars: 2,
      tracks: BOOM_BAP_PATTERNS[0].tracks.map(track => ({ ...track,
        hits: [...track.hits, ...track.hits.map(hit => ({ ...hit, step: hit.step + 16 }))],
      })),
    }
    const changed = withSubdivision(original, 6)
    await engine.prepare(kit)
    await engine.start({ pattern: original, bpm: 120, countIn: false })

    context.currentTime = 1.6
    engine.update({ pattern: changed, bpm: 90 })
    context.currentTime = 1.98
    tick()
    expect(engine.getPosition().step).toBeGreaterThan(0)
    expect(engine.getPosition().progress).toBeCloseTo((1.98 - 0.08) / 4, 2)

    context.currentTime = 2.1
    tick()
    expect(engine.getPosition()).toMatchObject({ status: 'playing', cycle: 1, step: 24 })
    expect(context.starts.some(start => Math.abs(start.time - 2.08) < 1e-8)).toBe(true)

    context.currentTime = 2.5
    engine.pause()
    const paused = engine.getPosition()
    engine.update({ pattern: changed, bpm: 60 })
    expect(engine.getPosition().progress).toBeCloseTo(paused.progress)

    context.currentTime = 100
    await engine.start({ pattern: changed, bpm: 60, countIn: false })
    expect(engine.getPosition().progress).toBeCloseTo(paused.progress)
    engine.dispose()
  })

  it.each(['solo', 'weaken', 'mute-target'] as const)('applies %s to every selected drum, including an explicitly empty selection', async mode => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setTrainingMix({ mode, targets: ['kick', 'closedHat'] })
    for (const drum of DRUM_IDS) {
      const selected = drum === 'kick' || drum === 'closedHat'
      const gain = mode === 'solo' ? (selected ? 0.82 : 0) : mode === 'weaken' ? 0.82 * (selected ? 0.18 : 1) : (selected ? 0 : 0.82)
      expect(context.trackGains.get(drum)?.gain.targets.at(-1)?.value).toBeCloseTo(gain)
    }
    // An empty multi-selection must override the legacy single-target fallback.
    engine.setTrainingMix({ mode, targets: [], target: 'kick' })
    for (const drum of DRUM_IDS) expect(context.trackGains.get(drum)?.gain.targets.at(-1)?.value).toBeCloseTo(mode === 'solo' ? 0 : 0.82)
    engine.dispose()
  })

  it('restores all four drums after the weaken and hidden-target phases', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setTrainingMix({ mode: 'weaken', targets: ['kick', 'snare'] })
    engine.setTrainingMix({ mode: 'mute-target', targets: ['kick', 'snare'] })
    engine.setTrainingMix({ mode: 'full', targets: ['kick', 'snare'] })
    for (const drum of DRUM_IDS) expect(context.trackGains.get(drum)?.gain.targets.at(-1)?.value).toBeCloseTo(0.82)
    engine.dispose()
  })

  it.each([[2, 4], [3, 4], [4, 4], [5, 4], [6, 8], [7, 8], [9, 8], [12, 8]] as const)('schedules and ends a %i/%i training bar on its real musical boundary', async (beatsPerBar, beatUnit) => {
    const engine = new WebAudioEngine()
    const steps = beatsPerBar * 4 / beatUnit * 4
    const pattern: Pattern = {
      ...BOOM_BAP_PATTERNS[0], beatsPerBar, beatUnit,
      tracks: [{ drum: 'kick', hits: Array.from({ length: steps }, (_, step) => ({ step, velocity: 90 })) }],
    }
    const duration = beatsPerBar * 4 / beatUnit * 60 / 120
    const end = 0.08 + duration
    await engine.prepare(kit)
    engine.setProgram([{ bars: 1, mix: { mode: 'full', targets: ['kick'] } }])
    await engine.start({ pattern, bpm: 120, countIn: false })
    for (let time = 0.025; time < end + 0.1; time += 0.025) {
      context.currentTime = time
      tick()
    }
    expect(context.starts).toHaveLength(steps)
    expect(context.starts.every(start => start.time < end - 1e-9)).toBe(true)
    expect(context.starts.at(-1)?.time).toBeCloseTo(end - 0.125)
    expect(engine.getPosition()).toMatchObject({ status: 'paused', cycle: 1, step: 0 })
    expect(engine.getPosition().elapsed).toBeCloseTo(duration)
    expect(vi.mocked(window.clearInterval)).toHaveBeenCalled()
    engine.dispose()
  })

  it('repeats every route phase on the same clock without finite sample cutoff', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([
      { bars: 1, mix: { mode: 'full', targets: ['kick'] } },
      { bars: 1, mix: { mode: 'mute-target', targets: ['kick'] } },
    ], true)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    for (let time = 0.025; time < 12.15; time += 0.025) { context.currentTime = time; tick() }
    const targets = context.trackGains.get('kick')!.gain.targets
    for (const time of [4.08, 8.08, 12.08]) expect(targets.some(v => Math.abs(v.time-time)<1e-8 && Math.abs(v.value-.82)<1e-8)).toBe(true)
    for (const time of [2.08, 6.08, 10.08]) expect(targets.some(v => Math.abs(v.time-time)<1e-8 && v.value===0)).toBe(true)
    expect(context.stops.filter(v => v.time!==undefined)).toHaveLength(0)
    expect(engine.getPosition().cycle).toBe(6)
    expect(engine.getPosition().status).toBe('playing')
    const events = context.starts.map(v=>`${v.drum}:${v.time.toFixed(8)}`)
    expect(new Set(events).size).toBe(events.length)
    const position = engine.getPosition()
    engine.pause(); context.currentTime += 20
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    expect(engine.getPosition().cycle).toBe(position.cycle)
    expect(engine.getPosition().elapsed).toBeCloseTo(position.elapsed)
    engine.dispose()
  })

  it('changes program phase audio exactly at a boundary and schedules no extra final hit', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([
      { bars: 1, mix: { mode: 'full', targets: ['kick', 'snare'] } },
      { bars: 1, mix: { mode: 'weaken', targets: ['kick', 'snare'] } },
    ])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    for (let time = 0.025; time < 4.15; time += 0.025) {
      context.currentTime = time
      tick()
    }
    expect(context.trackGains.get('kick')?.gain.targets.some(target => Math.abs(target.time - 2.08) < 1e-9 && Math.abs(target.value - 0.82 * 0.18) < 1e-9)).toBe(true)
    expect(context.starts.every(start => start.time < 4.08 - 1e-9)).toBe(true)
    expect(engine.getPosition().elapsed).toBeCloseTo(4)
    engine.dispose()
  })

  it('uses real bar boundaries for a multi-bar pattern and ends after the route bars', async () => {
    const engine = new WebAudioEngine()
    const pattern: Pattern = { ...BOOM_BAP_PATTERNS[0], bars: 3 }
    await engine.prepare(kit)
    engine.setProgram([
      { bars: 1, mix: { mode: 'full', targets: ['kick'] } },
      { bars: 1, mix: { mode: 'solo', targets: ['snare'] } },
    ])
    await engine.start({ pattern, bpm: 120, countIn: false })

    for (const time of [0.025, 1.025, 2.025, 2.1, 3.1]) {
      context.currentTime = time
      tick()
    }
    const kickTargets = context.trackGains.get('kick')!.gain.targets
    const snareTargets = context.trackGains.get('snare')!.gain.targets
    expect(kickTargets.some(target => Math.abs(target.time - 2.08) < 1e-9 && target.value === 0)).toBe(true)
    expect(snareTargets.some(target => Math.abs(target.time - 2.08) < 1e-9 && target.value === 0.82)).toBe(true)

    context.currentTime = 4.1
    tick()
    expect(engine.getPosition()).toMatchObject({ status: 'paused', cycle: 2 })
    expect(context.starts.every(start => start.time < 4.08 - 1e-9)).toBe(true)
    engine.dispose()
  })

  it('schedules each sample cutoff on the audio clock even before the UI reaches the final bar', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([{ bars: 1, mix: { mode: 'full' } }])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    expect(context.starts.length).toBeGreaterThan(0)
    expect(context.stops.filter(stop => stop.time === 2.08)).toHaveLength(context.starts.length)
    // No scheduler callback is needed to cap the visual/recording clock at finish.
    context.currentTime = 10
    expect(engine.getPosition().elapsed).toBeCloseTo(2)
    engine.dispose()
  })

  it('resumes the current program mix when paused in the middle of a later phase', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    const program = [
      { bars: 1, mix: { mode: 'full' as const, targets: ['kick' as const] } },
      { bars: 2, mix: { mode: 'solo' as const, targets: ['kick' as const] } },
    ]
    engine.setProgram(program)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 2.4
    tick()
    engine.pause()
    engine.setProgram(program)
    context.currentTime = 10
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    expect(context.trackGains.get('kick')?.gain.targets.at(-1)?.value).toBeCloseTo(0.82)
    expect(context.trackGains.get('snare')?.gain.targets.at(-1)?.value).toBe(0)
    engine.dispose()
  })

  it.each([[6, 8], [7, 8], [9, 8], [12, 8]] as const)('keeps %i/%i count-in within its actual step range before and after pause', async (beatsPerBar, beatUnit) => {
    const engine = new WebAudioEngine()
    const pattern: Pattern = { ...BOOM_BAP_PATTERNS[0], beatsPerBar, beatUnit }
    await engine.prepare(kit)
    await engine.start({ pattern, bpm: 120, countIn: true })
    const duration = beatsPerBar * 4 / beatUnit * 0.5
    context.currentTime = 0.08 + duration * 0.75
    const expectedStep = Math.floor(beatsPerBar * 4 / beatUnit * 4 * 0.75)
    expect(engine.getPosition()).toMatchObject({ isCountIn: true, step: expectedStep, elapsed: 0 })
    engine.pause()
    expect(engine.getPosition()).toMatchObject({ isCountIn: true, step: expectedStep, elapsed: 0 })
    engine.dispose()
  })

  it.each(['stop', 'pause'] as const)('does not restart after an asynchronous resume was cancelled with %s', async cancel => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    let resume!: () => void
    context.resume = () => new Promise<void>(resolve => { resume = resolve })
    const pending = engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    engine[cancel]()
    resume()
    await pending
    expect(engine.getPosition().status).toBe(cancel === 'stop' ? 'stopped' : 'ready')
    expect(context.starts).toHaveLength(0)
    expect(vi.mocked(window.setInterval)).not.toHaveBeenCalled()
    engine.dispose()
  })

  it('lets the newest asynchronous playback request win without a duplicate scheduler', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    const resumes: Array<() => void> = []
    context.resume = () => new Promise<void>(resolve => { resumes.push(resolve) })
    const oldStart = engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 60, countIn: false })
    const newStart = engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    resumes[1]()
    await newStart
    resumes[0]()
    await oldStart
    expect(vi.mocked(window.setInterval)).toHaveBeenCalledTimes(1)
    context.currentTime = 1.08
    expect(engine.getPosition().progress).toBeCloseTo(0.5)
    engine.dispose()
  })

  it.each(['suspended', 'interrupted'])('turns a visible audio %s interruption into a resumable paused snapshot', async state => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 1.08
    context.state = state as AudioContextState
    context.onstatechange?.()
    expect(engine.getSnapshot()).toMatchObject({ status: 'paused', elapsed: 1, error: '声音已中断，点击继续播放' })
    expect(vi.mocked(window.clearInterval)).toHaveBeenCalled()
    context.resume = async () => { context.state = 'running'; context.onstatechange?.() }
    context.currentTime = 20
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', error: undefined })
    expect(engine.getSnapshot().elapsed).toBeCloseTo(1)
    engine.dispose()
  })

  it('reports a failed resume while retaining the paused position for retry', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 1.08
    engine.pause()
    context.resume = async () => { throw new Error('声音未能开启') }
    await expect(engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })).rejects.toThrow('声音未能开启')
    expect(engine.getSnapshot()).toMatchObject({ status: 'paused', elapsed: 1, error: '声音未能开启' })
    context.resume = async () => {}
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', error: undefined })
    engine.dispose()
  })

  it.each(['full', 'solo', 'weaken', 'mute-target'] as const)('preserves saved arrangement switches during the %s training phase', async mode => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setTrackMix('kick', { muted: true, solo: false, focused: false, volume: 0.82 })
    engine.setTrainingMix({ mode, targets: ['kick', 'snare'] })
    expect(context.trackGains.get('kick')?.gain.targets.at(-1)?.value).toBe(0)
    const snare = context.trackGains.get('snare')?.gain.targets.at(-1)?.value
    expect(snare).toBeCloseTo(mode === 'mute-target' ? 0 : mode === 'weaken' ? 0.82 * 0.18 : 0.82)
    engine.dispose()
  })

  it('changes selected targets in the current phase without resetting progress or replaying phase one', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([
      { bars: 1, mix: { mode: 'full', targets: ['kick'] } },
      { bars: 2, mix: { mode: 'solo', targets: ['kick'] } },
    ])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 2.4
    const before = engine.getPosition()
    engine.setProgram([
      { bars: 1, mix: { mode: 'full', targets: ['snare'] } },
      { bars: 2, mix: { mode: 'solo', targets: ['snare'] } },
    ])
    expect(engine.getPosition()).toEqual(before)
    expect(context.trackGains.get('kick')?.gain.targets.at(-1)?.value).toBe(0)
    expect(context.trackGains.get('snare')?.gain.targets.at(-1)?.value).toBeCloseTo(0.82)
    expect(vi.mocked(window.setInterval)).toHaveBeenCalledTimes(1)
    engine.dispose()
  })

  it('preserves the imminent phase boundary when live targets change inside the lookahead window', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([
      { bars: 1, mix: { mode: 'full', targets: ['kick'] } },
      { bars: 2, mix: { mode: 'solo', targets: ['kick'] } },
    ])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 2
    tick()
    engine.setProgram([
      { bars: 1, mix: { mode: 'full', targets: ['snare'] } },
      { bars: 2, mix: { mode: 'solo', targets: ['snare'] } },
    ])
    // The hook updates arrangement switches in a separate effect after program.
    engine.setTrackMix('closedHat', { muted: false, solo: false, focused: false, volume: 0.82 })
    const kick = context.trackGains.get('kick')!.gain.targets
    const snare = context.trackGains.get('snare')!.gain.targets
    expect(kick.filter(change => change.time === 2).at(-1)?.value).toBeCloseTo(0.82)
    expect(kick.at(-1)).toMatchObject({ time: 2.08, value: 0 })
    expect(snare.at(-1)).toMatchObject({ time: 2.08, value: 0.82 })
    expect(engine.getPosition().cycle).toBe(0)
    expect(vi.mocked(window.setInterval)).toHaveBeenCalledTimes(1)
    engine.dispose()
  })

  it('retains the true program end after pausing inside the final lookahead window', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([{ bars: 1, mix: { mode: 'full' } }])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 2.02
    tick()
    engine.pause()
    expect(engine.getPosition().elapsed).toBeCloseTo(1.94)
    context.currentTime = 50
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 50.10
    tick()
    expect(engine.getPosition().status).toBe('playing')
    context.currentTime = 50.16
    tick()
    expect(engine.getPosition()).toMatchObject({ status: 'paused', cycle: 1 })
    expect(engine.getPosition().elapsed).toBeCloseTo(2)
    engine.dispose()
  })

  it('caps completed duration at the actual route end even when a timer stalls across it', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([{ bars: 1, mix: { mode: 'full' } }])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 12
    tick()
    tick()
    expect(engine.getPosition()).toMatchObject({ status: 'paused', cycle: 1, step: 0 })
    expect(engine.getPosition().elapsed).toBeCloseTo(2)
    expect(context.starts.every(start => start.time < 2.08)).toBe(true)
    engine.dispose()
  })

  it('applies Pattern and BPM changes once at a bar boundary without duplicate hits', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 100, countIn: false })
    engine.update({ pattern: BOOM_BAP_PATTERNS[2], bpm: 120 })

    context.currentTime = 2.37
    tick()

    const eventKeys = context.starts.map(({ drum, time }) => `${drum}:${time.toFixed(9)}`)
    expect(new Set(eventKeys).size).toBe(eventKeys.length)
    expect(context.stops.some(({ time }) => time === 2.48)).toBe(true)
    expect(engine.getSnapshot().status).toBe('playing')
    expect(vi.mocked(window.setInterval)).toHaveBeenCalledTimes(1)
    context.currentTime = 2.49
    expect(engine.getSnapshot().cycle).toBe(1)
    engine.dispose()
  })

  it('keeps visuals on the sounding bar until a pre-scheduled tempo change is audible', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 100, countIn: false })
    engine.update({ pattern: BOOM_BAP_PATTERNS[2], bpm: 120 })
    context.currentTime = 2.37
    tick()
    expect(engine.getPosition()).toMatchObject({ cycle: 0, step: 15, isCountIn: false })
    expect(engine.getPosition().elapsed).toBeCloseTo(2.29)
    expect(engine.getPosition().progress).toBeCloseTo(2.29 / 2.4)
    context.currentTime = 2.479
    expect(engine.getPosition()).toMatchObject({ cycle: 0, step: 15, isCountIn: false })
    context.currentTime = 2.48
    expect(engine.getPosition()).toMatchObject({ cycle: 1, step: 0, isCountIn: false })
    expect(engine.getPosition().elapsed).toBeCloseTo(2.4)
    context.currentTime = 2.68
    expect(engine.getPosition().progress).toBeCloseTo(0.1)
    expect(engine.getPosition().elapsed).toBeCloseTo(2.6)
    engine.dispose()
  })

  it('pauses the audible timeline if a future tempo boundary was already queued', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([{ bars: 2, mix: { mode: 'full' } }])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 100, countIn: false })
    engine.update({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120 })
    context.currentTime = 2.37
    tick()
    context.currentTime = 2.4
    engine.pause()
    const paused = engine.getPosition()
    expect(paused).toMatchObject({ cycle: 0, step: 15, isCountIn: false })
    expect(paused.elapsed).toBeCloseTo(2.32)
    context.currentTime = 50
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 50.08
    expect(engine.getPosition()).toMatchObject({ cycle: 0, step: 15, isCountIn: false })
    expect(engine.getPosition().elapsed).toBeCloseTo(paused.elapsed)
    expect(engine.getPosition().progress).toBeCloseTo(paused.progress)
    context.currentTime = 50.18
    tick()
    expect(engine.getPosition()).toMatchObject({ cycle: 1, isCountIn: false })
    expect(engine.getPosition().elapsed).toBeCloseTo(2.42)
    engine.dispose()
  })

  it('exposes silent drum pads before playback and while paused', async () => {
    const engine = new WebAudioEngine()
    expect(engine.getSnapshot().drums).toEqual({
      kick: { gain: 0, level: 'silent', hit: false },
      snare: { gain: 0, level: 'silent', hit: false },
      closedHat: { gain: 0, level: 'silent', hit: false },
      openHat: { gain: 0, level: 'silent', hit: false },
    })
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })
    context.currentTime = 0.58
    engine.pause()
    expect(Object.values(engine.getSnapshot().drums ?? {}).every(drums => drums.level === 'silent' && !drums.hit && drums.gain === 0)).toBe(true)
    engine.dispose()
  })

  it('reports only the current step hit and reflects a muted track', async () => {
    const engine = new WebAudioEngine()
    const pattern: Pattern = {
      ...BOOM_BAP_PATTERNS[0],
      tracks: [
        { drum: 'kick', hits: [{ step: 0, velocity: 100 }] },
        { drum: 'snare', hits: [{ step: 1, velocity: 0 }] },
      ],
    }
    await engine.prepare(kit)
    await engine.start({ pattern, bpm: 120, countIn: false })
    context.currentTime = 0.081
    expect(engine.getSnapshot().drums?.kick).toEqual({ gain: 0.82, level: 'normal', hit: true })
    context.currentTime = 0.21
    expect(engine.getSnapshot().drums?.kick).toEqual({ gain: 0.82, level: 'normal', hit: false })
    engine.setTrackMix('kick', { muted: true, solo: false, focused: false, volume: 0.82 })
    expect(engine.getSnapshot().drums?.kick).toEqual({ gain: 0, level: 'silent', hit: false })
    engine.dispose()
  })

  it('keeps the current phase visible until its audio boundary despite lookahead scheduling', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([
      { bars: 1, mix: { mode: 'full', targets: ['kick'] } },
      { bars: 1, mix: { mode: 'mute-target', targets: ['kick'] } },
    ])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 100, countIn: false })
    context.currentTime = 2.37
    tick()
    expect(engine.getSnapshot().drums?.kick).toEqual({ gain: 0.82, level: 'normal', hit: false })
    context.currentTime = 2.48
    expect(engine.getSnapshot().drums?.kick).toEqual({ gain: 0, level: 'silent', hit: false })
    engine.dispose()
  })

  it('silences drum pads at a finite route ending before the scheduler flips status', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([{ bars: 1, mix: { mode: 'full' } }])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })

    // The route ends at 0.08 + 2 seconds. Do not call tick(): this exercises
    // the snapshot guard while the transport status is still nominally playing.
    context.currentTime = 2.08
    const snapshot = engine.getSnapshot()
    expect(snapshot.status).toBe('playing')
    expect(Object.values(snapshot.drums ?? {}).every(drums => drums.level === 'silent' && !drums.hit && drums.gain === 0)).toBe(true)
    engine.dispose()
  })

  it('routes count-in clicks through the master even when the selected target excludes hats', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setTrainingMix({ mode: 'solo', targets: ['kick'] })
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: true })

    const musicStart = 0.08 + 2
    const countIn = context.starts.filter(start => start.time < musicStart)
    expect(countIn.length).toBeGreaterThan(0)
    expect(countIn.every(start => start.viaMaster)).toBe(true)
    expect(context.trackGains.get('closedHat')?.gain.targets.at(-1)?.value).toBe(0)
    engine.dispose()
  })

  it('keeps a response phase fully silent', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram([
      { bars: 1, mix: { mode: 'solo', targets: ['kick'] } },
      { bars: 1, mix: { mode: 'silence' } as never },
    ])
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: false })

    context.currentTime = 2.08
    tick()
    expect([...context.trackGains.values()].every(gain =>
      gain.gain.targets.some(target => target.time === 2.08 && target.value === 0)
      || gain.gain.values.some(target => target.time === 2.08 && target.value === 0),
    )).toBe(true)
    engine.dispose()
  })

  it('preserves a paused count-in position when BPM changes before resume', async () => {
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 120, countIn: true })
    context.currentTime = 0.83
    engine.pause()
    const paused = engine.getPosition()
    expect(paused).toMatchObject({ status: 'paused', isCountIn: true, elapsed: 0 })

    engine.update({ pattern: BOOM_BAP_PATTERNS[0], bpm: 60 })
    context.currentTime = 50
    await engine.start({ pattern: BOOM_BAP_PATTERNS[0], bpm: 60, countIn: true })
    expect(engine.getPosition()).toMatchObject({ status: 'playing', isCountIn: true, step: paused.step })
    expect(context.starts.filter(start => start.scheduledAt >= 50 && start.time < 52.08)).toHaveLength(0)
    engine.dispose()
  })

  it.each([1, 2, 3, 4])('schedules identical Call and Check snippets for %i bars from a 3-bar source', async bars => {
    const source: Pattern = {
      ...BOOM_BAP_PATTERNS[0],
      bars: 3,
      tracks: [
        { drum: 'kick', hits: [0, 7, 16, 31, 32, 47].map(step => ({ step, velocity: 100 })) },
        { drum: 'snare', hits: [] },
        { drum: 'closedHat', hits: [] },
        { drum: 'openHat', hits: [] },
      ],
    }
    const pattern = callPhrase(source, bars)
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    engine.setProgram(callProgram(bars, ['kick']))
    await engine.start({ pattern, bpm: 120, countIn: false })

    const barSeconds = 2
    const callStart = 0.08
    const checkStart = callStart + bars * barSeconds * 2
    for (let time = 0.1; time < checkStart + bars * barSeconds + 0.2; time += 0.025) {
      context.currentTime = time
      tick()
    }
    const offsets = (start: number) => context.starts
      .filter(hit => hit.drum === 'kick' && hit.time >= start - 1e-9 && hit.time < start + bars * barSeconds - 1e-9)
      .map(hit => Number((hit.time - start).toFixed(6)))
    expect(offsets(checkStart)).toEqual(offsets(callStart))
    engine.dispose()
  })

  it('uses the source origin after a true-bar BPM change', async () => {
    const source: Pattern = {
      ...BOOM_BAP_PATTERNS[0],
      bars: 3,
      tracks: [
        { drum: 'kick', hits: [{ step: 0, velocity: 100 }, { step: 16, velocity: 100 }, { step: 32, velocity: 100 }] },
        { drum: 'snare', hits: [] }, { drum: 'closedHat', hits: [] }, { drum: 'openHat', hits: [] },
      ],
    }
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern: source, bpm: 100, countIn: false })
    engine.update({ pattern: source, bpm: 120 })
    context.currentTime = 2.41
    tick()
    expect(context.starts.some(start => start.drum === 'kick' && Math.abs(start.time - 2.48) < 1e-9)).toBe(true)
    context.currentTime = 2.49
    expect(engine.getPosition()).toMatchObject({ cycle: 1, step: 16 })
    expect(engine.getPosition().progress).toBeCloseTo(1 / 3, 2)
    engine.dispose()
  })

  it('clicks six times at eighth-meter beat intervals during a 6/8 count-in', async () => {
    const pattern: Pattern = { ...BOOM_BAP_PATTERNS[0], beatsPerBar: 6, beatUnit: 8 }
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern, bpm: 120, countIn: true })
    for (let time = 0.1; time <= 1.5; time += 0.05) {
      context.currentTime = time
      tick()
    }
    const clicks = context.starts.filter(start => start.viaMaster)
    expect(clicks).toHaveLength(6)
    expect(clicks.slice(1).map((click, index) => click.time - clicks[index].time).every(interval => Math.abs(interval - 0.25) < 1e-9)).toBe(true)
    engine.dispose()
  })

  it('preserves 6/8 count-in progress while paused through a BPM update', async () => {
    const pattern: Pattern = { ...BOOM_BAP_PATTERNS[0], beatsPerBar: 6, beatUnit: 8 }
    const engine = new WebAudioEngine()
    await engine.prepare(kit)
    await engine.start({ pattern, bpm: 120, countIn: true })
    context.currentTime = 0.83
    engine.pause()
    const paused = engine.getPosition()
    engine.update({ pattern, bpm: 60 })
    expect(engine.getPosition()).toMatchObject({ status: 'paused', isCountIn: true, step: paused.step, elapsed: 0 })
    expect(engine.getPosition().progress).toBeCloseTo(paused.progress)
    engine.dispose()
  })
})
