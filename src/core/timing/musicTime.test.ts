import { describe, expect, it } from 'vitest'

import { BOOM_BAP_PATTERNS } from '../pattern/fixtures'
import { absoluteStepTime, patternDuration, positionAtTime, secondsPerStep } from './musicTime'

describe('music time', () => {
  it.each([80, 100, 120])('converts steps at %i BPM', (bpm) => {
    expect(secondsPerStep(bpm, 4)).toBeCloseTo(60 / bpm / 4, 12)
    expect(patternDuration(BOOM_BAP_PATTERNS[0], bpm)).toBeCloseTo(60 / bpm * 4, 12)
  })

  it.each([80, 100, 120])('derives long-loop boundaries from an absolute origin at %i BPM', (bpm) => {
    const origin = 17.25
    const barSeconds = 60 / bpm * 4
    const loopCount = Math.floor(10 * 60 / barSeconds)
    const boundary = absoluteStepTime(origin, loopCount * 16, bpm, 4)
    expect(boundary).toBeCloseTo(origin + loopCount * barSeconds, 10)
    expect(positionAtTime(BOOM_BAP_PATTERNS[0], bpm, origin, boundary).progress).toBeCloseTo(0, 10)
  })
})
