import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TRAINING_CONFIG } from '../core/training/session'
import { PRACTICE_KEY, defaultSettings, readPractice, savePractice, type PracticeSettings } from './practice'
import { TRAINING_CONFIG_KEY } from './trainingConfig'

function useStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
  }
  vi.stubGlobal('window', { localStorage: storage })
  return { data, storage }
}

afterEach(() => vi.unstubAllGlobals())

describe('practice settings persistence', () => {
  it('starts with 24 bars and all drums, using independently mutable defaults', () => {
    const { storage } = useStorage()
    const settings = readPractice()
    expect(settings.phases.reduce((bars, phase) => bars + phase.bars, 0)).toBe(24)
    expect(settings.targets).toHaveLength(4)
    settings.phases[0].bars = 32
    settings.targets.pop()
    expect(readPractice()).toEqual(defaultSettings())
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('round-trips an edited route, no selected drums, and free practice', () => {
    useStorage()
    const settings: PracticeSettings = {
      ...defaultSettings(), targets: [], routeEnabled: false, bpm: 140, patternName: 'Pocket Swing', difficulty: 'hard',
      phases: [{ id: 'solo', instanceId: 'custom-solo', bars: 32 }, { id: 'full', instanceId: 'custom-full', bars: 1 }],
    }
    expect(savePractice(settings)).toBe(true)
    expect(readPractice()).toEqual(settings)
  })

  it('migrates a valid v1 target and custom route without changing the old document', () => {
    const old = { ...DEFAULT_TRAINING_CONFIG, targetDrum: 'snare', bpm: 113, difficulty: 'hard', patternName: 'Syncopated Break' }
    const raw = JSON.stringify(old)
    const { data, storage } = useStorage({ [TRAINING_CONFIG_KEY]: raw })
    const migrated = readPractice()
    expect(migrated).toMatchObject({ version: 2, targets: ['snare'], bpm: 113, difficulty: 'hard', patternName: 'Syncopated Break', phases: old.phases })
    expect(migrated.phases[0].bars).toBe(8)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(savePractice(migrated)).toBe(true)
    expect(readPractice()).toEqual(migrated)
    expect(data.get(TRAINING_CONFIG_KEY)).toBe(raw)
  })

  it.each(['', '{', 'null', JSON.stringify({ ...defaultSettings(), version: 3 })])('keeps corrupt or future v2 bytes untouched during automatic save: %s', (raw) => {
    const { data, storage } = useStorage({ [PRACTICE_KEY]: raw, [TRAINING_CONFIG_KEY]: JSON.stringify(DEFAULT_TRAINING_CONFIG) })
    expect(readPractice()).toEqual(defaultSettings())
    expect(savePractice(readPractice())).toBe(false)
    expect(data.get(PRACTICE_KEY)).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each([
    { patternName: 3 }, { patternName: 'Unknown fixture' }, { difficulty: 'medium' }, { bpm: 88.5 }, { bpm: 141 },
    { targets: ['kick', 'kick'] }, { targets: ['cymbal'] }, { routeEnabled: 'yes' }, { phases: [] },
    { phases: [null] }, { phases: [{ id: 'solo', instanceId: ' ', bars: 4 }] },
    { phases: [{ id: 'solo', instanceId: 'a', bars: 0 }] }, { phases: [{ id: 'solo', instanceId: 'a', bars: 33 }] },
    { phases: [{ id: 'solo', instanceId: 'same', bars: 4 }, { id: 'full', instanceId: 'same', bars: 4 }] },
    { phases: Array.from({ length: 17 }, (_, index) => ({ id: 'solo', instanceId: String(index), bars: 4 })) },
  ])('rejects invalid loaded and new settings: %j', (invalid) => {
    const raw = JSON.stringify({ ...defaultSettings(), ...invalid })
    const { data } = useStorage({ [PRACTICE_KEY]: raw })
    expect(readPractice()).toEqual(defaultSettings())
    expect(savePractice(defaultSettings())).toBe(false)
    expect(data.get(PRACTICE_KEY)).toBe(raw)
    data.delete(PRACTICE_KEY)
    expect(savePractice(JSON.parse(raw))).toBe(false)
    expect(data.has(PRACTICE_KEY)).toBe(false)
  })

  it.each(['{', JSON.stringify({ ...DEFAULT_TRAINING_CONFIG, version: 9 }), JSON.stringify({ ...DEFAULT_TRAINING_CONFIG, phases: [DEFAULT_TRAINING_CONFIG.phases[0], DEFAULT_TRAINING_CONFIG.phases[0]] })])('does not hide a corrupt legacy document behind auto-saved defaults', (raw) => {
    const { data } = useStorage({ [TRAINING_CONFIG_KEY]: raw })
    expect(readPractice()).toEqual(defaultSettings())
    expect(savePractice(readPractice())).toBe(false)
    expect(data.get(TRAINING_CONFIG_KEY)).toBe(raw)
    expect(data.has(PRACTICE_KEY)).toBe(false)
  })

  it('uses a valid v2 document independently of a broken older document', () => {
    const settings = { ...defaultSettings(), bpm: 91 }
    useStorage({ [PRACTICE_KEY]: JSON.stringify(settings), [TRAINING_CONFIG_KEY]: '{' })
    expect(readPractice()).toEqual(settings)
    expect(savePractice({ ...settings, bpm: 93 })).toBe(true)
    expect(readPractice().bpm).toBe(93)
  })

  it('handles absent browser globals, blocked getters, read failures and write failures', () => {
    vi.stubGlobal('window', undefined)
    expect(readPractice()).toEqual(defaultSettings())
    expect(savePractice(defaultSettings())).toBe(false)
    vi.stubGlobal('window', Object.defineProperty({}, 'localStorage', { get: () => { throw new Error('blocked') } }))
    expect(readPractice()).toEqual(defaultSettings())
    expect(savePractice(defaultSettings())).toBe(false)
    const { storage } = useStorage()
    storage.getItem.mockImplementation(() => { throw new Error('read denied') })
    expect(readPractice()).toEqual(defaultSettings())
    expect(savePractice(defaultSettings())).toBe(false)
    storage.getItem.mockImplementation(() => null)
    storage.setItem.mockImplementation(() => { throw new Error('quota') })
    expect(savePractice(defaultSettings())).toBe(false)
  })
})
