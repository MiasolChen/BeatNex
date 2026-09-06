import { DRUM_IDS, type DrumId, type Pattern } from '../core/pattern/types'
import { validatePattern } from '../core/pattern/validate'
import { readLocalList, writeLocalList, type LocalDataStorage } from './localData'

export const COMBINATIONS_KEY = 'beatnex:combinations:v1'

export type Combination = {
  id: string
  name: string
  bpm: number
  pattern: Pattern
  muted: DrumId[]
  /** Stable curated pattern ID, never a transient library index. */
  sourceId: string
}

function nonemptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

export function validateCombinations(value: unknown): asserts value is Combination[] {
  if (!Array.isArray(value)) throw new Error('组合列表无效，原数据已保留')
  const ids = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object'
      || !nonemptyString(item.id, 200) || !nonemptyString(item.name, 40) || !nonemptyString(item.sourceId, 200)
      || !Number.isInteger(item.bpm) || item.bpm < 60 || item.bpm > 140
      || !Array.isArray(item.muted) || item.muted.some((drum: unknown) => !DRUM_IDS.includes(drum as DrumId))
      || new Set(item.muted).size !== item.muted.length) {
      throw new Error('组合内容无效，原数据已保留')
    }
    if (ids.has(item.id)) throw new Error('组合标识重复，原数据已保留')
    ids.add(item.id)
    validatePattern(item.pattern)
  }
}

export function readCombinations(storage?: Pick<Storage, 'getItem'>) {
  return readLocalList<Combination>(COMBINATIONS_KEY, validateCombinations, storage)
}

export function writeCombinations(combinations: Combination[], storage?: LocalDataStorage) {
  return writeLocalList(COMBINATIONS_KEY, combinations, validateCombinations, storage)
}
