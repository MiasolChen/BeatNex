import { useEffect, useRef, useState } from 'react'
import { MetronomeEngine } from '../../audio/web/MetronomeEngine'
import { TempoWheel } from '../components/TempoWheel'

export interface MetronomePageProps { active: boolean; notice: (message: string) => void }

export function MetronomePage({ active, notice }: MetronomePageProps) {
  const [bpm, setBpm] = useState(90)
  const [playing, setPlaying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [status, setStatus] = useState('准备就绪')
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<MetronomeEngine | null>(null)
  const activeRef = useRef(active)
  const startingRef = useRef(false)
  const requestRef = useRef(0)
  const noticeRef = useRef(notice)
  activeRef.current = active
  noticeRef.current = notice

  const resetSeesaw = () => {
    const stage = stageRef.current
    const beam = stage?.querySelector<HTMLElement>('.bn-see-beam')
    if (beam) beam.style.transform = 'rotate(0deg)'
    stage?.querySelectorAll<HTMLElement>('.bn-see-seat,.bn-see-ball').forEach(element => { element.style.transform = '' })
    stage?.querySelectorAll('.bn-see-dots i').forEach(element => element.classList.remove('active'))
  }

  const stop = (message = '准备就绪') => {
    requestRef.current += 1
    startingRef.current = false
    engineRef.current?.stop()
    setPlaying(false)
    setStarting(false)
    setStatus(message)
    resetSeesaw()
  }

  useEffect(() => {
    engineRef.current = new MetronomeEngine(undefined, () => {
      stop('声音已中断，点击继续')
      noticeRef.current('节拍器声音已中断，点击播放可重新开启')
    })
    const visibility = () => {
      if (document.hidden) stop(engineRef.current?.isRunning ? '已暂停，点击继续' : '准备就绪')
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      requestRef.current += 1
      document.removeEventListener('visibilitychange', visibility)
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => { if (!active) stop() }, [active])
  useEffect(() => { engineRef.current?.setTempo(bpm) }, [bpm])

  useEffect(() => {
    if (!playing) return
    const stage = stageRef.current
    const beam = stage?.querySelector<HTMLElement>('.bn-see-beam')
    const seats = Array.from(stage?.querySelectorAll<HTMLElement>('.bn-see-seat') ?? [])
    const dots = Array.from(stage?.querySelectorAll<HTMLElement>('.bn-see-dots i') ?? [])
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let lastIndex = -1
    const tick = () => {
      const engine = engineRef.current
      if (!engine?.isRunning) return
      const beat = engine.getVisualBeat()
      if (beat && beam) {
        if (lastIndex !== beat.index) {
          lastIndex = beat.index
          dots.forEach((dot, index) => dot.classList.toggle('active', index === beat.index % 2))
        }
        if (reduceMotion.matches) {
          beam.style.transform = 'rotate(0deg)'
          seats.forEach(seat => {
            seat.style.transform = ''
            ;(seat.firstElementChild as HTMLElement).style.transform = ''
          })
        } else {
          // Preserve the approved seesaw's launch, counter-rotation, and landing.
          const t = Math.max(0, Math.min(1, (engine.currentTime - beat.at) / beat.period))
          const side = beat.index % 2
          const sign = side === 0 ? 1 : -1
          const swing = Math.min(1, t / 0.34)
          const ease = 1 - Math.pow(1 - swing, 3)
          const angle = sign * (-26 + 52 * ease)
          beam.style.transform = `rotate(${angle}deg)`
          seats.forEach((seat, index) => {
            seat.style.transform = `rotate(${-angle}deg)`
            const flying = index === side
            const flight = Math.max(0, (t - 0.12) / 0.88)
            const jump = flying ? Math.sin(Math.PI * flight) * 96 : 0
            const landing = !flying && t < 0.18 ? Math.sin(Math.PI * t / 0.18) : 0
            const anticipation = flying && t < 0.12 ? Math.sin(Math.PI * t / 0.12) : 0
            const squash = landing * 0.55 + anticipation * 0.35
            const stretch = flying ? Math.sin(Math.PI * flight) * 0.12 : 0
            ;(seat.firstElementChild as HTMLElement).style.transform = `translateY(${-jump}px) scale(${1 + squash * 0.2 - stretch},${1 - squash * 0.18 + stretch})`
          })
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); resetSeesaw() }
  }, [playing])

  const toggle = async () => {
    if (playing || startingRef.current) { stop(); return }
    const request = ++requestRef.current
    startingRef.current = true
    setStarting(true)
    setStatus('正在开启声音…')
    try {
      const started = await engineRef.current?.start(bpm)
      if (request !== requestRef.current) return
      if (!started || !activeRef.current || document.hidden) { stop(); return }
      setPlaying(true)
      setStatus('跟随节拍')
    } catch {
      if (request !== requestRef.current) return
      setStatus('声音未能开启，请再次点击播放')
      noticeRef.current('声音未能开启，请再次点击播放')
    } finally {
      if (request === requestRef.current) { startingRef.current = false; setStarting(false) }
    }
  }

  return <section className="bn-page" data-view="metronome" hidden={!active}>
    <div className="bn-heading"><div><h1>节拍器</h1></div></div>
    <article className="bn-metronome">
      <div className="bn-metro-stage" aria-hidden="true" ref={stageRef}>
        <div className="bn-see-floor" />
        <div className="bn-see-pivot" />
        <div className="bn-see-beam"><div className="bn-see-seat bn-see-left"><div className="bn-see-ball" /></div><div className="bn-see-seat bn-see-right"><div className="bn-see-ball" /></div></div>
        <div className="bn-see-dots"><i /><i /></div>
      </div>
      <div className="bn-metro-status" id="bn-metro-status" role="status">{status}</div>
      <TempoWheel value={bpm} min={30} max={300} onChange={setBpm} label="节拍器速度" />
      <button type="button" className="bn-primary" id="bn-metro-play" aria-pressed={playing} aria-busy={starting} onClick={() => void toggle()}>{playing ? 'Ⅱ 暂停节拍' : starting ? '取消开启' : '▶ 开始节拍'}</button>
    </article>
  </section>
}
