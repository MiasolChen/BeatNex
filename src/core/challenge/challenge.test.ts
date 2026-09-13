import { describe, expect, it } from 'vitest'
import { CHALLENGES, challengeEvents, challengePosition, hitSteps } from './challenge'

describe('rhythm challenge content and timeline', () => {
  it('keeps the four source charts on a 32-token sixteenth grid', () => {
    expect(CHALLENGES).toHaveLength(4)
    expect(CHALLENGES.every(challenge => challenge.tokens.reduce((sum, token) => sum + token.length, 0) === 32)).toBe(true)
    expect(CHALLENGES.map(challenge => hitSteps(challenge.tokens))).toEqual([
      [0, 2, 8, 12, 16, 18, 20, 28, 30],
      [4, 6, 8, 10, 12, 16, 18, 20, 28],
      [4, 12, 13, 14, 15, 16, 20, 26, 28],
      [4, 10, 12, 18, 20, 26, 28],
    ])
  })

  it('maps each round to one two-bar phrase', () => {
    expect(challengePosition(0, 2)).toMatchObject({ step: 0, total: 64, round: 1, phraseStep: 0, complete: false })
    expect(challengePosition(31, 2)).toMatchObject({ round: 1, phraseStep: 31, complete: false })
    expect(challengePosition(32, 2)).toMatchObject({ round: 2, phraseStep: 0, complete: false })
    expect(challengePosition(63, 2)).toMatchObject({ round: 2, phraseStep: 31, complete: false })
    expect(challengePosition(64, 2)).toMatchObject({ complete: true, step: 64, total: 64 })
    expect(challengePosition(0, 1, true)).toMatchObject({ step: 0, total: 48, countIn: true, phraseStep: 0, complete: false })
    expect(challengePosition(15, 1, true).countIn).toBe(true)
    expect(challengePosition(16, 1, true)).toMatchObject({ countIn: false, phraseStep: 0, step: 16 })
    expect(challengePosition(48, 1, true)).toMatchObject({ complete: true, step: 48, total: 48 })
  })

  it('plays only chart hits and keeps every empty chart position silent', () => {
    expect(challengeEvents(0, 1, hitSteps(CHALLENGES[0].tokens), true)).toEqual({ target: true, reference: false })
    expect(challengeEvents(4, 1, hitSteps(CHALLENGES[0].tokens), true)).toEqual({ target: false, reference: false })

    for (const challenge of CHALLENGES) {
      const hits = hitSteps(challenge.tokens)
      for (let step = 0; step < 32; step++) {
        const events = challengeEvents(step, 1, hits, true)
        expect(events.reference).toBe(false)
        expect(events.target).toBe(hits.includes(step))
      }
    }

    expect(challengeEvents(32, 2, [0, 4, 8], true)).toEqual({ target: true, reference: false })
    expect(challengeEvents(64, 2, [0, 4, 8], true)).toEqual({ target: false, reference: false })
    expect(challengeEvents(0, 1, [0, 4, 8], true, true)).toEqual({ target: false, reference: true })
    expect(challengeEvents(16, 1, [0, 4, 8], true, true)).toEqual({ target: true, reference: false })
    expect(challengeEvents(48, 1, [0, 4, 8], true, true)).toEqual({ target: false, reference: false })
  })
})
