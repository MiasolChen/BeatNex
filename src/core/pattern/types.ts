export const DRUM_IDS = ['kick', 'snare', 'closedHat', 'openHat'] as const

export type DrumId = (typeof DRUM_IDS)[number]
export type Difficulty = 'simple' | 'hard'
export const METERS = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'] as const
export type Meter = (typeof METERS)[number]

export type Hit = {
  step: number
  velocity: number
}

export type PatternTrack = {
  drum: DrumId
  hits: Hit[]
}

export type Pattern = {
  schemaVersion: 1
  id: string
  name: string
  style: 'boom-bap'
  difficulty: Difficulty
  bars: number
  beatsPerBar: 2 | 3 | 4 | 5 | 6 | 7 | 9 | 12
  /** Missing in the original v1 fixtures; those patterns use quarter-note beats. */
  beatUnit?: 4 | 8
  /** Steps per quarter note, independent of the meter denominator. */
  subdivision: 2 | 3 | 4 | 6
  recommendedBpm: number
  tracks: PatternTrack[]
}
