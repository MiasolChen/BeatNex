import {CHALLENGES, type ChallengeSound} from '../core/challenge/challenge'
export const CHALLENGE_KEY = 'beatnex:challenge:v1'
export type ChallengeSettings = {display?: 'grid' | 'staff'; id: string; bpm: number; rounds: number; sound: ChallengeSound; reference: boolean; volume: number}
export type ChallengeRecord = {id: string; at: string; bpm: number; rounds: number; sound: ChallengeSound; reference: boolean; volume: number; feedback: string}
export type ChallengeData = {schemaVersion: 1; settings: ChallengeSettings; completions: number; last: ChallengeRecord | null}
export const DEFAULT_CHALLENGE: ChallengeData = {schemaVersion: 1, settings: {display: 'staff', id: CHALLENGES[0].id, bpm: 90, rounds: 1, sound: 'click', reference: true, volume: 40}, completions: 0, last: null}
function validSettings(value: unknown): value is ChallengeSettings {
  if (!value || typeof value !== 'object') return false
  const v = value as ChallengeSettings
  return (v.display === undefined || v.display === 'grid' || v.display === 'staff') && CHALLENGES.some(c => c.id === v.id) && Number.isInteger(v.bpm) && v.bpm >= 40 && v.bpm <= 180 && Number.isInteger(v.rounds) && v.rounds >= 1 && v.rounds <= 4 && ['click','clap','drum'].includes(v.sound) && typeof v.reference === 'boolean' && Number.isInteger(v.volume) && v.volume >= 0 && v.volume <= 100
}
export function validChallengeData(value: unknown): value is ChallengeData {
  if (!value || typeof value !== 'object') return false
  const v = value as ChallengeData
  return v.schemaVersion === 1 && validSettings(v.settings) && Number.isSafeInteger(v.completions) && v.completions >= 0 && (v.last === null || (validSettings(v.last) && typeof v.last.at === 'string' && Number.isFinite(Date.parse(v.last.at)) && ['', '太轻松', '刚刚好', '有点挑战'].includes(v.last.feedback)))
}
export function readChallenge(): {data: ChallengeData; error: string} {
  try {
    if (typeof localStorage === 'undefined') return {data: DEFAULT_CHALLENGE, error: ''}
    const raw = localStorage.getItem(CHALLENGE_KEY)
    if (!raw) return {data: DEFAULT_CHALLENGE, error: ''}
    const value: unknown = JSON.parse(raw)
    if (!validChallengeData(value)) throw new Error()
    return {data: value, error: ''}
  } catch { return {data: DEFAULT_CHALLENGE, error: '挑战存储不可读，原数据已保留；本次练习仅暂存。'} }
}
export function writeChallenge(data: ChallengeData) {
  try {
    if (!validChallengeData(data)) throw new Error()
    const raw = localStorage.getItem(CHALLENGE_KEY)
    if (raw && !validChallengeData(JSON.parse(raw))) throw new Error()
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify(data))
    return ''
  } catch { return '无法保存挑战设置与记录，本次练习仅暂存。' }
}
