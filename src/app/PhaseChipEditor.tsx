import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { TrainingPhase } from '../core/training/session'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

type DragState = {
  id: string
  fromIndex: number
  slot: number
  pointerId: number
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  overTrash: boolean
  canDelete: boolean
}

type PendingDrag = Omit<DragState, 'slot' | 'overTrash' | 'canDelete'>

type PhaseChipEditorProps = {
  phases: readonly TrainingPhase[]
  locked: boolean
  activeIndex: number
  sessionStarted: boolean
  completed: boolean
  onBarsChange: (instanceId: string, bars: number) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onDelete: (instanceId: string) => void
  onStatus: (message: string) => void
  children: ReactNode
}

export function PhaseChipEditor({ phases, locked, activeIndex, sessionStarted, completed, onBarsChange, onReorder, onDelete, onStatus, children }: PhaseChipEditorProps) {
  const [editingId, setEditingId] = useState<string>()
  const [drag, setDrag] = useState<DragState>()
  const dragRef = useRef<DragState>()
  const pendingRef = useRef<PendingDrag>()
  const holdTimer = useRef<ReturnType<typeof setTimeout>>()
  const trashTimer = useRef<ReturnType<typeof setTimeout>>()
  const activatePending = useRef<() => void>()
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const previousRects = useRef<Map<string, DOMRect>>()
  const animations = useRef(new Map<string, Animation>())
  const floatingLayer = useRef<HTMLDivElement>(null)
  const trashNode = useRef<HTMLDivElement>(null)
  const pointerFrame = useRef<number>()

  const updateDrag = (next?: DragState) => {
    dragRef.current = next
    setDrag(next)
  }

  const captureLayout = () => {
    previousRects.current = new Map(Array.from(nodes.current, ([id, node]) => {
      const rect = node.getBoundingClientRect()
      animations.current.get(id)?.cancel()
      animations.current.delete(id)
      return [id, rect]
    }))
  }

  useBrowserLayoutEffect(() => {
    const previous = previousRects.current
    if (!previous) return
    previousRects.current = undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    nodes.current.forEach((node, id) => {
      const before = previous.get(id)
      if (!before) return
      const after = node.getBoundingClientRect()
      const x = before.left - after.left
      const y = before.top - after.top
      if (Math.abs(x) < 1 && Math.abs(y) < 1) return
      const animation = node.animate(
        [{ transform: `translate3d(${x}px, ${y}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: 330, easing: 'cubic-bezier(.2,.9,.2,1.08)' },
      )
      animations.current.set(id, animation)
      animation.onfinish = () => animations.current.delete(id)
    })
  }, [drag?.slot, phases])

  const finishDrag = (cancelled = false) => {
    const current = dragRef.current
    if (!current) return
    clearTimeout(holdTimer.current)
    clearTimeout(trashTimer.current)
    activatePending.current = undefined
    pendingRef.current = undefined
    captureLayout()
    if (!cancelled) {
      if (current.overTrash && phases.length > 1) {
        const phase = phases.find((item) => item.instanceId === current.id)
        onDelete(current.id)
        if (phase) onStatus(`${phase.label} 已删除`)
      } else {
        onReorder(current.fromIndex, current.slot)
        const phase = phases.find((item) => item.instanceId === current.id)
        if (phase && current.fromIndex !== current.slot) onStatus(`${phase.label} 已移到第 ${current.slot + 1} 位`)
      }
    }
    updateDrag(undefined)
  }

  useEffect(() => {
    if (!drag) return
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const current = dragRef.current
      if (!current || event.pointerId !== current.pointerId) return
      event.preventDefault()
      const x = event.clientX
      const y = event.clientY
      cancelAnimationFrame(pointerFrame.current ?? 0)
      pointerFrame.current = requestAnimationFrame(() => {
        if (floatingLayer.current) floatingLayer.current.style.transform = `translate3d(${x - current.offsetX}px, ${y - current.offsetY}px, 0)`
      })
      const trashRect = trashNode.current?.getBoundingClientRect()
      const overTrash = Boolean(current.canDelete && trashRect && x >= trashRect.left - 12 && x <= trashRect.right + 12 && y >= trashRect.top - 12 && y <= trashRect.bottom + 12)
      let nextSlot = current.slot
      if (!overTrash) {
        const slots = Array.from(document.querySelectorAll<HTMLElement>('[data-phase-slot]'))
        let closestDistance = Number.POSITIVE_INFINITY
        let currentDistance = Number.POSITIVE_INFINITY
        for (const slot of slots) {
          const rect = slot.getBoundingClientRect()
          const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2))
          if (Number(slot.dataset.phaseSlot) === current.slot) currentDistance = distance
          if (distance < closestDistance) {
            closestDistance = distance
            nextSlot = Number(slot.dataset.phaseSlot)
          }
        }
        if (nextSlot !== current.slot && closestDistance + 10 >= currentDistance) nextSlot = current.slot
      }
      if (nextSlot !== current.slot) captureLayout()
      const next = { ...current, x, y, slot: nextSlot, overTrash }
      dragRef.current = next
      if (nextSlot !== current.slot || overTrash !== current.overTrash) setDrag(next)
    }
    const onPointerUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId === dragRef.current?.pointerId) finishDrag()
    }
    const onPointerCancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId === dragRef.current?.pointerId) finishDrag(true)
    }
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    const cancel = () => finishDrag(true)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', cancel)
    return () => {
      cancelAnimationFrame(pointerFrame.current ?? 0)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', cancel)
    }
  }, [drag?.id, phases])

  const beginHold = (event: PointerEvent<HTMLDivElement>, phase: TrainingPhase, index: number) => {
    if (locked || editingId || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || (event.target as HTMLElement).closest('select, button')) return
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic or interrupted pointers can lack a capturable stream. */ }
    const rect = event.currentTarget.getBoundingClientRect()
    pendingRef.current = {
      id: phase.instanceId,
      fromIndex: index,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }
    clearTimeout(holdTimer.current)
    const activate = () => {
      const pending = pendingRef.current
      if (!pending) return
      captureLayout()
      updateDrag({ ...pending, slot: index, overTrash: false, canDelete: event.pointerType !== 'mouse' })
      onStatus(`${phase.label} 已抬起，拖动可排序，拖到垃圾桶可删除`)
    }
    activatePending.current = activate
    if (event.pointerType === 'mouse') {
      holdTimer.current = setTimeout(() => {
        if (!dragRef.current) activate()
        const current = dragRef.current
        if (current) updateDrag({ ...current, canDelete: true })
      }, 360)
    } else holdTimer.current = setTimeout(activate, 360)
  }

  const updatePending = (event: PointerEvent<HTMLDivElement>) => {
    const pending = pendingRef.current
    if (!pending || dragRef.current) return
    const distance = Math.hypot(event.clientX - pending.x, event.clientY - pending.y)
    if (event.pointerType === 'mouse' && distance > 4) activatePending.current?.()
    else if (event.pointerType !== 'mouse' && distance > 8) cancelPending()
  }

  const cancelPending = () => {
    clearTimeout(holdTimer.current)
    clearTimeout(trashTimer.current)
    activatePending.current = undefined
    pendingRef.current = undefined
  }

  const keyboardAction = (event: KeyboardEvent<HTMLDivElement>, phase: TrainingPhase, index: number) => {
    if (locked) return
    if (event.key === 'Enter') { event.preventDefault(); setEditingId(phase.instanceId) }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); if (index > 0) onReorder(index, index - 1) }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); if (index < phases.length - 1) onReorder(index, index + 1) }
    else if ((event.key === 'Delete' || event.key === 'Backspace') && phases.length > 1) { event.preventDefault(); onDelete(phase.instanceId) }
  }

  const draggedPhase = drag && phases.find((phase) => phase.instanceId === drag.id)
  const stationary = drag ? phases.filter((phase) => phase.instanceId !== drag.id) : phases
  const cells: Array<TrainingPhase | null> = drag
    ? Array.from({ length: phases.length }, (_, slot) => {
        if (slot === drag.slot) return null
        const stationaryIndex = slot < drag.slot ? slot : slot - 1
        return stationary[stationaryIndex]
      })
    : [...phases]

  return <>
    <div className="phase-chip-row" role="list" aria-label="训练阶段">
      {cells.map((phase, slot) => phase
        ? <div
            key={phase.instanceId}
            ref={(node) => { if (node) nodes.current.set(phase.instanceId, node); else nodes.current.delete(phase.instanceId) }}
            data-phase-slot={slot}
            role="listitem"
            tabIndex={locked ? -1 : 0}
            aria-label={`${phase.label}，${phase.bars} 小节。长按拖动，双击修改小节数`}
            className={`phase-chip ${completed || phases.indexOf(phase) < activeIndex ? 'complete' : sessionStarted && phases.indexOf(phase) === activeIndex ? 'current' : ''}`}
            onPointerDown={(event) => beginHold(event, phase, phases.indexOf(phase))}
            onPointerMove={updatePending}
            onPointerUp={cancelPending}
            onPointerCancel={cancelPending}
            onDoubleClick={() => !locked && setEditingId(phase.instanceId)}
            onKeyDown={(event) => keyboardAction(event, phase, phases.indexOf(phase))}
          >
            <span className="drag-handle" aria-hidden="true" />
            <strong>{phase.label}</strong>
            {editingId === phase.instanceId
              ? <label><span className="sr-only">{phase.label} 小节数</span><select autoFocus value={phase.bars} onChange={(event) => onBarsChange(phase.instanceId, Number(event.target.value))} onBlur={() => setEditingId(undefined)}>{Array.from({ length: 32 }, (_, value) => <option key={value + 1} value={value + 1}>{value + 1}</option>)}</select></label>
              : <span className="bar-count" aria-hidden="true">{phase.bars}<small>小节</small></span>}
          </div>
        : <div key="phase-placeholder" data-phase-slot={slot} className="phase-chip-placeholder" aria-hidden="true" />)}
      {children}
    </div>
    {drag && draggedPhase && typeof document !== 'undefined' && createPortal(<>
      <div ref={floatingLayer} className="phase-drag-layer" style={{ transform: `translate3d(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px, 0)` } as CSSProperties} aria-hidden="true">
        <div className="phase-chip phase-chip-floating" style={{ width: drag.width, height: drag.height }}><span className="drag-handle" /><strong>{draggedPhase.label}</strong><span className="bar-count">{draggedPhase.bars}<small>小节</small></span></div>
      </div>
      {drag.canDelete && <div ref={trashNode} data-phase-trash className={`phase-trash visible ${drag.overTrash ? 'over' : ''} ${phases.length === 1 ? 'disabled' : ''}`} aria-hidden="true">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 12H8L7 9Zm3 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" /></svg>
        <span>{phases.length === 1 ? '至少保留一个阶段' : '拖到这里删除'}</span>
      </div>}
    </>, document.body)}
  </>
}
