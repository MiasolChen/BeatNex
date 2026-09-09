import { afterEach, describe, expect, it, vi } from 'vitest'
import { resizePatternBars, togglePatternStep, withMeter, withSubdivision } from '../core/pattern/editor'
import { BOOM_BAP_PATTERNS } from '../core/pattern/fixtures'
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
  it('keeps route targets and free playback drums independent across reloads', () => {
    useStorage()
    expect(savePractice({ ...defaultSettings(), targets: ['kick'], freeTargets: ['snare'] })).toBe(true)
    expect(readPractice().targets).toEqual(['kick'])
    expect(readPractice().freeTargets).toEqual(['snare'])
    expect(savePractice({ ...readPractice(), targets: ['closedHat'] })).toBe(true)
    expect(readPractice().freeTargets).toEqual(['snare'])
  })

  it('preserves corrupt free drum settings rather than overwriting them', () => {
    const raw = JSON.stringify({ ...defaultSettings(), freeTargets: ['unknown'] })
    const { data } = useStorage({ [PRACTICE_KEY]: raw })
    expect(savePractice(defaultSettings())).toBe(false)
    expect(data.get(PRACTICE_KEY)).toBe(raw)
  })

  it('defaults older v2 settings to once and persists infinite mode', () => {
    const { repeat: _, ...old } = defaultSettings()
    useStorage({ [PRACTICE_KEY]: JSON.stringify(old) })
    expect(readPractice().repeat).toBe('once')
    expect(savePractice({ ...readPractice(), repeat: 'infinite' })).toBe(true)
    expect(readPractice().repeat).toBe('infinite')
  })

  it('does not overwrite an unknown repeat mode', () => {
    const raw = JSON.stringify({ ...defaultSettings(), repeat: 'future-mode' })
    const { data } = useStorage({ [PRACTICE_KEY]: raw })
    expect(readPractice().repeat).toBe('once')
    expect(savePractice(defaultSettings())).toBe(false)
    expect(data.get(PRACTICE_KEY)).toBe(raw)
  })

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

  it.each([1, 2, 3, 4])('round-trips call practice with %s bars', (callBars) => {
    useStorage()
    const settings = { ...defaultSettings(), callEnabled: true, callBars }
    expect(savePractice(settings)).toBe(true)
    expect(readPractice()).toEqual(settings)
  })

  it('keeps older route settings unchanged when call fields are absent', () => {
    const settings = { ...defaultSettings(), routeEnabled: false, workspace: {
      pattern: BOOM_BAP_PATTERNS[0], source: BOOM_BAP_PATTERNS[0], muted: ['snare'] as const, activeId: 'draft-1',
    }}
    useStorage({ [PRACTICE_KEY]: JSON.stringify(settings) })
    expect(readPractice()).toEqual(settings)
    expect(readPractice()).not.toHaveProperty('callEnabled')
    expect(readPractice()).not.toHaveProperty('callBars')
  })

  it('defaults free drum volumes to 100 and round-trips edited volumes', () => {
    useStorage()
    expect(defaultSettings().freeVolumes).toBeUndefined()
    const settings = { ...defaultSettings(), freeVolumes: { kick: 25, closedHat: 100 } }
    expect(savePractice(settings)).toBe(true)
    expect(readPractice().freeVolumes).toEqual(settings.freeVolumes)
  })

  it.each([
    { freeVolumes: { kick: -1, snare: 100, closedHat: 100, openHat: 100 } },
    { freeVolumes: { kick: 101, snare: 100, closedHat: 100, openHat: 100 } },
    { freeVolumes: { kick: 12.5, snare: 100, closedHat: 100, openHat: 100 } },
    { freeVolumes: { kick: 100, snare: 100, closedHat: 100, unknown: 50 } },
  ])('rejects invalid free drum volumes: %j', (invalid) => {
    const raw = JSON.stringify({ ...defaultSettings(), ...invalid })
    const { data } = useStorage({ [PRACTICE_KEY]: raw })
    expect(readPractice()).toEqual(defaultSettings())
    expect(savePractice(defaultSettings())).toBe(false)
    expect(data.get(PRACTICE_KEY)).toBe(raw)
  })

  it('accepts partial free drum volumes and leaves absent drums at the default', () => {
    const settings = { ...defaultSettings(), freeVolumes: { snare: 0 } }
    useStorage()
    expect(savePractice(settings)).toBe(true)
    expect(readPractice().freeVolumes).toEqual({ snare: 0 })
  })

  it('keeps older settings valid without adding free drum volumes', () => {
    const old = defaultSettings()
    useStorage({ [PRACTICE_KEY]: JSON.stringify(old) })
    expect(readPractice()).toEqual(old)
  })

  it('round-trips an edited multi-bar workspace with its source, mutes, and active combination', () => {
    const source = resizePatternBars(withMeter(BOOM_BAP_PATTERNS[1], '3/4'), 2)
    const settings: PracticeSettings = {
      ...defaultSettings(),
      workspace: {
        pattern: togglePatternStep(source, 'kick', 1),
        source,
        muted: ['snare', 'openHat'],
        activeId: 'saved-combination-3-4',
      },
    }
    useStorage()
    expect(savePractice(settings)).toBe(true)
    expect(readPractice()).toEqual(settings)
  })

  it('round-trips a six-step workspace for restore after refresh', () => {
    const source = withSubdivision(BOOM_BAP_PATTERNS[1], 6)
    const settings: PracticeSettings = {
      ...defaultSettings(),
      workspace: { pattern: source, source, muted: [], activeId: 'saved-triplet-6' },
    }
    useStorage()
    expect(savePractice(settings)).toBe(true)
    expect(readPractice().workspace).toEqual(settings.workspace)
  })

  it.each([
    null,
    { pattern: { ...BOOM_BAP_PATTERNS[0], bars: 0 }, source: BOOM_BAP_PATTERNS[0], muted: [] },
    { pattern: BOOM_BAP_PATTERNS[0], source: { ...BOOM_BAP_PATTERNS[0], tracks: [] }, muted: [] },
    { pattern: BOOM_BAP_PATTERNS[0], source: BOOM_BAP_PATTERNS[0], muted: ['snare', 'snare'] },
    { pattern: BOOM_BAP_PATTERNS[0], source: BOOM_BAP_PATTERNS[0], muted: ['cymbal'] },
    { pattern: BOOM_BAP_PATTERNS[0], source: BOOM_BAP_PATTERNS[0], muted: [], activeId: ' ' },
    { pattern: BOOM_BAP_PATTERNS[0], source: BOOM_BAP_PATTERNS[0], muted: [], activeId: 'x'.repeat(201) },
  ])('rejects malformed workspace and preserves its bytes during automatic save: %j', (workspace) => {
    const raw = JSON.stringify({ ...defaultSettings(), workspace })
    const { data } = useStorage({ [PRACTICE_KEY]: raw })
    expect(readPractice()).toEqual(defaultSettings())
    expect(savePractice(defaultSettings())).toBe(false)
    expect(data.get(PRACTICE_KEY)).toBe(raw)
  })

  it('keeps settings without a workspace compatible', () => {
    const old = defaultSettings()
    useStorage({ [PRACTICE_KEY]: JSON.stringify(old) })
    expect(readPractice()).toEqual(old)
    expect(savePractice(old)).toBe(true)
    expect(readPractice()).toEqual(old)
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
    { callEnabled: 'yes' }, { callBars: 0 }, { callBars: 5 }, { callBars: 1.5 },
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
