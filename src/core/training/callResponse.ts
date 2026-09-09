import type { Pattern, DrumId } from '../pattern/types'
import { stepsPerBar, stepsPerPattern } from '../timing/musicTime'
import type { TrainingProgram } from '../../audio/types'

/** Repeat/truncate the source to one phrase so Call and Check share its origin. */
export function callPhrase(pattern: Pattern, bars: number): Pattern {
  const length = stepsPerBar(pattern) * bars
  const sourceLength = stepsPerPattern(pattern)
  return { ...pattern, bars, tracks: pattern.tracks.map(track => ({ ...track,
    hits: Array.from({ length: Math.ceil(length / sourceLength) }, (_, cycle) =>
      track.hits.map(hit => ({ ...hit, step: hit.step + cycle * sourceLength })))
      .flat().filter(hit => hit.step < length),
  })) }
}

export function callProgram(bars: number, targets: DrumId[]): TrainingProgram {
  return [
    { bars, mix: { mode: 'solo', targets } },
    { bars, mix: { mode: 'silence' } },
    { bars, mix: { mode: 'solo', targets } },
  ]
}

export function callStage(cycle: number, bars: number, countIn: boolean) {
  if (countIn) return { label: '预备拍', task: '跟随点击声，准备听示范' }
  if (cycle < bars) return { label: '示范', task: '听目标鼓件，记住每次落点' }
  if (cycle < bars * 2) return { label: '回应', task: '鼓声暂时静音，在心中保持刚才的节奏' }
  if (cycle < bars * 3) return { label: '检查', task: '同一段鼓声回来，核对心中的落点' }
  return { label: '本轮结束', task: '选择感受，再开始下一轮' }
}
