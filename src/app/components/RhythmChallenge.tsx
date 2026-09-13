import {Icon} from './Icons'
import {RhythmStaff} from './RhythmStaff'
import {useEffect, useRef, useState} from 'react'
import {CHALLENGES, hitSteps, type Challenge} from '../../core/challenge/challenge'
import type {RhythmChallenge as ChallengeState} from '../../features/useRhythmChallenge'
import './rhythm-challenge.css'
export function ChallengeCards({onStart, selected, disabled = false}: {onStart: (id: string) => void; selected?: string; disabled?: boolean}) {
  return <section className="rc-catalog" aria-label="四个节奏挑战"><div className="rc-heading"><h2>选择节奏</h2><span>选一张卡，直接开始</span></div><div className="rc-cards">{CHALLENGES.map((c,i) => <article className="rc-card" key={c.id} data-selected={selected === c.id}><span className="rc-number">0{i+1}</span><div><h3>节奏 {String(i+1).padStart(2,'0')}</h3><p>{c.hint}</p><button type="button" disabled={disabled} aria-label={`开始挑战：${c.name}`} onClick={()=>onStart(c.id)}>播放 <span aria-hidden="true">↗</span></button></div></article>)}</div></section>
}
function Phrase({challenge, step, active = false}: {challenge: Challenge; step: number; active?: boolean}) {
  const hits = hitSteps(challenge.tokens)
  return <div className="rc-phrase" role="img" aria-label={`${challenge.name}，两小节，实心圆为击打，短横线为无击打位置`}>
    {[0,1].map(bar => <div className="rc-bar" key={bar}><span className="rc-bar-label">第 {bar+1} 小节</span><div className="rc-beat-grid">{[0,1,2,3].map(beat => <div className="rc-beat" key={beat}>{[0,1,2,3].map(part => {const index=bar*16+beat*4+part;return <span className="rc-cell" key={part} data-current={active&&Math.floor(step)===index} data-hit={hits.includes(index)}><small>{part===0?beat+1:['','e','&','a'][part]}</small><b>{hits.includes(index)?'●':'—'}</b></span>})}</div>)}</div><div className="rc-cursor" aria-hidden="true" style={{left:`${Math.max(0,Math.min(16,step-bar*16))/16*100}%`,opacity:active&&step>=bar*16&&step<(bar+1)*16?1:0}}/></div>)}
  </div>
}
export function RhythmChallenge({state}: {state: ChallengeState}) {
  const {data,challenge,status,position,error,storageError}=state
  const settings=data.settings, locked=status==='playing'||status==='loading'
  const heading=useRef<HTMLDivElement>(null), previous=useRef(challenge.id)
  useEffect(()=>{if(previous.current!==challenge.id){previous.current=challenge.id;heading.current?.focus()}},[challenge.id])
  const [tempo, setTempo] = useState(String(settings.bpm))
  useEffect(()=>setTempo(String(settings.bpm)),[settings.bpm])
  const commitTempo = () => {
    const value = tempo.trim() === '' ? settings.bpm : Number(tempo)
    const bpm = Number.isFinite(value) ? Math.max(40, Math.min(180, Math.round(value))) : settings.bpm
    setTempo(String(bpm))
    if (bpm !== settings.bpm) state.update({bpm})
  }
  const ready=status==='ready', complete=status==='complete'
  const playLabel=status==='loading'?'取消开启':status==='playing'?'暂停播放':complete?'重新播放':status==='paused'?'继续播放':'开始播放'
  const counting=Boolean(settings.countIn)&&position.countIn&&status==='playing'
  return <section className="rc-workspace" aria-label="节奏挑战练习">
    <article className="rc-player">
      <div className="rc-console">
        <div className="rc-console-top"><span className="rc-label">NO. {String(CHALLENGES.findIndex(c=>c.id===challenge.id)+1).padStart(2,'0')}</span><svg className="rc-ink-tag" viewBox="0 0 120 28" aria-hidden="true"><path d="m8 18 39-10-21 15L77 5 57 23l44-11"/><path className="rc-ink-trail" d="m6 26 103-3"/><circle cx="114" cy="7" r="2"/><circle cx="117" cy="18" r="1"/></svg><span>4/4 · 2 小节</span></div>
        <div className="rc-toolbar" role="group" aria-label="节奏工具栏" ref={heading} tabIndex={-1}>
          <div className="rc-main-tools">
          <div className="rc-transport">
            <button className="rc-primary" type="button" aria-label={playLabel} title={playLabel} aria-busy={status==='loading'} onClick={()=>locked?state.pause():void state.play()}><Icon name={status==='playing'?'pause':status==='loading'?'reset':'play'}/></button>
            <button type="button" aria-label="回到开始" title="回到开始" disabled={ready} onClick={state.reset}><Icon name="reset"/></button>
          </div>
          <fieldset className="rc-tempo" disabled={locked} aria-label="播放速度">
            <div className="rc-tempo-controls">
              <button type="button" aria-label="降低速度" disabled={settings.bpm<=40} onClick={()=>state.update({bpm:settings.bpm-1})}>−</button>
              <label><input type="number" inputMode="numeric" min={40} max={180} step={1} aria-label="挑战速度" value={tempo} onChange={e=>setTempo(e.target.value)} onBlur={commitTempo} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/><span>BPM</span></label>
              <button type="button" aria-label="提高速度" disabled={settings.bpm>=180} onClick={()=>state.update({bpm:settings.bpm+1})}>+</button>
            </div>
          </fieldset>
          </div>
          <div className="rc-settings">
            <label className="rc-tone-control"><select aria-label="音色" disabled={locked} value={settings.sound} onChange={e=>state.update({sound:e.target.value as 'click'|'clap'|'drum'})}><option value="click">节拍器</option><option value="clap">拍手</option><option value="drum">鼓声</option></select></label>
            <div className="rc-loop-mode" role="group" aria-label="播放方式"><button type="button" disabled={locked} aria-label={settings.repeat?'无限循环':'只播一次'} aria-pressed={Boolean(settings.repeat)} onClick={()=>state.update({repeat:!settings.repeat})}><span>循环</span><span className="rc-toggle" aria-hidden="true"/></button></div>
            <label className="rc-display-switch rc-preparation"><span>预备音</span><input type="checkbox" role="switch" aria-label="播放四拍预备音" disabled={locked} checked={Boolean(settings.countIn)} onChange={e=>state.update({countIn:e.target.checked})}/></label>
          </div>
          <div className="rc-playback-status">
            <span role="status">{counting?'准备进入':status==='playing'?`第 ${position.round} 轮 · 第 ${Math.min(2,Math.floor(position.phraseStep/16)+1)} 小节`:status==='loading'?'正在准备音频…':status==='paused'?'已暂停 · 可调整设置':complete?'本轮播放结束':'点击播放 · 跟着节奏走'}</span>
            <div className="rc-count-in" role="img" hidden={!counting} aria-label={counting ? `预备音，第 ${Math.min(4,Math.floor(position.step/4)+1)} 拍` : '四拍预备音'}>{[0,1,2,3].map(beat=><i key={beat} aria-hidden="true" data-current={counting&&Math.floor(position.step/4)===beat}/>)}</div>
          </div>
        </div>
      </div>
    {error&&<p role="alert" className="rc-error">{error}</p>}
    <section className="rc-notation" aria-label="节奏图"><div className="rc-heading"><h2>节奏图</h2><label className="rc-display-switch rc-view-control"><span>五线谱</span><input type="checkbox" role="switch" aria-label="五线谱显示" checked={(settings.display??'staff')==='staff'} onChange={e=>state.setDisplay(e.target.checked?'staff':'grid')}/></label></div><p>{(settings.display??'staff')==='grid'?'圆点发声 · 横线留空':'音符发声 · 休止符静音'}</p>{(settings.display??'staff')==='grid'?<Phrase challenge={challenge} step={position.phraseStep} active={status==='playing'&&!position.countIn}/>:<RhythmStaff challenge={challenge} step={position.phraseStep} active={status==='playing'&&!position.countIn}/>}</section>
    </article>
    {storageError&&<p role="alert" className="rc-error">{storageError}</p>}
    <ChallengeCards selected={challenge.id} disabled={locked} onStart={id=>void state.play(id)}/>
  </section>
}
