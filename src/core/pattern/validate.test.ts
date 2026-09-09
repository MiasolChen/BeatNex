import { describe, expect, it } from 'vitest'

import { BOOM_BAP_PATTERNS } from './fixtures'
import { validatePattern } from './validate'

describe('Boom Bap fixtures', () => {
  it('accepts all 24 fixed patterns with unique IDs and three variants per name', () => {
    expect(BOOM_BAP_PATTERNS).toHaveLength(24)
    expect(new Set(BOOM_BAP_PATTERNS.map(({ id }) => id)).size).toBe(24)
    const variants = new Map<string, Set<string>>()
    for (const pattern of BOOM_BAP_PATTERNS) {
      expect(() => validatePattern(pattern)).not.toThrow()
      const names = variants.get(pattern.name) ?? new Set<string>()
      names.add(pattern.difficulty)
      variants.set(pattern.name, names)
    }
    expect(variants.size).toBe(8)
    for (const difficulties of variants.values()) expect(difficulties).toEqual(new Set(['simple', 'medium', 'hard']))
  })

  it('keeps each difficulty variant musically distinct', () => {
    for (const name of new Set(BOOM_BAP_PATTERNS.map(({ name }) => name))) {
      const variants = BOOM_BAP_PATTERNS.filter(pattern => pattern.name === name)
      expect(new Set(variants.map(pattern => JSON.stringify(pattern.tracks))).size).toBe(3)
    }
  })

  it('retains the six original curated pattern IDs', () => {
    const ids = new Set(BOOM_BAP_PATTERNS.map(({ id }) => id))
    for (const id of [
      'boom-bap-foundation-simple', 'boom-bap-foundation-hard',
      'boom-bap-pocket-swing-simple', 'boom-bap-pocket-swing-hard',
      'boom-bap-syncopated-break-simple', 'boom-bap-syncopated-break-hard',
    ]) expect(ids.has(id)).toBe(true)
  })

  it('retains the original six pattern content', () => {
    const expected: Record<string, string[]> = {
      'boom-bap-foundation-simple': ['X---X---X---X---', '----X-------X---', 'x-x-x-x-x-x-x-x-', '----------------'],
      'boom-bap-foundation-hard': ['X-----x-X-x---x-', '----X-------X--g', 'x-x-x-x-x-x-x-x-', '--------------x-'],
      'boom-bap-pocket-swing-simple': ['X-----x-X-x-----', '----X-------X---', 'x-x-x-x-x-x-x-x-', '----------------'],
      'boom-bap-pocket-swing-hard': ['X--x--x-X-x---x-', '----X--g----X--g', 'x-xxx-x-x-xxx-x-', '--------------x-'],
      'boom-bap-syncopated-break-simple': ['X--x----X-x---x-', '----X-------X---', 'x-x-x-x-x-x-x---', '--------------x-'],
      'boom-bap-syncopated-break-hard': ['X--x--x---x-x--x', '----X-g-----X--g', 'x-xxx-x-x---x-x-', '----------x-----'],
    }
    const mark = (velocity: number) => velocity === 100 ? 'X' : velocity === 65 ? 'x' : 'g'
    for (const [id, notation] of Object.entries(expected)) {
      const pattern = BOOM_BAP_PATTERNS.find(item => item.id === id)
      expect(pattern).toBeDefined()
      expect(pattern?.tracks.map(track => Array.from({ length: 16 }, (_, step) => {
        const hit = track.hits.find(item => item.step === step)
        return hit ? mark(hit.velocity) : '-'
      }).join(''))).toEqual(notation)
    }
  })

  it('rejects duplicate tracks, steps outside the bar and invalid velocity', () => {
    const duplicate = structuredClone(BOOM_BAP_PATTERNS[0])
    duplicate.tracks.push(structuredClone(duplicate.tracks[0]))
    expect(() => validatePattern(duplicate)).toThrow('重复轨道')

    const outside = structuredClone(BOOM_BAP_PATTERNS[0])
    outside.tracks[0].hits[0].step = 16
    expect(() => validatePattern(outside)).toThrow('超出范围')

    const velocity = structuredClone(BOOM_BAP_PATTERNS[0])
    velocity.tracks[0].hits[0].velocity = 101
    expect(() => validatePattern(velocity)).toThrow('力度')
  })
})
