export const IMPORT_JOURNAL_KEY = 'beatnex:import-journal:v1'
const KEYS = ['beatnex:combinations:v2', 'beatnex:favorites:v1', 'beatnex:practice:v2'] as const
export function assertNoImport(storage: Pick<Storage, 'getItem'>) {
  if (storage.getItem(IMPORT_JOURNAL_KEY) !== null) throw new Error('备份导入尚未恢复，请刷新重试；原数据已保留')
}
export function recoverImport(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): string | null {
  try {
    storage ??= window.localStorage
    const raw = storage.getItem(IMPORT_JOURNAL_KEY)
    if (raw === null) return null
    const journal = JSON.parse(raw)
    if (journal?.version !== 1 || !Array.isArray(journal.entries) || journal.entries.length !== KEYS.length
      || journal.entries.some((e: {key: string; before: unknown; after: unknown}, i: number) => !e || e.key !== KEYS[i] || (e.before !== null && typeof e.before !== 'string') || typeof e.after !== 'string')) throw new Error('导入恢复日志无效，请保留本机数据')
    for (const entry of journal.entries) {
      if (entry.before === null) storage.removeItem(entry.key)
      else storage.setItem(entry.key, entry.before)
    }
    storage.removeItem(IMPORT_JOURNAL_KEY)
    return null
  } catch (error) { return `导入恢复失败，已锁定保存：${error instanceof Error ? error.message : error}` }
}
export function commitImport(values: [string, string, string], storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  try {
    const target = storage ?? window.localStorage
    assertNoImport(target)
    const entries = KEYS.map((key, i) => ({ key, before: target.getItem(key), after: values[i] }))
    target.setItem(IMPORT_JOURNAL_KEY, JSON.stringify({ version: 1, entries }))
    try {
      for (const entry of entries) target.setItem(entry.key, entry.after)
      target.removeItem(IMPORT_JOURNAL_KEY)
    } catch (error) {
      const failure = recoverImport(target)
      throw new Error(failure ?? `导入失败，已恢复原数据：${error instanceof Error ? error.message : error}`)
    }
    return { ok: true, error: null }
  } catch (error) { return { ok: false, error: String(error instanceof Error ? error.message : error) } }
}
