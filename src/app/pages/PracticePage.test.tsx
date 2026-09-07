import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BOOM_BAP_PATTERNS } from '../../core/pattern/fixtures'
import { DRUM_IDS } from '../../core/pattern/types'
import type { EngineSnapshot } from '../../audio/types'
import type { BeatNex } from '../../features/useBeatNex'
import { defaultSettings } from '../../storage/practice'
import { PracticePage } from './PracticePage'

const snapshot = (status: EngineSnapshot['status'], drums?: EngineSnapshot['drums']): EngineSnapshot => ({
  status, step: 0, cycle: 0, progress: 0, isCountIn: false, elapsed: 0,
  diagnostics: { scheduledHits: 0, skippedSteps: 0, minScheduleLeadMs: null, maxScheduleLeadMs: null },
  drums: drums ?? Object.fromEntries(DRUM_IDS.map(drum => [drum, { gain: 0, level: 'silent', hit: false }])) as NonNullable<EngineSnapshot['drums']>,
})

const appFor = (status: EngineSnapshot['status'], options: { routeEnabled?: boolean, drums?: EngineSnapshot['drums'] } = {}): BeatNex => {
  const settings = defaultSettings()
  settings.routeEnabled = options.routeEnabled ?? true
  return {
    settings,
    selectedDrums: settings.targets,
    pattern: BOOM_BAP_PATTERNS[0],
    source: BOOM_BAP_PATTERNS[0],
    page: 'practice', muted: [], history: [], future: [], combinations: [], favorites: [],
    toast: '', activeId: undefined, saveOpen: false, feedback: '', landscape: false, follow: false,
    completed: false, snapshot: snapshot(status, options.drums), playing: status === 'playing', loading: status === 'loading',
    totalBars: 24, cycle: 0, round: 1, activeIndex: 0,
    phases: settings.phases.map((phase, index) => ({ ...phase, label: ['完整聆听', '单独听辨', '弱化目标', '正常合奏', '自主保持', '完整检查'][index] })),
    audio: {} as BeatNex['audio'],
    notice() {}, switchPage() {}, changeBpm() {}, togglePlayback() {}, selectDrum() {}, choosePattern() {},
    toggleStep() {}, changeMeter() {}, changePatternBars() {}, undo() {}, redo() {}, restore() {}, toggleMute() {}, save() { return true },
    load() {}, toggleFavorite() {}, reorder() {}, removePhase() {}, addPhase() {}, changeBars() {}, changeRepeat() {},
    toggleRoute() {}, endFree() {}, reset() {}, setCompleted() {}, setSaveOpen() {}, submitFeedback() {}, setLandscape() {}, setFollow() {},
  } as BeatNex
}

const drumButtons = (markup: string) => [...markup.matchAll(/<button\b[^>]*data-drum="\d+"[^>]*>/g)].map(([button]) => button)
const attribute = (button: string, name: string) => button.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]

describe('PracticePage route drum pad locking', () => {
  it.each([
    [true, 'loading'],
    [true, 'playing'],
    [false, 'paused'],
  ] as const)('sets pads disabled=%s for %s route state', (disabled, status) => {
    const markup = renderToStaticMarkup(<PracticePage app={appFor(status)} />)
    const pads = drumButtons(markup)
    expect(pads).toHaveLength(4)
    pads.forEach((button, index) => expect(button.includes('disabled'), `pad ${index}`).toBe(disabled))
    const play = markup.match(/<button\b[^>]*\bid="bn-play"[^>]*>/)?.[0] ?? ''
    expect(play.includes('disabled')).toBe(status === 'loading')
  })
})

describe('PracticePage drum feedback SSR state', () => {
  it('maps normal, weak, silent, and idle states to level and accessible label', () => {
    const playingDrums = Object.fromEntries(DRUM_IDS.map((drum, index) => [drum, {
      gain: 1, level: (['normal', 'weak', 'silent', 'normal'] as const)[index], hit: false,
    }])) as NonNullable<EngineSnapshot['drums']>
    const playingPads = drumButtons(renderToStaticMarkup(<PracticePage app={appFor('playing', { drums: playingDrums })} />))
    expect(playingPads.map(button => [attribute(button, 'data-level'), attribute(button, 'aria-label')])).toEqual([
      ['normal', 'Kick，正常音量，目标鼓件'],
      ['weak', 'Snare，弱化音量，目标鼓件'],
      ['silent', 'Closed Hat，静音，目标鼓件'],
      ['normal', 'Open Hat，正常音量，目标鼓件'],
    ])

    const idlePads = drumButtons(renderToStaticMarkup(<PracticePage app={appFor('paused')} />))
    idlePads.forEach(button => expect(attribute(button, 'data-level')).toBe('idle'))
    expect(attribute(idlePads[0], 'aria-label')).toBe('Kick，目标鼓件')
  })

  it('marks a playing hit and clears it when paused', () => {
    const drums = Object.fromEntries(DRUM_IDS.map((drum, index) => [drum, {
      gain: 1, level: 'normal' as const, hit: index === 0,
    }])) as NonNullable<EngineSnapshot['drums']>
    const playingPads = drumButtons(renderToStaticMarkup(<PracticePage app={appFor('playing', { drums })} />))
    expect(attribute(playingPads[0], 'data-hit')).toBe('true')

    const pausedPads = drumButtons(renderToStaticMarkup(<PracticePage app={appFor('paused', { drums })} />))
    expect(pausedPads[0]).toContain('data-hit="false"')
  })

  it('keeps free-practice playing pads available', () => {
    const pads = drumButtons(renderToStaticMarkup(<PracticePage app={appFor('playing', { routeEnabled: false })} />))
    expect(pads).toHaveLength(4)
    pads.forEach(button => expect(button).not.toContain('disabled'))
  })
})
