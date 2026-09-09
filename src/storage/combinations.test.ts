import { describe, expect, it } from 'vitest'
import { withMeter } from '../core/pattern/editor'
import { BOOM_BAP_PATTERNS } from '../core/pattern/fixtures'
import { METERS } from '../core/pattern/types'
import { COMBINATIONS_KEY, readCombinations, writeCombinations, type Combination } from './combinations'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

const combination: Combination = {
  id: 'mix-1', name: '我的 Groove', bpm: 88, pattern: BOOM_BAP_PATTERNS[1], muted: ['openHat'], sourceId: BOOM_BAP_PATTERNS[1].id,
}

describe('saved combinations', () => {
  it.each(METERS)('round-trips the full audible state in %s', (meter) => {
    const storage = memoryStorage()
    const entry = { ...combination, pattern: withMeter(combination.pattern, meter) }
    expect(writeCombinations([entry], storage)).toEqual({ ok: true, error: null })
    expect(readCombinations(storage)).toEqual({ value: [entry], error: null })
    expect(JSON.parse(storage.getItem(COMBINATIONS_KEY)!)).toMatchObject({ schemaVersion: 1 })
  })

  it('round-trips an eighth-note triplet subdivision of 6', () => {
    const storage = memoryStorage()
    const entry = { ...combination, pattern: { ...combination.pattern, subdivision: 6 as const } }
    expect(writeCombinations([entry], storage)).toEqual({ ok: true, error: null })
    expect(readCombinations(storage)).toEqual({ value: [entry], error: null })
  })

  it('starts empty and never reads prototype data', () => {
    const storage = memoryStorage({ 'beatnex-touch-prototype': JSON.stringify([combination]) })
    expect(readCombinations(storage)).toEqual({ value: [], error: null })
  })

  it.each(['{', JSON.stringify({ schemaVersion: 2, items: [] }), JSON.stringify({ schemaVersion: 1, items: [{ ...combination, bpm: 900 }] })])('preserves invalid raw storage and exposes a failed save: %s', (raw) => {
    const storage = memoryStorage({ [COMBINATIONS_KEY]: raw })
    expect(readCombinations(storage).error).toBeTruthy()
    expect(writeCombinations([combination], storage).ok).toBe(false)
    expect(storage.getItem(COMBINATIONS_KEY)).toBe(raw)
  })

  it('reports denied storage and quota errors', () => {
    const denied = { getItem: () => { throw new Error('denied') }, setItem: () => {} }
    expect(readCombinations(denied).error).toBe('denied')
    const full = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    expect(writeCombinations([combination], full)).toEqual({ ok: false, error: 'quota' })
  })

  it('rejects invalid new data before altering valid stored combinations', () => {
    const storage = memoryStorage()
    writeCombinations([combination], storage)
    const raw = storage.getItem(COMBINATIONS_KEY)
    expect(writeCombinations([combination, combination], storage).ok).toBe(false)
    expect(writeCombinations([{ ...combination, muted: ['snare', 'snare'] }], storage).ok).toBe(false)
    expect(writeCombinations([{ ...combination, name: ' ' }], storage).ok).toBe(false)
    expect(storage.getItem(COMBINATIONS_KEY)).toBe(raw)
  })
})
