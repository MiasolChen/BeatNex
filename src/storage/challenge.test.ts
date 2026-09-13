import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHALLENGE, CHALLENGE_KEY, readChallenge, validChallengeData, writeChallenge } from './challenge'

const storage = (initial?: string, setItem = (_key: string, _value: string) => {}) => {
  let value = initial ?? null
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { setItem(_key, next); value = next }),
  }
}

describe('challenge storage', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('round-trips settings, completion count, and the latest feedback record', () => {
    const value = { ...DEFAULT_CHALLENGE, settings: { ...DEFAULT_CHALLENGE.settings, id: 'short-phrase-3', bpm: 120, rounds: 2, sound: 'clap' as const, reference: false, volume: 70 }, completions: 3, last: { id: 'short-phrase-3', at: '2026-09-13T00:00:00.000Z', bpm: 120, rounds: 2, sound: 'clap' as const, reference: false, volume: 70, feedback: '刚刚好' } }
    const target = storage()
    vi.stubGlobal('localStorage', target)
    expect(writeChallenge(value)).toBe('')
    expect(readChallenge()).toEqual({ data: value, error: '' })
    expect(target.setItem).toHaveBeenCalledWith(CHALLENGE_KEY, JSON.stringify(value))
  })

  it('accepts older settings that have no display preference', () => {
    const { display: _display, ...legacySettings } = DEFAULT_CHALLENGE.settings
    const value = { ...DEFAULT_CHALLENGE, settings: legacySettings }
    expect(validChallengeData(value)).toBe(true)

    const target = storage(JSON.stringify(value))
    vi.stubGlobal('localStorage', target)
    expect(readChallenge()).toEqual({ data: value, error: '' })
  })

  it.each([
    ['negative completions', { ...DEFAULT_CHALLENGE, completions: -1 }],
    ['fractional completions', { ...DEFAULT_CHALLENGE, completions: 1.5 }],
    ['unknown challenge', { ...DEFAULT_CHALLENGE, settings: { ...DEFAULT_CHALLENGE.settings, id: 'unknown' } }],
    ['invalid display mode', { ...DEFAULT_CHALLENGE, settings: { ...DEFAULT_CHALLENGE.settings, display: 'staff-and-grid' } }],
    ['out of range tempo', { ...DEFAULT_CHALLENGE, settings: { ...DEFAULT_CHALLENGE.settings, bpm: 181 } }],
    ['invalid feedback', { ...DEFAULT_CHALLENGE, last: { ...DEFAULT_CHALLENGE.settings, at: '2026-09-13T00:00:00.000Z', feedback: '准确率' } }],
  ])('rejects %s without treating it as valid data', (_label, value) => {
    expect(validChallengeData(value)).toBe(false)
  })

  it('retains corrupt or unknown existing data instead of overwriting it', () => {
    const raw = '{"schemaVersion":1,"settings":{"id":"unknown"}}'
    const target = storage(raw)
    vi.stubGlobal('localStorage', target)
    expect(readChallenge()).toEqual({ data: DEFAULT_CHALLENGE, error: expect.any(String) })
    expect(writeChallenge(DEFAULT_CHALLENGE)).toContain('无法保存')
    expect(target.getItem()).toBe(raw)
    expect(target.setItem).not.toHaveBeenCalled()
  })

  it('reports quota failures while preserving the prior serialized record', () => {
    const previous = JSON.stringify(DEFAULT_CHALLENGE)
    const target = storage(previous, () => { throw new Error('quota') })
    vi.stubGlobal('localStorage', target)
    const next = { ...DEFAULT_CHALLENGE, completions: 1 }
    expect(writeChallenge(next)).toContain('无法保存')
    expect(target.getItem()).toBe(previous)
  })
})
