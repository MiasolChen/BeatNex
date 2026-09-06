import { describe, expect, it } from 'vitest'
import { danceDuration, durationMs, emptyCalendar, finishDraft, localDay, pauseDraft, splitByLocalDay, toggleDraft } from './session'

describe('real dance timing', () => {
  it('deducts all pauses and keeps exact sub-minute segments', () => {
    const start = new Date(2026, 8, 6, 18).getTime()
    let draft = toggleDraft(emptyCalendar().draft, start)
    draft = pauseDraft(draft, start + 30_400)
    draft = toggleDraft(draft, start + 90_000)
    const result = finishDraft({ ...emptyCalendar(), draft }, start + 120_700, 'one')
    expect(result.record?.parts).toEqual([{ date: localDay(new Date(start)), ms: 61_100 }])
    expect(result.record?.segments).toEqual([[start, start + 30_400], [start + 90_000, start + 120_700]])
    expect(result.data.draft).toEqual({ segments: [], runningSince: null })
  })
  it('preserves a qualifying session split into two sub-minute local days', () => {
    const midnight = new Date(2026, 8, 7).getTime()
    const result = finishDraft({ ...emptyCalendar(), draft: { segments: [], runningSince: midnight - 30_500 } }, midnight + 30_700, 'cross-midnight')
    expect(result.record?.parts).toEqual([{ date: '2026-09-06', ms: 30_500 }, { date: '2026-09-07', ms: 30_700 }])
    expect(result.record?.parts.reduce((sum, part) => sum + part.ms, 0)).toBe(61_200)
  })
  it('discards under one minute and makes repeated finish idempotent', () => {
    const data = { ...emptyCalendar(), draft: { segments: [], runningSince: 100_000 } }
    const short = finishDraft(data, 159_999, 'short')
    expect(short.discarded).toBe(true)
    expect(short.data.records).toHaveLength(0)
    const saved = finishDraft(data, 160_000, 'long')
    expect(saved.data.records).toHaveLength(1)
    const repeated = finishDraft(saved.data, 200_000, 'duplicate')
    expect(repeated.data).toBe(saved.data)
    expect(repeated.record).toBeNull()
  })
  it('does not accumulate idle time or negative duration after clock rollback', () => {
    expect(durationMs({ segments: [[1000, 5000]], runningSince: null }, 500_000)).toBe(4000)
    expect(durationMs({ segments: [], runningSince: 5000 }, 1000)).toBe(0)
    expect(pauseDraft({ segments: [], runningSince: 5000 }, 1000)).toEqual({ segments: [], runningSince: null })
  })
  it('allocates midnight-exclusive ends only to the preceding day', () => {
    const midnight = new Date(2026, 8, 7).getTime()
    expect(splitByLocalDay([[midnight - 60_000, midnight]])).toEqual([{ date: '2026-09-06', ms: 60_000 }])
  })
  it('uses local calendar boundaries even when a daylight-saving day is not 24 hours', () => {
    const start = new Date(2026, 2, 8).getTime(), next = new Date(2026, 2, 9).getTime()
    expect(splitByLocalDay([[start, next + 60_000]])).toEqual([{ date: '2026-03-08', ms: next - start }, { date: '2026-03-09', ms: 60_000 }])
  })
  it('formats totals by minutes without changing underlying precision', () => {
    expect(danceDuration(59_999)).toBe('0分钟')
    expect(danceDuration(3_660_999)).toBe('1小时1分钟')
  })
})
