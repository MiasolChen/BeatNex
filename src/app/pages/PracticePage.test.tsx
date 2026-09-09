import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BOOM_BAP_PATTERNS } from '../../core/pattern/fixtures'
import { DRUM_IDS } from '../../core/pattern/types'
import type { EngineSnapshot } from '../../audio/types'
import type { BeatNex } from '../../features/useBeatNex'
import { defaultSettings } from '../../storage/practice'
import { PracticePage } from './PracticePage'
import { volumeFromDrag } from '../usePadVolume'

const snapshot = (status: EngineSnapshot['status'], drums?: EngineSnapshot['drums'], options: { cycle?: number, isCountIn?: boolean } = {}): EngineSnapshot => ({
  status, step: 0, cycle: options.cycle ?? 0, progress: 0, isCountIn: options.isCountIn ?? false, elapsed: 0,
  diagnostics: { scheduledHits: 0, skippedSteps: 0, minScheduleLeadMs: null, maxScheduleLeadMs: null },
  drums: drums ?? Object.fromEntries(DRUM_IDS.map(drum => [drum, { gain: 0, level: 'silent', hit: false }])) as NonNullable<EngineSnapshot['drums']>,
})

const appFor = (status: EngineSnapshot['status'], options: {
  routeEnabled?: boolean, callEnabled?: boolean, callBars?: number, callStage?: { label: string, task: string },
  drums?: EngineSnapshot['drums'], cycle?: number, isCountIn?: boolean, completed?: boolean,
} = {}): BeatNex => {
  const settings = defaultSettings()
  settings.routeEnabled = options.routeEnabled ?? true
  settings.callEnabled = options.callEnabled
  settings.callBars = options.callBars
  const mode = options.callEnabled ? 'call' : settings.routeEnabled ? 'route' : 'free'
  return {
    settings,
    selectedDrums: settings.targets,
    pattern: BOOM_BAP_PATTERNS[0],
    source: BOOM_BAP_PATTERNS[0],
    page: 'practice', muted: [], history: [], future: [], combinations: [], favorites: [],
    toast: '', activeId: undefined, saveOpen: false, feedback: '', landscape: false, follow: false,
    mode, isCall: mode === 'call', callBars: options.callBars ?? 1,
    callStage: options.callStage ?? { label: '示范', task: '听目标鼓件，记住每次落点' },
    completed: options.completed ?? false, snapshot: snapshot(status, options.drums, options), playing: status === 'playing', loading: status === 'loading',
    totalBars: 24, cycle: 0, round: 1, activeIndex: 0,
    phases: settings.phases.map((phase, index) => ({ ...phase, label: ['完整聆听', '单独听辨', '弱化目标', '正常合奏', '自主保持', '完整检查'][index] })),
    audio: {} as BeatNex['audio'],
    notice() {}, switchPage() {}, changeBpm() {}, togglePlayback() {}, selectDrum() {}, choosePattern() {},
    toggleStep() {}, changeMeter() {}, changeSubdivision() {}, changePatternBars() {}, undo() {}, redo() {}, restore() {}, toggleMute() {}, save() { return true },
    load() {}, toggleFavorite() {}, reorder() {}, removePhase() {}, addPhase() {}, changeBars() {}, changeRepeat() {},
    toggleRoute() {}, changeMode() {}, changeCallBars() {}, endFree() {}, reset() {}, setCompleted() {}, setSaveOpen() {}, submitFeedback() {}, setLandscape() {}, setFollow() {},
    preview: { key: undefined, loading: false, snapshot: snapshot('idle'), toggle() {}, stop() {} },
    changeFreeVolume() {},
  } as BeatNex
}

const drumButtons = (markup: string) => [...markup.matchAll(/<button\b[^>]*data-drum="\d+"[^>]*>/g)].map(([button]) => button)
const attribute = (button: string, name: string) => button.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]

const modePanel = (markup: string) => markup.match(/<article class="bn-card bn-mode-panel"[^>]*>/)?.[0] ?? ''

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

  it.each(['loading', 'playing'] as const)('renders locked pad markers and labels for route %s', status => {
    const markup = renderToStaticMarkup(<PracticePage app={appFor(status)} />)
    expect((markup.match(/class="bn-pad-lock"/g) ?? [])).toHaveLength(4)
    drumButtons(markup).forEach(button => {
      expect(button).toContain('aria-label="')
      expect(button).toMatch(/aria-label="[^"]*，已锁定"/)
    })
  })

  it('removes locked pad markers and labels when route practice is paused', () => {
    const markup = renderToStaticMarkup(<PracticePage app={appFor('paused')} />)
    expect(markup).not.toContain('bn-pad-lock')
    drumButtons(markup).forEach(button => expect(button).not.toMatch(/aria-label="[^"]*，已锁定"/))
  })

  it('marks the mode panel as route or free in SSR', () => {
    expect(modePanel(renderToStaticMarkup(<PracticePage app={appFor('paused')} />))).toContain('data-mode="route"')
    expect(modePanel(renderToStaticMarkup(<PracticePage app={appFor('paused', { routeEnabled: false })} />))).toContain('data-mode="free"')
  })
})

describe('PracticePage call-and-response SSR', () => {
  it('renders the third practice mode and selected call length', () => {
    const markup = renderToStaticMarkup(<PracticePage app={appFor('paused', { callEnabled: true, callBars: 3 })} />)
    expect(markup).toContain('data-mode="call"')
    expect(markup).toContain('听与回应')
    expect(markup).toContain('目标鼓件')
    expect(markup).toContain('回应长度（小节）')
    const callLength = markup.match(/<div class="bn-call-length"[^>]*>(.*?)<\/div>/)?.[1] ?? ''
    const controls = [...callLength.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)]
    expect(controls.map(match => match[1])).toEqual(['1', '2', '3', '4'])
    expect(controls.map(match => attribute(match[0], 'aria-label'))).toEqual(['回应 1 小节', '回应 2 小节', '回应 3 小节', '回应 4 小节'])
    expect(controls[2][0]).toContain('aria-pressed="true"')
    expect(markup).toContain('预备 → 示范 → 回应 → 检查')
  })

  it.each(['loading', 'playing'] as const)('locks call length while %s', status => {
    const markup = renderToStaticMarkup(<PracticePage app={appFor(status, { callEnabled: true, callBars: 2 })} />)
    const controls = [...markup.matchAll(/<div class="bn-call-length"[^>]*>(.*?)<\/div>/g)].flatMap(match => [...match[1].matchAll(/<button\b[^>]*>/g)])
    expect(controls).toHaveLength(4)
    controls.forEach(button => expect(button[0]).toContain('disabled'))
  })

  it('shows the current call stage task and completion action', () => {
    const markup = renderToStaticMarkup(<PracticePage app={appFor('paused', {
      callEnabled: true, callBars: 1, completed: true, callStage: { label: '回应', task: '鼓声暂时静音，在心中保持刚才的节奏' },
    })} />)
    expect(markup).toContain('回应')
    expect(markup).toContain('鼓声暂时静音，在心中保持刚才的节奏')
    expect(markup).toContain('练习完成 · 回应')
  })
})

describe('PracticePage drum feedback SSR state', () => {
  it('maps normal, weak, silent, and idle states to level and accessible label', () => {
    const playingDrums = Object.fromEntries(DRUM_IDS.map((drum, index) => [drum, {
      gain: 1, level: (['normal', 'weak', 'silent', 'normal'] as const)[index], hit: false,
    }])) as NonNullable<EngineSnapshot['drums']>
    const playingPads = drumButtons(renderToStaticMarkup(<PracticePage app={appFor('playing', { drums: playingDrums })} />))
    expect(playingPads.map(button => [attribute(button, 'data-level'), attribute(button, 'aria-label')])).toEqual([
      ['normal', 'Kick，正常音量，目标鼓件，已锁定'],
      ['weak', 'Snare，弱化音量，目标鼓件，已锁定'],
      ['silent', 'Closed Hat，静音，目标鼓件，已锁定'],
      ['normal', 'Open Hat，正常音量，目标鼓件，已锁定'],
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

  it('hides the weak-volume legend and exposes free-practice volume percentages in SSR', () => {
    const settings = { ...defaultSettings(), freeTargets: [...DRUM_IDS] }
    settings.routeEnabled = false
    settings.freeVolumes = { kick: 25, snare: 0, closedHat: 100, openHat: 67 }
    const app = appFor('playing', { routeEnabled: false })
    app.settings = settings
    app.selectedDrums = settings.freeTargets ?? settings.targets
    const markup = renderToStaticMarkup(<PracticePage app={app} />)
    expect(markup).not.toContain('弱化')
    expect(markup).toContain('25%')
    expect(markup).toContain('0%')
    expect(markup).toContain('100%')
    expect(markup).toContain('67%')
  })

  it('keeps the weak-volume legend for route practice', () => {
    const markup = renderToStaticMarkup(<PracticePage app={appFor('playing')} />)
    expect(markup).toContain('鼓垫音量图例')
    expect(markup).toContain('弱化')
  })
})

describe('volumeFromDrag', () => {
  it.each([
    [50, 200, 200, 50],
    [50, 200, 275, 0],
    [50, 200, 125, 100],
    [0, 200, 201, 0],
    [100, 200, 199, 100],
    [50, 200, 201.5, 49],
  ])('maps start=%s startY=%s currentY=%s to %s percent', (start, startY, currentY, expected) => {
    expect(volumeFromDrag(start, startY, currentY)).toBe(expected)
  })
})
