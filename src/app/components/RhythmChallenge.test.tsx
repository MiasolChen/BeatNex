import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CHALLENGES } from '../../core/challenge/challenge'
import { DEFAULT_CHALLENGE } from '../../storage/challenge'
import type { RhythmChallenge } from '../../features/useRhythmChallenge'
import { ChallengeCards, RhythmChallenge as RhythmChallengeView } from './RhythmChallenge'
import { RhythmStaff } from './RhythmStaff'

const stateFor = (status: RhythmChallenge['status'], phase = 0, display?: 'grid' | 'staff'): RhythmChallenge => ({
  data: display ? { ...DEFAULT_CHALLENGE, settings: { ...DEFAULT_CHALLENGE.settings, display } } : DEFAULT_CHALLENGE,
  challenge: CHALLENGES[0],
  status,
  position: { step: status === 'complete' ? 32 : status === 'ready' ? 0 : phase * 8, total: 32, complete: status === 'complete', round: 1, phraseStep: phase * 8 },
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

  it('makes the ready action clear while leaving settings collapsed', () => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('ready')} />)
    expect(markup).toContain('开始播放')
    expect(markup).toContain('<details class="rc-settings">')
    expect(markup).toContain('class="rc-notation"')
  })

  it('locks settings and challenge cards while loading or playing', () => {
    for (const status of ['loading', 'playing'] as const) {
      const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor(status)} />)
      expect(markup.match(/<fieldset disabled="">/g)).toHaveLength(2)
      expect(markup).not.toContain('辅助打拍声')
      expect(markup).not.toContain('参考拍音量')
      expect(markup.match(/<button[^>]*disabled=""[^>]*aria-label="开始挑战：[^\"]*"/g)).toHaveLength(4)
      expect(markup).toContain(status === 'loading' ? '取消开启' : '暂停播放')
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
    expect(markup).toContain('选择节奏')
  })
})
