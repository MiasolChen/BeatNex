import { describe, expect, it } from 'vitest'
import { patternDuration, stepsPerBar, stepsPerPattern } from '../timing/musicTime'
import { meterForPattern, patternFromGrid, patternGrid, togglePatternStep, withMeter } from './editor'
import { BOOM_BAP_PATTERNS } from './fixtures'
import { METERS } from './types'
import { validatePattern } from './validate'

describe('pattern editor and meters', () => {
  it('reads legacy v1 patterns as four quarter-note beats', () => {
    expect(meterForPattern(BOOM_BAP_PATTERNS[0])).toBe('4/4')
    expect(patternFromGrid(BOOM_BAP_PATTERNS[1], patternGrid(BOOM_BAP_PATTERNS[1]))).toEqual(BOOM_BAP_PATTERNS[1])
  })

  it.each(METERS)('supports a complete sixteenth-note grid in %s', (meter) => {
    const [beats, unit] = meter.split('/').map(Number)
    const pattern = withMeter(BOOM_BAP_PATTERNS[1], meter)
    validatePattern(pattern)
    expect(meterForPattern(pattern)).toBe(meter)
    expect(stepsPerBar(pattern)).toBe(beats * 16 / unit)
    expect(patternGrid(pattern).every((row) => row.length === beats * 16 / unit)).toBe(true)
    expect(patternDuration(pattern, 120)).toBeCloseTo(beats * 4 / unit * 0.5)
    expect(patternFromGrid(pattern, patternGrid(pattern))).toEqual(pattern)
  })

  it('edits a step without flattening existing ghost or accent velocities', () => {
    const original = BOOM_BAP_PATTERNS[1]
    const changed = togglePatternStep(original, 'kick', 1)
    expect(changed.tracks[0].hits).toEqual([
      original.tracks[0].hits[0], { step: 1, velocity: 85 }, ...original.tracks[0].hits.slice(1),
    ])
    expect(changed.tracks.slice(1)).toEqual(original.tracks.slice(1))
    expect(togglePatternStep(changed, 'kick', 1)).toEqual(original)
    expect(() => togglePatternStep(original, 'kick', 16)).toThrow('位置')
    expect(() => patternFromGrid(original, [[true]])).toThrow('网格')
  })

  it('preserves bar-relative hit timing when resizing multi-bar patterns', () => {
    const original = { ...BOOM_BAP_PATTERNS[0], bars: 2 as const,
      tracks: BOOM_BAP_PATTERNS[0].tracks.map((track) => ({ ...track, hits: [...track.hits, ...track.hits.map((hit) => ({ ...hit, step: hit.step + 16 }))] })),
    }
    const resized = withMeter(original, '3/4')
    expect(stepsPerPattern(resized)).toBe(24)
    expect(resized.tracks[0].hits.map((hit) => hit.step)).toEqual([0, 4, 8, 12, 16, 20])
    expect(original.tracks[0].hits.map((hit) => hit.step)).toContain(28)
  })

  it('rejects unsupported meters, incomplete bar grids, and malformed track data', () => {
    expect(() => validatePattern({ ...BOOM_BAP_PATTERNS[0], beatsPerBar: 6 })).toThrow('拍号')
    expect(() => validatePattern({ ...BOOM_BAP_PATTERNS[0], beatsPerBar: '4' })).toThrow('拍号')
    expect(() => validatePattern({ ...withMeter(BOOM_BAP_PATTERNS[0], '7/8'), subdivision: 3 })).toThrow('完整覆盖')
    expect(() => validatePattern({ ...BOOM_BAP_PATTERNS[0], tracks: [null] })).toThrow('轨道')
  })
})
