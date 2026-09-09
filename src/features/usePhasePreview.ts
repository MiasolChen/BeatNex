import { useEffect, useState } from 'react'
import { BOOM_BAP_PATTERNS } from '../core/pattern/fixtures'
import type { DrumId, Pattern } from '../core/pattern/types'
import { phaseProgram } from '../core/training/phaseProgram'
import type { RoutePhase } from '../storage/practice'
import { useDrumMachine } from './useDrumMachine'

export function usePhasePreview(active: boolean, pattern: Pattern, bpm: number,
  phases: RoutePhase[], targets: DrumId[], pauseOthers: () => void) {
  const audio = useDrumMachine(BOOM_BAP_PATTERNS[0], 88)
  const [key, setKey] = useState<string>()
  const stop = () => { audio.stop(); setKey(undefined) }
  useEffect(() => { audio.stop(); setKey(undefined) }, [active, pattern, bpm, phases, targets, audio.stop])
  const phase = phases.find(item => item.instanceId === key)
  useEffect(() => {
    if (phase && audio.snapshot.cycle >= phase.bars) { audio.stop(); setKey(undefined) }
  }, [phase, audio.snapshot.cycle, audio.stop])
  const toggle = (id: string) => {
    const item = phases.find(value => value.instanceId === id)
    if (!active || !item) return
    if (id === key && (audio.loading || audio.snapshot.status === 'playing')) { stop(); return }
    pauseOthers()
    audio.stop()
    setKey(id)
    void audio.play({ pattern, bpm, program: phaseProgram([item], targets) })
  }
  return { key, toggle, stop, loading: audio.loading, snapshot: audio.snapshot }
}
