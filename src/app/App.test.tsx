import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('recommended practice entry', () => {
  it('shows a complete default practice with one primary start action and no prerequisite flow', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('Foundation Backbeat')
    expect(markup).toContain('88 BPM')
    expect(markup).toContain('Boom Bap')
    expect(markup).toContain('Kick')
    expect(markup).toContain('约 5 分钟')
    expect(markup).toContain('>开始练习</span></button>')
    expect(markup).toContain('>开始练习</button>')
    expect(markup).not.toContain('<dialog')
    expect(markup).not.toContain('<form')
  })

  it('renders the available dance library without introducing future placeholder categories', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('练习库分类视角')
    expect(markup).toContain('Hip-Hop')
    expect(markup).toContain('3 个练习')
    expect(markup).toContain('88–96 BPM')
    expect(markup).not.toContain('Locking')
    expect(markup).not.toContain('House Dance')
  })
})
