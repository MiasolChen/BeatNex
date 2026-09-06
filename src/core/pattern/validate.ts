import { DRUM_IDS, METERS, type Meter, type Pattern } from './types'

export function validatePattern(value: unknown): asserts value is Pattern {
  if (!value || typeof value !== 'object') throw new Error('Pattern 必须是对象')
  const pattern = value as Partial<Pattern>
  if (pattern.schemaVersion !== 1) throw new Error('不支持的 Pattern schema 版本')
  if (typeof pattern.id !== 'string' || !pattern.id.trim() || typeof pattern.name !== 'string' || !pattern.name.trim()) throw new Error('Pattern 缺少 id 或 name')
  if (pattern.style !== 'boom-bap') throw new Error('Pattern 风格无效')
  if (!['simple', 'hard'].includes(pattern.difficulty ?? '')) throw new Error('Pattern 难度无效')
  if (![1, 2, 4, 8].includes(pattern.bars ?? 0)) throw new Error('Pattern 小节数无效')
  if (!Number.isInteger(pattern.beatsPerBar)
    || (pattern.beatUnit !== undefined && pattern.beatUnit !== 4 && pattern.beatUnit !== 8)
    || !METERS.includes(`${pattern.beatsPerBar}/${pattern.beatUnit ?? 4}` as Meter)
    || ![2, 3, 4].includes(pattern.subdivision ?? 0)) {
    throw new Error('Pattern 拍号或细分无效')
  }
  if (!Number.isFinite(pattern.recommendedBpm) || (pattern.recommendedBpm ?? 0) <= 0) {
    throw new Error('Pattern BPM 无效')
  }
  if (!Array.isArray(pattern.tracks)) throw new Error('Pattern 缺少轨道')

  const barSteps = pattern.beatsPerBar! * 4 / (pattern.beatUnit ?? 4) * pattern.subdivision!
  if (!Number.isInteger(barSteps)) throw new Error('Pattern 细分必须完整覆盖每个小节')
  const maxStep = pattern.bars! * barSteps
  const drums = new Set<string>()
  for (const track of pattern.tracks) {
    if (!track || typeof track !== 'object' || !Array.isArray(track.hits)) throw new Error('Pattern 轨道无效')
    if (!DRUM_IDS.includes(track.drum)) throw new Error(`未知鼓件：${track.drum}`)
    if (drums.has(track.drum)) throw new Error(`重复轨道：${track.drum}`)
    drums.add(track.drum)
    let previousStep = -1
    for (const hit of track.hits) {
      if (!hit || typeof hit !== 'object') throw new Error('Pattern 鼓点无效')
      if (!Number.isInteger(hit.step) || hit.step < 0 || hit.step >= maxStep) {
        throw new Error(`${track.drum} 的 step ${hit.step} 超出范围`)
      }
      if (hit.step <= previousStep) throw new Error(`${track.drum} 的 hit 未升序或重复`)
      if (!Number.isInteger(hit.velocity) || hit.velocity < 0 || hit.velocity > 100) {
        throw new Error(`${track.drum} 的力度 ${hit.velocity} 无效`)
      }
      previousStep = hit.step
    }
  }
  if (drums.size !== DRUM_IDS.length) throw new Error('Pattern 必须包含四条鼓件轨道')
}
