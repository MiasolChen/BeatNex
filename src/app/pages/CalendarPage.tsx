import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dailyTotals, danceDuration, heat, localDay, type DanceRecord } from '../../core/calendar/session'
import { useCalendar } from '../../features/useCalendar'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

type Mode = 'year' | 'month' | 'day'
const modes: Mode[] = ['year', 'month', 'day']
const modeLabel = { year: '年', month: '月', day: '日' }
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function CalendarPage({ active, notice }: { active: boolean; notice: (message: string) => void }) {
  const calendar = useCalendar(active, notice)
  const [mode, setMode] = useState<Mode>('month')
  const [resetDate, setResetDate] = useState(0)
  const minutes = Math.floor(calendar.ms / 60_000), hours = Math.floor(minutes / 60)
  return <section className="bn-page" data-view="calendar" data-calendar-mode={mode} hidden={!active}>
    <div className="bn-heading"><div><div className="bn-eyebrow">SHOW UP. KEEP MOVING.</div><h1>练舞日历<span className="bn-diary-mark" aria-hidden="true" /></h1></div><span className="bn-diary-caption">{calendar.persistent ? '真实记录 · 本机保存' : '真实记录 · 仅本次暂存'}</span></div>
    <article className={`bn-dance-timer${calendar.running ? ' running' : ''}`}>
      <div className="bn-row"><span>练舞计时</span><span id="bn-dance-state">{calendar.running ? calendar.ms < 60_000 ? '计时中 · 未满1分钟' : '正在练舞' : calendar.ms ? '已暂停' : '准备开始'}</span></div>
      <div id="bn-dance-clock" className={hours ? 'bn-hours' : ''} role="timer" aria-label={`练舞用时 ${danceDuration(calendar.ms)}`}>{hours ? <><b>{hours}</b><span>小时</span>{minutes % 60 > 0 && <><b>{minutes % 60}</b><span>分钟</span></>}</> : <><b>{minutes}</b><span>分钟</span></>}</div>
      <div className="bn-dance-actions"><button id="bn-dance-start" aria-pressed={calendar.running} onClick={calendar.toggle}>{calendar.running ? 'Ⅱ 暂停' : calendar.ms ? '▶ 继续计时' : '▶ 开始计时'}</button><button id="bn-dance-finish" disabled={calendar.ms < 1000} onClick={() => { if (calendar.finish()) setResetDate(value => value + 1) }}>结束并记录</button></div>
      <p id="bn-dance-storage">{calendar.persistent ? '本机保存 · 切换页面继续计时' : '仅本次打开期间保存 · 切换页面继续计时'}</p>
    </article>
    <CalendarSheet active={active} mode={mode} setMode={setMode} resetDate={resetDate} records={calendar.data.records} />
  </section>
}

const CalendarSheet = memo(function CalendarSheet({ active, mode, setMode, resetDate, records }: { active: boolean; mode: Mode; setMode: (mode: Mode) => void; resetDate: number; records: DanceRecord[] }) {
  const [day, setDay] = useState(() => localDay(new Date()))
  const date = new Date(`${day}T12:00:00`), year = date.getFullYear(), month = date.getMonth()
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const daily = useMemo(() => dailyTotals(records), [records])
  const sum = (key: string) => [...daily].reduce((total, [recordDay, ms]) => total + (recordDay.startsWith(key) ? ms : 0), 0)
  const tabs = useRef<HTMLDivElement>(null), slider = useRef<HTMLSpanElement>(null)
  const tabAnimation = useRef<Animation | null>(null)
  const previousMode = useRef(mode)
  const markerGeometry = useRef<{ x: number; width: number } | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const previousGrid = useRef<{ key: number; html: string } | null>(null)
  const lastTap = useRef({ key: '', time: 0 })
  useEffect(() => () => { tabAnimation.current?.cancel() }, [])
  useEffect(() => { setDay(localDay(new Date())) }, [resetDate])
  useBrowserLayoutEffect(() => {
    if (!active || !tabs.current || !slider.current) { tabAnimation.current?.cancel(); markerGeometry.current = null; return }
    const host = tabs.current, marker = slider.current
    const update = () => {
      const selected = host.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      if (!selected) return
      const geometry = { x: selected.offsetLeft, width: selected.offsetWidth }
      // ResizeObserver also fires immediately after observing. Do not cancel a
      // running tab transition when the layout has not actually changed.
      if (markerGeometry.current?.x === geometry.x && markerGeometry.current.width === geometry.width) return
      const initialized = markerGeometry.current !== null
      markerGeometry.current = geometry
      const from = getComputedStyle(marker).transform
      tabAnimation.current?.cancel()
      const target = `translateX(${selected.offsetLeft}px)`
      marker.style.width = `${selected.offsetWidth}px`
      marker.style.transform = target
      if (initialized && previousMode.current !== mode && !reducedMotion()) tabAnimation.current = marker.animate([{ transform: from === 'none' ? target : from }, { transform: target }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' })
      previousMode.current = mode
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => { observer.disconnect() }
  }, [active, mode])
  useBrowserLayoutEffect(() => {
    const element = grid.current
    if (!element || !active || mode !== 'month') { previousGrid.current = null; return }
    const key = year * 12 + month, previous = previousGrid.current
    previousGrid.current = { key, html: element.innerHTML }
    if (!previous || previous.key === key || reducedMotion()) return
    const copy = document.createElement('div')
    copy.className = 'bn-calendar-copy'
    copy.innerHTML = previous.html
    copy.setAttribute('aria-hidden', 'true')
    copy.inert = true
    Object.assign(copy.style, { position: 'absolute', left: `${element.offsetLeft}px`, top: `${element.offsetTop}px`, width: `${element.offsetWidth}px`, pointerEvents: 'none' })
    element.parentElement?.append(copy)
    const direction = key > previous.key ? 1 : -1
    const options = { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' }
    const leave = copy.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-direction * 32}px)` }], options)
    const enter = element.animate([{ opacity: 0, transform: `translateX(${direction * 32}px)` }, { opacity: 1, transform: 'translateX(0)' }], options)
    leave.onfinish = () => copy.remove()
    return () => { leave.cancel(); enter.cancel(); copy.remove() }
  }, [active, mode, year, month, day])
  function changeMode(next: Mode) { lastTap.current.key = ''; setMode(next) }
  function select(key: string, next: Mode) {
    const now = performance.now(), double = lastTap.current.key === key && now - lastTap.current.time < (mode === 'year' ? 400 : 340)
    lastTap.current = { key: double ? '' : key, time: now }
    setDay(key)
    if (double) { setMode(next); tabs.current?.querySelector<HTMLButtonElement>(`[data-calendar-mode="${next}"]`)?.focus({ preventScroll: true }) }
  }
  function shift(delta: number) {
    lastTap.current.key = ''
    const next = new Date(`${day}T12:00:00`)
    if (mode === 'day') next.setDate(next.getDate() + delta)
    else { next.setDate(1); if (mode === 'year') next.setFullYear(year + delta); else next.setMonth(month + delta) }
    setDay(localDay(next))
  }
  const offset = (new Date(year, month, 1).getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate()
  const monthRows = new Map<string, { ms: number; count: number }>()
  let monthCount = 0
  records.forEach(record => {
    const parts = record.parts.filter(part => part.date.startsWith(prefix))
    if (parts.length) monthCount++
    parts.forEach(part => { const row = monthRows.get(part.date) ?? { ms: 0, count: 0 }; monthRows.set(part.date, { ms: row.ms + part.ms, count: row.count + 1 }) })
  })
  const start = new Date(`${day}T00:00:00`).getTime(), end = new Date(year, month, date.getDate() + 1).getTime()
  const dayRows = records.filter(record => record.parts.some(part => part.date === day)).map(record => ({ id: record.id, ms: record.parts.filter(part => part.date === day).reduce((total, part) => total + part.ms, 0), segments: record.segments.filter(([from, to]) => to > start && from < end).map(([from, to]) => [Math.max(start, from), Math.min(end, to)]) })).sort((a, b) => (b.segments[0]?.[0] ?? 0) - (a.segments[0]?.[0] ?? 0))
  const time = (value: number) => value === end ? '24:00' : new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const label = mode === 'year' ? `${year}年` : mode === 'day' ? day.replaceAll('-', '/') : `${year}年 ${month + 1}月`
  return <div className="bn-calendar-sheet">
    <div className="bn-calendar-tabs" role="tablist" aria-label="统计周期" ref={tabs} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? 'year' : event.key === 'End' ? 'day' : modes[(modes.indexOf(mode) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]
      changeMode(next)
      tabs.current?.querySelector<HTMLButtonElement>(`[data-calendar-mode="${next}"]`)?.focus()
    }}><span className="bn-calendar-tracks" aria-hidden="true"><i /><i /><i /></span><span className="bn-calendar-slider" ref={slider} aria-hidden="true" />{modes.map(item => <button key={item} role="tab" data-calendar-mode={item} aria-selected={mode === item} tabIndex={mode === item ? 0 : -1} onClick={() => changeMode(item)}>{modeLabel[item]}</button>)}</div>
    <div className="bn-calendar-top"><div><button id="bn-calendar-prev" aria-label={mode === 'year' ? '上一年' : mode === 'day' ? '前一天' : '上个月'} onClick={() => shift(-1)}>‹</button><strong id="bn-calendar-month">{label}</strong><button id="bn-calendar-next" aria-label={mode === 'year' ? '下一年' : mode === 'day' ? '后一天' : '下个月'} onClick={() => shift(1)}>›</button></div><button id="bn-calendar-today" onClick={() => { lastTap.current.key = ''; setDay(localDay(new Date())) }}>今天</button></div>
    <div className="bn-dance-stats">{modes.map(item => <div key={item} data-stat={item} hidden={mode !== item}><span id={`bn-${item}-label`}>{item === 'year' ? '全年训练时长' : item === 'month' ? '本月训练时长' : '当日训练时长'}</span><b id={`bn-${item}-total`}>{danceDuration(item === 'year' ? sum(`${year}-`) : item === 'month' ? sum(prefix) : daily.get(day) ?? 0)}</b></div>)}</div>
    <article className="bn-calendar-card" hidden={mode !== 'month'}><div className="bn-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(value => <span key={value}>{value}</span>)}</div><div id="bn-calendar-grid" ref={grid}>{Array.from({ length: 42 }, (_, index) => {
      const n = index - offset + 1
      if (n < 1 || n > days) return <span key={`blank-${index}`} />
      const key = `${prefix}-${String(n).padStart(2, '0')}`, ms = daily.get(key) ?? 0
      return <button key={key} data-dance-day={key} data-heat={heat(ms)} aria-pressed={key === day} aria-label={`${key}，练舞 ${danceDuration(ms)}；双击查看当日记录`} aria-current={key === localDay(new Date()) ? 'date' : undefined} onClick={() => select(key, 'day')} onDoubleClick={() => { setDay(key); changeMode('day') }}>{n}</button>
    })}</div><div className="bn-calendar-key"><span>未练</span><i /><i /><i /><i /><span>1小时+</span></div></article>
    <div className="bn-day-detail" id="bn-day-detail" aria-live="polite" hidden={mode === 'year'}>{mode === 'month' ? <><div className="bn-record-summary"><strong>{month + 1}月 · 月记录</strong><span>{monthRows.size} 天 · {monthCount} 次</span></div><div className="bn-training-list">{monthRows.size ? [...monthRows].sort(([a], [b]) => b.localeCompare(a)).map(([key, row]) => <article className="bn-training-row" key={key}><span className="bn-training-no">{key.slice(8)}</span><div><strong>{key.slice(5).replace('-', '/')}</strong><small>{row.count} 次训练</small></div><b>{danceDuration(row.ms)}</b></article>) : <div className="bn-training-empty">本月还没有练舞记录</div>}</div></> : <><div className="bn-record-summary"><strong>{day.slice(5).replace('-', '/')} · 当日记录</strong><span>{dayRows.length} 次 · {danceDuration(dayRows.reduce((total, row) => total + row.ms, 0))}</span></div><div className="bn-training-list">{dayRows.length ? dayRows.map((row, index) => <article className="bn-training-row" key={row.id}><span className="bn-training-no">{String(dayRows.length - index).padStart(2, '0')}</span><div><strong>{row.segments.length ? `${time(row.segments[0][0])} – ${time(row.segments.at(-1)![1])}` : '时段未记录'}</strong><small>{row.segments.length > 1 ? '含暂停 · 时长已扣除暂停' : '练舞训练'}</small></div><b>{danceDuration(row.ms)}</b></article>) : <div className="bn-training-empty">当天还没有练舞记录</div>}</div></>}</div>
    <div className="bn-year-heading" hidden={mode !== 'year'}>全年练舞分布</div><div id="bn-year-grid" hidden={mode !== 'year'}>{Array.from({ length: 12 }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, '0')}`, ms = sum(key)
      return <button key={key} data-dance-month={index} data-heat={heat(ms)} aria-pressed={index === month} aria-label={`${year}年${index + 1}月，${danceDuration(ms)}；双击查看月记录`} onClick={() => select(`${key}-01`, 'month')} onDoubleClick={() => { setDay(`${key}-01`); changeMode('month') }}><span>{index + 1}月</span><b>{danceDuration(ms)}</b></button>
    })}</div>
  </div>
})
