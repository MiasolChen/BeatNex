import { describe, expect, it } from 'vitest'
import { phaseProgram } from './phaseProgram'

describe('phase program', () => {
  it('maps each route phase to its saved bar length and mix mode', () => {
    const phases = [
      { id: 'full', instanceId: 'a', bars: 1 },
      { id: 'solo', instanceId: 'b', bars: 2 },
      { id: 'focus', instanceId: 'c', bars: 3 },
      { id: 'normal', instanceId: 'd', bars: 4 },
      { id: 'muteTarget', instanceId: 'e', bars: 5 },
      { id: 'check', instanceId: 'f', bars: 6 },
    ] as const
    expect(phaseProgram(phases, ['kick', 'snare'])).toEqual([
      { bars: 1, mix: { mode: 'full', targets: ['kick', 'snare'] } },
      { bars: 2, mix: { mode: 'solo', targets: ['kick', 'snare'] } },
      { bars: 3, mix: { mode: 'weaken', targets: ['kick', 'snare'] } },
      { bars: 4, mix: { mode: 'full', targets: ['kick', 'snare'] } },
      { bars: 5, mix: { mode: 'mute-target', targets: ['kick', 'snare'] } },
      { bars: 6, mix: { mode: 'full', targets: ['kick', 'snare'] } },
    ])
  })

  it('preserves the supplied target selection in every phase', () => {
    const targets = ['closedHat'] as const
    const result = phaseProgram([{ id: 'solo', instanceId: 'only', bars: 7 }], [...targets])
    expect(result).toEqual([{ bars: 7, mix: { mode: 'solo', targets: ['closedHat'] } }])
    expect(result[0].mix.targets).not.toBe(targets)
  })
})
