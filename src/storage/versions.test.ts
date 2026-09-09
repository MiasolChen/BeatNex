import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOOM_BAP_PATTERNS } from '../core/pattern/fixtures'
import { defaultSettings } from './practice'
import {
  VERSIONS_KEY,
  appendRevision,
  changeVersion,
  currentCombination,
  makeSnapshot,
  readVersions,
  writeVersions,
  type Snapshot,
  type VersionedCombination,
} from './versions'

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const pattern = BOOM_BAP_PATTERNS[1]
const settings = defaultSettings()
const snapshot = (): Snapshot => makeSnapshot(pattern, 96, ['openHat'], settings)

function item(): VersionedCombination {
  const versionId = 'revision-1'
  const value = snapshot()
  return {
    id: 'mix-1', name: 'Pocket', sourceId: pattern.id, original: value, currentId: versionId, nextNumber: 2,
    versions: [{ id: versionId, number: 1, name: 'Pocket', createdAt: null, snapshot: value }],
  }
}

describe('versioned combinations', () => {
  beforeEach(() => vi.stubGlobal('crypto', { randomUUID: () => `generated-${Math.random()}` }))
  it('migrates v1 combinations once and preserves the original v1 bytes', () => {
    const old = { schemaVersion: 1, items: [{ id: 'mix-1', name: 'Pocket', bpm: 96, pattern, muted: ['openHat'], sourceId: pattern.id }] }
    const target = storage({ 'beatnex:combinations:v1': JSON.stringify(old) })
    const first = readVersions(settings, target)
    expect(first.error).toBeNull()
    expect(first.value[0]).toMatchObject({ id: 'mix-1', currentId: 'migrated', nextNumber: 2 })
    expect(first.value[0].versions[0]).toMatchObject({ id: 'migrated', number: 1, createdAt: null })
    expect(target.getItem('beatnex:combinations:v1')).toBe(JSON.stringify(old))
    const raw = target.getItem(VERSIONS_KEY)
    expect(readVersions(settings, target).value).toEqual(first.value)
    expect(target.getItem(VERSIONS_KEY)).toBe(raw)
  })

  it('refuses to overwrite malformed v2 data', () => {
    const raw = JSON.stringify({ schemaVersion: 2, items: [{ id: 'broken' }] })
    const target = storage({ [VERSIONS_KEY]: raw })
    expect(readVersions(settings, target).error).toBeTruthy()
    expect(writeVersions([item()], target).ok).toBe(false)
    expect(target.getItem(VERSIONS_KEY)).toBe(raw)
  })

  it('appends immutable revisions and does not mutate the earlier snapshot', () => {
    const previous = item()
    const nextSnapshot = makeSnapshot({ ...pattern, subdivision: 6 }, 112, [], settings)
    const result = appendRevision([previous], 'mix-1', 'Updated', pattern.id, nextSnapshot)
    expect(result[0].versions).toHaveLength(2)
    expect(result[0].versions.map(version => version.number)).toEqual([1, 2])
    expect(result[0].versions[0].snapshot).toEqual(previous.versions[0].snapshot)
    expect(result[0].versions[1].snapshot).toEqual(nextSnapshot)
    expect(previous.versions).toHaveLength(1)
    expect(currentCombination(result[0])).toMatchObject({ bpm: 112, muted: [], pattern: { subdivision: 6, name: 'Updated' } })
  })

  it('does not reuse revision numbers after deleting a revision', () => {
    const appended = appendRevision([item()], 'mix-1', 'Second', pattern.id, snapshot())[0]
    const trashed = changeVersion([appended], 'mix-1', 'trash', appended.versions[0].id)
    const purged = changeVersion(trashed, 'mix-1', 'purge', appended.versions[0].id)
    const next = appendRevision(purged, 'mix-1', 'Third', pattern.id, snapshot())[0]
    expect(next.versions.map(version => version.number)).toEqual([2, 3])
    expect(next.nextNumber).toBe(4)
  })

  it('protects the last active revision and selects a replacement current revision', () => {
    const only = item()
    expect(() => changeVersion([only], 'mix-1', 'trash', only.currentId)).toThrow(/最后一个版本/)
    const two = appendRevision([only], 'mix-1', 'Second', pattern.id, snapshot())[0]
    const trashed = changeVersion([two], 'mix-1', 'trash', two.currentId)
    expect(trashed[0].currentId).toBe(two.versions[0].id)
    expect(trashed[0].versions[1].deletedAt).toBeTruthy()
  })

  it('renames labels without changing the musical snapshot', () => {
    const before = item()
    const renamed = changeVersion([before], 'mix-1', 'rename', before.currentId, 'Renamed')
    expect(renamed[0].name).toBe('Pocket')
    expect(renamed[0].versions[0].name).toBe('Renamed')
    expect(renamed[0].versions[0].snapshot).toEqual(before.versions[0].snapshot)
  })

  it('keeps stored bytes when quota or browser access fails', () => {
    const denied = { getItem: () => { throw new Error('denied') }, setItem: () => {} }
    expect(readVersions(settings, denied).error).toBe('denied')
    const full = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    expect(writeVersions([item()], full)).toEqual({ ok: false, error: 'quota' })
  })
})
