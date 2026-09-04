import { describe, expect, it } from 'vitest'

import { categoriesForView, PRACTICE_ENTRIES, practicesForCategory } from './catalog'

describe('practice catalog classification', () => {
  it('shows only available Alpha categories in both views', () => {
    expect(categoriesForView('dance').map(({ name }) => name)).toEqual(['Hip-Hop'])
    expect(categoriesForView('music').map(({ name }) => name)).toEqual(['Boom Bap'])
  })

  it('reuses canonical practices and favorite keys across classification views', () => {
    const dancePractices = practicesForCategory('hip-hop')
    const musicPractices = practicesForCategory('boom-bap')

    expect(dancePractices).toHaveLength(3)
    expect(musicPractices).toHaveLength(3)
    dancePractices.forEach((practice, index) => {
      expect(practice).toBe(PRACTICE_ENTRIES[index])
      expect(musicPractices[index]).toBe(practice)
      expect(musicPractices[index].favoriteKey).toBe(practice.favoriteKey)
    })
    expect(new Set(PRACTICE_ENTRIES.map(({ favoriteKey }) => favoriteKey)).size).toBe(PRACTICE_ENTRIES.length)
  })
})
