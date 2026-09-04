import { useCallback, useEffect, useRef, useState } from 'react'

import { PROTOTYPE_KIT } from '../audio/kit'
import type { EngineSnapshot, TrackMix } from '../audio/types'
import { WebAudioEngine } from '../audio/web/WebAudioEngine'
import { DRUM_IDS, type DrumId, type Pattern } from '../core/pattern/types'

const initialSnapshot: EngineSnapshot = { status: 'idle', step: 0, cycle: 0, progress: 0, isCountIn: false }
const initialMixes = Object.fromEntries(
  DRUM_IDS.map((drum) => [drum, { muted: false, solo: false, focused: false, volume: 0.82 }]),
) as Record<DrumId, TrackMix>

export function useDrumMachine(pattern: Pattern, bpm: number) {
  const engineRef = useRef<WebAudioEngine>()
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [mixes, setMixes] = useState(initialMixes)
  const [pendingChange, setPendingChange] = useState(false)
  if (!engineRef.current) engineRef.current = new WebAudioEngine()
  const engine = engineRef.current

  useEffect(() => {
    const unsubscribe = engine.subscribe(() => setSnapshot(engine.getSnapshot()))
    let frame = 0
    const updatePosition = () => {
      setSnapshot(engine.getSnapshot())
      frame = requestAnimationFrame(updatePosition)
    }
    frame = requestAnimationFrame(updatePosition)
    return () => { unsubscribe(); cancelAnimationFrame(frame); engine.dispose() }
  }, [engine])

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.visibilityState === 'hidden') engine.pause()
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden)
  }, [engine])

  useEffect(() => {
    if (snapshot.status === 'playing') {
      engine.update({ pattern, bpm })
      setPendingChange(true)
      const timeout = window.setTimeout(() => setPendingChange(false), 60 / bpm * pattern.beatsPerBar * 1000)
      return () => window.clearTimeout(timeout)
    }
    engine.update({ pattern, bpm })
    setPendingChange(false)
  }, [bpm, engine, pattern])

  const play = useCallback(async () => {
    try {
      await engine.prepare(PROTOTYPE_KIT)
      await engine.start({ pattern, bpm, countIn: snapshot.status !== 'paused' })
    } catch { setSnapshot(engine.getSnapshot()) }
  }, [bpm, engine, pattern, snapshot.status])

  const retry = useCallback(async () => {
    try {
      await engine.prepare(PROTOTYPE_KIT)
      await engine.start({ pattern, bpm, countIn: true })
    } catch { setSnapshot(engine.getSnapshot()) }
  }, [bpm, engine, pattern])

  const updateMix = useCallback((drum: DrumId, patch: Partial<TrackMix>) => {
    setMixes((current) => {
      const next = { ...current, [drum]: { ...current[drum], ...patch } }
      engine.setTrackMix(drum, next[drum])
      return next
    })
  }, [engine])

  return { snapshot, mixes, pendingChange, play, retry, pause: () => engine.pause(), stop: () => engine.stop(), updateMix }
}
