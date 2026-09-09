import { readCombinations, validateCombinations, type Combination } from './combinations'
import { isPracticeSettings, type PracticeSettings } from './practice'
import { assertNoImport } from './transaction'

export const VERSIONS_KEY = 'beatnex:combinations:v2'
export type Snapshot = { pattern: Combination['pattern']; bpm: number; muted: Combination['muted']; training: Omit<PracticeSettings, 'workspace'> }
export type Revision = { id: string; number: number; name: string; createdAt: string | null; snapshot: Snapshot; deletedAt?: string }
export type VersionedCombination = { id: string; name: string; sourceId: string; original: Snapshot; currentId: string; nextNumber: number; versions: Revision[]; deletedAt?: string }
type Store = Pick<Storage, 'getItem' | 'setItem'>
const text = (v: unknown, max = 200): v is string => typeof v === 'string' && !!v.trim() && v.length <= max
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const fail = (): never => { throw new Error('版本数据无效，原数据已保留') }
export function makeSnapshot(pattern: Snapshot['pattern'], bpm: number, muted: Snapshot['muted'], settings: PracticeSettings): Snapshot {
  const { workspace: _workspace, ...training } = settings
  return structuredClone({ pattern, bpm, muted, training: { ...training, bpm } })
}
function validateSnapshot(value: Snapshot) {
  if (!value || !isPracticeSettings(value.training) || 'workspace' in value.training || value.training.bpm !== value.bpm) fail()
  validateCombinations([{ id: 'snapshot', name: 'snapshot', sourceId: 'snapshot', pattern: value.pattern, bpm: value.bpm, muted: value.muted }])
}
export function validateVersions(value: unknown): asserts value is VersionedCombination[] {
  if (!Array.isArray(value)) fail()
  const ids = new Set<string>()
  for (const item of value as VersionedCombination[]) {
    if (!item || !text(item.id) || ids.has(item.id) || !text(item.name, 40) || !text(item.sourceId) || !text(item.currentId)
      || !Number.isSafeInteger(item.nextNumber) || item.nextNumber < 2 || !Array.isArray(item.versions) || !item.versions.length
      || (item.deletedAt !== undefined && !date(item.deletedAt))) fail()
    ids.add(item.id)
    validateSnapshot(item.original)
    const revisions = new Set<string>(), numbers = new Set<number>()
    for (const rev of item.versions) {
      if (!rev || !text(rev.id) || revisions.has(rev.id) || !text(rev.name, 40) || !Number.isSafeInteger(rev.number)
        || rev.number < 1 || rev.number >= item.nextNumber || numbers.has(rev.number)
        || (rev.createdAt !== null && !date(rev.createdAt)) || (rev.deletedAt !== undefined && !date(rev.deletedAt))) fail()
      revisions.add(rev.id); numbers.add(rev.number); validateSnapshot(rev.snapshot)
    }
    if (!item.versions.some(rev => rev.id === item.currentId && !rev.deletedAt)) fail()
  }
}
export function currentCombination(item: VersionedCombination): Combination {
  const rev = item.versions.find(rev => rev.id === item.currentId)!
  return { id: item.id, name: item.name, sourceId: item.sourceId, ...rev.snapshot, pattern: { ...rev.snapshot.pattern, name: item.name } }
}
export function encodeVersions(items: VersionedCombination[]) { validateVersions(items); return JSON.stringify({ schemaVersion: 2, items }) }
export function decodeVersions(raw: string): VersionedCombination[] {
  const value = JSON.parse(raw)
  if (!value || value.schemaVersion !== 2) fail()
  validateVersions(value.items); return value.items
}
export function readVersions(settings: PracticeSettings, storage?: Store) {
  try {
    storage ??= window.localStorage
    assertNoImport(storage)
    const raw = storage.getItem(VERSIONS_KEY)
    if (raw !== null) return { value: decodeVersions(raw), error: null }
    const old = readCombinations(storage)
    if (old.error) throw new Error(old.error)
    const items: VersionedCombination[] = old.value.map(item => {
      const snapshot = makeSnapshot(item.pattern, item.bpm, item.muted, settings)
      return { id: item.id, name: item.name, sourceId: item.sourceId, original: snapshot, currentId: 'migrated', nextNumber: 2,
        versions: [{ id: 'migrated', number: 1, name: item.name, createdAt: null, snapshot }] }
    })
    storage.setItem(VERSIONS_KEY, encodeVersions(items))
    return { value: items, error: null }
  } catch (error) { return { value: [] as VersionedCombination[], error: String(error instanceof Error ? error.message : error) } }
}
export function writeVersions(items: VersionedCombination[], storage?: Store) {
  try {
    storage ??= window.localStorage
    assertNoImport(storage)
    const raw = storage.getItem(VERSIONS_KEY)
    if (raw !== null) decodeVersions(raw)
    storage.setItem(VERSIONS_KEY, encodeVersions(items))
    return { ok: true, error: null }
  } catch (error) { return { ok: false, error: String(error instanceof Error ? error.message : error) } }
}
export function appendRevision(items: VersionedCombination[], id: string, name: string, sourceId: string, snapshot: Snapshot): VersionedCombination[] {
  const previous = items.find(item => item.id === id)
  if (previous?.deletedAt) throw new Error('组合已在回收站，请先恢复')
  const rev: Revision = { id: crypto.randomUUID(), number: previous?.nextNumber ?? 1, name: name.trim(), createdAt: new Date().toISOString(), snapshot: structuredClone(snapshot) }
  const item: VersionedCombination = { id, name: name.trim(), sourceId: previous?.sourceId ?? sourceId, original: previous?.original ?? structuredClone(snapshot),
    currentId: rev.id, nextNumber: rev.number + 1, versions: [...(previous?.versions ?? []), rev] }
  const result = [item, ...items.filter(item => item.id !== id)]
  validateVersions(result); return result
}
export type VersionAction = 'rename' | 'trash' | 'restore' | 'purge'
export function changeVersion(items: VersionedCombination[], id: string, action: VersionAction, revisionId?: string, name?: string): VersionedCombination[] {
  const result = structuredClone(items), index = result.findIndex(item => item.id === id), item = result[index]
  if (!item) throw new Error('找不到组合')
  const rev = revisionId ? item.versions.find(rev => rev.id === revisionId) : undefined
  if (revisionId && !rev) throw new Error('找不到版本')
  const target = rev ?? item
  if (action === 'rename') { if (!text(name, 40)) throw new Error('名称须为 1–40 字'); target.name = name.trim() }
  if (action === 'restore') delete target.deletedAt
  if (action === 'trash') {
    if (rev && !rev.deletedAt && item.versions.filter(v => !v.deletedAt).length <= 1) throw new Error('最后一个版本不能单独删除，请将组合移入回收站')
    target.deletedAt = new Date().toISOString()
    if (rev?.id === item.currentId) item.currentId = item.versions.filter(v => !v.deletedAt).sort((a,b) => b.number-a.number)[0].id
  }
  if (action === 'purge') {
    if (!target.deletedAt) throw new Error('只能永久删除回收站中的项目')
    if (rev) item.versions = item.versions.filter(v => v.id !== rev.id)
    else result.splice(index, 1)
  }
  validateVersions(result); return result
}
