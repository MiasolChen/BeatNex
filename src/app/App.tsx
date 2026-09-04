import { useMemo, useState, type CSSProperties } from 'react'

import { BOOM_BAP_PATTERNS, findPattern, PATTERN_NAMES } from '../core/pattern/fixtures'
import { DRUM_IDS, type Difficulty, type DrumId } from '../core/pattern/types'
import { useDrumMachine } from '../features/useDrumMachine'

const drumLabels: Record<DrumId, { name: string; short: string }> = {
  kick: { name: 'Kick', short: 'K' }, snare: { name: 'Snare', short: 'S' },
  closedHat: { name: 'Closed Hat', short: 'CH' }, openHat: { name: 'Open Hat', short: 'OH' },
}

function Icon({ name }: { name: 'play' | 'pause' | 'stop' }) {
  if (name === 'play') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z" /></svg>
  if (name === 'pause') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
}

export function App() {
  const [patternName, setPatternName] = useState(PATTERN_NAMES[0])
  const [difficulty, setDifficulty] = useState<Difficulty>('simple')
  const selectedPattern = useMemo(() => findPattern(patternName, difficulty), [difficulty, patternName])
  const [bpm, setBpm] = useState(selectedPattern.recommendedBpm)
  const { snapshot, mixes, pendingChange, play, pause, stop, retry, updateMix } = useDrumMachine(selectedPattern, bpm)
  const isPlaying = snapshot.status === 'playing'
  const isLoading = snapshot.status === 'loading'
  const canStop = isPlaying || snapshot.status === 'paused'
  const statusLabel = snapshot.status === 'error'
    ? '音频错误'
    : isLoading
      ? '正在加载鼓组'
      : isPlaying
        ? '音频时钟运行中'
        : snapshot.status === 'paused'
          ? '练习已暂停'
          : '准备练习'

  const choosePattern = (name: string) => {
    setPatternName(name)
    const next = BOOM_BAP_PATTERNS.find((item) => item.name === name && item.difficulty === difficulty)
    if (next) setBpm(next.recommendedBpm)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BeatNex 首页"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>BeatNex</span></a>
        <div className={`engine-status status-${snapshot.status}`} role="status" aria-live="polite"><span aria-hidden="true" />{statusLabel}</div>
      </header>

      <section className="hero" id="top">
        <div><p className="eyebrow">Boom Bap · Loop Lab</p><h1>听清每一层，<br /><em>踩进拍里。</em></h1><p className="intro">选择一个 Groove，四拍预备后直接开始。所有鼓点和播放指针都由同一条音频时间轴驱动。</p></div>
        <div className="now-card" aria-label="当前练习">
          <div className="now-meta"><span>当前练习</span><strong>{bpm} BPM</strong></div><h2>{selectedPattern.name}</h2>
          <p>{difficulty === 'simple' ? '稳定后拍与身体重心' : '加入切分、Ghost Note 与句尾推动'}</p>
          <div className="transport"><button className="play-button" onClick={isPlaying ? pause : play} disabled={isLoading}><Icon name={isPlaying ? 'pause' : 'play'} />{isLoading ? '加载中…' : isPlaying ? '暂停' : snapshot.status === 'paused' ? '继续' : '开始练习'}</button><button className="icon-button" onClick={stop} disabled={!canStop} aria-label="停止并回到开头"><Icon name="stop" /></button></div>
          <p className="count-in-note">{snapshot.isCountIn ? 'Count-in · 准备进入' : pendingChange ? '将在下一小节切换' : '首次播放包含一小节 Count-in'}</p>
        </div>
      </section>

      {snapshot.status === 'error' && <section className="error-banner" role="alert"><div><strong>鼓组没有准备好</strong><p>{snapshot.error}</p></div><button onClick={retry}>重试加载</button></section>}

      <section className="workspace" aria-label="节奏练习台">
        <div className="section-heading"><div><p className="section-kicker">01 / Groove</p><h2>选择 Pattern</h2></div><div className="difficulty-switch" aria-label="难度">{(['simple', 'hard'] as const).map((value) => <button key={value} aria-pressed={difficulty === value} onClick={() => setDifficulty(value)}>{value === 'simple' ? 'Simple' : 'Hard'}</button>)}</div></div>
        <div className="pattern-tabs">{PATTERN_NAMES.map((name, index) => <button key={name} className={patternName === name ? 'active' : ''} aria-pressed={patternName === name} onClick={() => choosePattern(name)}><span>0{index + 1}</span>{name}</button>)}</div>
        <div className="tempo-row"><label htmlFor="tempo">Tempo</label><input id="tempo" type="range" min="60" max="140" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /><output htmlFor="tempo">{bpm} <small>BPM</small></output></div>
        <div className="grid-shell"><div className="beat-numbers" aria-hidden="true"><span /><span>1</span><span>2</span><span>3</span><span>4</span></div><div className="rhythm-grid" aria-label={`${selectedPattern.name} 十六步节奏网格`}>
          {DRUM_IDS.map((drum) => { const track = selectedPattern.tracks.find((item) => item.drum === drum); return <div className="track-row" key={drum}><div className="track-name"><span>{drumLabels[drum].short}</span>{drumLabels[drum].name}</div><div className="steps">{Array.from({ length: 16 }, (_, step) => { const hit = track?.hits.find((item) => item.step === step); const current = isPlaying && !snapshot.isCountIn && snapshot.step === step; return <span key={step} className={`step ${hit ? 'hit' : ''} ${current ? 'current' : ''}`} data-velocity={hit?.velocity ?? 0} /> })}</div></div> })}
          <div className="playhead" style={{ '--progress': snapshot.isCountIn ? 0 : snapshot.progress } as CSSProperties} aria-hidden="true" />
        </div></div>
      </section>

      <section className="mixer" aria-labelledby="mixer-title"><div className="section-heading"><div><p className="section-kicker">02 / Layers</p><h2 id="mixer-title">分层聆听</h2></div><p className="section-copy">切换不会停止时间轴。Focus 会压低其他声部，适合专注听一层。</p></div><div className="channel-grid">
        {DRUM_IDS.map((drum) => <article className="channel" key={drum}><div className="channel-title"><span>{drumLabels[drum].short}</span><h3>{drumLabels[drum].name}</h3></div><label className="volume-label" htmlFor={`${drum}-volume`}><span>Volume</span><output>{Math.round(mixes[drum].volume * 100)}</output></label><input id={`${drum}-volume`} type="range" min="0" max="100" value={mixes[drum].volume * 100} onChange={(event) => updateMix(drum, { volume: Number(event.target.value) / 100 })} /><div className="mix-actions"><button aria-pressed={mixes[drum].solo} onClick={() => updateMix(drum, { solo: !mixes[drum].solo })}>Solo</button><button aria-pressed={mixes[drum].muted} onClick={() => updateMix(drum, { muted: !mixes[drum].muted })}>Mute</button><button aria-pressed={mixes[drum].focused} onClick={() => updateMix(drum, { focused: !mixes[drum].focused })}>Focus</button></div></article>)}
      </div></section>
    </main>
  )
}
