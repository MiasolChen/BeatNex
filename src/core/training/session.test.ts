import { describe, expect, it } from 'vitest'
import { DEFAULT_PHASES, resolveTrainingPhases, trainingBarMarks, trainingFrameAtCycle, trainingTotalBars } from './session'

describe('guided training session', () => {
  it('moves through a freely ordered sequence including duplicate phases', () => {
    const phases = resolveTrainingPhases([{ id: 'solo', instanceId: 'one', bars: 2 }, { id: 'full', instanceId: 'two', bars: 1 }, { id: 'solo', instanceId: 'three', bars: 3 }])
    expect(trainingTotalBars(phases)).toBe(6)
    expect(trainingFrameAtCycle(phases, true, false, 0).phase.instanceId).toBe('one')
    expect(trainingFrameAtCycle(phases, true, false, 2).phase.instanceId).toBe('two')
    expect(trainingFrameAtCycle(phases, true, false, 3).phase.instanceId).toBe('three')
    expect(trainingFrameAtCycle(phases, true, false, 6).status).toBe('completed')
  })
  it('uses the final bar of each non-final phase as a transition notice', () => {
    const phases = resolveTrainingPhases(DEFAULT_PHASES)
    for (const [cycle, index] of [[7, 0], [11, 1], [15, 2], [19, 3], [23, 4]] as const) expect(trainingFrameAtCycle(phases, true, false, cycle)).toMatchObject({ status: 'phaseNotice', phaseIndex: index, nextPhase: { instanceId: phases[index + 1].instanceId } })
  })
  it('supports a one-stage course and clamps phase length', () => {
    const phases = resolveTrainingPhases([{ id: 'check', instanceId: 'only', bars: 99 }])
    expect(phases[0].bars).toBe(32)
    expect(trainingFrameAtCycle(phases, false, false, 0).status).toBe('notStarted')
    expect(trainingFrameAtCycle(phases, true, true, 0).status).toBe('countIn')
  })
  it('divides a four-bar session into four parts and marks phase boundaries', () => {
    const fourBars = resolveTrainingPhases([{ id: 'full', instanceId: 'only', bars: 4 }])
    expect(trainingBarMarks(fourBars)).toEqual([
      { bar: 1, isPhaseBoundary: false }, { bar: 2, isPhaseBoundary: false }, { bar: 3, isPhaseBoundary: false },
    ])
    const twoPhases = resolveTrainingPhases([{ id: 'full', instanceId: 'one', bars: 2 }, { id: 'solo', instanceId: 'two', bars: 2 }])
    expect(trainingBarMarks(twoPhases)[1]).toEqual({ bar: 2, isPhaseBoundary: true })
  })
})
