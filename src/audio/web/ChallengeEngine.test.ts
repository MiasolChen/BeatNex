import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHALLENGES } from '../../core/challenge/challenge'
import { ChallengeEngine, type ChallengeOptions } from './ChallengeEngine'

class FakeParam {
  setValueAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
}

class FakeSource {
  frequency = new FakeParam()
  onended: (() => void) | null = null
  startAt = -1
  stopAt = -1
  cancelled = false
  disconnected = false
  connect() { return this }
  disconnect() { this.disconnected = true }
  start(at: number) { this.startAt = at }
  stop(at?: number) { if (at === undefined) this.cancelled = true; else this.stopAt = at }
}

class FakeContext {
  currentTime = 0
  state: AudioContextState = 'running'
  sampleRate = 48_000
  destination = {}
  onstatechange: (() => void) | null = null
  sources: FakeSource[] = []
  resume = vi.fn(async () => {})
  close = vi.fn(async () => { this.state = 'closed' })
  createGain() { return { gain: new FakeParam(), connect() {}, disconnect() {} } }
  createOscillator() { const source = new FakeSource(); this.sources.push(source); return source }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source }
  createBuffer() { return { getChannelData: () => new Float32Array(1_000) } }
}

const options = (overrides: Partial<ChallengeOptions> = {}): ChallengeOptions => ({
  challenge: CHALLENGES[0], bpm: 90, rounds: 1, sound: 'click', reference: true, volume: 100, ...overrides,
})

describe('ChallengeEngine audio clock and lifecycle', () => {
  let context: FakeContext
  let engine: ChallengeEngine

  beforeEach(() => {
    vi.useFakeTimers()
    context = new FakeContext()
    engine = new ChallengeEngine(() => context as unknown as AudioContext)
  })
  afterEach(() => { engine.dispose(); vi.useRealTimers() })

  it('rejects settings outside the challenge contract', async () => {
    await expect(engine.start(options({ bpm: 39 }))).rejects.toThrow('挑战设置无效')
    await expect(engine.start(options({ bpm: 181 }))).rejects.toThrow('挑战设置无效')
    await expect(engine.start(options({ rounds: 0 }))).rejects.toThrow('挑战设置无效')
    await expect(engine.start(options({ rounds: 5 }))).rejects.toThrow('挑战设置无效')
    await expect(engine.start(options({ volume: -1 }))).rejects.toThrow('挑战设置无效')
    await expect(engine.start(options({ volume: 101 }))).rejects.toThrow('挑战设置无效')
  })

  it('uses the audio clock and emits no reference clicks', async () => {
    await engine.start(options({ bpm: 180, reference: false }))
    expect(context.sources).toHaveLength(1)
    expect(context.sources[0].startAt).toBeCloseTo(0.03)
    expect(engine.position.phraseStep).toBe(0)

    context.currentTime = 0.03 + 15 / 180
    vi.advanceTimersByTime(25)
    expect(engine.position.phraseStep).toBeGreaterThanOrEqual(1)
  })

  it('does not play a legacy reference click on chart two’s empty opening beat', async () => {
    await engine.start(options({ challenge: CHALLENGES[1], bpm: 180, reference: true }))
    const musicStart = 0.03
    const before = context.sources.length

    context.currentTime = musicStart
    vi.advanceTimersByTime(25)
    context.currentTime = musicStart + 0.28
    vi.advanceTimersByTime(25)

    expect(context.sources.filter(source => source.startAt === musicStart)).toHaveLength(0)
    expect(context.sources.length).toBeGreaterThan(before)
    expect(engine.position.step).toBeGreaterThanOrEqual(1)
  })

  it('pauses and resumes from the exact musical position', async () => {
    await engine.start(options({ bpm: 90 }))
    context.currentTime = 0.03 + 23 * (15 / 90) + 0.01
    const before = engine.position.step
    engine.pause()
    expect(engine.running).toBe(false)
    expect(engine.position.step).toBeCloseTo(before)

    await engine.start(options({ bpm: 90 }))
    context.currentTime += 0.03
    expect(engine.position.step).toBeCloseTo(before)
  })

  it('cancels a pending resume and leaves no scheduler or voices', async () => {
    let resume!: () => void
    context.resume.mockImplementation(() => new Promise<void>(resolve => { resume = resolve }))
    const pending = engine.start(options())
    engine.reset()
    resume()
    expect(await pending).toBe(false)
    expect(engine.running).toBe(false)
    expect(context.sources).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops every scheduled voice and does not burst after a timer stall', async () => {
    await engine.start(options({ bpm: 180, rounds: 4 }))
    context.currentTime = 10.25
    vi.advanceTimersByTime(25)
    expect(context.sources.filter(source => source.startAt >= 10.2)).toHaveLength(1)
    engine.reset()
    expect(context.sources.every(source => source.cancelled && source.disconnected)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends once at the total timeline and preserves complete position', async () => {
    await engine.start(options({ bpm: 180, rounds: 1 }))
    context.currentTime = 0.03 + 32 * (15 / 180) + 0.01
    vi.advanceTimersByTime(25)
    expect(engine.running).toBe(false)
    expect(engine.position).toMatchObject({ complete: true, step: 32, total: 32 })
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(100)
    expect(engine.position.step).toBe(32)
  })
})
