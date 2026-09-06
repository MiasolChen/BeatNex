import { useEffect, useRef, useState } from 'react'
import { danceDuration, durationMs, finishDraft, toggleDraft, type CalendarData } from '../core/calendar/session'
import { readCalendar, writeCalendar } from '../storage/calendar'

export function useCalendar(active: boolean, notice: (message: string) => void) {
  const [loaded] = useState(readCalendar)
  const [data, setData] = useState(loaded.data)
  const dataRef = useRef(data)
  const [persistent, setPersistent] = useState(loaded.persistent)
  const [now, setNow] = useState(Date.now)
  const announced = useRef(false)
  useEffect(() => {
    if (active && loaded.error && !announced.current) { announced.current = true; notice(loaded.error) }
  }, [active, loaded.error, notice])
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    if (data.draft.runningSince === null) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    const refresh = () => setNow(Date.now())
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', refresh) }
  }, [active, data.draft.runningSince])
  function commit(next: CalendarData): boolean {
    const saved = loaded.writable && writeCalendar(next)
    dataRef.current = next
    setData(next)
    setNow(Date.now())
    setPersistent(saved)
    if (!saved && persistent) notice('本机保存失败，记录仅在本次打开期间保留')
    return saved
  }
  function toggle() {
    const current = dataRef.current
    commit({ ...current, draft: toggleDraft(current.draft, Date.now()) })
  }
  function finish(): boolean {
    const result = finishDraft(dataRef.current, Date.now(), `dance-${crypto.randomUUID()}`)
    if (result.data === dataRef.current) return false
    const saved = commit(result.data)
    if (result.discarded) notice('未满1分钟，本次不计入统计')
    else if (result.record) notice(`${saved ? '已记录' : '本次暂存'} ${danceDuration(result.record.parts.reduce((sum, part) => sum + part.ms, 0))}，跨午夜按日期分别累计`)
    return result.record !== null
  }
  return { data, ms: durationMs(data.draft, now), running: data.draft.runningSince !== null, persistent, toggle, finish }
}
