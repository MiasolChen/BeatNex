import { BOOM_BAP_PATTERNS, PATTERN_NAMES } from '../pattern/fixtures'
import type { Pattern } from '../pattern/types'

export type CatalogView = 'dance' | 'music'

export type PracticeEntry = {
  id: string
  name: string
  favoriteKey: string
  patterns: readonly Pattern[]
}

export type PracticeCategory = {
  id: string
  view: CatalogView
  name: string
  description: string
  guidance: string
  practiceIds: readonly string[]
}

const practiceId = (name: string) => name.toLowerCase().replaceAll(' ', '-')

export const PRACTICE_ENTRIES = PATTERN_NAMES.map((name): PracticeEntry => {
  const patterns = BOOM_BAP_PATTERNS.filter((pattern) => pattern.name === name)
  const id = practiceId(name)
  return { id, name, favoriteKey: `official:${id}`, patterns }
})

export const PRACTICE_CATEGORIES: readonly PracticeCategory[] = [
  {
    id: 'hip-hop',
    view: 'dance',
    name: 'Hip-Hop',
    description: '从 Bounce 与 Pocket 入手，听清 Kick、后拍和切分。',
    guidance: '先听 Kick 的落点，再辨认 Snare 与 Hat 如何组成 Bounce。',
    practiceIds: PRACTICE_ENTRIES.map(({ id }) => id),
  },
  {
    id: 'boom-bap',
    view: 'music',
    name: 'Boom Bap',
    description: '听清 Backbeat、Swing Hat、切分 Kick 与留白。',
    guidance: '先听完整 Groove，再分层辨认 Kick、Snare 和 Hat。',
    practiceIds: PRACTICE_ENTRIES.map(({ id }) => id),
  },
]

export function categoriesForView(view: CatalogView) {
  return PRACTICE_CATEGORIES.filter((category) => category.view === view)
}

export function practicesForCategory(categoryId: string) {
  const category = PRACTICE_CATEGORIES.find(({ id }) => id === categoryId)
  if (!category) return []
  return category.practiceIds.flatMap((id) => {
    const practice = PRACTICE_ENTRIES.find((entry) => entry.id === id)
    return practice ? [practice] : []
  })
}

export function bpmRangeForCategory(categoryId: string) {
  const bpms = practicesForCategory(categoryId).flatMap(({ patterns }) => patterns.map(({ recommendedBpm }) => recommendedBpm))
  return bpms.length ? [Math.min(...bpms), Math.max(...bpms)] as const : null
}
