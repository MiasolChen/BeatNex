import { readLocalList, writeLocalList, type LocalDataStorage } from './localData'

export const FAVORITES_KEY = 'beatnex:favorites:v1'

export function validateFavorites(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim() || id.length > 200)
    || new Set(value).size !== value.length) throw new Error('收藏数据无效，原数据已保留')
}

export function readFavorites(storage?: Pick<Storage, 'getItem'>) {
  return readLocalList<string>(FAVORITES_KEY, validateFavorites, storage)
}

export function writeFavorites(ids: string[], storage?: LocalDataStorage) {
  return writeLocalList(FAVORITES_KEY, ids, validateFavorites, storage)
}
