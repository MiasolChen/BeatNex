import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './components/Icons'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const PHASE_TYPES = [
  ['FULL', '完整聆听'], ['SOLO', '单独听辨'], ['FOCUS', '弱化目标'],
  ['NORMAL', '正常合奏'], ['MUTE', '自主保持'], ['RECOVER', '完整检查'],
] as const

type Phase = { instanceId: string; id: string; label: string; bars: number }
type Props = {
  phases: readonly Phase[]
  locked: boolean
  activeIndex: number
  onBarsChange: (id: string, bars: number) => void
  onReorder: (from: number, to: number) => void
  onDelete: (id: string) => void
  onAdd: (typeIndex: number) => void
  notice: (message: string) => void
}
type Pending = { id: string; from: number; pointerId: number; pointerType: string; x: number; y: number }
type Drag = Pending & { slot: number; dx: number; dy: number; width: number; height: number; slots: DOMRect[]; overTrash: boolean }
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function PhaseChipEditor(props: Props) {
  const { phases, locked, activeIndex } = props
  const latest = useRef(props)
  latest.current = props
  const [selected, setSelected] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [trayState, setTrayState] = useState<'open' | 'closing' | null>(null)
  const [barsDrafts, setBarsDrafts] = useState<Record<string, string>>({})
  const dragRef = useRef<Drag | null>(null)
  const pending = useRef<Pending | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout>>()
  const suppressClickUntil = useRef(0)
  const frame = useRef(0)
  const rootRef = useRef<HTMLElement | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const ghost = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  const tray = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const highWater = useRef(227)
  const beforeRects = useRef<Map<string, DOMRect> | null>(null)
  const layoutAnimations = useRef(new Map<string, Animation>())
  const trayAnimations = useRef<Animation[]>([])
  const trayVersion = useRef(0)
  const deletion = useRef<{ node: HTMLElement; animation: Animation } | null>(null)
  const closeTrayRef = useRef<() => void>(() => {})
  const finishDragRef = useRef<(cancel?: boolean) => void>(() => {})
  const liftRef = useRef<() => void>(() => {})

  const capture = () => {
    beforeRects.current = new Map(Array.from(nodes.current, ([id, node]) => [id, node.getBoundingClientRect()]))
    layoutAnimations.current.forEach((animation) => animation.cancel())
    layoutAnimations.current.clear()
  }
  const clearPending = () => { clearTimeout(hold.current); pending.current = null }
  const closeTray = () => setTrayState((state) => state ? 'closing' : null)
  closeTrayRef.current = closeTray

  const remove = (id: string) => {
    const current = latest.current
    if (current.locked) return
    if (current.phases.length <= 1) { current.notice('至少保留一个阶段'); return }
    const phase = current.phases.find((item) => item.instanceId === id)
    if (!phase) return
    deletion.current?.animation.cancel()
    deletion.current?.node.remove()
    deletion.current = null
    const source = ghost.current?.firstElementChild as HTMLElement | undefined ?? nodes.current.get(id)
    const root = rootRef.current
    if (source && root && !reduced()) {
      const rect = source.getBoundingClientRect(), base = root.getBoundingClientRect()
      const copy = source.cloneNode(true) as HTMLElement
      copy.removeAttribute('id')
      copy.removeAttribute('data-route-id')
      copy.className = 'bn-drag-ghost'
      copy.inert = true
      copy.setAttribute('aria-hidden', 'true')
      copy.style.cssText = `position:absolute;left:${rect.left - base.left}px;top:${rect.top - base.top}px;width:${rect.width}px;height:${rect.height}px;z-index:24;pointer-events:none`
      root.append(copy)
      const animation = copy.animate([{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(16px) scale(.3)', opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'both' })
      deletion.current = { node: copy, animation }
      animation.onfinish = () => { copy.remove(); if (deletion.current?.node === copy) deletion.current = null }
    }
    capture()
    current.onDelete(id)
    setSelected(null)
    current.notice(`已删除${phase.label}`)
  }

  const finishDrag = (cancel = false) => {
    clearPending()
    cancelAnimationFrame(frame.current)
    const current = dragRef.current
    if (!current) return
    capture()
    const floatingRect = ghost.current?.getBoundingClientRect()
    if (floatingRect) beforeRects.current?.set(current.id, floatingRect)
    dragRef.current = null
    setDrag(null)
    suppressClickUntil.current = performance.now() + 400
    const root = rootRef.current
    root?.classList.remove('bn-editing', 'bn-dragging-route')
    try { root?.releasePointerCapture(current.pointerId) } catch { /* A cancelled pointer may have released capture already. */ }
    if (cancel || latest.current.locked) { latest.current.notice('已取消拖动'); return }
    if (current.overTrash) remove(current.id)
    else if (current.slot !== current.from) {
      latest.current.onReorder(current.from, current.slot)
      latest.current.notice(`已移到第 ${current.slot + 1} 位`)
    }
  }
  finishDragRef.current = finishDrag

  const lift = () => {
    const start = pending.current
    const node = start && nodes.current.get(start.id)
    const root = rootRef.current
    if (!start || !node || !root || latest.current.locked) return
    clearPending()
    capture()
    const rect = node.getBoundingClientRect()
    const current: Drag = { ...start, slot: start.from, dx: start.x - rect.left, dy: start.y - rect.top,
      width: rect.width, height: rect.height,
      slots: latest.current.phases.map((phase) => nodes.current.get(phase.instanceId)!.getBoundingClientRect()), overTrash: false }
    dragRef.current = current
    setDrag(current)
    setSelected(start.id)
    root.classList.add('bn-editing', 'bn-dragging-route')
    try { root.setPointerCapture(start.pointerId) } catch { /* Pointer capture is unavailable for a cancelled gesture. */ }
    latest.current.notice('已抬起阶段，拖动换位或拖入垃圾桶删除')
  }
  liftRef.current = lift

  useBrowserLayoutEffect(() => {
    rootRef.current = list.current?.closest('#bn') ?? null
    const node = list.current
    if (node) {
      highWater.current = Math.max(highWater.current, node.getBoundingClientRect().height, node.scrollHeight)
      node.style.minHeight = `${highWater.current}px`
    }
    const previous = beforeRects.current
    beforeRects.current = null
    if (!previous || reduced()) return
    nodes.current.forEach((node, id) => {
      if (id === dragRef.current?.id) return
      const before = previous.get(id)
      if (!before) return
      const after = node.getBoundingClientRect()
      const dx = before.left - after.left, dy = before.top - after.top
      if (Math.abs(dx) + Math.abs(dy) < 1) return
      const animation = node.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }],
        { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' })
      layoutAnimations.current.set(id, animation)
      animation.onfinish = () => { if (layoutAnimations.current.get(id) === animation) layoutAnimations.current.delete(id) }
    })
  }, [phases, drag?.slot])

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const start = pending.current
      if (start && start.pointerId === event.pointerId) {
        const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
        if (start.pointerType === 'mouse' && distance > 5) liftRef.current()
        else if (distance > 9) clearPending()
      }
      const current = dragRef.current
      if (!current || current.pointerId !== event.pointerId) return
      event.preventDefault()
      const x = event.clientX, y = event.clientY
      const bin = dock.current?.getBoundingClientRect()
      const overTrash = Boolean(latest.current.phases.length > 1 && bin && x >= bin.left && x <= bin.right && y >= bin.top && y <= bin.bottom)
      let slot = current.slot, nearest = slot, nearestDistance = Infinity
      if (!overTrash) {
        current.slots.forEach((rect, index) => {
          const distance = Math.hypot(x - rect.left - rect.width / 2, y - rect.top - rect.height / 2)
          if (distance < nearestDistance) { nearest = index; nearestDistance = distance }
        })
        const previous = current.slots[slot]
        const previousDistance = Math.hypot(x - previous.left - previous.width / 2, y - previous.top - previous.height / 2)
        if (nearestDistance < 100 && nearestDistance + 14 < previousDistance) slot = nearest
      }
      const next = { ...current, x, y, slot, overTrash }
      dragRef.current = next
      if (slot !== current.slot || overTrash !== current.overTrash) {
        if (slot !== current.slot) capture()
        setDrag(next)
      }
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        const base = rootRef.current?.getBoundingClientRect()
        if (ghost.current && base) ghost.current.style.transform = `translate3d(${x - base.left - current.dx}px,${y - base.top - current.dy}px,0)`
      })
    }
    const up = (event: globalThis.PointerEvent) => {
      if (event.pointerId === dragRef.current?.pointerId) finishDragRef.current()
      else if (event.pointerId === pending.current?.pointerId) clearPending()
    }
    const cancelPointer = (event: globalThis.PointerEvent) => {
      if (event.pointerId === dragRef.current?.pointerId || event.pointerId === pending.current?.pointerId) finishDragRef.current(true)
    }
    const cancel = () => { finishDragRef.current(true); closeTrayRef.current() }
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && (dragRef.current || pending.current)) { event.preventDefault(); finishDragRef.current(true) }
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancelPointer)
    window.addEventListener('blur', cancel)
    window.addEventListener('resize', cancel)
    window.addEventListener('keydown', keys)
    document.addEventListener('visibilitychange', cancel)
    return () => {
      clearPending()
      cancelAnimationFrame(frame.current)
      rootRef.current?.classList.remove('bn-editing', 'bn-dragging-route')
      if (dragRef.current) { try { rootRef.current?.releasePointerCapture(dragRef.current.pointerId) } catch { /* Already released. */ } }
      layoutAnimations.current.forEach((animation) => animation.cancel())
      trayAnimations.current.forEach((animation) => animation.cancel())
      deletion.current?.animation.cancel()
      deletion.current?.node.remove()
      ++trayVersion.current
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancelPointer)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('resize', cancel)
      window.removeEventListener('keydown', keys)
      document.removeEventListener('visibilitychange', cancel)
    }
  }, [])

  useEffect(() => { if (locked) { finishDragRef.current(true); closeTrayRef.current() } }, [locked])

  useBrowserLayoutEffect(() => {
    const panel = tray.current, shade = backdrop.current, anchor = addButton.current, root = rootRef.current
    if (!trayState || !panel || !shade || !anchor || !root) return
    const version = ++trayVersion.current
    const style = getComputedStyle(panel)
    const from = { transform: style.transform, clipPath: style.clipPath, opacity: style.opacity }
    trayAnimations.current.forEach((animation) => animation.cancel())
    trayAnimations.current = []
    const rootBox = root.getBoundingClientRect(), anchorBox = anchor.getBoundingClientRect()
    if (trayState === 'open') panel.style.top = `${Math.max(20, Math.min(anchorBox.top - rootBox.top - 160, rootBox.height - panel.offsetHeight - 90))}px`
    const box = panel.getBoundingClientRect()
    const dx = anchorBox.left + anchorBox.width / 2 - box.left - box.width / 2
    const dy = anchorBox.top + anchorBox.height / 2 - box.top - box.height / 2
    const folded = { transform: `translate(${dx}px,${dy}px)`, clipPath: `inset(${Math.max(0, (box.height - 44) / 2)}px ${Math.max(0, (box.width - 44) / 2)}px round 22px)`, opacity: 0 }
    const full = { transform: 'translate(0,0)', clipPath: 'inset(0px 0px round 20px)', opacity: 1 }
    const done = () => {
      if (trayVersion.current !== version) return
      if (trayState === 'closing') setTrayState(null)
    }
    if (reduced()) done()
    else {
      const animation = panel.animate(trayState === 'open' ? [{ ...folded, opacity: 1 }, full] : [from, folded],
        { duration: trayState === 'open' ? 360 : 220, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' })
      animation.onfinish = done
      trayAnimations.current.push(animation)
      trayAnimations.current.push(shade.animate([{ backgroundColor: trayState === 'open' ? '#20211f00' : '#20211f50' }, { backgroundColor: trayState === 'open' ? '#20211f50' : '#20211f00' }], { duration: 220, fill: 'both' }))
      if (trayState === 'open') panel.querySelectorAll<HTMLElement>('h3,.bn-add-options button').forEach((element, index) => {
        trayAnimations.current.push(element.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, delay: 60 + index * 16, fill: 'both', easing: 'ease-out' }))
      })
    }
    if (trayState === 'open') panel.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [trayState])

  useEffect(() => {
    if (!trayState) return
    const root = rootRef.current, panel = tray.current
    if (!root || !panel) return
    const siblings = Array.from(root.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop.current)
    const inertBefore = siblings.map((element) => element.inert)
    siblings.forEach((element) => { element.inert = true })
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeTrayRef.current() }
      if (event.key !== 'Tab') return
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const first = buttons[0], last = buttons.at(-1)
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keys)
    return () => { siblings.forEach((element, index) => { element.inert = inertBefore[index] }); document.removeEventListener('keydown', keys); addButton.current?.focus({ preventScroll: true }) }
  }, [Boolean(trayState)])

  const begin = (event: PointerEvent<HTMLButtonElement>, phase: Phase, index: number) => {
    if (locked || trayState || !event.isPrimary || event.button > 0) return
    clearPending()
    pending.current = { id: phase.instanceId, from: index, pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY }
    hold.current = setTimeout(() => liftRef.current(), 360)
  }
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, phase: Phase, index: number) => {
    if (locked) return
    if (event.key.startsWith('Arrow')) {
      event.preventDefault()
      const next = Math.max(0, Math.min(phases.length - 1, index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)))
      if (next !== index) { capture(); props.onReorder(index, next); props.notice(`已移到第 ${next + 1} 位`) }
    } else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(phase.instanceId) }
  }
  const saveBars = (phase: Phase, input: HTMLInputElement) => {
    const value = Number(input.value)
    if (!locked && input.value.trim() && Number.isInteger(value) && value >= 1 && value <= 32) {
      if (value !== phase.bars) props.onBarsChange(phase.instanceId, value)
    } else if (!locked) props.notice('每个阶段为 1 至 32 小节')
    setBarsDrafts((drafts) => { const next = { ...drafts }; delete next[phase.instanceId]; return next })
  }
  const ordered = [...phases]
  if (drag) { const [moving] = ordered.splice(drag.from, 1); ordered.splice(drag.slot, 0, moving) }
  const dragged = drag && phases.find((phase) => phase.instanceId === drag.id)
  const root = rootRef.current
  const rootBox = root?.getBoundingClientRect()
  const selectedExists = phases.some((phase) => phase.instanceId === selected)
  const deleteDock = <div ref={dock} className={`bn-route-dock${drag ? ' bn-floating-delete' : ''}`}>
    <span id="bn-delete-hint">{phases.length === 1 ? '至少保留一个阶段' : selectedExists ? '已选中 · 可拖动或删除' : '点标签选中 · 点数字修改'}</span>
    <button id="bn-trash" className={`bn-trash${drag?.overTrash ? ' over' : ''}`} disabled={locked || phases.length <= 1 || (!drag && !selectedExists)} aria-label={drag ? '松手删除阶段' : '删除选中阶段'} onClick={() => { if (!drag && selected) remove(selected) }}>
      <Icon name="trash" /><span>{drag ? drag.overTrash ? '松手删除' : '拖到这里删除' : '删除'}{drag && <small>{drag.overTrash ? '移出区域即可取消' : '松手删除 · 移开取消'}</small>}</span>
    </button>
  </div>
  return <>
    <div id="bn-phases" className="bn-phases" ref={list} aria-label="训练阶段">
      {ordered.map((phase, index) => <div key={phase.instanceId} ref={(node) => { if (node) nodes.current.set(phase.instanceId, node); else nodes.current.delete(phase.instanceId) }} data-route-id={phase.instanceId} className={`bn-phase${phases.indexOf(phase) === activeIndex ? ' active' : ''}${phase.instanceId === selected ? ' selected' : ''}${phase.instanceId === drag?.id ? ' bn-placeholder' : ''}`}>
        <button className="bn-phase-face" disabled={locked} data-select-phase={phase.instanceId} aria-pressed={phase.instanceId === selected} aria-current={phases.indexOf(phase) === activeIndex ? 'step' : undefined} aria-label={`${phase.label}，第 ${index + 1} 位，长按拖动，方向键排序`} onPointerDown={(event) => begin(event, phase, index)} onContextMenu={(event) => event.preventDefault()} onClick={() => { if (performance.now() >= suppressClickUntil.current) setSelected(phase.instanceId) }} onKeyDown={(event) => keyboard(event, phase, index)}><strong>{phase.label}</strong></button>
        <label className="bn-inline-bars"><input type="text" inputMode="numeric" pattern="(3[0-2]|[12][0-9]|[1-9])" maxLength={2} required disabled={locked} aria-label={`${phase.label} 第 ${index + 1} 项小节数`} value={barsDrafts[phase.instanceId] ?? phase.bars} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setBarsDrafts((drafts) => ({ ...drafts, [phase.instanceId]: event.target.value }))} onBlur={(event) => saveBars(phase, event.currentTarget)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } else if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.value = String(phase.bars); event.currentTarget.blur() } }} /><span>小节</span></label>
      </div>)}
      <button ref={addButton} id="bn-add-phase" className="bn-add-phase" disabled={locked || phases.length >= 16} aria-expanded={trayState === 'open'} aria-controls="bn-add-tray" onClick={() => { if (performance.now() >= suppressClickUntil.current) setTrayState('open') }}><span>＋</span>添加阶段</button>
    </div>
    {drag ? <div aria-hidden="true" style={{ minHeight: 60, marginTop: 12 }} /> : deleteDock}
    {drag && dragged && root && createPortal(<>{deleteDock}<div ref={ghost} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, zIndex: 24, pointerEvents: 'none', transform: `translate3d(${drag.x - (rootBox?.left ?? 0) - drag.dx}px,${drag.y - (rootBox?.top ?? 0) - drag.dy}px,0)` }}><div className={`bn-drag-ghost${drag.overTrash ? ' bn-over-bin' : ''}`} style={{ position: 'relative', width: drag.width, height: drag.height }}><span className="bn-phase-face"><strong>{dragged.label}</strong></span><span className="bn-inline-bars"><input readOnly tabIndex={-1} value={dragged.bars} /><span>小节</span></span></div></div></>, root)}
    {trayState && root && createPortal(<div ref={backdrop} id="bn-add-backdrop" className="bn-add-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closeTray() }}><div ref={tray} id="bn-add-tray" className="bn-add-tray" role="dialog" aria-modal="true" aria-labelledby="bn-add-title"><div className="bn-row"><h3 id="bn-add-title">添加一个阶段</h3><button className="bn-smallbtn" aria-label="收起添加阶段" onClick={closeTray}>×</button></div><div className="bn-add-options">{PHASE_TYPES.map(([code, label], index) => <button key={code} disabled={trayState === 'closing' || phases.length >= 16} onClick={() => { if (latest.current.locked || latest.current.phases.length >= 16) return; capture(); props.onAdd(index); props.notice(`已添加${label}`); closeTray() }}><span>{code}</span><strong>{label}</strong><b>＋</b></button>)}</div></div></div>, root)}
  </>
}
