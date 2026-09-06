import { emptyCalendar, type CalendarData, type TimeSegment } from '../core/calendar/session'

// Never consult the prototype's design-demo key or populate production with fixtures.
export const CALENDAR_KEY = 'beatnex:dance-calendar:v1'
export type CalendarStorage = Pick<Storage, 'getItem' | 'setItem'>
export interface CalendarLoad { data: CalendarData; persistent: boolean; writable: boolean; error: string | null }
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000
function segmentsValid(value: unknown): value is TimeSegment[] {
  return Array.isArray(value) && value.every((segment, index) => Array.isArray(segment) && segment.length === 2 && timestamp(segment[0]) && timestamp(segment[1]) && segment[1] > segment[0] && (index === 0 || segment[0] >= value[index - 1][1]))
}
function dayValid(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function validateCalendar(value: unknown): value is CalendarData {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.records) || !object(value.draft)) return false
  const draft = value.draft
  if (!segmentsValid(draft.segments) || !(draft.runningSince === null || (timestamp(draft.runningSince) && draft.runningSince >= (draft.segments.at(-1)?.[1] ?? 0)))) return false
  const ids = new Set<string>()
  return value.records.every(record => {
    if (!object(record) || typeof record.id !== 'string' || !record.id || ids.has(record.id) || !segmentsValid(record.segments) || !Array.isArray(record.parts) || !record.parts.length) return false
    ids.add(record.id)
    const dates = new Set<string>()
    if (!record.parts.every(part => {
      if (!object(part) || !dayValid(part.date) || dates.has(part.date) || typeof part.ms !== 'number' || !Number.isSafeInteger(part.ms) || part.ms <= 0) return false
      dates.add(part.date)
      return true
    })) return false
    const total = record.segments.reduce((sum, [start, end]) => sum + end - start, 0)
    return total >= 60_000 && total === record.parts.reduce((sum, part) => sum + part.ms, 0)
  })
}
export function readCalendar(storage?: CalendarStorage): CalendarLoad {
  try {
    const target = storage ?? window.localStorage
    const raw = target.getItem(CALENDAR_KEY)
    if (raw === null) return { data: emptyCalendar(), persistent: true, writable: true, error: null }
    const data: unknown = JSON.parse(raw)
    if (!validateCalendar(data)) throw new Error('invalid calendar data')
    return { data, persistent: true, writable: true, error: null }
  } catch {
    // Keep the original bytes intact for recovery, including unsupported future versions.
    return { data: emptyCalendar(), persistent: false, writable: false, error: '无法读取本机记录，原数据已保留；新计时仅在本次打开期间保留' }
  }
}
export function writeCalendar(data: CalendarData, storage?: CalendarStorage): boolean {
  try {
    if (!validateCalendar(data)) return false
    ;(storage ?? window.localStorage).setItem(CALENDAR_KEY, JSON.stringify(data))
    return true
  } catch { return false }
}
