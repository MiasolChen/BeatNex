import type { Pattern } from '../pattern/types'

export function secondsPerStep(bpm: number, subdivision: number) {
  return 60 / bpm / subdivision
}

export function stepsPerPattern(pattern: Pattern) {
  return pattern.bars * stepsPerBar(pattern)
}

export function beatsPerBarInQuarters(pattern: Pattern) {
  return pattern.beatsPerBar * 4 / (pattern.beatUnit ?? 4)
}

export function stepsPerBar(pattern: Pattern) {
  return beatsPerBarInQuarters(pattern) * pattern.subdivision
}

export function patternDuration(pattern: Pattern, bpm: number) {
  return stepsPerPattern(pattern) * secondsPerStep(bpm, pattern.subdivision)
}

export function absoluteStepTime(
  startTime: number,
  absoluteStep: number,
  bpm: number,
  subdivision: number,
) {
  return startTime + absoluteStep * secondsPerStep(bpm, subdivision)
}

export function positionAtTime(pattern: Pattern, bpm: number, startedAt: number, now: number) {
  const elapsed = Math.max(0, now - startedAt)
  const patternSteps = stepsPerPattern(pattern)
  const rawAbsoluteStep = elapsed / secondsPerStep(bpm, pattern.subdivision)
  const nearestStep = Math.round(rawAbsoluteStep)
  const absoluteStep = Math.abs(rawAbsoluteStep - nearestStep) < 1e-9
    ? nearestStep
    : rawAbsoluteStep
  const completedSteps = Math.floor(absoluteStep)
  const stepInPattern = absoluteStep % patternSteps
  return {
    elapsed,
    cycle: Math.floor(completedSteps / patternSteps),
    step: completedSteps % patternSteps,
    progress: stepInPattern / patternSteps,
  }
}
