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
  return <section className="rc-workspace" aria-label="节奏挑战练习">
    <article className="rc-player"><div className="rc-heading"><span className="rc-label">节奏播放</span><span>{settings.bpm} BPM · 约 {Math.ceil((settings.rounds*8)*60/settings.bpm)} 秒</span></div><h1 ref={heading} tabIndex={-1}>{challenge.name}</h1>
    <div className="rc-transport"><button className="rc-primary" type="button" aria-busy={status==='loading'} onClick={()=>locked?state.pause():void state.play()}>{status==='loading'?'取消开启':status==='playing'?'暂停播放':complete?'重新播放':status==='paused'?'继续播放':'开始播放'}</button><button type="button" disabled={ready} onClick={state.reset}>回到开始</button></div>
    {error&&<p role="alert" className="rc-error">{error}</p>}
    <section className="rc-notation" aria-label="节奏图"><div className="rc-heading"><h2>节奏图</h2><label className="rc-display-switch"><span>点线</span><input type="checkbox" role="switch" aria-label="五线谱显示" checked={(settings.display??'staff')==='staff'} onChange={e=>state.setDisplay(e.target.checked?'staff':'grid')}/><span>五线谱</span></label></div><p>{(settings.display??'staff')==='grid'?'圆点表示发声，横线表示无击打。':'音符表示发声，休止符表示静音。'}空拍没有声音，指针继续走。</p>{(settings.display??'staff')==='grid'?<Phrase challenge={challenge} step={position.phraseStep} active={status==='playing'}/>:<RhythmStaff challenge={challenge} step={position.phraseStep} active={status==='playing'}/>}</section>
    </article>
    <details className="rc-settings"><summary>调整声音和速度 <span>{locked?'先暂停再调整':`${settings.bpm} BPM · ${settings.rounds} 次`}</span></summary>
    <fieldset disabled={locked}><legend>播放声音</legend><div className="rc-sounds">{(['click','clap','drum'] as const).map((sound,i)=><button type="button" key={sound} aria-pressed={settings.sound===sound} onClick={()=>state.update({sound})}>{['节拍器','拍手','鼓声'][i]}</button>)}</div><p>节拍器声音与跷跷板相同。</p></fieldset>
    <fieldset disabled={locked}><legend>播放速度与次数</legend><label className="rc-range">速度（BPM） <output>{settings.bpm} BPM</output><input type="range" min={40} max={180} step={1} value={settings.bpm} aria-label="挑战速度" aria-valuetext={`${settings.bpm} BPM`} onChange={e=>state.update({bpm:Number(e.target.value)})}/></label><div className="rc-tempo-buttons"><button type="button" disabled={settings.bpm<=40} onClick={()=>state.update({bpm:Math.max(40,settings.bpm-5)})} aria-label="减慢 5 BPM">−5</button><button type="button" onClick={()=>state.update({bpm:90})} disabled={settings.bpm===90}>90 BPM</button><button type="button" disabled={settings.bpm>=180} onClick={()=>state.update({bpm:Math.min(180,settings.bpm+5)})} aria-label="加快 5 BPM">+5</button></div><label className="rc-repeat">播放次数<select value={settings.rounds} onChange={e=>state.update({rounds:Number(e.target.value)})}>{[1,2,3,4].map(n=><option value={n} key={n}>{n} 次</option>)}</select></label><p>每次播放两小节。修改次数会回到开始。</p></fieldset>

    {storageError&&<p role="alert" className="rc-error">{storageError}</p>}
    </details>
    <ChallengeCards selected={challenge.id} disabled={locked} onStart={id=>void state.play(id)}/>
  </section>
}
