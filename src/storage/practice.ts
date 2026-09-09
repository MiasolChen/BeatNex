import { PATTERN_NAMES } from '../core/pattern/fixtures'
import { validatePattern } from '../core/pattern/validate'
import { DRUM_IDS, type Pattern, type DrumId } from '../core/pattern/types'
import { TRAINING_PHASE_DEFINITIONS } from '../core/training/session'
import { TRAINING_CONFIG_KEY } from './trainingConfig'

export type RoutePhase = { id: string; instanceId: string; bars: number }
export type PracticeSettings = {
  version: 2
  workspace?: { pattern: Pattern; source: Pattern; muted: DrumId[]; activeId?: string }
  targets: DrumId[]
  freeTargets?: DrumId[]
  freeVolumes?: Partial<Record<DrumId, number>>
  phases: RoutePhase[]
  repeat: 'once' | 'infinite'
  routeEnabled: boolean
  bpm: number
  patternName: string
  difficulty: 'simple' | 'hard'
}
export const PHASE_LABELS = ['完整聆听', '单独听辨', '弱化目标', '正常合奏', '自主保持', '完整检查']
export const PHASE_CODES = ['FULL', 'SOLO', 'FOCUS', 'NORMAL', 'MUTE', 'CHECK']
export const PHASE_GUIDES = ['听完整鼓组，留意 {drum} 的位置', '只听 {drum}，记住每次落点', '{drum} 变轻了，继续留意它', '回到完整鼓组，辨认 {drum}', '隐藏 {drum}，在心中保持它的节奏', '恢复 {drum}，检查心中的落点']
export const phaseIds = TRAINING_PHASE_DEFINITIONS.map((phase) => phase.id)
export const PRACTICE_KEY = 'beatnex:practice:v2'

export const defaultSettings = (): PracticeSettings => ({
  version: 2,
  targets: [...DRUM_IDS],
  phases: phaseIds.map((id, index) => ({ id, instanceId: `phase-${index}`, bars: 4 })),
  repeat: 'once',
  routeEnabled: true,
  bpm: 88,
  patternName: 'Foundation Backbeat',
  difficulty: 'simple',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validPhases(value: unknown): value is RoutePhase[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) return false
  const ids = new Set<string>()
  for (const phase of value) {
    if (!isRecord(phase) || !phaseIds.some((id) => id === phase.id)
      || typeof phase.instanceId !== 'string' || !phase.instanceId.trim() || phase.instanceId.length > 200
      || typeof phase.bars !== 'number' || !Number.isInteger(phase.bars) || phase.bars < 1 || phase.bars > 32
      || ids.has(phase.instanceId)) return false
    ids.add(phase.instanceId)
  }
  return true
}

function validCommon(value: Record<string, unknown>) {
  return validPhases(value.phases)
    && typeof value.bpm === 'number' && Number.isInteger(value.bpm) && value.bpm >= 60 && value.bpm <= 140
    && typeof value.patternName === 'string' && PATTERN_NAMES.includes(value.patternName)
    && (value.difficulty === 'simple' || value.difficulty === 'hard')
}

function validWorkspace(value: unknown): boolean {
  if (value === undefined) return true
  if (!isRecord(value) || !Array.isArray(value.muted)
    || !value.muted.every(drum => DRUM_IDS.includes(drum as DrumId))
    || new Set(value.muted).size !== value.muted.length
    || (value.activeId !== undefined && (typeof value.activeId !== 'string'
      || !value.activeId.trim() || value.activeId.length > 200))) return false
  try {
    validatePattern(value.pattern)
    validatePattern(value.source)
    return true
  } catch { return false }
}

function isPracticeSettings(value: unknown): value is PracticeSettings {
  return isRecord(value) && value.version === 2 && validCommon(value) && validWorkspace(value.workspace)
    && (value.repeat === undefined || value.repeat === 'once' || value.repeat === 'infinite')
    && typeof value.routeEnabled === 'boolean' && Array.isArray(value.targets)
    && value.targets.every((drum) => DRUM_IDS.includes(drum as DrumId))
    && new Set(value.targets).size === value.targets.length
    && (value.freeVolumes === undefined || (isRecord(value.freeVolumes)
      && Object.entries(value.freeVolumes).every(([drum, volume]) => DRUM_IDS.includes(drum as DrumId)
        && typeof volume === 'number' && Number.isInteger(volume) && volume >= 0 && volume <= 100)))
    && (value.freeTargets === undefined || (Array.isArray(value.freeTargets)
      && value.freeTargets.every((drum) => DRUM_IDS.includes(drum as DrumId))
      && new Set(value.freeTargets).size === value.freeTargets.length))
}

/** Read the actual legacy bytes: its forgiving UI reader cannot distinguish corruption from defaults. */
function migrateLegacy(raw: string): PracticeSettings | null {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value) || value.version !== 1 || !validCommon(value) || !DRUM_IDS.includes(value.targetDrum as DrumId)) return null
  return {
    ...defaultSettings(),
    targets: [value.targetDrum as DrumId],
    phases: value.phases as RoutePhase[],
    bpm: value.bpm as number,
    patternName: value.patternName as string,
    difficulty: value.difficulty as PracticeSettings['difficulty'],
  }
}

export function readPractice(): PracticeSettings {
  try {
    if (typeof window === 'undefined') return defaultSettings()
    const storage = window.localStorage
    const raw = storage.getItem(PRACTICE_KEY)
    if (raw !== null) {
      const value: unknown = JSON.parse(raw)
      return isPracticeSettings(value) ? { ...value, repeat: value.repeat ?? 'once' } : defaultSettings()
    }
    const legacy = storage.getItem(TRAINING_CONFIG_KEY)
    if (legacy !== null) return migrateLegacy(legacy) ?? defaultSettings()
  } catch { /* Keep practice usable when access or stored bytes are invalid. Never write during a read. */ }
  return defaultSettings()
}

export function savePractice(value: PracticeSettings): boolean {
  try {
    if (!isPracticeSettings(value) || typeof window === 'undefined') return false
    const storage = window.localStorage
    const existing = storage.getItem(PRACTICE_KEY)
    if (existing !== null) {
      // Automatic saves must not destroy a recoverable or newer settings document.
      if (!isPracticeSettings(JSON.parse(existing))) return false
    } else {
      const legacy = storage.getItem(TRAINING_CONFIG_KEY)
      // Do not mask broken legacy settings with defaults saved under the new key.
      if (legacy !== null && !migrateLegacy(legacy)) return false
    }
    storage.setItem(PRACTICE_KEY, JSON.stringify(value))
    return true
  } catch { return false }
}
