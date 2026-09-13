import { describe, expect, it } from 'vitest'
import { CHALLENGES, CHALLENGE_PHASES, challengeEvents, challengePosition, hitSteps } from './challenge'

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

  it('maps the 16-step count-in and four 32-step phases across rounds', () => {
    expect(CHALLENGE_PHASES).toEqual(['听示范', '跟着打', '轮到你', '再听验证'])
    expect(challengePosition(0, 2)).toMatchObject({ step: 0, total: 272, countIn: true, round: 1, phase: 0, phraseStep: 0, complete: false })
    expect(challengePosition(15, 2)).toMatchObject({ countIn: true, phase: 0, phraseStep: 0 })
    expect(challengePosition(16, 2)).toMatchObject({ countIn: false, round: 1, phase: 0, phraseStep: 0 })
    expect(challengePosition(48, 2)).toMatchObject({ round: 1, phase: 1, phraseStep: 0 })
    expect(challengePosition(80, 2)).toMatchObject({ round: 1, phase: 2, phraseStep: 0 })
    expect(challengePosition(144, 2)).toMatchObject({ round: 2, phase: 0, phraseStep: 0 })
    expect(challengePosition(272, 2)).toMatchObject({ complete: true, step: 272 })
  })

  it('always clicks the count-in and suppresses target hits only in the user phase', () => {
    const hits = [0, 4, 8]
    expect(challengeEvents(0, 1, hits, false)).toEqual({ target: false, reference: true })
    expect(challengeEvents(16, 1, hits, false)).toEqual({ target: true, reference: false })
    expect(challengeEvents(80, 1, hits, true)).toEqual({ target: false, reference: true })
    expect(challengeEvents(80, 1, hits, false)).toEqual({ target: false, reference: false })
    expect(challengeEvents(144, 2, hits, true)).toEqual({ target: true, reference: true })
    expect(challengeEvents(272, 2, hits, true)).toEqual({ target: false, reference: false })
  })
})
