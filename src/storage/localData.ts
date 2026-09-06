export type StorageReadResult<T> = { value: T; error: string | null }
export type StorageWriteResult = { ok: boolean; error: string | null }
export type LocalDataStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): Storage {
  if (typeof window === 'undefined') throw new Error('当前环境无法使用浏览器存储')
  return window.localStorage
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '本地存储不可用'
}

/** Invalid data stays untouched, so the caller can surface a recoverable error. */
export function readLocalList<T>(key: string, validate: (value: unknown) => asserts value is T[], storage?: Pick<Storage, 'getItem'>): StorageReadResult<T[]> {
  try {
    const raw = (storage ?? browserStorage()).getItem(key)
    if (raw === null) return { value: [], error: null }
    const envelope: unknown = JSON.parse(raw)
    if (!envelope || typeof envelope !== 'object' || !('schemaVersion' in envelope) || envelope.schemaVersion !== 1 || !('items' in envelope)) {
      throw new Error('本地数据版本无效，原数据已保留')
    }
    validate(envelope.items)
    return { value: envelope.items, error: null }
  } catch (error) {
    return { value: [], error: errorMessage(error) }
  }
}

export function writeLocalList<T>(key: string, items: T[], validate: (value: unknown) => asserts value is T[], storage?: LocalDataStorage): StorageWriteResult {
  try {
    validate(items)
    const target = storage ?? browserStorage()
    const previous = readLocalList(key, validate, target)
    if (previous.error) return { ok: false, error: `无法覆盖现有数据：${previous.error}` }
    target.setItem(key, JSON.stringify({ schemaVersion: 1, items }))
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}
