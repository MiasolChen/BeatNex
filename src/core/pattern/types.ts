export const DRUM_IDS = ['kick', 'snare', 'closedHat', 'openHat'] as const

export type DrumId = (typeof DRUM_IDS)[number]
export type Difficulty = 'simple' | 'hard'

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
  bars: 1 | 2 | 4 | 8
  beatsPerBar: 4
  subdivision: 2 | 3 | 4
  recommendedBpm: number
  tracks: PatternTrack[]
}
