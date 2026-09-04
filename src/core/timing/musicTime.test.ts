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

  it('normalizes floating point noise at an exact visual step boundary', () => {
    const position = positionAtTime(BOOM_BAP_PATTERNS[0], 100, 0.08, 1.13)

    expect(position).toMatchObject({ cycle: 0, step: 7 })
    expect(position.progress).toBeCloseTo(7 / 16, 12)
  })

  it.each([80, 100, 120])('keeps visual step and progress stable across long loops at %i BPM', (bpm) => {
    const pattern = BOOM_BAP_PATTERNS[0]
    const origin = 0.08

    for (const cycle of [0, 1, 10, 100, 5_000]) {
      for (const step of [0, 1, 7, 15]) {
        const absoluteStep = cycle * 16 + step
        const now = absoluteStepTime(origin, absoluteStep, bpm, pattern.subdivision)
        const position = positionAtTime(pattern, bpm, origin, now)

        expect(position.cycle).toBe(cycle)
        expect(position.step).toBe(step)
        expect(position.progress).toBeCloseTo(step / 16, 10)
      }
    }
  })
})
