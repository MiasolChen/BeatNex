import {TempoWheel} from './TempoWheel'
import {Icon} from './Icons'
import {RhythmStaff} from './RhythmStaff'
import {useEffect, useRef} from 'react'
import {CHALLENGES, hitSteps, type Challenge} from '../../core/challenge/challenge'
import type {RhythmChallenge as ChallengeState} from '../../features/useRhythmChallenge'
import './rhythm-challenge.css'
export function ChallengeCards({onStart, selected, disabled = false}: {onStart: (id: string) => void; selected?: string; disabled?: boolean}) {
  return <section className="rc-catalog" aria-label="四个节奏挑战"><div className="rc-heading"><h2>选择节奏</h2><span>选一张卡，直接开始</span></div><div className="rc-cards">{CHALLENGES.map((c,i) => <article className="rc-card" key={c.id} data-selected={selected === c.id}><span className="rc-number">0{i+1}</span><div><h3>{c.name}</h3><p>{c.hint}</p><button type="button" disabled={disabled} aria-label={`开始挑战：${c.name}`} onClick={()=>onStart(c.id)}>播放 <span aria-hidden="true">↗</span></button></div></article>)}</div></section>
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
  const heading=useRef<HTMLHeadingElement>(null), previous=useRef(challenge.id)
  useEffect(()=>{if(previous.current!==challenge.id){previous.current=challenge.id;heading.current?.focus()}},[challenge.id])
  const ready=status==='ready', complete=status==='complete'
  const playLabel=status==='loading'?'取消开启':status==='playing'?'暂停播放':complete?'重新播放':status==='paused'?'继续播放':'开始播放'
  return <section className="rc-workspace" aria-label="节奏挑战练习">
    <article className="rc-player"><div className="rc-console"><div className="rc-heading"><span className="rc-label">节奏播放</span><span>{settings.bpm} BPM · {settings.repeat?'无限循环':`约 ${Math.ceil((8+(settings.countIn?4:0))*60/settings.bpm)} 秒`}</span></div><h1 ref={heading} tabIndex={-1}>{challenge.name}</h1>
    <div className="rc-toolbar" role="group" aria-label="节奏工具栏">
    <div className="rc-transport"><button className="rc-primary" type="button" aria-label={playLabel} title={playLabel} aria-busy={status==='loading'} onClick={()=>locked?state.pause():void state.play()}><Icon name={status==='playing'?'pause':status==='loading'?'reset':'play'}/></button><button type="button" aria-label="回到开始" title="回到开始" disabled={ready} onClick={state.reset}><Icon name="reset"/></button></div>
<div className="rc-loop-mode" role="group" aria-label="播放方式"><button type="button" disabled={locked} aria-label={settings.repeat?'无限循环':'只播一次'} title="切换单次 / 无限循环" aria-pressed={Boolean(settings.repeat)} onClick={()=>state.update({repeat:!settings.repeat})}><span aria-hidden="true">{settings.repeat?'∞':'1×'}</span></button></div><label className="rc-display-switch rc-view-control" title="切换点线 / 五线谱"><input type="checkbox" role="switch" aria-label="五线谱显示" checked={(settings.display??'staff')==='staff'} onChange={e=>state.setDisplay(e.target.checked?'staff':'grid')}/><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h20M2 9h20M2 13h20M2 17h20M2 21h20M15 4v12"/><ellipse cx="12" cy="17" rx="3" ry="2"/></svg></label>
    <label className="rc-tool rc-tone-control"><select aria-label="音色" disabled={locked} value={settings.sound} onChange={e=>state.update({sound:e.target.value as 'click'|'clap'|'drum'})}><option value="click">节拍器</option><option value="clap">拍手</option><option value="drum">鼓声</option></select></label>
    <fieldset className="rc-tempo-wheel" disabled={locked} aria-label="播放速度"><TempoWheel value={settings.bpm} min={40} max={180} onChange={bpm=>state.update({bpm})} label="挑战速度" compact/></fieldset>
    <div className="rc-preparation"><label className="rc-display-switch" title="四拍预备音"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3zM10 21h4M12 1v2"/></svg><input type="checkbox" role="switch" aria-label="播放四拍预备音" disabled={locked} checked={Boolean(settings.countIn)} onChange={e=>state.update({countIn:e.target.checked})}/></label>
    <div className="rc-count-in" role="img" aria-label={settings.countIn ? position.countIn&&status==='playing' ? `预备音，第 ${Math.min(4,Math.floor(position.step/4)+1)} 拍` : '四拍预备音' : '预备音已关闭'} data-enabled={Boolean(settings.countIn)}>{[0,1,2,3].map(beat=><i key={beat} aria-hidden="true" data-current={Boolean(settings.countIn)&&position.countIn&&status==='playing'&&Math.floor(position.step/4)===beat}/>)}</div></div>
    </div>

    </div>
    {error&&<p role="alert" className="rc-error">{error}</p>}
    <section className="rc-notation" aria-label="节奏图"><div className="rc-heading"><h2>节奏图</h2></div><p>{(settings.display??'staff')==='grid'?'圆点表示发声，横线表示无击打。':'音符表示发声，休止符表示静音。'}空拍没有声音，指针继续走。</p>{(settings.display??'staff')==='grid'?<Phrase challenge={challenge} step={position.phraseStep} active={status==='playing'&&!position.countIn}/>:<RhythmStaff challenge={challenge} step={position.phraseStep} active={status==='playing'&&!position.countIn}/>}</section>
    </article>
    {storageError&&<p role="alert" className="rc-error">{storageError}</p>}
    <ChallengeCards selected={challenge.id} disabled={locked} onStart={id=>void state.play(id)}/>
  </section>
}
