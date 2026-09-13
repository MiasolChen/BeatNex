import { describe, expect, it, vi } from 'vitest'
import { scheduleClick } from './clickSound'

class FakeParam {
  setValueAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
}

class FakeOscillator {
  type = ''
  frequency = new FakeParam()
  start = vi.fn()
  stop = vi.fn()
  connect = vi.fn()
}

class FakeContext {
  destination = {}
  oscillator = new FakeOscillator()
  gain = { gain: new FakeParam(), connect: vi.fn() }
  createOscillator = vi.fn(() => this.oscillator)
  createGain = vi.fn(() => this.gain)
}

describe('scheduleClick', () => {
  it('uses the shared short 1 kHz sine envelope', () => {
    const context = new FakeContext()
    const voice = scheduleClick(context as unknown as AudioContext, 2.5)

    expect(voice.oscillator).toBe(context.oscillator)
    expect(context.oscillator.type).toBe('sine')
    expect(context.oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(1000, 2.5)
    expect(context.gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 2.5)
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(.16, 2.502)
    expect(context.gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(.0001, 2.545)
    expect(context.oscillator.start).toHaveBeenCalledWith(2.5)
    expect(context.oscillator.stop).toHaveBeenCalledWith(2.55)
  })

  it('accepts a quieter reference volume without changing timing', () => {
    const context = new FakeContext()
    scheduleClick(context as unknown as AudioContext, 1, .08)
    expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(.08, 1.002)
    expect(context.oscillator.stop).toHaveBeenCalledWith(1.05)
  })
})
