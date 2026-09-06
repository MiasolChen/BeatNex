import { useCallback, useEffect, useRef, useState } from 'react'
import { PROTOTYPE_KIT } from '../audio/kit'
import type { EngineSnapshot, TrackMix, TrainingMix, TrainingProgram } from '../audio/types'
import { WebAudioEngine } from '../audio/web/WebAudioEngine'
import { DRUM_IDS, type DrumId, type Pattern } from '../core/pattern/types'

const defaultMixes = () => Object.fromEntries(DRUM_IDS.map(drum => [drum, {
  muted: false, solo: false, focused: false, volume: 0.82,
}])) as Record<DrumId, TrackMix>

export function useDrumMachine(pattern: Pattern, bpm: number, program?: TrainingProgram, repeat = false) {
  const [engine] = useState(() => new WebAudioEngine())
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => engine.getSnapshot())
  const [mixes, setMixes] = useState(defaultMixes)
  const mixesRef = useRef(mixes)
  const [loading, setLoading] = useState(false)
  const generation = useRef(0)
  const mounted = useRef(false)
  const request = useRef({ pattern, bpm })

  useEffect(() => {
    mounted.current = true
    let frame = 0
    let last = -100
    const refresh = () => { if (mounted.current) setSnapshot(engine.getSnapshot()) }
    const unsubscribe = engine.subscribe(refresh)
    const animate = (now: number) => {
      if (now - last >= 32 && engine.getSnapshot().status === 'playing') {
        refresh()
        last = now
      }
      frame = requestAnimationFrame(animate)
    }
    refresh()
    frame = requestAnimationFrame(animate)
    const hidden = () => {
      if (!document.hidden) return
      generation.current += 1
      setLoading(false)
      engine.pause()
      refresh()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      mounted.current = false
      generation.current += 1
      unsubscribe()
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', hidden)
      engine.dispose()
    }
  }, [engine])

  useEffect(() => {
    request.current = { pattern, bpm }
    engine.update(request.current)
  }, [engine, pattern, bpm])
  useEffect(() => { engine.setProgram(program, repeat) }, [engine, program, repeat])

  const play = useCallback(async () => {
    const token = ++generation.current
    // Invalidate an older resume before awaiting shared preparation; otherwise
    // it could resolve in this microtask gap and start the superseded request.
    if (engine.getSnapshot().status !== 'playing') engine.pause()
    setLoading(true)
    try {
      // Every request shares preparation work while the newest request wins.
      await engine.prepare(PROTOTYPE_KIT)
      if (token !== generation.current || !mounted.current || document.hidden) return
      await engine.start({ ...request.current, countIn: false })
      // The engine also invalidates resume on stop/pause. An older completion
      // must never pause a newer successfully started request.
    } catch {
      if (token === generation.current && mounted.current) setSnapshot(engine.getSnapshot())
    } finally {
      if (token === generation.current && mounted.current) setLoading(false)
    }
  }, [engine])

  const pause = useCallback(() => {
    generation.current += 1
    setLoading(false)
    engine.pause()
    setSnapshot(engine.getSnapshot())
  }, [engine])
  const stop = useCallback(() => {
    generation.current += 1
    setLoading(false)
    engine.stop()
    setSnapshot(engine.getSnapshot())
  }, [engine])

  const updateMix = useCallback((drum: DrumId, patch: Partial<TrackMix>) => {
    const current = mixesRef.current
    const next = { ...current, [drum]: { ...current[drum], ...patch } }
    mixesRef.current = next
    engine.setTrackMix(drum, next[drum])
    // Publish pure state; StrictMode render replay cannot replay audio changes.
    setMixes(next)
  }, [engine])
  const resetMixes = useCallback(() => {
    const next = defaultMixes()
    mixesRef.current = next
    for (const drum of DRUM_IDS) engine.setTrackMix(drum, next[drum])
    setMixes(next)
  }, [engine])
  const setTrainingMix = useCallback((mix?: TrainingMix, timing?: 'immediate' | 'next-bar') => {
    engine.setTrainingMix(mix, timing)
  }, [engine])

  return { snapshot, mixes, loading, play, pause, stop, retry: play, updateMix, resetMixes, setTrainingMix }
}
