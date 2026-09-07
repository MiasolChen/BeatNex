import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EditorSelect, MeterSelect } from './MeterSelect'

const attrs = (markup: string, name: string) => markup.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]

describe('editor selects SSR', () => {
  it('renders a closed generic editor select with its label, value, and listbox semantics', () => {
    const markup = renderToStaticMarkup(
      <EditorSelect value={4} onChange={() => {}} options={[1, 2, 4] as const} label="鼓机小节数" />,
    )
    const button = markup.match(/<button\b[^>]*>/)?.[0] ?? ''

    expect(markup).toContain('鼓机小节数')
    expect(markup).toContain('>4<')
    expect(attrs(button, 'aria-label')).toBe('鼓机小节数')
    expect(attrs(button, 'aria-haspopup')).toBe('listbox')
    expect(attrs(button, 'aria-expanded')).toBe('false')
  })

  it('keeps the meter trigger closed and exposes the selected meter value', () => {
    const markup = renderToStaticMarkup(<MeterSelect value="4/4" onChange={() => {}} />)
    const button = markup.match(/<button\b[^>]*>/)?.[0] ?? ''

    expect(markup).toContain('>4/4<')
    expect(attrs(button, 'aria-label')).toBe('拍号')
    expect(attrs(button, 'aria-haspopup')).toBe('listbox')
    expect(attrs(button, 'aria-expanded')).toBe('false')
    expect(markup).not.toContain('role="listbox"')
  })
})
