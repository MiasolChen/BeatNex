import type { DrumId, Pattern } from '../core/pattern/types'

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error'

export type TrackMix = {
  muted: boolean
  solo: boolean
  focused: boolean
  volume: number
}

export type PlaybackRequest = {
  pattern: Pattern
  bpm: number
  countIn: boolean
}

export type PlaybackPosition = {
  status: EngineStatus
  step: number
  cycle: number
  progress: number
  isCountIn: boolean
  elapsed: number
}

export type EngineDiagnostics = {
  scheduledHits: number
  skippedSteps: number
  minScheduleLeadMs: number | null
  maxScheduleLeadMs: number | null
}

export type DrumKit = Record<DrumId, string>

export type EngineSnapshot = PlaybackPosition & {
  error?: string
  diagnostics: EngineDiagnostics
}

export interface AudioEngine {
  prepare(kit: DrumKit): Promise<void>
  start(request: PlaybackRequest): Promise<void>
  pause(): void
  stop(): void
  update(request: Omit<PlaybackRequest, 'countIn'>): void
  setTrackMix(drum: DrumId, mix: TrackMix): void
  getPosition(): PlaybackPosition
  getSnapshot(): EngineSnapshot
  subscribe(listener: () => void): () => void
  dispose(): void
}
