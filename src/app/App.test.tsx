import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { App } from './App'

let markup = ''
let warnings: string[] = []
let pages: Array<{ name: string; opening: string; content: string }> = []

beforeAll(() => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation((...messages) => { warnings.push(messages.join(' ')) })
  try { markup = renderToStaticMarkup(<App />) } finally { consoleError.mockRestore() }
  const sections = [...markup.matchAll(/<section\b[^>]*\bdata-view="([^"]+)"[^>]*>/g)]
  pages = sections.map((section, index) => ({
    name: section[1], opening: section[0],
    content: markup.slice(section.index!, sections[index + 1]?.index ?? markup.indexOf('</main>')),
  }))
})

const page = (name: string) => pages.find((item) => item.name === name)!.content
const elementOpening = (html: string, id: string) => html.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0] ?? ''

describe('confirmed BeatNex initial interface', () => {
  it('renders all five pages with only practice initially visible and one active navigation item', () => {
    expect(pages.map(({ name }) => name)).toEqual(['practice', 'library', 'machine', 'metronome', 'calendar'])
    expect(pages.filter(({ opening }) => !/\bhidden(?:=|\s|>)/.test(opening)).map(({ name }) => name)).toEqual(['practice'])
    const navigation = markup.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] ?? ''
    expect((navigation.match(/aria-current="page"/g) ?? []).length).toBe(1)
    expect(/data-page="practice"[^>]*aria-current="page"/.test(navigation)).toBe(true)
    expect(/aria-label="练舞日历"/.test(markup)).toBe(true)
  })

  it('provides an enabled direct start action at the confirmed default tempo and pattern', () => {
    const practice = page('practice')
    const start = practice.match(/<button\b[^>]*\bid="bn-play"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ''
    expect(start.includes('开始练习')).toBe(true)
    expect(/\bdisabled(?:=|\s|>)/.test(start)).toBe(false)
    expect(practice.includes('Foundation Backbeat')).toBe(true)
    expect(practice.includes('BOOM BAP / HIP-HOP')).toBe(true)
    expect(/data-tempo="practice"[^>]*data-value="88"/.test(practice)).toBe(true)
    expect(practice.includes('约 65 秒')).toBe(true)
    expect(/role="dialog"|<form\b/.test(markup)).toBe(false)
  })

  it('shows the six editable phases, 24 bars, and all four selected target drums', () => {
    const practice = page('practice')
    for (const label of ['完整聆听', '单独听辨', '弱化目标', '正常合奏', '自主保持', '完整检查']) {
      expect(practice.includes(`<strong>${label}</strong>`), label).toBe(true)
    }
    const bars = [...practice.matchAll(/<input\b[^>]*aria-label="[^"]*小节数"[^>]*>/g)].map(([input]) => input.match(/\bvalue="([^"]+)"/)?.[1])
    expect(bars).toEqual(['4', '4', '4', '4', '4', '4'])
    const progress = elementOpening(practice, 'bn-progress')
    expect(progress.includes('role="progressbar"')).toBe(true)
    expect(progress.includes('aria-valuemax="24"')).toBe(true)
    expect(progress.includes('aria-valuenow="0"')).toBe(true)
    const drums = [...practice.matchAll(/<button\b[^>]*data-drum="[^"]+"[^>]*>/g)].map(([button]) => button.includes('aria-pressed="true"'))
    expect(drums).toEqual([true, true, true, true])
    expect(practice.includes('单击选择 · 双击取消')).toBe(true)
    expect(practice.includes('id="bn-add-phase"')).toBe(true)
  })

  it('starts with three curated records and zero saved combinations or favorites', () => {
    const library = page('library')
    expect((library.match(/<article class="bn-record"/g) ?? []).length).toBe(3)
    expect(library.includes('<span id="bn-saved-count">0</span>')).toBe(true)
    const favorites = [...library.matchAll(/<button class="bn-favorite"[^>]*>/g)].map(([button]) => button.includes('aria-pressed="false"'))
    expect(favorites).toEqual([true, true, true])
    expect(library.includes('bn-saved-record')).toBe(false)
    expect(library.includes('内容待收录')).toBe(true)
  })

  it('starts the real calendar empty without prototype records or fabricated statistics', () => {
    const calendar = page('calendar')
    expect(calendar.includes('真实记录')).toBe(true)
    expect(calendar.includes('本月还没有练舞记录')).toBe(true)
    expect(calendar.includes('0 天 · 0 次')).toBe(true)
    expect(calendar.includes('bn-training-row')).toBe(false)
    expect(elementOpening(calendar, 'bn-dance-finish').includes('disabled')).toBe(true)
    const totals = [...calendar.matchAll(/<b id="bn-(?:year|month|day)-total">([^<]+)<\/b>/g)].map(([, text]) => text)
    expect(totals).toEqual(['0分钟', '0分钟', '0分钟'])
    const heatValues = [...calendar.matchAll(/data-heat="([^"]+)"/g)].map(([, value]) => value)
    expect(heatValues.length).toBeGreaterThan(30)
    expect(heatValues.every((value) => value === '0')).toBe(true)
    expect(/模拟数据|design-demo|touch-prototype/.test(calendar)).toBe(false)
  })

  it('renders 64 accessible step buttons plus real editor and transport controls', () => {
    const machine = page('machine')
    const steps = [...machine.matchAll(/<button\b[^>]*data-cell="([^"]+)"[^>]*>/g)]
    expect(steps.length).toBe(64)
    expect(new Set(steps.map(([, cell]) => cell)).size).toBe(64)
    expect(steps.every(([button]) => /aria-label="[^"]+第 \d+ 步"/.test(button) && /aria-pressed="(?:true|false)"/.test(button) && !button.includes('disabled'))).toBe(true)
    for (const id of ['bn-save', 'bn-restore', 'bn-machine-play']) {
      expect(elementOpening(machine, id).length > 0, id).toBe(true)
      expect(elementOpening(machine, id).includes('disabled'), id).toBe(false)
    }
    expect(elementOpening(machine, 'bn-undo').includes('disabled')).toBe(true)
    expect(elementOpening(machine, 'bn-redo').includes('disabled')).toBe(true)
  })

  it('renders the initial interface without server-side layout effect warnings', () => {
    expect(warnings.filter((warning) => warning.includes('useLayoutEffect'))).toEqual([])
  })
})
