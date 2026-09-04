import type { Difficulty, DrumId } from '../pattern/types'

export type TrainingPhaseId = 'full' | 'solo' | 'focus' | 'normal' | 'muteTarget' | 'check'
export type TrainingMixMode = 'full' | 'solo' | 'focus' | 'mute-target'
export type TrainingVisualMode = 'full' | 'target' | 'focus' | 'partial' | 'hidden-target' | 'check'
export type TrainingPhaseDefinition = { id: TrainingPhaseId; label: string; mixMode: TrainingMixMode; visualMode: TrainingVisualMode; sound: (target: string) => string; task: (target: string) => string }
export type TrainingPhase = TrainingPhaseDefinition & { instanceId: string; bars: number }
export type TrainingConfig = { version: 1; targetDrum: DrumId; phases: Array<{ id: TrainingPhaseId; instanceId: string; bars: number }>; patternName: string; difficulty: Difficulty; bpm: number }

export const TRAINING_PHASE_DEFINITIONS: readonly TrainingPhaseDefinition[] = [
  { id: 'full', label: 'Full', mixMode: 'full', visualMode: 'full', sound: () => '完整鼓组', task: (target) => `在完整节奏中找到 ${target}` },
  { id: 'solo', label: 'Solo', mixMode: 'solo', visualMode: 'target', sound: (target) => `只播放 ${target}`, task: (target) => `记住 ${target} 的拍点` },
  { id: 'focus', label: 'Focus', mixMode: 'focus', visualMode: 'focus', sound: (target) => `${target} 突出，其他鼓降低`, task: (target) => `在完整节奏中持续听清 ${target}` },
  { id: 'normal', label: 'Normal', mixMode: 'full', visualMode: 'partial', sound: () => '恢复正常混音', task: (target) => `不依赖音量突出，保持 ${target} 的拍点` },
  { id: 'muteTarget', label: 'Mute Target', mixMode: 'mute-target', visualMode: 'hidden-target', sound: (target) => `${target} 静音，其他鼓继续`, task: (target) => `在留白中保持 ${target} 的拍点` },
  { id: 'check', label: 'Check', mixMode: 'full', visualMode: 'check', sound: (target) => `恢复 ${target}`, task: (target) => `核对内部节拍与 ${target} 的位置` },
] as const

export const DEFAULT_PHASES: TrainingConfig['phases'] = [
  { id: 'full', instanceId: 'default-full', bars: 8 }, { id: 'solo', instanceId: 'default-solo', bars: 4 },
  { id: 'focus', instanceId: 'default-focus', bars: 4 }, { id: 'normal', instanceId: 'default-normal', bars: 4 },
  { id: 'muteTarget', instanceId: 'default-mute', bars: 4 }, { id: 'check', instanceId: 'default-check', bars: 4 },
]
export const DEFAULT_TRAINING_CONFIG: TrainingConfig = { version: 1, targetDrum: 'kick', phases: DEFAULT_PHASES, patternName: 'Foundation Backbeat', difficulty: 'simple', bpm: 88 }

export function resolveTrainingPhases(phases: TrainingConfig['phases']): TrainingPhase[] {
  return phases.map((phase) => {
    const definition = TRAINING_PHASE_DEFINITIONS.find((item) => item.id === phase.id)
    if (!definition) throw new Error(`未知训练阶段：${phase.id}`)
    return { ...definition, ...phase, bars: Math.max(1, Math.min(32, Math.round(phase.bars))) }
  })
}
export function trainingTotalBars(phases: readonly TrainingPhase[]) { return phases.reduce((total, phase) => total + phase.bars, 0) }

export type TrainingBarMark = { bar: number; isPhaseBoundary: boolean }
export function trainingBarMarks(phases: readonly TrainingPhase[]): TrainingBarMark[] {
  const totalBars = trainingTotalBars(phases)
  let elapsedBars = 0
  const boundaries = new Set(phases.slice(0, -1).map((phase) => (elapsedBars += phase.bars)))
  return Array.from({ length: Math.max(0, totalBars - 1) }, (_, index) => ({
    bar: index + 1,
    isPhaseBoundary: boundaries.has(index + 1),
  }))
}

export type TrainingFrame = { status: 'notStarted' | 'countIn' | 'activePhase' | 'phaseNotice' | 'completed'; phase: TrainingPhase; phaseIndex: number; barInPhase: number; completedBars: number; nextPhase?: TrainingPhase }
export function trainingFrameAtCycle(phases: readonly TrainingPhase[], started: boolean, isCountIn: boolean, cycle: number): TrainingFrame {
  if (!phases.length) throw new Error('训练至少需要一个阶段')
  const firstPhase = phases[0]
  if (!started) return { status: 'notStarted', phase: firstPhase, phaseIndex: 0, barInPhase: 0, completedBars: 0 }
  if (isCountIn) return { status: 'countIn', phase: firstPhase, phaseIndex: 0, barInPhase: 0, completedBars: 0 }
  const totalBars = trainingTotalBars(phases)
  if (cycle >= totalBars) { const phaseIndex = phases.length - 1; return { status: 'completed', phase: phases[phaseIndex], phaseIndex, barInPhase: phases[phaseIndex].bars, completedBars: totalBars } }
  let phaseStart = 0
  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
    const phase = phases[phaseIndex]
    if (cycle < phaseStart + phase.bars) { const barInPhase = cycle - phaseStart + 1; const nextPhase = phases[phaseIndex + 1]; return { status: nextPhase && barInPhase === phase.bars ? 'phaseNotice' : 'activePhase', phase, phaseIndex, barInPhase, completedBars: cycle, nextPhase } }
    phaseStart += phase.bars
  }
  throw new Error('训练阶段时间轴无法解析')
}
export function trainingMixForPhase(phase: TrainingPhase, target: DrumId) { return { mode: phase.mixMode, target } as const }
