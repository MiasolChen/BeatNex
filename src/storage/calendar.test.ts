import { describe, expect, it } from 'vitest'
import { durationMs, emptyCalendar, finishDraft } from '../core/calendar/session'
import { CALENDAR_KEY, readCalendar, validateCalendar, writeCalendar } from './calendar'

function memory() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
describe('production calendar storage', () => {
  it('starts empty and ignores all prototype demonstration data', () => {
    const storage = memory()
    storage.setItem('beatnex:dance-calendar:design-demo:v1', JSON.stringify({ records: ['demo'] }))
    expect(readCalendar(storage).data).toEqual(emptyCalendar())
    expect(storage.values.size).toBe(1)
  })
  it('restores a running draft after refresh from its original start', () => {
    const storage = memory(), data = { ...emptyCalendar(), draft: { segments: [[1000, 31_000] as [number, number]], runningSince: 60_000 } }
    expect(writeCalendar(data, storage)).toBe(true)
    const loaded = readCalendar(storage)
    expect(loaded.data).toEqual(data)
    expect(durationMs(loaded.data.draft, 90_000)).toBe(60_000)
  })
  it('round-trips exact cross-midnight parts and paused draft', () => {
    const storage = memory(), midnight = new Date(2026, 8, 7).getTime()
    const saved = finishDraft({ ...emptyCalendar(), draft: { segments: [], runningSince: midnight - 30_500 } }, midnight + 30_500, 'saved').data
    expect(writeCalendar(saved, storage)).toBe(true)
    expect(readCalendar(storage).data).toEqual(saved)
  })
  it.each(['{invalid', '{"version":2,"records":[],"draft":{}}'])('preserves corrupt or unsupported data without making it writable: %s', raw => {
    const storage = memory()
    storage.setItem(CALENDAR_KEY, raw)
    expect(readCalendar(storage)).toMatchObject({ persistent: false, writable: false })
    expect(storage.getItem(CALENDAR_KEY)).toBe(raw)
  })
  it('rejects overlapping segments, forged totals, duplicate ids and invalid dates', () => {
    const good = finishDraft({ ...emptyCalendar(), draft: { segments: [], runningSince: 1000 } }, 61_000, 'one').data
    expect(validateCalendar(good)).toBe(true)
    expect(validateCalendar({ ...good, draft: { segments: [[1, 4], [3, 8]], runningSince: null } })).toBe(false)
    expect(validateCalendar({ ...good, records: [...good.records, ...good.records] })).toBe(false)
    expect(validateCalendar({ ...good, records: [{ ...good.records[0], parts: [{ date: '2026-02-30', ms: 60_000 }] }] })).toBe(false)
    expect(validateCalendar({ ...good, records: [{ ...good.records[0], parts: [{ date: '2026-09-06', ms: 1 }] }] })).toBe(false)
  })
  it('reports browser access and quota failures', () => {
    const storage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }
    expect(readCalendar(storage)).toMatchObject({ persistent: false, writable: false })
    expect(writeCalendar(emptyCalendar(), storage)).toBe(false)
  })
})
