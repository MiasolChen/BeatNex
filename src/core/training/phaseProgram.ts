import type { TrainingMix, TrainingProgram } from '../../audio/types'
import type { DrumId } from '../pattern/types'
import type { RoutePhase } from '../../storage/practice'

const modes: Record<string, TrainingMix['mode']> = {
  full: 'full', solo: 'solo', focus: 'weaken', normal: 'full',
  muteTarget: 'mute-target', check: 'full',
}
export function phaseProgram(phases: readonly RoutePhase[], targets: DrumId[]): TrainingProgram {
  return phases.map(phase => ({ bars: phase.bars, mix: { mode: modes[phase.id], targets } }))
}
