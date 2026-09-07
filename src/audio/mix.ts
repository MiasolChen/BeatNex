import { DRUM_IDS, type DrumId } from '../core/pattern/types'
import type { TrackMix, TrainingMix } from './types'

/** Shared by Web Audio gain automation and the current-time playback display. */
export function resolveDrumGains(mixes: ReadonlyMap<DrumId, TrackMix>, training?: TrainingMix): Record<DrumId, number> {
  const values = [...mixes.values()]
  const solo = values.some(mix => mix.solo)
  const focus = values.some(mix => mix.focused && !mix.muted && (!solo || mix.solo))
  return Object.fromEntries(DRUM_IDS.map(drum => {
    const mix = mixes.get(drum)
    if (!mix) return [drum, 0]
    const target = training?.targets?.includes(drum) ?? drum === training?.target
    const audible = !mix.muted && (!solo || mix.solo)
      && (training?.mode !== 'solo' || target) && (training?.mode !== 'mute-target' || !target)
    const reduced = training
      ? (training.mode === 'focus' && !target) || (training.mode === 'weaken' && target)
      : focus && !mix.focused
    return [drum, audible ? mix.volume * (reduced ? 0.18 : 1) : 0]
  })) as Record<DrumId, number>
}
