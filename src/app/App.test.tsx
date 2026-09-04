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

  it('shows the complete six-phase guided practice before audio starts', () => {
    const markup = renderToStaticMarkup(<App />)

    for (const label of ['Full', 'Solo', 'Focus', 'Normal', 'Mute Target', 'Check']) {
      expect(markup).toContain(`>${label}</strong>`)
    }
    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('class="bar-ticks"')
    expect(markup).toContain('phase-boundary')
    expect(markup).toContain('四拍预备后播放 完整鼓组')
    expect(markup).toContain('目标鼓')
    expect(markup).toContain('添加训练阶段')
    expect(markup).toContain('恢复默认组合')
    expect(markup).not.toContain('Guide Setup')
  })
})
