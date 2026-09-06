import { describe, expect, it } from 'vitest'
import { barProgress } from './PracticeProgress'

describe('current bar display', () => {
  it('does not label an unstarted session as playing bar one', () => {
    expect(barProgress(17, 0, false, false)).toMatchObject({ done: 0, current: 0 })
  })
  it('shows bar five after four completed bars, including while paused', () => {
    expect(barProgress(17, 4, true, false)).toMatchObject({ done: 4, current: 5 })
  })
  it('never shows a bar beyond the final bar', () => {
    expect(barProgress(17, 17, true, true)).toMatchObject({ done: 17, current: 17 })
  })
  it('keeps the current bar in a bounded window throughout long routes', () => {
    for (let cycle = 0; cycle < 512; cycle++) {
      const value = barProgress(512, cycle, true, false)
      expect(value.end - value.start).toBe(24)
      expect(value.current).toBeGreaterThan(value.start)
      expect(value.current).toBeLessThanOrEqual(value.end)
    }
  })
})
