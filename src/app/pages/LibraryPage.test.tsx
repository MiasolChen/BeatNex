import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BOOM_BAP_PATTERNS } from '../../core/pattern/fixtures'
import { resizePatternBars } from '../../core/pattern/editor'
import type { BeatNex } from '../../features/useBeatNex'
import type { Combination } from '../../storage/combinations'
import { LibraryPage } from './LibraryPage'

const preview = (overrides: Partial<BeatNex['preview']> = {}): BeatNex['preview'] => ({
  key: undefined,
  loading: false,
  snapshot: { status: 'idle' } as BeatNex['preview']['snapshot'],
  toggle() {},
  stop() {},
  ...overrides,
})

const appFor = (overrides: Partial<BeatNex> = {}) => ({
  page: 'library', combinations: [], favorites: [], preview: preview(),
  switchPage() {}, choosePattern() {}, load() {}, toggleFavorite() {},
  ...overrides,
} as unknown as BeatNex)

describe('LibraryPage preview controls SSR', () => {
  it('labels curated preview, pause, loading cancel, and retry with the pattern name', () => {
    const name = BOOM_BAP_PATTERNS[0].name
    expect(renderToStaticMarkup(<LibraryPage app={appFor()} />)).toContain(`试听 ${name}`)
    const key = `curated:${BOOM_BAP_PATTERNS[0].id}`
    expect(renderToStaticMarkup(<LibraryPage app={appFor({ preview: preview({ key, snapshot: { status: 'playing' } as BeatNex['preview']['snapshot'] }) })} />)).toContain(`暂停试听 ${name}`)
    expect(renderToStaticMarkup(<LibraryPage app={appFor({ preview: preview({ key, loading: true }) })} />)).toContain(`取消试听加载 ${name}`)
    expect(renderToStaticMarkup(<LibraryPage app={appFor({ preview: preview({ key, snapshot: { status: 'error', error: 'network' } as BeatNex['preview']['snapshot'] }) })} />)).toContain(`重试试听 ${name}`)
  })

  it('keeps explicit practice action separate from audition', () => {
    const markup = renderToStaticMarkup(<LibraryPage app={appFor()} />)
    expect(markup).toContain('试听 Foundation Backbeat')
    expect(markup).toContain('练习 Foundation Backbeat')
    expect(markup).not.toContain('aria-label="节奏难度"')
    expect(markup).not.toContain('aria-label="练习方式"')
  })

  it('keeps the saved collection count visible', () => {
    const pattern = resizePatternBars(BOOM_BAP_PATTERNS[0], 3)
    const combination: Combination = {
      id: 'saved-3-bars', name: '三小节草稿', bpm: 88, pattern,
      muted: ['openHat'], sourceId: pattern.id,
    }
    const markup = renderToStaticMarkup(<LibraryPage app={appFor({ combinations: [combination] })} />)
    expect(markup).toContain('我的组合')
    expect(markup).toContain('id="bn-saved-count">1')
  })
})
