import { describe, expect, it } from 'vitest'
import { callPhrase, callProgram, callStage } from './callResponse'
import { BOOM_BAP_PATTERNS } from '../pattern/fixtures'
import type { Pattern } from '../pattern/types'
import { stepsPerBar } from '../timing/musicTime'

const threeBarPattern: Pattern = {
  ...BOOM_BAP_PATTERNS[0],
  bars: 3,
  tracks: [
    { drum: 'kick', hits: [{ step: 0, velocity: 100 }, { step: 16, velocity: 80 }, { step: 32, velocity: 60 }] },
    { drum: 'snare', hits: [{ step: 4, velocity: 90 }, { step: 20, velocity: 70 }, { step: 36, velocity: 50 }] },
    { drum: 'closedHat', hits: [] },
    { drum: 'openHat', hits: [] },
  ],
}

describe('Call / Response training model', () => {
  it.each([1, 2, 3, 4])('repeats and truncates a three-bar source to %i bars', bars => {
    const phrase = callPhrase(threeBarPattern, bars)
    const sourceSteps = stepsPerBar(threeBarPattern) * 3
    const length = stepsPerBar(threeBarPattern) * bars
    expect(phrase.bars).toBe(bars)
    expect(phrase.tracks[0].hits.map(hit => hit.step)).toEqual(
      Array.from({ length: Math.ceil(length / sourceSteps) }, (_, cycle) =>
        [0, 16, 32].map(step => step + cycle * sourceSteps),
      ).flat().filter(step => step < length),
    )
  })

  it('builds equal-length Call, silent Response, and matching Check stages', () => {
    expect(callProgram(3, ['kick', 'snare'])).toEqual([
      { bars: 3, mix: { mode: 'solo', targets: ['kick', 'snare'] } },
      { bars: 3, mix: { mode: 'silence' } },
      { bars: 3, mix: { mode: 'solo', targets: ['kick', 'snare'] } },
    ])
  })

  it('labels count-in, Call, Response, Check, and completion boundaries', () => {
    expect(callStage(0, 2, true)).toEqual({ label: '预备拍', task: '跟随点击声，准备听示范' })
    expect(callStage(0, 2, false).label).toBe('示范')
    expect(callStage(2, 2, false).label).toBe('回应')
    expect(callStage(4, 2, false).label).toBe('检查')
    expect(callStage(6, 2, false).label).toBe('本轮结束')
  })
})
