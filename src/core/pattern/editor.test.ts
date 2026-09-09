import { describe, expect, it } from 'vitest'
import { patternDuration, stepsPerBar, stepsPerPattern } from '../timing/musicTime'
import { meterForPattern, patternFromGrid, patternGrid, resizePatternBars, togglePatternStep, withMeter, withSubdivision } from './editor'
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

  it.each(METERS.flatMap(meter => [1, 8].map(bars => [meter, bars] as const)))('supports every approved subdivision in %s across %i bars', (meter, bars) => {
    const [_, unit] = meter.split('/').map(Number)
    for (const selected of [2, 3, 4] as const) {
      const meterPattern = withMeter({ ...BOOM_BAP_PATTERNS[1], bars }, meter)
      const subdivision = selected === 3 && unit === 8 ? 6 : selected
      const pattern = withSubdivision(meterPattern, subdivision)
      validatePattern(pattern)
      expect(stepsPerBar(pattern)).toBe(Math.floor(stepsPerBar(pattern)))
      expect(patternGrid(pattern).every(row => row.length === stepsPerPattern(pattern))).toBe(true)
    }
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

  it('quantizes each bar when changing subdivision, clamps the last step, and keeps the stronger collision', () => {
    const original: Pattern = {
      ...BOOM_BAP_PATTERNS[0], bars: 2, subdivision: 4,
      tracks: BOOM_BAP_PATTERNS[0].tracks.map((track) => track.drum === 'kick' ? ({ drum: 'kick' as const, hits: [
        { step: 1, velocity: 52 }, { step: 2, velocity: 61 }, { step: 15, velocity: 70 },
        { step: 16, velocity: 80 }, { step: 17, velocity: 91 }, { step: 31, velocity: 63 },
      ] }) : ({ ...track, hits: [] })),
    }
    const before = structuredClone(original)
    const changed = withSubdivision(original, 2)

    expect(changed.subdivision).toBe(2)
    expect(changed.tracks[0].hits).toEqual([
      { step: 1, velocity: 61 }, { step: 7, velocity: 70 },
      { step: 8, velocity: 80 }, { step: 9, velocity: 91 }, { step: 15, velocity: 63 },
    ])
    expect(changed.tracks[0].hits.every(hit => hit.step < 16 * 2)).toBe(true)
    expect(original).toEqual(before)
  })

  it('maps triplet subdivision to the matching denominator when changing meter', () => {
    const original: Pattern = {
      ...BOOM_BAP_PATTERNS[0], subdivision: 3,
      tracks: BOOM_BAP_PATTERNS[0].tracks.map((track) => track.drum === 'kick' ? ({ drum: 'kick' as const, hits: [{ step: 2, velocity: 90 }, { step: 8, velocity: 80 }] }) : ({ ...track, hits: [] })),
    }
    const inEighths = withMeter(original, '6/8')
    expect(inEighths.subdivision).toBe(6)
    expect(inEighths.tracks[0].hits).toEqual([{ step: 4, velocity: 90 }, { step: 16, velocity: 80 }])

    const backInQuarters = withMeter(inEighths, '4/4')
    expect(backInQuarters.subdivision).toBe(3)
    expect(backInQuarters.tracks[0].hits).toEqual(original.tracks[0].hits)
  })

  it('crops converted odd-meter bars without leaking hits across the new boundary', () => {
    const source = withSubdivision(withMeter(BOOM_BAP_PATTERNS[1], '7/8'), 6)
    const converted = withMeter(source, '4/4')
    expect(converted.subdivision).toBe(3)
    expect(meterForPattern(converted)).toBe('4/4')
    expect(converted.tracks.flatMap(track => track.hits).every(hit => hit.step < stepsPerBar(converted))).toBe(true)
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
