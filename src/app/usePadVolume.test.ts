import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: <T,>(value: T) => [value, vi.fn()] as const,
    useRef: <T,>(value?: T) => ({ current: value as T }),
    useEffect: (effect: () => void | (() => void)) => { effect() },
  }
})

import { usePadVolume } from './usePadVolume'

const button = () => ({
  setPointerCapture: vi.fn(),
  hasPointerCapture: vi.fn(() => true),
  releasePointerCapture: vi.fn(),
}) as unknown as HTMLButtonElement

const event = (target: HTMLButtonElement, y: number, overrides: Partial<PointerEvent> = {}) => ({
  button: 0, pointerId: 1, clientX: 10, clientY: y, currentTarget: target,
  preventDefault: vi.fn(), ...overrides,
}) as unknown as React.PointerEvent<HTMLButtonElement>

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('usePadVolume gesture lifecycle', () => {
  it('does not adjust before the 350ms hold, then maps vertical movement', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const change = vi.fn()
    const target = button()
    const pad = usePadVolume(true, { kick: 50 }, change)
    pad.onPointerDown('kick', event(target, 200))
    pad.onPointerMove(event(target, 200))
    expect(change).not.toHaveBeenCalled()
    vi.advanceTimersByTime(350)
    pad.onPointerMove(event(target, 125))
    expect(change).toHaveBeenCalledWith('kick', 100)
  })

  it('suppresses the click after an active gesture and ends capture', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const target = button()
    const pad = usePadVolume(true, { kick: 50 }, vi.fn())
    pad.onPointerDown('kick', event(target, 200))
    vi.advanceTimersByTime(350)
    pad.onPointerEnd(event(target, 200))
    expect(pad.consumeClick()).toBe(true)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('cancels a pending hold after movement and ignores disabled mode', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const change = vi.fn()
    const target = button()
    const pending = usePadVolume(true, { kick: 50 }, change)
    pending.onPointerDown('kick', event(target, 200))
    pending.onPointerMove(event(target, 209))
    vi.advanceTimersByTime(350)
    pending.onPointerMove(event(target, 100))
    expect(change).not.toHaveBeenCalled()

    const disabled = usePadVolume(false, { kick: 50 }, change)
    disabled.onPointerDown('kick', event(target, 200))
    vi.advanceTimersByTime(350)
    disabled.onPointerMove(event(target, 100))
    expect(change).not.toHaveBeenCalled()
  })
})
