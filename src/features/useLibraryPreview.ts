import { useEffect, useState } from 'react'
import { BOOM_BAP_PATTERNS } from '../core/pattern/fixtures'
import { DRUM_IDS, type DrumId, type Pattern } from '../core/pattern/types'
import { useDrumMachine } from './useDrumMachine'

export type PreviewItem = { key: string; pattern: Pattern; bpm: number; muted: DrumId[] }

export function useLibraryPreview(active: boolean, pauseOthers: () => void) {
  // Stable defaults: preview requests are transient, never practice settings.
  const audio = useDrumMachine(BOOM_BAP_PATTERNS[0], 88)
  const [key, setKey] = useState<string>()
  const stop = () => { audio.stop(); setKey(undefined) }
  useEffect(() => { if (!active) { audio.stop(); setKey(undefined) } }, [active, audio.stop])
  const toggle = (item: PreviewItem) => {
    if (item.key === key && (audio.loading || audio.snapshot.status === 'playing')) { audio.pause(); return }
    pauseOthers()
    if (item.key !== key) audio.stop()
    setKey(item.key)
    DRUM_IDS.forEach(drum => audio.updateMix(drum, { muted: item.muted.includes(drum) }))
    void audio.play({ pattern: item.pattern, bpm: item.bpm })
  }
  return { key, toggle, stop, loading: audio.loading, snapshot: audio.snapshot }
}
