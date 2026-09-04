import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { bpmRangeForCategory, categoriesForView, practicesForCategory, type CatalogView } from '../core/content/catalog'
import { BOOM_BAP_PATTERNS, findPattern, PATTERN_NAMES } from '../core/pattern/fixtures'
import { DRUM_IDS, type Difficulty, type DrumId } from '../core/pattern/types'
import { DEFAULT_PHASES, TRAINING_PHASE_DEFINITIONS, resolveTrainingPhases, trainingBarMarks, trainingFrameAtCycle, trainingMixForPhase, trainingTotalBars, type TrainingPhaseId } from '../core/training/session'
import { useDrumMachine } from '../features/useDrumMachine'
import { readTrainingConfig, writeTrainingConfig } from '../storage/trainingConfig'
import { PhaseChipEditor } from './PhaseChipEditor'

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

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function formatLead(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)} ms`
}

type MobileTab = 'practice' | 'library' | 'tracks' | 'status'

function Icon({ name }: { name: 'play' | 'pause' | 'stop' | MobileTab }) {
  if (name === 'play') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z" /></svg>
  if (name === 'pause') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>
  if (name === 'stop') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
  if (name === 'practice') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3Zm1 4v6h5v-2h-3V7h-2Z" /></svg>
  if (name === 'library') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7ZM6 6v3h3V6H6Zm9 0v3h3V6h-3ZM6 15v3h3v-3H6Zm9 0v3h3v-3h-3Z" /></svg>
  if (name === 'tracks') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h10v2H4V5Zm0 6h16v2H4v-2Zm0 6h7v2H4v-2Zm13-14h2v6h-2V3Zm-5 12h2v6h-2v-6Z" /></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M11 10h2v7h-2v-7Zm0-4h2v2h-2V6Zm1-4a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" /></svg>
}

export function App() {
  const [initialConfig] = useState(() => readTrainingConfig(typeof window === 'undefined' ? undefined : window.localStorage))
  const [patternName, setPatternName] = useState(initialConfig.patternName)
  const [difficulty, setDifficulty] = useState<Difficulty>(initialConfig.difficulty)
  const selectedPattern = useMemo(() => findPattern(patternName, difficulty), [difficulty, patternName])
  const [bpm, setBpm] = useState(initialConfig.bpm)
  const [targetDrum, setTargetDrum] = useState<DrumId>(initialConfig.targetDrum)
  const [phaseConfig, setPhaseConfig] = useState(initialConfig.phases)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [editorStatus, setEditorStatus] = useState('')
  const trainingPhases = useMemo(() => resolveTrainingPhases(phaseConfig), [phaseConfig])
  const trainingBars = useMemo(() => trainingTotalBars(trainingPhases), [trainingPhases])
  const [mobileTab, setMobileTab] = useState<MobileTab>('practice')
  const [catalogView, setCatalogView] = useState<CatalogView>('dance')
  const [sessionStarted, setSessionStarted] = useState(false)
  const [feedback, setFeedback] = useState<'too-easy' | 'right' | 'too-hard'>()
  const { snapshot, mixes, pendingChange, play, restart, pause, stop, retry, updateMix, resetMixes, setTrainingMix } = useDrumMachine(selectedPattern, bpm)
  const trainingFrame = trainingFrameAtCycle(trainingPhases, sessionStarted, snapshot.isCountIn, snapshot.cycle)
  const diagnostics = snapshot.diagnostics ?? emptyDiagnostics
  const isPlaying = snapshot.status === 'playing'
  const isLoading = snapshot.status === 'loading'
  const canStop = isPlaying || snapshot.status === 'paused'
  const visualProgress = snapshot.isCountIn ? 0 : snapshot.progress
  const sessionProgress = trainingFrame.status === 'completed'
    ? 1
    : Math.min(1, (trainingFrame.completedBars + (trainingFrame.status === 'activePhase' || trainingFrame.status === 'phaseNotice' ? snapshot.progress : 0)) / trainingBars)
  const mixLocked = sessionStarted && trainingFrame.status !== 'completed'
  const editorLocked = sessionStarted
  const barMarks = useMemo(() => trainingBarMarks(trainingPhases), [trainingPhases])
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
    if (mobileTab === 'library') document.getElementById('library')?.scrollIntoView()
    else window.scrollTo({ top: 0, behavior: 'auto' })
  }, [mobileTab])

  useEffect(() => {
    try {
      const savedView = window.localStorage.getItem('beatnex:catalog-view')
      if (savedView === 'dance' || savedView === 'music') setCatalogView(savedView)
    } catch { /* Keep the default view when browser storage is unavailable. */ }
  }, [])

  useEffect(() => {
    writeTrainingConfig({ version: 1, targetDrum, phases: phaseConfig, patternName, difficulty, bpm }, typeof window === 'undefined' ? undefined : window.localStorage)
  }, [bpm, difficulty, patternName, phaseConfig, targetDrum])

  useEffect(() => {
    if (!addMenuOpen) return
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('.add-phase-wrap')) setAddMenuOpen(false)
    }
    const dismissWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAddMenuOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismissWithKeyboard)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismissWithKeyboard)
    }
  }, [addMenuOpen])

  useEffect(() => {
    if (editorLocked) setAddMenuOpen(false)
  }, [editorLocked])

  useEffect(() => {
    if (trainingFrame.status === 'phaseNotice' && trainingFrame.nextPhase) {
      setTrainingMix(trainingMixForPhase(trainingFrame.nextPhase, targetDrum), 'next-bar')
    }
  }, [setTrainingMix, targetDrum, trainingFrame.nextPhase, trainingFrame.status])

  const beginTraining = async () => {
    resetMixes()
    setTrainingMix(trainingMixForPhase(trainingPhases[0], targetDrum))
    setFeedback(undefined)
    setSessionStarted(true)
    await play()
  }

  const restartTraining = async () => {
    resetMixes()
    setTrainingMix(trainingMixForPhase(trainingPhases[0], targetDrum))
    setFeedback(undefined)
    setSessionStarted(true)
    await restart()
  }

  const togglePlayback = () => {
    if (isPlaying) pause()
    else if (snapshot.status === 'paused') void play()
    else void beginTraining()
  }

  const stopTraining = () => {
    stop()
    setTrainingMix(undefined)
    setSessionStarted(false)
    setFeedback(undefined)
  }

  const endTrainingForSelection = () => {
    if (!sessionStarted) return
    stopTraining()
  }

  const choosePattern = (name: string) => {
    endTrainingForSelection()
    setPatternName(name)
    const next = BOOM_BAP_PATTERNS.find((item) => item.name === name && item.difficulty === difficulty)
    if (next) setBpm(next.recommendedBpm)
  }

  const chooseMobileTab = (tab: MobileTab) => {
    setMobileTab(tab)
  }

  const openLibrary = () => {
    setMobileTab('library')
  }

  const chooseCatalogView = (view: CatalogView) => {
    setCatalogView(view)
    try { window.localStorage.setItem('beatnex:catalog-view', view) } catch { /* Browsing still works without persistence. */ }
  }

  const choosePractice = (name: string) => {
    choosePattern(name)
    setMobileTab('practice')
  }

  const chooseDifficulty = (value: Difficulty) => {
    endTrainingForSelection()
    setDifficulty(value)
  }

  const chooseTargetDrum = (value: DrumId) => { endTrainingForSelection(); setTargetDrum(value) }

  const submitFeedback = (value: 'too-easy' | 'right' | 'too-hard') => {
    setFeedback(value)
    try { window.localStorage.setItem('beatnex:last-training-feedback', value) } catch { /* Feedback remains visible for this session. */ }
  }

  const updatePhase = (instanceId: string, bars: number) => setPhaseConfig((items) => items.map((item) => item.instanceId === instanceId ? { ...item, bars: Math.max(1, Math.min(32, Math.round(bars || 1))) } : item))
  const removePhase = (instanceId: string) => setPhaseConfig((items) => items.length === 1 ? items : items.filter((item) => item.instanceId !== instanceId))
  const reorderPhase = (from: number, to: number) => {
    if (editorLocked || from === to || from < 0 || to < 0 || from >= phaseConfig.length || to >= phaseConfig.length) return
    setPhaseConfig((items) => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next })
  }
  const addPhase = (id: TrainingPhaseId) => setPhaseConfig((items) => [...items, { id, instanceId: `${id}-${Date.now()}-${items.length}`, bars: 4 }])
  const resetPhases = () => setPhaseConfig(DEFAULT_PHASES.map((phase) => ({ ...phase })))

  const visibleCategories = categoriesForView(catalogView)

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BeatNex 首页"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>BeatNex</span></a>
        <div className="top-actions"><button onClick={openLibrary}>练习库</button><div className={`engine-status status-${snapshot.status}`} role="status" aria-live="polite"><span aria-hidden="true" />{statusLabel}</div></div>
      </header>

      <section className={`hero mobile-panel ${mobileTab === 'practice' ? 'mobile-panel-active' : ''}`} id="top">
        <div className="hero-copy"><p className="eyebrow">Boom Bap · Loop Lab</p><h1>听清每一层，<br /><em>保持节拍。</em></h1><p className="intro">选择目标鼓和阶段组合，四拍预备后开始；鼓点与播放指针共用同一条音频时间轴。</p></div>
        <div className="now-card" aria-label="当前练习">
          <div className="now-meta"><span>当前练习</span><strong>{bpm} BPM</strong></div><h2>{selectedPattern.name}</h2>
          <p>{difficulty === 'simple' ? '清晰后拍与稳定脉冲' : '加入切分、Ghost Note 与句尾推动'}</p>
          <dl className="practice-facts" aria-label="推荐练习信息">
            <div><dt>目标鼓</dt><dd>{drumLabels[targetDrum].name}</dd></div>
            <div><dt>阶段</dt><dd>{trainingPhases.length} 个 / {trainingBars} 小节</dd></div>
            <div><dt>难度</dt><dd>{difficulty === 'simple' ? 'Simple' : 'Hard'}</dd></div>
          </dl>
          <div className="transport"><button className="play-button" onClick={togglePlayback} disabled={isLoading}><Icon name={isPlaying ? 'pause' : 'play'} />{isLoading ? '加载中…' : isPlaying ? '暂停' : snapshot.status === 'paused' ? '继续' : '开始练习'}</button><button className="icon-button" onClick={stopTraining} disabled={!canStop} aria-label="停止并回到开头"><Icon name="stop" /></button></div>
          <p className="count-in-note">{snapshot.isCountIn ? 'Count-in · 准备进入' : pendingChange ? '将在下一小节切换' : '首次播放包含一小节 Count-in'}</p>
        </div>
      </section>

      {snapshot.status === 'error' && <section className="error-banner" role="alert"><div><strong>鼓组没有准备好</strong><p>{snapshot.error}</p></div><button onClick={retry}>重试加载</button></section>}

      <section className={`training-panel mobile-panel ${mobileTab === 'practice' ? 'mobile-panel-active' : ''}`} aria-labelledby="training-title">
        <div className="training-summary">
          <div><p className="section-kicker">Guided Session</p><h2 id="training-title">{trainingFrame.status === 'completed' ? '训练完成' : `${trainingFrame.phase.label} · ${drumLabels[targetDrum].name}`}</h2></div>
          <span>{trainingFrame.status === 'notStarted' ? `${trainingPhases.length} 个阶段` : trainingFrame.status === 'countIn' ? 'Count-in' : trainingFrame.status === 'completed' ? `${trainingBars} / ${trainingBars} 小节` : `${trainingFrame.barInPhase} / ${trainingFrame.phase.bars} 小节`}</span>
        </div>
        <div className="guide-targets" role="group" aria-label="目标鼓">{DRUM_IDS.map((drum) => <button key={drum} disabled={editorLocked} aria-pressed={targetDrum === drum} onClick={() => chooseTargetDrum(drum)}>{drumLabels[drum].name}</button>)}</div>
        <div className="session-progress" role="progressbar" aria-label="跟练进度" aria-valuemin={0} aria-valuemax={trainingBars} aria-valuenow={Math.round(sessionProgress * trainingBars)}><i style={{ '--session-progress': sessionProgress } as CSSProperties} /><span className="bar-ticks" aria-hidden="true">{barMarks.map(({ bar, isPhaseBoundary }) => <b key={bar} className={isPhaseBoundary ? 'phase-boundary' : ''} style={{ left: `${bar / trainingBars * 100}%` }} />)}</span></div>
        <PhaseChipEditor phases={trainingPhases} locked={editorLocked} activeIndex={trainingFrame.phaseIndex} sessionStarted={sessionStarted} completed={trainingFrame.status === 'completed'} onBarsChange={updatePhase} onReorder={reorderPhase} onDelete={removePhase} onStatus={setEditorStatus}>
          <div className="add-phase-wrap"><button className="add-phase-chip" disabled={editorLocked} aria-expanded={addMenuOpen} aria-label="添加训练阶段" onClick={() => setAddMenuOpen((value) => !value)}>＋</button>{addMenuOpen && !editorLocked && <div className="add-phase-menu">{TRAINING_PHASE_DEFINITIONS.map((definition) => <button key={definition.id} onClick={() => { addPhase(definition.id); setAddMenuOpen(false) }}>+ {definition.label}</button>)}</div>}</div>
        </PhaseChipEditor>
        {!editorLocked && <button className="reset-phases" onClick={resetPhases}>恢复默认组合</button>}
        <p className="sr-only" role="status" aria-live="polite">{editorStatus}</p>
        <div className="phase-instruction" aria-live="polite">
          <span>{trainingFrame.status === 'notStarted' ? '准备' : trainingFrame.status === 'countIn' ? '预备小节' : trainingFrame.status === 'phaseNotice' ? '下一小节' : trainingFrame.status === 'completed' ? '自我检查' : '当前任务'}</span>
          <p>{trainingFrame.status === 'notStarted' ? `点击“开始练习”，四拍预备后播放 ${trainingPhases[0].sound(drumLabels[targetDrum].name)}。` : trainingFrame.status === 'countIn' ? `Count-in 结束后开始 ${trainingPhases[0].label}。` : trainingFrame.status === 'phaseNotice' && trainingFrame.nextPhase ? `下一小节：${trainingFrame.nextPhase.sound(drumLabels[targetDrum].name)}。${trainingFrame.nextPhase.task(drumLabels[targetDrum].name)}` : trainingFrame.status === 'completed' ? '课程已完成。回想目标鼓的节拍位置，选择本轮难度；系统不会分析用户行为。' : `${trainingFrame.phase.sound(drumLabels[targetDrum].name)}。${trainingFrame.phase.task(drumLabels[targetDrum].name)}。`}</p>
        </div>
        {trainingFrame.status === 'completed' && <div className="completion-actions"><div className="feedback-actions" role="group" aria-label="本轮练习难度"><button aria-pressed={feedback === 'too-easy'} onClick={() => submitFeedback('too-easy')}>太简单</button><button aria-pressed={feedback === 'right'} onClick={() => submitFeedback('right')}>合适</button><button aria-pressed={feedback === 'too-hard'} onClick={() => submitFeedback('too-hard')}>太难</button></div><button className="restart-button" onClick={() => void restartTraining()}>再练一次</button></div>}
      </section>

      <section className={`workspace mobile-panel ${mobileTab === 'practice' ? 'mobile-panel-active' : ''}`} aria-label="节奏练习台">
        <div className="section-heading"><div><p className="section-kicker">01 / Groove</p><h2>选择 Pattern</h2></div><div className="difficulty-switch" aria-label="难度">{(['simple', 'hard'] as const).map((value) => <button key={value} aria-pressed={difficulty === value} onClick={() => chooseDifficulty(value)}>{value === 'simple' ? 'Simple' : 'Hard'}</button>)}</div></div>
        <div className="pattern-tabs">{PATTERN_NAMES.map((name, index) => <button key={name} className={patternName === name ? 'active' : ''} aria-pressed={patternName === name} onClick={() => choosePattern(name)}><span>0{index + 1}</span>{name}</button>)}</div>
        <div className="tempo-row"><label htmlFor="tempo">Tempo</label><input id="tempo" type="range" min="60" max="140" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /><output htmlFor="tempo">{bpm} <small>BPM</small></output></div>
      </section>

      <section className={`library-panel mobile-panel ${mobileTab === 'library' ? 'mobile-panel-active' : ''}`} id="library" aria-labelledby="library-title">
        <div className="section-heading library-heading"><div><p className="section-kicker">02 / Library</p><h2 id="library-title">练习库</h2></div><p className="section-copy">按音乐类别和节奏语言找到同一份可复现练习。</p></div>
        <div className="catalog-switch" role="group" aria-label="练习库分类视角">
          <button aria-pressed={catalogView === 'dance'} onClick={() => chooseCatalogView('dance')}>舞种</button>
          <button aria-pressed={catalogView === 'music'} onClick={() => chooseCatalogView('music')}>音乐</button>
        </div>
        <div className="category-grid">
          {visibleCategories.map((category) => {
            const practices = practicesForCategory(category.id)
            const bpmRange = bpmRangeForCategory(category.id)
            return <article className="category-card" key={category.id}>
              <div className="category-card-top"><span>{catalogView === 'dance' ? '舞种' : '音乐'}</span><strong>{practices.length} 个练习</strong></div>
              <h3>{category.name}</h3><p>{category.description}</p>
              <div className="category-meta"><span>{bpmRange ? `${bpmRange[0]}–${bpmRange[1]} BPM` : 'BPM 待补充'}</span><span>Simple / Hard</span></div>
              <p className="category-guidance">{category.guidance}</p>
              <div className="practice-list" aria-label={`${category.name} 可用练习`}>
                {practices.map((practice) => <div className="practice-item" key={practice.id}><div><strong>{practice.name}</strong><span>{practice.patterns[0]?.recommendedBpm} BPM · 约 5 分钟</span></div><button onClick={() => choosePractice(practice.name)}>{patternName === practice.name ? '当前练习' : '选择练习'}</button></div>)}
              </div>
            </article>
          })}
        </div>
      </section>

      <section className={`tracks-panel mobile-panel ${mobileTab === 'tracks' ? 'mobile-panel-active' : ''}`} aria-labelledby="tracks-title">
        <div className="section-heading"><div><p className="section-kicker">03 / Tracks</p><h2 id="tracks-title">轨道与分层</h2></div><p className="section-copy">音量与听音操作紧跟所属轨道，调整时不必在网格和调音台之间来回寻找。</p></div>
        <div className="grid-shell"><div className="beat-numbers" aria-hidden="true"><span /><span>1</span><span>2</span><span>3</span><span>4</span><span /></div><div className={`rhythm-grid visual-${sessionStarted ? trainingFrame.phase.visualMode : 'full'}`} aria-label={`${selectedPattern.name} 十六步节奏网格`} data-audio-step={snapshot.step} data-audio-cycle={snapshot.cycle} data-audio-progress={visualProgress} data-training-phase={trainingFrame.phase.id}>
          {DRUM_IDS.map((drum) => { const track = selectedPattern.tracks.find((item) => item.drum === drum); return <article className={`track-row ${drum === targetDrum ? 'training-target' : ''}`} key={drum}><div className="track-name"><span>{drumLabels[drum].short}</span><strong>{drumLabels[drum].name}</strong></div><div className="steps">{Array.from({ length: 16 }, (_, step) => { const hit = track?.hits.find((item) => item.step === step); const current = isPlaying && !snapshot.isCountIn && snapshot.step === step; return <span key={step} className={`step ${hit ? 'hit' : ''} ${current ? 'current' : ''}`} data-step={step} data-velocity={hit?.velocity ?? 0} /> })}</div><div className="track-mix"><label className="volume-label" htmlFor={`${drum}-volume`}><span>Volume</span><output>{Math.round(mixes[drum].volume * 100)}</output></label><input id={`${drum}-volume`} aria-label={`${drumLabels[drum].name} 音量`} type="range" min="0" max="100" value={mixes[drum].volume * 100} onChange={(event) => updateMix(drum, { volume: Number(event.target.value) / 100 })} /><div className="mix-actions"><button disabled={mixLocked} aria-label={`${drumLabels[drum].name} Solo`} aria-pressed={mixes[drum].solo} onClick={() => updateMix(drum, { solo: !mixes[drum].solo })}>S</button><button disabled={mixLocked} aria-label={`${drumLabels[drum].name} Mute`} aria-pressed={mixes[drum].muted} onClick={() => updateMix(drum, { muted: !mixes[drum].muted })}>M</button><button disabled={mixLocked} aria-label={`${drumLabels[drum].name} Focus`} aria-pressed={mixes[drum].focused} onClick={() => updateMix(drum, { focused: !mixes[drum].focused })}>F</button></div></div></article> })}
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

      <div className="mobile-transport" aria-label="移动端走带控制"><div><strong>{sessionStarted ? trainingFrame.phase.label : selectedPattern.name}</strong><span>{bpm} BPM · {snapshot.isCountIn ? 'Count-in' : sessionStarted ? `${trainingFrame.barInPhase}/${trainingFrame.phase.bars} 小节` : `第 ${snapshot.step + 1} 步`}</span></div><button className="mobile-play" onClick={togglePlayback} disabled={isLoading}><Icon name={isPlaying ? 'pause' : 'play'} /><span>{isLoading ? '加载中…' : isPlaying ? '暂停' : snapshot.status === 'paused' ? '继续' : '开始练习'}</span></button><button className="mobile-stop" onClick={stopTraining} disabled={!canStop} aria-label="停止并回到开头"><Icon name="stop" /></button></div>
      <nav className="mobile-tabs" aria-label="主要页面">{([{ id: 'practice', label: '练习' }, { id: 'library', label: '练习库' }, { id: 'tracks', label: '轨道' }, { id: 'status', label: '状态' }] as const).map((tab) => <button key={tab.id} onClick={() => chooseMobileTab(tab.id)} aria-current={mobileTab === tab.id ? 'page' : undefined}><Icon name={tab.id} /><span>{tab.label}</span></button>)}</nav>
    </main>
  )
}
