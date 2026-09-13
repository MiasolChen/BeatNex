import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CHALLENGES } from '../../core/challenge/challenge'
import { DEFAULT_CHALLENGE } from '../../storage/challenge'
import type { RhythmChallenge } from '../../features/useRhythmChallenge'
import { ChallengeCards, RhythmChallenge as RhythmChallengeView } from './RhythmChallenge'
import { RhythmStaff } from './RhythmStaff'

const stateFor = (status: RhythmChallenge['status'], phase = 0, display?: 'grid' | 'staff', repeat = false, countIn = false): RhythmChallenge => ({
  data: display || repeat || countIn ? { ...DEFAULT_CHALLENGE, settings: { ...DEFAULT_CHALLENGE.settings, ...(display ? { display } : {}), repeat, countIn } } : DEFAULT_CHALLENGE,
  challenge: CHALLENGES[0],
  status,
  position: { step: status === 'complete' ? 32 : status === 'ready' ? 0 : phase * 8, total: 32, complete: status === 'complete', countIn: false, round: 1, phraseStep: phase * 8 },
  storageError: '', error: '',
  play: async () => {}, pause() {}, reset() {}, update() {}, feedback() {}, setDisplay() {},
})

describe('RhythmStaff SSR notation', () => {
  it('renders two five-line bars with note and rest duration metadata', () => {
    const markup = renderToStaticMarkup(<RhythmStaff challenge={CHALLENGES[0]} step={0} active={false} />)
    expect(markup.match(/class="rc-staff"/g)).toHaveLength(2)
    expect(markup.match(/class="rc-staff-line"/g)).toHaveLength(10)
    expect(markup).toMatch(/data-kind="note" data-duration="[124]"/)
    expect(markup).toMatch(/data-kind="rest" data-duration="[124]"/)
    expect(markup).toContain('data-current="false"')
  })

  it('marks an active rest while playback is in progress', () => {
    const markup = renderToStaticMarkup(<RhythmStaff challenge={CHALLENGES[0]} step={4} active />)
    expect(markup).toContain('data-kind="rest" data-duration="4" data-current="true"')
  })
})

describe('RhythmChallenge SSR controls', () => {
  it.each([false, true])('renders one-shot and infinite playback controls with %s selected', (repeat) => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('ready', 0, undefined, repeat)} />)
    expect(markup).toContain('<div class="rc-loop-mode" role="group" aria-label="播放方式">')
    const controls = [...markup.matchAll(/<button type="button"[^>]*aria-label="(只播一次|无限循环)"[^>]*>/g)]
    expect(controls).toHaveLength(1)
    expect(controls.every(([control]) => !control.includes('disabled'))).toBe(true)
    expect(controls.map(([control]) => control.includes('aria-pressed="true"'))).toEqual([repeat])
  })

  it('locks playback mode controls while playing', () => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('playing', 0, undefined, true)} />)
    const controls = [...markup.matchAll(/<button type="button"[^>]*aria-label="(只播一次|无限循环)"[^>]*>/g)]
    expect(controls).toHaveLength(1)
    expect(controls.every(([control]) => control.includes('disabled=""'))).toBe(true)
  })

  it('renders the toolbar with an optional four-beat count-in switch', () => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('ready', 0, undefined, false, true)} />)
    expect(markup).toMatch(/<div[^>]*class="rc-toolbar"[^>]*role="group"[^>]*aria-label="节奏工具栏"[^>]*tabindex="-1"/)
    expect(markup).toContain('aria-label="音色"')
    expect(markup).toContain('aria-label="挑战速度"')
    expect(markup).toMatch(/aria-label="播放四拍预备音"[^>]*checked=""/)
    expect(markup).toMatch(/class="rc-count-in"[^>]*hidden=""/)
  })

  it.each(['grid', 'staff'] as const)('keeps the notation switch enabled and selects %s mode', (display) => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('playing', 0, display)} />)
    const switches = [...markup.matchAll(/<input[^>]*role="switch"[^>]*aria-label="五线谱显示"[^>]*>/g)]
    expect(switches).toHaveLength(1)
    expect(switches[0][0]).not.toContain('disabled')
    expect(switches[0][0].includes('checked=""')).toBe(display === 'staff')
    expect((markup.match(/class="rc-phrase"/g) ?? []).length).toBe(display === 'grid' ? 1 : 0)
    expect((markup.match(/class="rc-staves"/g) ?? []).length).toBe(display === 'staff' ? 1 : 0)
  })

  it.each(['ready', 'loading', 'playing', 'paused', 'complete'] as const)('renders the notation in %s without retired status panels', (status) => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor(status)} />)
    expect(markup.match(/class="rc-notation"/g)).toHaveLength(1)
    expect(markup).not.toContain('class="rc-stage"')
    expect(markup).not.toContain('class="rc-result"')
    expect(markup).not.toContain('class="rc-listening"')
    expect(markup).not.toContain('class="rc-silent-beats"')
  })

  it('keeps the compact toolbar and score visible without a descriptive title', () => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('ready')} />)
    expect(markup).toContain('开始播放')
    expect(markup).not.toMatch(/<h1[^>]*>/)
    expect(markup).toMatch(/<div[^>]*class="rc-toolbar"[^>]*role="group"[^>]*aria-label="节奏工具栏"[^>]*tabindex="-1"/)
    expect(markup).toContain('class="rc-notation"')
  })

  it('locks playback settings and challenge cards while loading or playing', () => {
    for (const status of ['loading', 'playing'] as const) {
      const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor(status)} />)
      expect(markup).toMatch(/<div[^>]*class="rc-toolbar"[^>]*role="group"[^>]*aria-label="节奏工具栏"[^>]*tabindex="-1"/)
      expect(markup).not.toContain('辅助打拍声')
      expect(markup).not.toContain('参考拍音量')
      expect(markup.match(/<button[^>]*disabled=""[^>]*aria-label="开始挑战：[^\"]*"/g)).toHaveLength(4)
      expect(markup).toContain(status === 'loading' ? '取消开启' : '暂停播放')
      expect(markup).toMatch(/aria-label="播放四拍预备音"[^>]*disabled=""/)
      expect(markup).toMatch(/<fieldset[^>]*class="rc-tempo"[^>]*disabled=""/)
      expect(markup).toMatch(/<input[^>]*type="number"[^>]*aria-label="挑战速度"[^>]*value="90"/)
    }
  })

  it('keeps completion free of the retired self-assessment panel', () => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('complete')} />)
    expect(markup).not.toContain('本次主观感受')
    expect(markup).not.toContain('class="rc-result"')
    expect(markup).not.toContain('准确率：')
    expect(markup).not.toContain('得分')
    expect(markup).toContain('class="rc-notation"')
  })

  it('keeps the four step labels while the notation remains the visual guide', () => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('playing', 0)} />)
    expect(markup).not.toContain('rc-phases')
    expect(markup).toContain('暂停播放')
    expect(markup).toContain('class="rc-notation"')
  })

  it('exposes all four challenge cards with accessible start labels', () => {
    const starts: string[] = []
    const markup = renderToStaticMarkup(<ChallengeCards onStart={id => starts.push(id)} />)
    expect(markup.match(/class="rc-card"/g)).toHaveLength(4)
    expect(markup.match(/aria-label="开始挑战：/g)).toHaveLength(4)
    for (let index = 1; index <= 4; index++) expect(markup).toContain(`<h3>节奏 ${String(index).padStart(2, '0')}</h3>`)
    expect(markup).toContain('选择节奏')
  })
})


describe('count-in dots', () => {
  it('highlights each count-in beat and clears the dots when paused or in the phrase', () => {
    for (let beat = 0; beat < 4; beat++) {
      const state = stateFor('playing', 0, 'staff', false, true)
      state.position = {...state.position, countIn: true, step: beat * 4 + 1}
      const markup = renderToStaticMarkup(<RhythmChallengeView state={state} />)
      expect(markup).toContain(`预备音，第 ${beat + 1} 拍`)
      const dots = [...markup.matchAll(/<i aria-hidden="true" data-current="(true|false)"/g)]
      expect(dots.map(match => match[1])).toEqual([0,1,2,3].map(index => String(index === beat)))
      state.status = 'paused'
      expect(renderToStaticMarkup(<RhythmChallengeView state={state} />)).not.toContain('<i aria-hidden="true" data-current="true"')
      state.status = 'playing'; state.position.countIn = false
      expect(renderToStaticMarkup(<RhythmChallengeView state={state} />)).not.toContain('<i aria-hidden="true" data-current="true"')
    }
  })
})
