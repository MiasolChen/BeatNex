import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface TempoWheelProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label: string
  compact?: boolean
}

const STEP_WIDTH = 64
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)))

/** Native touch scrolling; one snap per completed gesture, never a scroll/commit loop. */
export function TempoWheel({ value, min, max, onChange, label, compact = false }: TempoWheelProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const moving = useRef(false)
  const pendingTarget = useRef<number | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout>>()
  const mouse = useRef<{ x: number; left: number; id: number; dragged: boolean } | null>(null)
  const skipClick = useRef(false)
  const editingRef = useRef(false)
  const returnFocusRef = useRef(false)
  const [selected, setSelected] = useState(value)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  valueRef.current = value
  onChangeRef.current = onChange

  const align = (next: number, smooth = false) => {
    const rail = railRef.current
    if (!rail || !rail.clientWidth) return
    const left = (next - min) * STEP_WIDTH
    if (Math.abs(rail.scrollLeft - left) < 0.5) return
    rail.scrollTo({ left, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' })
  }

  const commitScroll = () => {
    clearTimeout(settleTimer.current)
    if (mouse.current || editingRef.current || !railRef.current?.clientWidth) return
    const next = clamp(min + railRef.current.scrollLeft / STEP_WIDTH, min, max)
    moving.current = false
    pendingTarget.current = null
    setSelected(next)
    if (valueRef.current !== next) {
      valueRef.current = next
      onChangeRef.current(next)
    }
    // CSS handles native scroll snap. A fractional mouse position needs one correction.
    align(next)
  }

  useBrowserLayoutEffect(() => {
    if (!moving.current && !editingRef.current) {
      setSelected(value)
      align(value)
    }
  }, [value, min, max])

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const observer = new ResizeObserver(() => {
      if (!moving.current && !editingRef.current) align(valueRef.current)
    })
    observer.observe(rail)
    return () => { observer.disconnect(); clearTimeout(settleTimer.current) }
  }, [min, max])

  useBrowserLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus({ preventScroll: true })
      inputRef.current?.select()
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false
      railRef.current?.querySelector<HTMLButtonElement>(`[data-bpm="${valueRef.current}"]`)?.focus({ preventScroll: true })
    }
  }, [editing])

  const choose = (next: number) => {
    clearTimeout(settleTimer.current)
    moving.current = true
    pendingTarget.current = next
    setSelected(next)
    align(next, true)
    // Also handles a click on a value whose pixel position already matches.
    settleTimer.current = setTimeout(commitScroll, 180)
  }

  const finishEdit = (cancel: boolean, returnFocus = false) => {
    if (!editingRef.current) return
    editingRef.current = false
    returnFocusRef.current = returnFocus
    setEditing(false)
    const parsed = Number(draft)
    const next = !cancel && draft.trim() && Number.isFinite(parsed) ? clamp(parsed, min, max) : valueRef.current
    moving.current = false
    setSelected(next)
    valueRef.current = next
    if (next !== value) onChangeRef.current(next)
    align(next)
  }

  const releaseMouse = (event: PointerEvent<HTMLDivElement>) => {
    if (!mouse.current || mouse.current.id !== event.pointerId) return
    const dragged = mouse.current.dragged
    mouse.current = null
    const rail = event.currentTarget
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId)
    rail.style.scrollSnapType = ''
    if (dragged) commitScroll()
  }

  return <div className={`bn-bpm-wheel${compact ? ' bn-wheel-compact' : ''}${editing ? ' bn-wheel-editing' : ''}`} aria-label={label} data-tempo={min === 30 ? 'metro' : compact ? 'machine' : 'practice'} data-min={min} data-value={value}>
    <div className="bn-bpm-rail" ref={railRef} role="group" aria-label={`${label}，左右滑动选择 BPM`} aria-hidden={editing || undefined}
      onScroll={() => {
        if (editingRef.current) return
        const rail = railRef.current
        if (!rail?.clientWidth) return
        const next = clamp(min + rail.scrollLeft / STEP_WIDTH, min, max)
        setSelected(next)
        clearTimeout(settleTimer.current)
        // Ignore our own final alignment, including ResizeObserver initialization.
        if (next === valueRef.current && Math.abs(rail.scrollLeft - (next - min) * STEP_WIDTH) < 0.5 && !mouse.current) {
          moving.current = false
          return
        }
        moving.current = true
        settleTimer.current = setTimeout(commitScroll, 120)
      }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? min : event.key === 'End' ? max : clamp((pendingTarget.current ?? selected) + (event.key === 'ArrowRight' ? 1 : -1), min, max)
        choose(next)
        railRef.current?.querySelector<HTMLButtonElement>(`[data-bpm="${next}"]`)?.focus({ preventScroll: true })
      }}
      onPointerDown={event => {
        pendingTarget.current = null
        if (event.pointerType !== 'mouse' || event.button !== 0) return
        clearTimeout(settleTimer.current)
        mouse.current = { x: event.clientX, left: event.currentTarget.scrollLeft, id: event.pointerId, dragged: false }
        skipClick.current = false
        event.currentTarget.style.scrollSnapType = 'none'
      }}
      onPointerMove={event => {
        const pointer = mouse.current
        if (!pointer || pointer.id !== event.pointerId) return
        const dx = event.clientX - pointer.x
        if (Math.abs(dx) > 4 || pointer.dragged) {
          pointer.dragged = true
          moving.current = true
          skipClick.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          event.currentTarget.scrollLeft = pointer.left - dx
        }
      }} onPointerUp={releaseMouse} onPointerCancel={releaseMouse} onLostPointerCapture={releaseMouse}>
      {Array.from({ length: max - min + 1 }, (_, index) => min + index).map(bpm => <button type="button" key={bpm} data-bpm={bpm} aria-label={`${bpm} BPM`} aria-pressed={selected === bpm} tabIndex={!editing && selected === bpm ? 0 : -1}
        onClick={() => {
          if (skipClick.current) { skipClick.current = false; return }
          if (bpm === valueRef.current) {
            clearTimeout(settleTimer.current)
            moving.current = false
            editingRef.current = true
            setDraft(String(valueRef.current))
            setEditing(true)
          } else choose(bpm)
        }}>{bpm}</button>)}
    </div>
    <small>BPM</small>
    {editing && <input ref={inputRef} className="bn-wheel-input" type="number" inputMode="numeric" min={min} max={max} step={1} value={draft} aria-label={`输入 BPM，${min} 至 ${max}`} onChange={event => setDraft(event.target.value)} onBlur={() => finishEdit(false)} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finishEdit(event.key === 'Escape', true)
      }
    }} />}
  </div>
}
