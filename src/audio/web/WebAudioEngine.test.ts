import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BOOM_BAP_PATTERNS } from '../../core/pattern/fixtures'
import { DRUM_IDS, type DrumId } from '../../core/pattern/types'
import type { DrumKit } from '../types'
import { WebAudioEngine } from './WebAudioEngine'

class FakeAudioParam {
  value = 1
  targets: Array<{ value: number; time: number; constant: number }> = []
  heldAt: number[] = []
  cancelledAt: number[] = []
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

type StartRecord = { drum?: DrumId; scheduledAt: number; time: number }
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
    })
  }
  stop(time?: number) {
    this.context.stops.push({ drum: this.target?.target?.drum, time })
    this.onended?.()
  }
}

class FakeAudioContext {
  currentTime = 0
  destination = {}
  state: AudioContextState = 'running'
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
    engine.dispose()
  })
})
