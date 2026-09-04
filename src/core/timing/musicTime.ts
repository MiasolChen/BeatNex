import type { Pattern } from '../pattern/types'

export function secondsPerStep(bpm: number, subdivision: number) {
  return 60 / bpm / subdivision
}

export function stepsPerPattern(pattern: Pattern) {
  return pattern.bars * pattern.beatsPerBar * pattern.subdivision
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
  const duration = patternDuration(pattern, bpm)
  const elapsed = Math.max(0, now - startedAt)
  const cycleTime = elapsed % duration
  const exactStep = cycleTime / secondsPerStep(bpm, pattern.subdivision)
  return {
    elapsed,
    cycle: Math.floor(elapsed / duration),
    step: Math.floor(exactStep) % stepsPerPattern(pattern),
    progress: cycleTime / duration,
  }
}
