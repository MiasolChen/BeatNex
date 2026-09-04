import { describe, expect, it } from 'vitest'

import { BOOM_BAP_PATTERNS } from './fixtures'
import { validatePattern } from './validate'

describe('Boom Bap fixtures', () => {
  it('accepts all six approved patterns', () => {
    expect(BOOM_BAP_PATTERNS).toHaveLength(6)
    for (const pattern of BOOM_BAP_PATTERNS) expect(() => validatePattern(pattern)).not.toThrow()
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
