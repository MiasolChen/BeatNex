export type ChallengeSound = 'click' | 'clap' | 'drum'
export type RhythmToken = { length: number; hit: boolean }
const hit = (length: number): RhythmToken => ({length, hit: true})
const rest = (length: number): RhythmToken => ({length, hit: false})
export const CHALLENGES = [
  {id: 'short-phrase-1', name: '连打之后，稳住', hint: '试着拍两下、停一下，再跟着声音拍。', tokens: [hit(2),hit(2),rest(4),hit(4),hit(4),hit(2),hit(2),hit(4),rest(4),hit(2),hit(2)]},
  {id: 'short-phrase-2', name: '空拍出发', hint: '这段节奏从等待开始，别急着拍。', tokens: [rest(4),hit(2),hit(2),hit(2),hit(2),hit(4),hit(2),hit(2),hit(4),rest(4),hit(4)]},
  {id: 'short-phrase-3', name: '四连击，接住', hint: '中间会连续响四下，试着跟上。', tokens: [rest(4),hit(4),rest(4),hit(1),hit(1),hit(1),hit(1),hit(4),hit(4),rest(2),hit(2),hit(4)]},
  {id: 'short-phrase-4', name: '踩在反拍上', hint: '有的声音来得稍晚，听清楚再拍。', tokens: [rest(4),hit(4),rest(2),hit(2),hit(4),rest(2),hit(2),hit(4),rest(2),hit(2),hit(4)]},
] as const
export type Challenge = typeof CHALLENGES[number]
export function hitSteps(tokens: readonly RhythmToken[]): number[] {
  let step = 0
  return tokens.flatMap(token => { const at = step; step += token.length; return token.hit ? [at] : [] })
}
export const CHALLENGE_PHASES = ['听示范', '跟着打', '轮到你', '再听验证'] as const
export function challengePosition(step: number, rounds: number) {
  const total = 16 + rounds * 128
  const bounded = Math.max(0, Math.min(step, total))
  const body = Math.max(0, bounded - 16)
  return {
    complete: bounded >= total,
    countIn: bounded < 16,
    phase: Math.min(3, Math.floor(body % 128 / 32)),
    round: Math.min(rounds, Math.floor(body / 128) + 1),
    phraseStep: body % 32,
    step: bounded, total,
  }
}
export function challengeEvents(step: number, rounds: number, hits: readonly number[], reference: boolean) {
  const position = challengePosition(step, rounds)
  if (position.complete) return { target: false, reference: false }
  return {
    target: !position.countIn && position.phase !== 2 && hits.includes((step - 16) % 32),
    reference: step % 4 === 0 && (position.countIn || reference),
  }
}
