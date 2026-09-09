import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { METERS, type Meter } from '../../core/pattern/types'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

type Phase = 'closed' | 'open' | 'closing'
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The prototype's local listbox, portalled inside #bn to retain its visual tokens. */
export function EditorSelect<T extends string | number>({ value, onChange, options, label, format = String, optionLabel = format }: { value: T; onChange: (value: T) => void; options: readonly T[]; label: string; format?: (value: T) => string; optionLabel?: (value: T) => string }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const animations = useRef<Animation[]>([])
  const phaseRef = useRef<Phase>('closed')
  const initialFocus = useRef(0)
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const [phase, setPhase] = useState<Phase>('closed')

  const cancelAnimations = useCallback(() => {
    animations.current.forEach(animation => animation.cancel())
    animations.current = []
  }, [])
  const close = useCallback((restore = false, instant = false) => {
    if (phaseRef.current === 'closed') return
    cancelAnimations()
    if (menu.current) menu.current.inert = true
    const next: Phase = instant || reduced() ? 'closed' : 'closing'
    phaseRef.current = next
    setPhase(next)
    if (restore) trigger.current?.focus({ preventScroll: true })
  }, [cancelAnimations])
  function open(index = options.indexOf(value)) {
    cancelAnimations()
    initialFocus.current = index
    phaseRef.current = 'open'
    setPhase('open')
  }
  function focusOption(index: number) {
    const container = menu.current
    const option = container?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]
    if (!container || !option) return
    option.focus({ preventScroll: true })
    if (option.offsetTop < container.scrollTop) container.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = option.offsetTop + option.offsetHeight - container.clientHeight
  }
  useBrowserLayoutEffect(() => { setRoot(trigger.current?.closest<HTMLElement>('#bn') ?? null) }, [])
  useBrowserLayoutEffect(() => {
    const popup = menu.current, button = trigger.current
    if (!popup || !button || !root || phase === 'closed') return
    cancelAnimations()
    if (phase === 'closing') {
      popup.inert = true
      const animation = popup.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-5px)' }], { duration: 110, easing: 'ease-out' })
      animations.current = [animation]
      animation.onfinish = () => { if (phaseRef.current === 'closing') { phaseRef.current = 'closed'; setPhase('closed') } }
      return cancelAnimations
    }
    popup.inert = false
    const r = (button.closest('label') ?? button).getBoundingClientRect(), p = root.getBoundingClientRect()
    const width = Math.min(Math.max(r.width, 136), p.width - 24)
    popup.style.width = `${width}px`
    popup.style.left = `${Math.max(12, Math.min(r.left - p.left, p.width - width - 12))}px`
    const below = r.bottom - p.top + 6
    popup.style.maxHeight = `${Math.min(232, Math.max(88, p.height - below - 12))}px`
    popup.style.top = `${below + popup.offsetHeight < p.height - 12 ? below : Math.max(12, r.top - p.top - popup.offsetHeight - 6)}px`
    if (!reduced()) {
      animations.current.push(popup.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.96,.8)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 190, easing: 'cubic-bezier(.22,1,.36,1)' }))
      Array.from(popup.children).forEach((item, index) => animations.current.push(item.animate([{ opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 140, delay: Math.min(index, 4) * 12, easing: 'ease-out' })))
    }
    focusOption(initialFocus.current)
    return cancelAnimations
  }, [phase, root, cancelAnimations])
  useEffect(() => {
    if (phase !== 'open' || !root) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close()
    }
    const dismiss = () => close(false, true)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const stopMotion = () => { if (media.matches) cancelAnimations() }
    const main = root.querySelector('main')
    document.addEventListener('pointerdown', outside, true)
    main?.addEventListener('scroll', dismiss, { passive: true })
    window.addEventListener('resize', dismiss)
    media.addEventListener('change', stopMotion)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      main?.removeEventListener('scroll', dismiss)
      window.removeEventListener('resize', dismiss)
      media.removeEventListener('change', stopMotion)
    }
  }, [phase, root, close, cancelAnimations])
  useEffect(() => () => { cancelAnimations() }, [cancelAnimations])
  function menuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (phaseRef.current !== 'open') return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
    // Let the browser advance from the original field, rather than the portalled menu.
    if (event.key === 'Tab') { close(true, true); return }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
    focusOption(next)
  }

  return <>
    <button type="button" ref={trigger} className="bn-select-trigger"  aria-label={label} aria-haspopup="listbox" aria-expanded={phase === 'open'} aria-controls={phase !== 'closed' ? id : undefined} onClick={() => { if (phaseRef.current === 'open') close(); else open() }} onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); open(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : options.indexOf(value)) }
    }}><span>{format(value)}</span><i className="bn-select-arrow" aria-hidden="true" /></button>
    {root && phase !== 'closed' && createPortal(<div id={id} ref={menu} className="bn-select-menu" role="listbox" aria-label={label} aria-hidden={phase === 'closing' || undefined} onKeyDown={menuKeyDown}>{options.map(meter => <button key={meter} type="button" role="option" tabIndex={-1} aria-selected={value === meter} data-value={meter} onClick={() => { onChange(meter); close(true) }}>{optionLabel(meter)}</button>)}</div>, root)}
  </>
}

export function MeterSelect({value,onChange}:{value:Meter;onChange:(value:Meter)=>void}) {
  return <EditorSelect value={value} onChange={onChange} options={METERS} label="拍号"/>
}
