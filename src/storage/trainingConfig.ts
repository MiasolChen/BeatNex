import { PATTERN_NAMES } from '../core/pattern/fixtures'
import { DRUM_IDS, type DrumId } from '../core/pattern/types'
import { DEFAULT_TRAINING_CONFIG, TRAINING_PHASE_DEFINITIONS, type TrainingConfig } from '../core/training/session'
export const TRAINING_CONFIG_KEY = 'beatnex:training-config:v1'
export function readTrainingConfig(storage?: Pick<Storage, 'getItem'>): TrainingConfig {
  if (!storage) return structuredClone(DEFAULT_TRAINING_CONFIG)
  try {
    const value = JSON.parse(storage.getItem(TRAINING_CONFIG_KEY) ?? '') as Partial<TrainingConfig>
    const validPhases = Array.isArray(value.phases) && value.phases.length > 0 && value.phases.every((phase) => phase && typeof phase.instanceId === 'string' && TRAINING_PHASE_DEFINITIONS.some((item) => item.id === phase.id) && Number.isInteger(phase.bars) && phase.bars! >= 1 && phase.bars! <= 32)
    if (value.version !== 1 || !DRUM_IDS.includes(value.targetDrum as DrumId) || !validPhases || !PATTERN_NAMES.includes(value.patternName as never) || !['simple', 'hard'].includes(value.difficulty ?? '') || !Number.isInteger(value.bpm) || value.bpm! < 60 || value.bpm! > 140) throw new Error('invalid')
    return value as TrainingConfig
  } catch { return structuredClone(DEFAULT_TRAINING_CONFIG) }
}
export function writeTrainingConfig(config: TrainingConfig, storage?: Pick<Storage, 'setItem'>) { try { storage?.setItem(TRAINING_CONFIG_KEY, JSON.stringify(config)) } catch { /* Training remains usable without storage. */ } }
