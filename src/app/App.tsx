import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { BOOM_BAP_PATTERNS, findPattern, PATTERN_NAMES } from '../core/pattern/fixtures'
import { DRUM_IDS, type Difficulty, type DrumId } from '../core/pattern/types'
import { useDrumMachine } from '../features/useDrumMachine'

const drumLabels: Record<DrumId, { name: string; short: string }> = {
  kick: { name: 'Kick', short: 'K' }, snare: { name: 'Snare', short: 'S' },
  closedHat: { name: 'Closed Hat', short: 'CH' }, openHat: { name: 'Open Hat', short: 'OH' },
}

const emptyDiagnostics = {
  scheduledHits: 0,
  skippedSteps: 0,
  minScheduleLeadMs: null,
  maxScheduleLeadMs: null,
}

const recommendedPractice = {
  duration: '约 5 分钟',
  style: 'Boom Bap',
  target: 'Kick',
} as const

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function formatLead(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)} ms`
}

type MobileTab = 'practice' | 'tracks' | 'status'

function Icon({ name }: { name: 'play' | 'pause' | 'stop' | MobileTab }) {
  if (name === 'play') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z" /></svg>
  if (name === 'pause') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>
  if (name === 'stop') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
  if (name === 'practice') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3Zm1 4v6h5v-2h-3V7h-2Z" /></svg>
  if (name === 'tracks') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h10v2H4V5Zm0 6h16v2H4v-2Zm0 6h7v2H4v-2Zm13-14h2v6h-2V3Zm-5 12h2v6h-2v-6Z" /></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M11 10h2v7h-2v-7Zm0-4h2v2h-2V6Zm1-4a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" /></svg>
}

export function App() {
  const [patternName, setPatternName] = useState(PATTERN_NAMES[0])
  const [difficulty, setDifficulty] = useState<Difficulty>('simple')
  const selectedPattern = useMemo(() => findPattern(patternName, difficulty), [difficulty, patternName])
  const [bpm, setBpm] = useState(selectedPattern.recommendedBpm)
  const [mobileTab, setMobileTab] = useState<MobileTab>('practice')
  const { snapshot, mixes, pendingChange, play, pause, stop, retry, updateMix } = useDrumMachine(selectedPattern, bpm)
  const diagnostics = snapshot.diagnostics ?? emptyDiagnostics
  const isPlaying = snapshot.status === 'playing'
  const isLoading = snapshot.status === 'loading'
  const canStop = isPlaying || snapshot.status === 'paused'
  const visualProgress = snapshot.isCountIn ? 0 : snapshot.progress
  const statusLabel = snapshot.status === 'error'
    ? '音频错误'
    : isLoading
      ? '正在加载鼓组'
      : isPlaying
        ? '音频时钟运行中'
        : snapshot.status === 'paused'
          ? '练习已暂停'
          : '准备练习'

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [mobileTab])

  const choosePattern = (name: string) => {
    setPatternName(name)
    const next = BOOM_BAP_PATTERNS.find((item) => item.name === name && item.difficulty === difficulty)
    if (next) setBpm(next.recommendedBpm)
  }

  const chooseMobileTab = (tab: MobileTab) => {
    setMobileTab(tab)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BeatNex 首页"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>BeatNex</span></a>
        <div className={`engine-status status-${snapshot.status}`} role="status" aria-live="polite"><span aria-hidden="true" />{statusLabel}</div>
      </header>

      <section className={`hero mobile-panel ${mobileTab === 'practice' ? 'mobile-panel-active' : ''}`} id="top">
        <div className="hero-copy"><p className="eyebrow">Boom Bap · Loop Lab</p><h1>听清每一层，<br /><em>踩进拍里。</em></h1><p className="intro">选择一个 Groove，四拍预备后开始；鼓点与播放指针共用同一条音频时间轴。</p></div>
        <div className="now-card" aria-label="当前练习">
          <div className="now-meta"><span>当前练习</span><strong>{bpm} BPM</strong></div><h2>{selectedPattern.name}</h2>
          <p>{difficulty === 'simple' ? '稳定后拍与身体重心' : '加入切分、Ghost Note 与句尾推动'}</p>
          <dl className="practice-facts" aria-label="推荐练习信息">
            <div><dt>风格</dt><dd>{recommendedPractice.style}</dd></div>
            <div><dt>首练目标</dt><dd>{recommendedPractice.target}</dd></div>
            <div><dt>预计时长</dt><dd>{recommendedPractice.duration}</dd></div>
          </dl>
          <div className="transport"><button className="play-button" onClick={isPlaying ? pause : play} disabled={isLoading}><Icon name={isPlaying ? 'pause' : 'play'} />{isLoading ? '加载中…' : isPlaying ? '暂停' : snapshot.status === 'paused' ? '继续' : '开始练习'}</button><button className="icon-button" onClick={stop} disabled={!canStop} aria-label="停止并回到开头"><Icon name="stop" /></button></div>
          <p className="count-in-note">{snapshot.isCountIn ? 'Count-in · 准备进入' : pendingChange ? '将在下一小节切换' : '首次播放包含一小节 Count-in'}</p>
        </div>
      </section>

      {snapshot.status === 'error' && <section className="error-banner" role="alert"><div><strong>鼓组没有准备好</strong><p>{snapshot.error}</p></div><button onClick={retry}>重试加载</button></section>}

      <section className={`workspace mobile-panel ${mobileTab === 'practice' ? 'mobile-panel-active' : ''}`} aria-label="节奏练习台">
        <div className="section-heading"><div><p className="section-kicker">01 / Groove</p><h2>选择 Pattern</h2></div><div className="difficulty-switch" aria-label="难度">{(['simple', 'hard'] as const).map((value) => <button key={value} aria-pressed={difficulty === value} onClick={() => setDifficulty(value)}>{value === 'simple' ? 'Simple' : 'Hard'}</button>)}</div></div>
        <div className="pattern-tabs">{PATTERN_NAMES.map((name, index) => <button key={name} className={patternName === name ? 'active' : ''} aria-pressed={patternName === name} onClick={() => choosePattern(name)}><span>0{index + 1}</span>{name}</button>)}</div>
        <div className="tempo-row"><label htmlFor="tempo">Tempo</label><input id="tempo" type="range" min="60" max="140" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /><output htmlFor="tempo">{bpm} <small>BPM</small></output></div>
      </section>

      <section className={`tracks-panel mobile-panel ${mobileTab === 'tracks' ? 'mobile-panel-active' : ''}`} aria-labelledby="tracks-title">
        <div className="section-heading"><div><p className="section-kicker">02 / Tracks</p><h2 id="tracks-title">轨道与分层</h2></div><p className="section-copy">音量与听音操作紧跟所属轨道，调整时不必在网格和调音台之间来回寻找。</p></div>
        <div className="grid-shell"><div className="beat-numbers" aria-hidden="true"><span /><span>1</span><span>2</span><span>3</span><span>4</span><span /></div><div className="rhythm-grid" aria-label={`${selectedPattern.name} 十六步节奏网格`} data-audio-step={snapshot.step} data-audio-cycle={snapshot.cycle} data-audio-progress={visualProgress}>
          {DRUM_IDS.map((drum) => { const track = selectedPattern.tracks.find((item) => item.drum === drum); return <article className="track-row" key={drum}><div className="track-name"><span>{drumLabels[drum].short}</span><strong>{drumLabels[drum].name}</strong></div><div className="steps">{Array.from({ length: 16 }, (_, step) => { const hit = track?.hits.find((item) => item.step === step); const current = isPlaying && !snapshot.isCountIn && snapshot.step === step; return <span key={step} className={`step ${hit ? 'hit' : ''} ${current ? 'current' : ''}`} data-step={step} data-velocity={hit?.velocity ?? 0} /> })}</div><div className="track-mix"><label className="volume-label" htmlFor={`${drum}-volume`}><span>Volume</span><output>{Math.round(mixes[drum].volume * 100)}</output></label><input id={`${drum}-volume`} aria-label={`${drumLabels[drum].name} 音量`} type="range" min="0" max="100" value={mixes[drum].volume * 100} onChange={(event) => updateMix(drum, { volume: Number(event.target.value) / 100 })} /><div className="mix-actions"><button aria-label={`${drumLabels[drum].name} Solo`} aria-pressed={mixes[drum].solo} onClick={() => updateMix(drum, { solo: !mixes[drum].solo })}>S</button><button aria-label={`${drumLabels[drum].name} Mute`} aria-pressed={mixes[drum].muted} onClick={() => updateMix(drum, { muted: !mixes[drum].muted })}>M</button><button aria-label={`${drumLabels[drum].name} Focus`} aria-pressed={mixes[drum].focused} onClick={() => updateMix(drum, { focused: !mixes[drum].focused })}>F</button></div></div></article> })}
          <div className="playhead" data-audio-progress={visualProgress} style={{ '--progress': visualProgress } as CSSProperties} aria-hidden="true" />
        </div></div>
      </section>

      <details className={`diagnostics mobile-panel ${mobileTab === 'status' ? 'mobile-panel-active' : ''}`} open={mobileTab === 'status' || undefined}>
        <summary>计时诊断 <span>用于 M1 长循环验收</span></summary>
        <p>数据来自当前 AudioContext；停止后会保留到下一次全新播放。</p>
        <dl>
          <div><dt>音频时间</dt><dd data-testid="diagnostic-elapsed">{formatDuration(snapshot.elapsed)}</dd></div>
          <div><dt>完成循环</dt><dd>{snapshot.cycle}</dd></div>
          <div><dt>已调度鼓点</dt><dd>{diagnostics.scheduledHits}</dd></div>
          <div><dt>跳过过期 Step</dt><dd>{diagnostics.skippedSteps}</dd></div>
          <div><dt>最小提前量</dt><dd>{formatLead(diagnostics.minScheduleLeadMs)}</dd></div>
          <div><dt>最大提前量</dt><dd>{formatLead(diagnostics.maxScheduleLeadMs)}</dd></div>
        </dl>
      </details>

      <div className="mobile-transport" aria-label="移动端走带控制"><div><strong>{selectedPattern.name}</strong><span>{bpm} BPM · {snapshot.isCountIn ? 'Count-in' : `第 ${snapshot.step + 1} 步`}</span></div><button className="mobile-play" onClick={isPlaying ? pause : play} disabled={isLoading}><Icon name={isPlaying ? 'pause' : 'play'} /><span>{isLoading ? '加载中…' : isPlaying ? '暂停' : snapshot.status === 'paused' ? '继续' : '开始练习'}</span></button><button className="mobile-stop" onClick={stop} disabled={!canStop} aria-label="停止并回到开头"><Icon name="stop" /></button></div>
      <nav className="mobile-tabs" aria-label="主要页面">{([{ id: 'practice', label: '练习' }, { id: 'tracks', label: '轨道' }, { id: 'status', label: '状态' }] as const).map((tab) => <button key={tab.id} onClick={() => chooseMobileTab(tab.id)} aria-current={mobileTab === tab.id ? 'page' : undefined}><Icon name={tab.id} /><span>{tab.label}</span></button>)}</nav>
    </main>
  )
}
