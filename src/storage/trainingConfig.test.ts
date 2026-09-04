import { describe, expect, it } from 'vitest'
import { DEFAULT_TRAINING_CONFIG } from '../core/training/session'
import { readTrainingConfig, TRAINING_CONFIG_KEY, writeTrainingConfig } from './trainingConfig'
describe('training configuration storage', () => {
  it('round-trips the complete last training configuration', () => {
    const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const config = { ...DEFAULT_TRAINING_CONFIG, targetDrum: 'snare' as const, bpm: 104, phases: [{ id: 'solo' as const, instanceId: 'solo-a', bars: 7 }] }
    writeTrainingConfig(config, storage); expect(readTrainingConfig(storage)).toEqual(config)
  })
  it('falls back safely when stored configuration is invalid', () => { const storage = { getItem: (key: string) => key === TRAINING_CONFIG_KEY ? '{"version":1,"phases":[]}' : null }; expect(readTrainingConfig(storage)).toEqual(DEFAULT_TRAINING_CONFIG) })
})
