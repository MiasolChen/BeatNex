import { describe, expect, it } from 'vitest'
import { patternDuration, stepsPerBar, stepsPerPattern } from '../timing/musicTime'
import { meterForPattern, patternFromGrid, patternGrid, resizePatternBars, togglePatternStep, withMeter } from './editor'
import { BOOM_BAP_PATTERNS } from './fixtures'
import { METERS, type Pattern } from './types'
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

  it.each([1, 2, 3, 4, 5, 6, 7, 8] as Pattern['bars'][])('resizes to %s bars without mutating or inventing hits', (bars) => {
    const original: Pattern = {
      ...BOOM_BAP_PATTERNS[0],
      bars: 2,
      tracks: BOOM_BAP_PATTERNS[0].tracks.map((track) => ({
        ...track,
        hits: [...track.hits, ...track.hits.map((hit) => ({ ...hit, step: hit.step + 16 }))],
      })),
    }
    const before = structuredClone(original)
    const resized = resizePatternBars(original, bars)

    expect(resized).toEqual({
      ...original,
      bars,
      tracks: original.tracks.map((track) => ({
        ...track,
        hits: track.hits.filter((hit) => hit.step < bars * 16),
      })),
    })
    expect(original).toEqual(before)
    expect(resized.tracks.flatMap((track) => track.hits).every((hit) => hit.step < bars * 16)).toBe(true)
    validatePattern(resized)
  })

  it('rejects bar counts outside 1 through 8', () => {
    const pattern = BOOM_BAP_PATTERNS[0]
    expect(() => resizePatternBars(pattern, 0 as Pattern['bars'])).toThrow('小节数')
    expect(() => resizePatternBars(pattern, 9 as Pattern['bars'])).toThrow('小节数')
    expect(() => resizePatternBars(pattern, 1.5 as Pattern['bars'])).toThrow('小节数')
  })

  it('rejects unsupported meters, incomplete bar grids, and malformed track data', () => {
    expect(() => validatePattern({ ...BOOM_BAP_PATTERNS[0], beatsPerBar: 6 })).toThrow('拍号')
    expect(() => validatePattern({ ...BOOM_BAP_PATTERNS[0], beatsPerBar: '4' })).toThrow('拍号')
    expect(() => validatePattern({ ...withMeter(BOOM_BAP_PATTERNS[0], '7/8'), subdivision: 3 })).toThrow('完整覆盖')
    expect(() => validatePattern({ ...BOOM_BAP_PATTERNS[0], tracks: [null] })).toThrow('轨道')
  })
})
