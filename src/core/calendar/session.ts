/** Wall-clock dance timing is deliberately independent of the audio transport. */
export type TimeSegment = [start: number, end: number]
export interface DanceDraft { segments: TimeSegment[]; runningSince: number | null }
export interface DanceRecord { id: string; segments: TimeSegment[]; parts: { date: string; ms: number }[] }
export interface CalendarData { version: 1; records: DanceRecord[]; draft: DanceDraft }
export const emptyDraft = (): DanceDraft => ({ segments: [], runningSince: null })
export const emptyCalendar = (): CalendarData => ({ version: 1, records: [], draft: emptyDraft() })
export const localDay = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const durationMs = (draft: DanceDraft, now: number): number => draft.segments.reduce((total, [start, end]) => total + end - start, 0) + (draft.runningSince === null ? 0 : Math.max(0, now - draft.runningSince))
export function pauseDraft(draft: DanceDraft, now: number): DanceDraft {
  if (draft.runningSince === null) return draft
  const end = Math.max(draft.runningSince, now)
  return { segments: end > draft.runningSince ? [...draft.segments, [draft.runningSince, end]] : draft.segments, runningSince: null }
}
export function toggleDraft(draft: DanceDraft, now: number): DanceDraft {
  return draft.runningSince === null ? { ...draft, runningSince: Math.max(now, draft.segments.at(-1)?.[1] ?? now) } : pauseDraft(draft, now)
}
/** Split at local calendar boundaries, preserving every millisecond (including DST days). */
export function splitByLocalDay(segments: TimeSegment[]): DanceRecord['parts'] {
  const days = new Map<string, number>()
  for (const [start, end] of segments) {
    let cursor = start
    while (cursor < end) {
      const date = new Date(cursor)
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
      const until = Math.min(midnight, end)
      const key = localDay(date)
      days.set(key, (days.get(key) ?? 0) + until - cursor)
      cursor = until
    }
  }
  return [...days].map(([date, ms]) => ({ date, ms }))
}
export function finishDraft(data: CalendarData, now: number, id: string): { data: CalendarData; record: DanceRecord | null; discarded: boolean } {
  const draft = pauseDraft(data.draft, now)
  const ms = durationMs(draft, now)
  if (ms < 1_000) return { data, record: null, discarded: false }
  if (ms < 60_000) return { data: { ...data, draft: emptyDraft() }, record: null, discarded: true }
  const record: DanceRecord = { id, segments: draft.segments.map(([start, end]) => [start, end]), parts: splitByLocalDay(draft.segments) }
  return { data: { ...data, records: [...data.records, record], draft: emptyDraft() }, record, discarded: false }
}
export function danceDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000), hours = Math.floor(minutes / 60), rest = minutes % 60
  return hours ? `${hours}小时${rest ? `${rest}分钟` : ''}` : `${minutes}分钟`
}
export const heat = (ms: number): number => ms === 0 ? 0 : ms < 15 * 60_000 ? 1 : ms < 30 * 60_000 ? 2 : ms < 60 * 60_000 ? 3 : 4
export function dailyTotals(records: DanceRecord[]): Map<string, number> {
  const result = new Map<string, number>()
  records.forEach(record => record.parts.forEach(part => result.set(part.date, (result.get(part.date) ?? 0) + part.ms)))
  return result
}
