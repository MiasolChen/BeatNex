export type ChallengeSound = 'click' | 'clap' | 'drum'
export type RhythmToken = { length: number; hit: boolean }
const hit = (length: number): RhythmToken => ({length, hit: true})
const rest = (length: number): RhythmToken => ({length, hit: false})
export const CHALLENGES = [
  {id: 'short-phrase-1', name: '连打之后，稳住', hint: '连续八分音符与四分音符交替。', tokens: [hit(2),hit(2),rest(4),hit(4),hit(4),hit(2),hit(2),hit(4),rest(4),hit(2),hit(2)]},
  {id: 'short-phrase-2', name: '空拍出发', hint: '以休止符开头的两小节节奏。', tokens: [rest(4),hit(2),hit(2),hit(2),hit(2),hit(4),hit(2),hit(2),hit(4),rest(4),hit(4)]},
  {id: 'short-phrase-3', name: '四连击，接住', hint: '包含连续四个十六分音符。', tokens: [rest(4),hit(4),rest(4),hit(1),hit(1),hit(1),hit(1),hit(4),hit(4),rest(2),hit(2),hit(4)]},
  {id: 'short-phrase-4', name: '踩在反拍上', hint: '八分休止与反拍击打交替。', tokens: [rest(4),hit(4),rest(2),hit(2),hit(4),rest(2),hit(2),hit(4),rest(2),hit(2),hit(4)]},
] as const
export type Challenge = typeof CHALLENGES[number]
export function hitSteps(tokens: readonly RhythmToken[]): number[] {
  let step = 0
  return tokens.flatMap(token => { const at = step; step += token.length; return token.hit ? [at] : [] })
}
export function challengePosition(step: number, rounds: number) {
  const total = rounds * 32
  const bounded = Math.max(0, Math.min(step, total))
  return {
    complete: bounded >= total,
    round: Math.min(rounds, Math.floor(bounded / 32) + 1),
    phraseStep: bounded % 32,
    step: bounded, total,
  }
}
export function challengeEvents(step: number, rounds: number, hits: readonly number[], _legacyReference: boolean) {
  return {target: step >= 0 && step < rounds * 32 && hits.includes(step % 32), reference: false}
}
