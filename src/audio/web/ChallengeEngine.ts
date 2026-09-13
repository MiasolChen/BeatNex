import {scheduleClick} from './clickSound'
import {challengeEvents, challengePosition, hitSteps, type Challenge, type ChallengeSound} from '../../core/challenge/challenge'
export type ChallengeOptions = {challenge: Challenge; bpm: number; rounds: number; sound: ChallengeSound; reference: boolean; volume: number}
type Voice = {source: AudioScheduledSourceNode; gain: GainNode}
export class ChallengeEngine {
  private context: AudioContext | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private voices = new Set<Voice>()
  private generation = 0
  private origin = 0
  private offset = 0
  private nextStep = 0
  private options: ChallengeOptions | null = null
  private hits: number[] = []
  running = false
  constructor(private readonly factory = () => new AudioContext(), private readonly interrupted?: () => void) {}
  get position() {
    const step = this.running && this.context && this.options ? (this.context.currentTime - this.origin) / (15 / this.options.bpm) : this.offset
    return challengePosition(step, this.options?.rounds ?? 1)
  }
  async start(options: ChallengeOptions) {
    if (!Number.isFinite(options.bpm) || options.bpm < 40 || options.bpm > 180 || !Number.isInteger(options.rounds) || options.rounds < 1 || options.rounds > 4 || !Number.isFinite(options.volume) || options.volume < 0 || options.volume > 100) throw new Error('挑战设置无效')
    this.halt()
    const generation = this.generation
    const context = this.context ??= this.factory()
    this.options = options
    this.hits = hitSteps(options.challenge.tokens)
    context.onstatechange = () => { if (this.running && context.state !== 'running') { this.pause(); this.interrupted?.() } }
    await context.resume()
    if (generation !== this.generation) return false
    if (context.state !== 'running') throw new Error('声音未能开启，请点击重试')
    if (this.offset >= 16 + options.rounds * 128) this.offset = 0
    this.origin = context.currentTime + 0.03 - this.offset * 15 / options.bpm
    this.nextStep = Math.ceil(this.offset - 1e-7)
    this.running = true
    this.schedule()
    return true
  }
  pause() { this.offset = this.position.step; this.halt() }
  reset() { this.halt(); this.offset = 0 }
  dispose() { this.reset(); if (this.context) { this.context.onstatechange = null; void this.context.close().catch(() => {}); this.context = null } }
  private halt() {
    this.generation++
    this.running = false
    clearTimeout(this.timer)
    for (const voice of this.voices) { voice.source.onended = null; try { voice.source.stop() } catch { /* Already ended. */ } voice.source.disconnect(); voice.gain.disconnect() }
    this.voices.clear()
  }
  private sound(at: number, sound: ChallengeSound, volume: number) {
    if (volume <= 0) return
    const context = this.context!
    if (sound === 'click') {
      const {oscillator, gain} = scheduleClick(context, at, volume)
      const voice = {source: oscillator, gain}
      this.voices.add(voice)
      oscillator.onended = () => { this.voices.delete(voice); oscillator.disconnect(); gain.disconnect() }
      return
    }
    const gain = context.createGain()
    let source: OscillatorNode | AudioBufferSourceNode
    const duration = sound === 'drum' ? 0.14 : 0.085
    if (sound === 'clap') {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
      const data = buffer.getChannelData(0)
      // Procedural handclap: short noise bursts, no external sample dependency.
      for (let i = 0; i < data.length; i++) { const t = i / context.sampleRate; data[i] = (Math.random() * 2 - 1) * (t < .025 ? (Math.floor(t / .006) % 2 ? .2 : 1) : .45) }
      source = context.createBufferSource(); source.buffer = buffer
    } else {
      source = context.createOscillator(); source.type = 'sine'
      source.frequency.setValueAtTime(180, at)
      if (sound === 'drum') source.frequency.exponentialRampToValueAtTime(55, at + duration)
    }
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(volume, at + .002)
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration)
    source.connect(gain); gain.connect(context.destination)
    const voice = {source, gain}; this.voices.add(voice)
    source.onended = () => { this.voices.delete(voice); source.disconnect(); gain.disconnect() }
    source.start(at); source.stop(at + duration + .005)
  }
  private schedule = () => {
    if (!this.running || !this.context || !this.options) return
    const {bpm, rounds, sound, reference, volume} = this.options
    const duration = 15 / bpm
    const total = 16 + rounds * 128
    if (this.position.complete) { this.offset = total; this.halt(); return }
    // Keep the absolute musical position after stalls, never replay missed hits.
    this.nextStep = Math.max(this.nextStep, Math.ceil((this.context.currentTime - this.origin) / duration - 1e-7))
    while (this.nextStep < total && this.origin + this.nextStep * duration < this.context.currentTime + .12) {
      const at = this.origin + this.nextStep * duration
      const events = challengeEvents(this.nextStep, rounds, this.hits, reference)
      if (events.reference) this.sound(at, 'click', this.nextStep < 16 ? .16 : .08 * volume / 100)
      if (events.target) this.sound(at, sound, sound === 'drum' ? .45 : sound === 'click' ? .16 : .23)
      this.nextStep++
    }
    this.timer = setTimeout(this.schedule, 25)
  }
}
