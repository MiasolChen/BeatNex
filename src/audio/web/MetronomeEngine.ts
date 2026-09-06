export interface MetronomeBeat {
  at: number
  period: number
  index: number
}

type Voice = { oscillator: OscillatorNode; gain: GainNode; at: number }

function createContext(): AudioContext {
  const host = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }
  const Context = host.AudioContext ?? host.webkitAudioContext
  if (!Context) throw new Error('此浏览器不支持 Web Audio')
  return new Context()
}

/** Audio-clock scheduling; animation only reads the beat that has actually sounded. */
export class MetronomeEngine {
  private context: AudioContext | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private voices = new Set<Voice>()
  private queue: MetronomeBeat[] = []
  private visual: MetronomeBeat | null = null
  private generation = 0
  private running = false
  private nextAt = 0
  private nextIndex = 0
  private bpm = 90

  constructor(
    private readonly contextFactory: () => AudioContext = createContext,
    private readonly onInterrupted?: () => void,
  ) {}

  get currentTime() { return this.context?.currentTime ?? 0 }
  get isRunning() { return this.running }

  async start(bpm: number): Promise<boolean> {
    this.stop()
    const generation = this.generation
    this.bpm = this.clamp(bpm)
    const context = this.context ??= this.contextFactory()
    context.onstatechange = () => {
      if (this.running && context.state !== 'running') {
        this.stop()
        this.onInterrupted?.()
      }
    }
    await context.resume()
    // A second click, navigation, unmount, or backgrounding can cancel resume().
    if (generation !== this.generation) return false
    if (context.state !== 'running') throw new Error('声音未能开启，请再次点击播放')
    this.running = true
    this.nextAt = context.currentTime + 0.03
    this.nextIndex = 0
    this.schedule()
    return true
  }

  setTempo(bpm: number) {
    const nextBpm = this.clamp(bpm)
    if (nextBpm === this.bpm) return
    const beat = this.getVisualBeat()
    this.bpm = nextBpm
    if (!this.running) return
    const now = this.currentTime
    clearTimeout(this.timer)
    // Retract only future clicks; preserve the currently sounding click and phase.
    for (const voice of [...this.voices]) {
      if (voice.at > now) this.release(voice)
    }
    this.queue = []
    const period = 60 / this.bpm
    if (beat) {
      const phase = Math.max(0, Math.min(1, (now - beat.at) / beat.period))
      this.visual = { ...beat, at: now - phase * period, period }
      this.nextAt = Math.max(now + 0.005, this.visual.at + period)
      this.nextIndex = beat.index + 1
    } else {
      this.nextAt = now + 0.03
      this.nextIndex = 0
    }
    this.schedule()
  }

  getVisualBeat(): MetronomeBeat | null {
    while (this.queue.length && this.queue[0].at <= this.currentTime) {
      this.visual = this.queue.shift()!
    }
    return this.visual
  }

  stop() {
    this.generation += 1
    this.running = false
    clearTimeout(this.timer)
    this.timer = undefined
    this.queue = []
    this.visual = null
    for (const voice of [...this.voices]) this.release(voice)
  }

  dispose() {
    this.stop()
    const context = this.context
    this.context = null
    if (context) {
      context.onstatechange = null
      void context.close().catch(() => {})
    }
  }

  private clamp(bpm: number) {
    return Math.max(30, Math.min(300, Math.round(Number.isFinite(bpm) ? bpm : 90)))
  }

  private release(voice: Voice) {
    voice.oscillator.onended = null
    try { voice.oscillator.stop() } catch { /* Already ended. */ }
    voice.oscillator.disconnect()
    voice.gain.disconnect()
    this.voices.delete(voice)
  }

  private schedule = () => {
    if (!this.running || !this.context) return
    const context = this.context
    // Drop missed ticks after a stalled main thread; never emit a catch-up burst.
    if (this.nextAt < context.currentTime) this.nextAt = context.currentTime + 0.005
    while (this.nextAt < context.currentTime + 0.12) {
      const at = this.nextAt
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const voice = { oscillator, gain, at }
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(1000, at)
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.16, at + 0.002)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.045)
      oscillator.connect(gain)
      gain.connect(context.destination)
      this.voices.add(voice)
      oscillator.onended = () => {
        this.voices.delete(voice)
        oscillator.disconnect()
        gain.disconnect()
      }
      oscillator.start(at)
      oscillator.stop(at + 0.05)
      this.queue.push({ at, period: 60 / this.bpm, index: this.nextIndex++ })
      this.nextAt = at + 60 / this.bpm
    }
    this.timer = setTimeout(this.schedule, 25)
  }
}
