/** Shared click voice for the metronome and rhythm challenges. */
export function scheduleClick(context: AudioContext, at: number, volume = 0.16) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(1000, at)
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(volume, at + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.045)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(at)
  oscillator.stop(at + 0.05)
  return {oscillator, gain}
}
