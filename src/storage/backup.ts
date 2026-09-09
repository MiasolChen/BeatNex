import { encodeVersions, validateVersions, type VersionedCombination } from './versions'
import { validateFavorites } from './favorites'
import { isPracticeSettings, type PracticeSettings } from './practice'

export type Backup = { format: 'beatnex-backup'; schemaVersion: 1; exportedAt: string; combinations: VersionedCombination[]; favorites: string[]; practice: PracticeSettings }
export function validateBackup(value: unknown): asserts value is Backup {
  const b = value as Backup
  if (!b || b.format !== 'beatnex-backup' || b.schemaVersion !== 1 || typeof b.exportedAt !== 'string' || !Number.isFinite(Date.parse(b.exportedAt))) throw new Error('不支持的备份格式或版本')
  validateVersions(b.combinations); validateFavorites(b.favorites)
  if (!isPracticeSettings(b.practice)) throw new Error('备份练习设置无效')
  const id = b.practice.workspace?.activeId
  if (id && !b.combinations.some(item => item.id === id && !item.deletedAt)) throw new Error('备份草稿引用的组合不存在')
}
export function parseBackup(raw: string): Backup { const value: unknown = JSON.parse(raw); validateBackup(value); return value }
export function createBackup(combinations: VersionedCombination[], favorites: string[], practice: PracticeSettings): Backup {
  const value: Backup = { format: 'beatnex-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), combinations, favorites, practice }
  validateBackup(value); return structuredClone(value)
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}'
  return JSON.stringify(value)
}
function content(item: VersionedCombination) {
  return canonical({ ...item, id: undefined, currentId: item.versions.find(v => v.id === item.currentId)?.number,
    versions: item.versions.map(v => ({ ...v, id: undefined })) })
}
export function mergeBackup(local: Backup, incoming: Backup, restorePractice: boolean): Backup {
  validateBackup(local); validateBackup(incoming)
  const result = structuredClone(local), ids = new Map<string,string>()
  for (const item of incoming.combinations) {
    const existing = result.combinations.find(x => content(x) === content(item))
    if (existing) { ids.set(item.id, existing.id); continue }
    const copy = structuredClone(item)
    if (result.combinations.some(x => x.id === copy.id)) {
      copy.id = crypto.randomUUID()
      copy.versions = copy.versions.map(v => {
        const id = crypto.randomUUID()
        if (v.id === item.currentId) copy.currentId = id
        return { ...v, id }
      })
    }
    ids.set(item.id, copy.id); result.combinations.push(copy)
  }
  result.favorites = [...new Set([...local.favorites, ...incoming.favorites])]
  if (restorePractice) {
    result.practice = structuredClone(incoming.practice)
    const workspace = result.practice.workspace
    if (workspace?.activeId) workspace.activeId = ids.get(workspace.activeId)
  }
  validateBackup(result); return result
}
export function backupValues(backup: Backup): [string, string, string] {
  validateBackup(backup)
  return [encodeVersions(backup.combinations), JSON.stringify({ schemaVersion: 1, items: backup.favorites }), JSON.stringify(backup.practice)]
}
