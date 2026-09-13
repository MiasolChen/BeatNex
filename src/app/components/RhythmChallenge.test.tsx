import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CHALLENGES } from '../../core/challenge/challenge'
import { DEFAULT_CHALLENGE } from '../../storage/challenge'
import type { RhythmChallenge } from '../../features/useRhythmChallenge'
import { ChallengeCards, RhythmChallenge as RhythmChallengeView } from './RhythmChallenge'

const stateFor = (status: RhythmChallenge['status'], phase = 0): RhythmChallenge => ({
  data: DEFAULT_CHALLENGE,
  challenge: CHALLENGES[0],
  status,
  position: { step: status === 'complete' ? 144 : status === 'ready' ? 0 : 16 + phase * 32, total: 144, complete: status === 'complete', countIn: status === 'ready', phase, round: 1, phraseStep: 0 },
  storageError: '', error: '',
  play: async () => {}, pause() {}, reset() {}, update() {}, feedback() {},
})

describe('RhythmChallenge SSR controls', () => {
  it('makes the ready action clear and keeps advanced controls collapsed', () => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('ready')} />)
    expect(markup).toContain('用拍手，模仿一段节奏')
    expect(markup).toContain('可以拍手，也可以轻敲桌面。不需要点击屏幕。')
    expect(markup).toContain('开始练习，先听一遍')
    expect(markup).toContain('<summary>看节奏图（可选）</summary>')
    expect(markup).toContain('<details class="rc-settings">')
    expect(markup).not.toContain('<details class="rc-settings" open="">')
  })

  it('locks settings and challenge cards while loading or playing', () => {
    for (const status of ['loading', 'playing'] as const) {
      const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor(status)} />)
      expect(markup.match(/<fieldset disabled="">/g)).toHaveLength(2)
      expect(markup).not.toContain('辅助打拍声')
      expect(markup).not.toContain('参考拍音量')
      expect(markup.match(/<button[^>]*disabled=""[^>]*aria-label="开始挑战：[^\"]*"/g)).toHaveLength(4)
      expect(markup).toContain(status === 'loading' ? '取消开启' : '暂停练习')
    }
  })

  it('describes completion as a subjective result without an accuracy score', () => {
    const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('complete')} />)
    expect(markup).toContain('回想刚才的练习，选一个最接近的感受。')
    expect(markup).toContain('本次主观感受')
    expect(markup).not.toContain('准确率：')
    expect(markup).not.toContain('得分')
    expect(markup).toContain('再练一次')
  })

  it('gives each practice phase a distinct plain-language instruction', () => {
    const expected = [
      ['先听，不用拍', '记住这段节奏，下一遍再跟着拍。'],
      ['跟着声音拍手', '每听到一下，就拍一下手或轻敲桌面。'],
      ['声音停了，自己继续', '按刚才记住的节奏继续拍手；屏幕上的拍点会继续走。'],
      ['继续拍，听听是否合上', '示范声回来了，听听你的拍手是否和它重合。'],
    ]
    expected.forEach(([title, description], phase) => {
      const markup = renderToStaticMarkup(<RhythmChallengeView state={stateFor('playing', phase)} />)
      expect(markup).toContain(`<strong>${title}</strong>`)
      expect(markup).toContain(`<span>${description}</span>`)
      if (phase === 2) expect(markup).toContain('data-current="true"')
    })
  })

  it('exposes all four challenge cards with accessible start labels', () => {
    const starts: string[] = []
    const markup = renderToStaticMarkup(<ChallengeCards onStart={id => starts.push(id)} />)
    expect(markup.match(/class="rc-card"/g)).toHaveLength(4)
    expect(markup.match(/aria-label="开始挑战：/g)).toHaveLength(4)
    expect(markup).toContain('换一段节奏练习')
  })
})
