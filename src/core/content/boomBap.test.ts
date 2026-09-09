import { describe, expect, it } from 'vitest'

import { BOOM_BAP_LESSONS } from './boomBap'
import { PATTERN_NAMES } from '../pattern/fixtures'
import { DRUM_IDS } from '../pattern/types'

describe('Boom Bap lessons', () => {
  it('provides a focused, non-empty target set for every lesson', () => {
    expect(BOOM_BAP_LESSONS.length).toBe(8)
    expect(new Set(BOOM_BAP_LESSONS.map(({ name }) => name))).toEqual(new Set(PATTERN_NAMES))
    for (const lesson of BOOM_BAP_LESSONS) {
      expect(lesson.name.trim()).not.toBe('')
      expect(lesson.goal.trim()).not.toBe('')
      expect(lesson.targets.length).toBeGreaterThan(0)
      expect(lesson.targets.every(target => DRUM_IDS.includes(target))).toBe(true)
      expect(new Set(lesson.targets).size).toBe(lesson.targets.length)
    }
  })
})
