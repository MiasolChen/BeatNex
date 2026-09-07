import { stepsPerBar, stepsPerPattern } from '../timing/musicTime'
import { DRUM_IDS, METERS, type DrumId, type Meter, type Pattern } from './types'
import { validatePattern } from './validate'

export function meterForPattern(pattern: Pattern): Meter {
  return `${pattern.beatsPerBar}/${pattern.beatUnit ?? 4}` as Meter
}

/** Change the bar width without changing retained hits' timing or velocity. */
export function withMeter(pattern: Pattern, meter: Meter): Pattern {
  if (!METERS.includes(meter)) throw new Error('拍号无效')
  const [beatsPerBar, beatUnit] = meter.split('/').map(Number)
  const next = {
    ...pattern,
    beatsPerBar: beatsPerBar as Pattern['beatsPerBar'],
    beatUnit: beatUnit as Pattern['beatUnit'],
  }
  const oldWidth = stepsPerBar(pattern)
  const newWidth = stepsPerBar(next)
  next.tracks = pattern.tracks.map((track) => ({
    ...track,
    hits: track.hits.flatMap((hit) => {
      const offset = hit.step % oldWidth
      return offset < newWidth ? [{ ...hit, step: Math.floor(hit.step / oldWidth) * newWidth + offset }] : []
    }),
  }))
  validatePattern(next)
  return next
}

/** A UI grid is deliberately boolean; the Pattern remains the velocity source. */
export function patternGrid(pattern: Pattern): boolean[][] {
  const width = stepsPerPattern(pattern)
  return DRUM_IDS.map((drum) => {
    const hits = new Set(pattern.tracks.find((track) => track.drum === drum)?.hits.map((hit) => hit.step))
    return Array.from({ length: width }, (_, step) => hits.has(step))
  })
}

export function patternFromGrid(pattern: Pattern, grid: boolean[][], velocity = 85): Pattern {
  const width = stepsPerPattern(pattern)
  if (!Array.isArray(grid) || grid.length !== DRUM_IDS.length
    || grid.some((row) => !Array.isArray(row) || row.length !== width || row.some((cell) => typeof cell !== 'boolean'))) {
    throw new Error('鼓机网格尺寸或鼓点无效')
  }
  if (!Number.isInteger(velocity) || velocity < 1 || velocity > 100) throw new Error('新增鼓点力度无效')
  const next: Pattern = {
    ...pattern,
    tracks: DRUM_IDS.map((drum, index) => {
      const previous = new Map(pattern.tracks.find((track) => track.drum === drum)?.hits.map((hit) => [hit.step, hit.velocity]))
      return { drum, hits: grid[index].flatMap((active, step) => active ? [{ step, velocity: previous.get(step) ?? velocity }] : []) }
    }),
  }
  validatePattern(next)
  return next
}

export function togglePatternStep(pattern: Pattern, drum: DrumId, step: number, velocity = 85): Pattern {
  const index = DRUM_IDS.indexOf(drum)
  if (index < 0 || !Number.isInteger(step) || step < 0 || step >= stepsPerPattern(pattern)) throw new Error('鼓点位置无效')
  const grid = patternGrid(pattern)
  grid[index][step] = !grid[index][step]
  return patternFromGrid(pattern, grid, velocity)
}

/** Keep existing bars; newly added bars are blank. Shrinking is undoable by the editor. */
export function resizePatternBars(pattern: Pattern, bars: number): Pattern {
  const next = {...pattern, bars, tracks: pattern.tracks.map(track => ({...track,
    hits: track.hits.filter(hit => hit.step < stepsPerBar(pattern) * bars).map(hit => ({...hit})),
  }))}
  validatePattern(next)
  return next
}
