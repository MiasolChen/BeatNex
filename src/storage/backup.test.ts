import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BOOM_BAP_PATTERNS } from '../core/pattern/fixtures'
import { defaultSettings, savePractice } from './practice'
import { backupValues, createBackup, mergeBackup, parseBackup, type Backup } from './backup'
import { commitImport, IMPORT_JOURNAL_KEY, recoverImport } from './transaction'
import { appendRevision, makeSnapshot, writeVersions, type VersionedCombination } from './versions'
import { writeFavorites } from './favorites'

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

const pattern = BOOM_BAP_PATTERNS[1]
const mediumPattern = BOOM_BAP_PATTERNS.find(item => item.name === 'Foundation Backbeat' && item.difficulty === 'medium')!
const settings = defaultSettings()
afterEach(() => vi.unstubAllGlobals())
function combination(id = 'mix-1', name = 'Pocket', source = pattern): VersionedCombination {
  const snapshot = makeSnapshot(source, 96, [], settings)
  return { id, name, sourceId: source.id, original: snapshot, currentId: 'revision-1', nextNumber: 2,
    versions: [{ id: 'revision-1', number: 1, name, createdAt: null, snapshot }] }
}
function backup(items = [combination()], practice = settings, favorites = ['boom-bap-foundation']): Backup {
  return createBackup(items, favorites, practice)
}

describe('JSON backups', () => {
  beforeEach(() => vi.stubGlobal('crypto', { randomUUID: () => `generated-${Math.random()}` }))
  it('round-trips full versions, favorites and practice settings', () => {
    const value = backup([combination('mix-1', 'Pocket', mediumPattern)], { ...settings, difficulty: 'medium', workspace: { pattern: mediumPattern, source: mediumPattern, muted: [], activeId: 'mix-1' } })
    const parsed = parseBackup(JSON.stringify(value))
    expect(parsed).toEqual(value)
    expect(backupValues(parsed)[0]).toContain('schemaVersion')
    expect(JSON.parse(backupValues(parsed)[1])).toEqual({ schemaVersion: 1, items: ['boom-bap-foundation'] })
  })

  it('rejects unknown schema, invalid references and malformed JSON', () => {
    expect(() => parseBackup('{')).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...backup(), schemaVersion: 2 }))).toThrow(/格式或版本/)
    expect(() => createBackup([combination()], [], { ...settings, workspace: { pattern, source: pattern, muted: [], activeId: 'missing' } })).toThrow(/引用/)
  })

  it('skips identical combinations, remaps conflicting IDs and merges favorites', () => {
    const local = backup([combination('same', 'Local')], settings, ['local'])
    const incoming = backup([combination('same', 'Incoming'), combination('new', 'New')], settings, ['incoming'])
    const merged = mergeBackup(local, incoming, false)
    expect(merged.combinations).toHaveLength(3)
    expect(merged.combinations.map(item => item.name)).toEqual(['Local', 'Incoming', 'New'])
    expect(merged.combinations[1].id).not.toBe('same')
    expect(merged.combinations[1].currentId).not.toBe('revision-1')
    expect(merged.favorites).toEqual(['local', 'incoming'])
  })

  it('restores practice only when requested and remaps the active workspace ID', () => {
    const local = backup([combination('same', 'Local')], settings)
    const incomingPractice = { ...settings, workspace: { pattern, source: pattern, muted: [], activeId: 'same' } }
    const incoming = backup([combination('same', 'Incoming')], incomingPractice)
    expect(mergeBackup(local, incoming, false).practice).toEqual(settings)
    const restored = mergeBackup(local, incoming, true)
    expect(restored.practice.workspace?.activeId).toBe(restored.combinations[1].id)
  })

  it('accepts repeated merge of the same backup without creating duplicates', () => {
    const source = backup([combination('new', 'New')], settings, ['incoming'])
    const once = mergeBackup(backup(), source, false)
    const twice = mergeBackup(once, source, false)
    expect(twice.combinations).toHaveLength(2)
    expect(twice.favorites).toEqual(['boom-bap-foundation', 'incoming'])
  })
})

describe('backup import transaction', () => {
  beforeEach(() => vi.stubGlobal('crypto', { randomUUID: () => `generated-${Math.random()}` }))
  it('commits all three values and removes its journal', () => {
    const target = storage()
    expect(commitImport(['versions', 'favorites', 'practice'], target)).toEqual({ ok: true, error: null })
    expect(target.values).toEqual(new Map([
      ['beatnex:combinations:v2', 'versions'],
      ['beatnex:favorites:v1', 'favorites'],
      ['beatnex:practice:v2', 'practice'],
    ]))
    expect(target.getItem(IMPORT_JOURNAL_KEY)).toBeNull()
  })

  it('rolls back partial writes after a quota failure', () => {
    const target = storage({ 'beatnex:combinations:v2': 'old-v', 'beatnex:favorites:v1': 'old-f', 'beatnex:practice:v2': 'old-p' })
    let writes = 0
    const failing = { ...target, setItem: (key: string, value: string) => { if (key !== IMPORT_JOURNAL_KEY && ++writes === 2) throw new Error('quota'); target.values.set(key, value) } }
    expect(commitImport(['new-v', 'new-f', 'new-p'], failing).ok).toBe(false)
    expect(target.values.get('beatnex:combinations:v2')).toBe('old-v')
    expect(target.values.get('beatnex:favorites:v1')).toBe('old-f')
    expect(target.values.get('beatnex:practice:v2')).toBe('old-p')
  })

  it('recovers an unfinished journal on startup and removes it', () => {
    const target = storage({ [IMPORT_JOURNAL_KEY]: JSON.stringify({ version: 1, entries: [
      { key: 'beatnex:combinations:v2', before: 'old-v', after: 'new-v' },
      { key: 'beatnex:favorites:v1', before: null, after: 'new-f' },
      { key: 'beatnex:practice:v2', before: 'old-p', after: 'new-p' },
    ] }) })
    expect(recoverImport(target)).toBeNull()
    expect(target.values.get('beatnex:combinations:v2')).toBe('old-v')
    expect(target.values.has('beatnex:favorites:v1')).toBe(false)
    expect(target.values.get(IMPORT_JOURNAL_KEY)).toBeUndefined()
  })

  it('does not alter data when the journal itself cannot be created', () => {
    const target = storage({ 'beatnex:combinations:v2': 'old-v', 'beatnex:favorites:v1': 'old-f', 'beatnex:practice:v2': 'old-p' })
    const failing = { ...target, setItem: (key: string, value: string) => { if (key === IMPORT_JOURNAL_KEY) throw new Error('quota'); target.values.set(key, value) } }
    expect(commitImport(['new-v', 'new-f', 'new-p'], failing).ok).toBe(false)
    expect([...target.values.entries()]).toEqual([
      ['beatnex:combinations:v2', 'old-v'], ['beatnex:favorites:v1', 'old-f'], ['beatnex:practice:v2', 'old-p'],
    ])
  })

  it('keeps the journal when rollback itself fails and blocks all writes', () => {
    const target = storage({ 'beatnex:combinations:v2': 'old-v', 'beatnex:favorites:v1': 'old-f', 'beatnex:practice:v2': 'old-p' })
    let targetWrites = 0
    const failing = { ...target, setItem: (key: string, value: string) => {
      if (key === IMPORT_JOURNAL_KEY) { target.values.set(key, value); return }
      targetWrites += 1
      if (targetWrites === 2 || targetWrites === 3) throw new Error('quota')
      target.values.set(key, value)
    } }
    expect(commitImport(['new-v', 'new-f', 'new-p'], failing).ok).toBe(false)
    expect(target.getItem(IMPORT_JOURNAL_KEY)).toBeTruthy()
    expect(writeFavorites(['blocked'], target).ok).toBe(false)
    expect(writeFavorites(['blocked'], target).error).toMatch(/导入/)
    expect(writeVersions([combination()], target).ok).toBe(false)
    vi.stubGlobal('window', { localStorage: target })
    expect(savePractice(settings)).toBe(false)
  })

  it('returns a recovery error when storage access is denied', () => {
    const denied = { getItem: () => { throw new Error('denied') }, setItem() {}, removeItem() {} }
    expect(recoverImport(denied)).toMatch(/denied/)
  })

  it('preserves malformed journal bytes for manual recovery', () => {
    const raw = '{malformed'
    const target = storage({ [IMPORT_JOURNAL_KEY]: raw, 'beatnex:combinations:v2': 'old-v' })
    expect(recoverImport(target)).toMatch(/导入恢复失败/)
    expect(target.getItem(IMPORT_JOURNAL_KEY)).toBe(raw)
    expect(target.getItem('beatnex:combinations:v2')).toBe('old-v')
  })
})
