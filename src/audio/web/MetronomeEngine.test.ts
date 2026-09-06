import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetronomeEngine } from './MetronomeEngine'

class FakeParam {
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeOscillator {
  type = 'sine'
  frequency = new FakeParam()
  onended: (() => void) | null = null
  startAt = -1
  cancelled = false
  disconnected = false
  connect() {}
  disconnect() { this.disconnected = true }
  start(at: number) { this.startAt = at }
  stop(at?: number) { if (at === undefined) this.cancelled = true }
}

class FakeContext {
  currentTime = 0
  state: AudioContextState = 'running'
  destination = {}
  onstatechange: (() => void) | null = null
  oscillators: FakeOscillator[] = []
  resume = vi.fn(async () => {})
  close = vi.fn(async () => { this.state = 'closed' })
  createOscillator() {
    const oscillator = new FakeOscillator()
    this.oscillators.push(oscillator)
    return oscillator
  }
  createGain() { return { gain: new FakeParam(), connect() {}, disconnect() {} } }
}

describe('MetronomeEngine audio clock and lifecycle', () => {
  let context: FakeContext
  let engine: MetronomeEngine
  beforeEach(() => {
    vi.useFakeTimers()
    context = new FakeContext()
    engine = new MetronomeEngine(() => context as unknown as AudioContext)
  })
  afterEach(() => { engine.dispose(); vi.useRealTimers() })

  it.each([30, 90, 300])('schedules %i BPM from audio time and exposes only sounded beats', async bpm => {
    await engine.start(bpm)
    expect(context.oscillators[0].startAt).toBeCloseTo(0.03)
    expect(engine.getVisualBeat()).toBeNull()
    context.currentTime = 0.03
    expect(engine.getVisualBeat()).toEqual({ at: 0.03, period: 60 / bpm, index: 0 })
    context.currentTime = 0.03 + 60 / bpm - 0.05
    vi.advanceTimersByTime(25)
    expect(context.oscillators[1].startAt).toBeCloseTo(0.03 + 60 / bpm)
    // Rendering does not drive timing, and a scheduled beat is not displayed early.
    expect(engine.getVisualBeat()?.index).toBe(0)
    context.currentTime = context.oscillators[1].startAt
    expect(engine.getVisualBeat()?.index).toBe(1)
  })

  it('cancels an in-flight audio resume without leaving a playing scheduler', async () => {
    let resume!: () => void
    context.resume.mockImplementation(() => new Promise<void>(resolve => { resume = resolve }))
    const pending = engine.start(90)
    engine.stop()
    resume()
    expect(await pending).toBe(false)
    expect(engine.isRunning).toBe(false)
    expect(context.oscillators).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rapid start/cancel/start accepts only the latest resume', async () => {
    const resumes: Array<() => void> = []
    context.resume.mockImplementation(() => new Promise<void>(resolve => { resumes.push(resolve) }))
    const oldStart = engine.start(90)
    engine.stop()
    const newStart = engine.start(120)
    resumes[1]()
    expect(await newStart).toBe(true)
    resumes[0]()
    expect(await oldStart).toBe(false)
    expect(engine.isRunning).toBe(true)
    expect(context.oscillators).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('retracts future audio on tempo change while preserving visual phase', async () => {
    await engine.start(300)
    context.currentTime = 0.18
    vi.advanceTimersByTime(25)
    expect(context.oscillators[1].startAt).toBeCloseTo(0.23)
    engine.setTempo(60)
    expect(context.oscillators[1].cancelled).toBe(true)
    expect(context.oscillators[0].cancelled).toBe(false)
    const beat = engine.getVisualBeat()!
    expect((context.currentTime - beat.at) / beat.period).toBeCloseTo(0.75)
    context.currentTime = 0.4
    vi.advanceTimersByTime(25)
    expect(context.oscillators.at(-1)?.startAt).toBeCloseTo(0.43)
    context.currentTime = 0.44
    expect(engine.getVisualBeat()?.index).toBe(1)
  })

  it('stops and disconnects every voice, including already scheduled future clicks', async () => {
    await engine.start(300)
    context.currentTime = 0.18
    vi.advanceTimersByTime(25)
    engine.stop()
    expect(context.oscillators.every(voice => voice.cancelled && voice.disconnected)).toBe(true)
    expect(engine.getVisualBeat()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not emit a burst of missed beats after a stalled scheduler', async () => {
    await engine.start(300)
    context.currentTime = 10
    vi.advanceTimersByTime(25)
    expect(context.oscillators).toHaveLength(2)
    expect(context.oscillators[1].startAt).toBeCloseTo(10.005)
  })

  it('reports browser audio interruption and clears the scheduler', async () => {
    const onInterrupted = vi.fn()
    engine = new MetronomeEngine(() => context as unknown as AudioContext, onInterrupted)
    await engine.start(90)
    context.state = 'suspended'
    context.onstatechange?.()
    expect(engine.isRunning).toBe(false)
    expect(onInterrupted).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
