import {useEffect, useRef, useState} from 'react'
import {CHALLENGES, challengePosition} from '../core/challenge/challenge'
import {ChallengeEngine} from '../audio/web/ChallengeEngine'
import {readChallenge, writeChallenge, type ChallengeSettings} from '../storage/challenge'
export function useRhythmChallenge(active: boolean, beforeStart: () => void) {
  const [initial] = useState(readChallenge)
  const [data, setData] = useState(initial.data)
  const dataRef = useRef(data); dataRef.current = data
  const [storageError, setStorageError] = useState(initial.error)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'ready'|'loading'|'playing'|'paused'|'complete'>('ready')
  const [position, setPosition] = useState(() => challengePosition(0, data.settings.rounds))
  const engine = useRef<ChallengeEngine | null>(null)
  const request = useRef(0), completed = useRef(false), activeRef = useRef(active)
  activeRef.current = active
  const before = useRef(beforeStart); before.current = beforeStart
  const challenge = CHALLENGES.find(c => c.id === data.settings.id) ?? CHALLENGES[0]
  useEffect(() => {
    const instance = new ChallengeEngine(undefined, () => { setPosition(instance.position); setStatus('paused'); setError('声音已中断，点击继续播放。') })
    engine.current = instance
    const background = () => { if (document.hidden) { request.current++; if (instance.running) { instance.pause(); setPosition(instance.position); setStatus('paused') } else setStatus(s => s === 'loading' ? 'paused' : s); instance.pause() } }
    document.addEventListener('visibilitychange', background)
    return () => { request.current++; instance.dispose(); engine.current = null; document.removeEventListener('visibilitychange', background) }
  }, [])
  const reset = () => { request.current++; engine.current?.reset(); completed.current = false; setStatus('ready'); setPosition(challengePosition(0, dataRef.current.settings.rounds)); setError('') }
  useEffect(() => { if (!active) reset() }, [active])
  useEffect(() => { if (!initial.error) setStorageError(writeChallenge(data)) }, [data, initial.error])
  useEffect(() => {
    if (status !== 'playing') return
    let frame = 0
    const tick = () => {
      const next = engine.current?.position
      if (!next) return
      setPosition(next)
      if (next.complete) {
        if (!completed.current) {
          completed.current = true
          setData(d => ({...d, completions: d.completions + 1, last: {...d.settings, at: new Date().toISOString(), feedback: ''}}))
        }
        setStatus('complete'); return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [status])
  const play = async (id?: string) => {
    before.current()
    let settings = dataRef.current.settings
    if (id) { reset(); settings = {...settings, id}; setData(d => ({...d, settings})); dataRef.current = {...dataRef.current, settings} }
    if (completed.current) { engine.current?.reset(); completed.current = false }
    const current = ++request.current
    setError(''); setStatus('loading')
    try {
      const result = await engine.current?.start({...settings, challenge: CHALLENGES.find(c => c.id === settings.id) ?? CHALLENGES[0]})
      if (current !== request.current) return
      if (!result || !activeRef.current || document.hidden) { engine.current?.pause(); setStatus('paused'); return }
      setStatus('playing')
    } catch (e) { if (current === request.current) { engine.current?.pause(); setStatus('paused'); setError(e instanceof Error ? e.message : '声音无法开启，请重试') } }
  }
  const pause = () => { request.current++; engine.current?.pause(); setPosition(engine.current?.position ?? position); setStatus('paused') }
  const update = (patch: Partial<ChallengeSettings>) => {
    if (status === 'playing' || status === 'loading') return
    if (patch.rounds !== undefined) reset()
    setData(d => ({...d, settings: {...d.settings, ...patch}}))
  }
  const setDisplay = (display: 'grid' | 'staff') => setData(d => ({...d, settings: {...d.settings, display}}))
  const feedback = (value: string) => setData(d => d.last ? {...d, last: {...d.last, feedback: value}} : d)
  return {data, challenge, status, position, storageError, error, play, pause, reset, update, feedback, setDisplay}
}
export type RhythmChallenge = ReturnType<typeof useRhythmChallenge>
