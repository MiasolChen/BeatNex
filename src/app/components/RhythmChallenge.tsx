import {useEffect, useRef} from 'react'
import {CHALLENGES, hitSteps, type Challenge} from '../../core/challenge/challenge'
import type {RhythmChallenge as ChallengeState} from '../../features/useRhythmChallenge'
import './rhythm-challenge.css'
export function ChallengeCards({onStart, selected, disabled = false}: {onStart: (id: string) => void; selected?: string; disabled?: boolean}) {
  return <section className="rc-catalog" aria-label="四个节奏挑战"><div className="rc-heading"><h2>换一段节奏练习</h2><span>选一张卡，直接开始</span></div><div className="rc-cards">{CHALLENGES.map((c,i) => <article className="rc-card" key={c.id} data-selected={selected === c.id}><span className="rc-number">0{i+1}</span><div><h3>{c.name}</h3><p>{c.hint}</p><button type="button" disabled={disabled} aria-label={`开始挑战：${c.name}`} onClick={()=>onStart(c.id)}>练这段 <span aria-hidden="true">↗</span></button></div></article>)}</div></section>
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
  const referenceAudible=settings.reference&&settings.volume>0
  const titles=['先听，不用拍','跟着声音拍手','声音停了，自己继续','继续拍，听听是否合上']
  const descriptions=['记住这段节奏，下一遍再跟着拍。','每听到一下，就拍一下手或轻敲桌面。',referenceAudible?'按刚才的节奏拍手。轻声滴答只是帮你保持速度。':'按刚才记住的节奏继续拍手，不要停。','示范声回来了，听听你的拍手是否和它重合。']
  const ready=status==='ready', complete=status==='complete'
  const hits=hitSteps(challenge.tokens)
  const sounding=status==='playing'&&!position.countIn&&position.phase!==2&&hits.includes(Math.floor(position.phraseStep))&&position.phraseStep%1<0.65
  const title=complete?'这一段练完了':ready?'用拍手，模仿一段节奏':status==='loading'?'正在开启声音…':status==='paused'?'已暂停，准备好再继续':position.countIn?'准备，数完四拍开始听':titles[position.phase]
  const description=complete?'回想刚才的练习，选一个最接近的感受。':ready?'可以拍手，也可以轻敲桌面。不需要点击屏幕。':status==='paused'?'点继续后，从刚才停下的位置接着练。':position.countIn?'先不用拍手，接下来会播放一遍示范。':descriptions[position.phase]
  return <section className="rc-workspace" aria-label="节奏挑战练习">
    <article className="rc-player"><div className="rc-heading"><span className="rc-label">节奏模仿练习</span><span>{settings.bpm} BPM · 约 {Math.ceil((4+settings.rounds*32)*60/settings.bpm)} 秒</span></div><h1 ref={heading} tabIndex={-1}>{challenge.name}</h1>
    <div className="rc-stage" role="status" aria-live="polite"><strong>{title}</strong><span>{description}</span></div>
    <ol className="rc-phases" aria-label="练习顺序">{['先听一遍','跟着拍','自己拍','听声核对'].map((name,i)=><li key={name} aria-current={!ready&&!complete&&!position.countIn&&i===position.phase?'step':undefined}><span>{i+1}</span>{name}</li>)}</ol>
    <div className="rc-transport"><button className="rc-primary" type="button" aria-busy={status==='loading'} onClick={()=>locked?state.pause():void state.play()}>{status==='loading'?'取消开启':status==='playing'?'暂停练习':complete?'再练一次':status==='paused'?'继续练习':'开始练习，先听一遍'}</button>{!ready&&<button type="button" onClick={state.reset}>回到开始</button>}</div>
    {error&&<p role="alert" className="rc-error">{error}</p>}
    {!ready&&!complete&&<div className="rc-listening" aria-hidden="true"><div className="rc-cue" data-hit={sounding} data-paused={status!=='playing'}>{status==='paused'?'暂停':position.countIn?Math.min(4,Math.floor(position.step/4)+1):position.phase===0?'听':position.phase===2?'自己拍':sounding?'拍':'等'}</div><p>{position.countIn?'预备四拍':position.phase===0?'先用耳朵记住节奏':position.phase===2?'保持刚才的节奏':sounding?'拍一下':'等下一声'}</p></div>}
    {!ready&&<><div className="rc-legend"><span>{complete?'本次完成':position.countIn?'准备中':`第 ${position.phase+1} / 4 步`}</span><span>第 {position.round} / {settings.rounds} 轮</span></div><progress aria-label="本次挑战进度" max={position.total} value={position.step}/></>}
    {complete&&<div className="rc-result"><div role="group" aria-label="本次主观感受">{['太轻松','刚刚好','有点挑战'].map(value=><button key={value} type="button" aria-pressed={data.last?.feedback===value} onClick={()=>state.feedback(value)}>{value}</button>)}</div><button type="button" disabled={settings.bpm<=40} onClick={()=>{state.reset();state.update({bpm:Math.max(40,settings.bpm-10)})}}>放慢一点，再试试</button><p>已完成 {data.completions} 次练习 · {storageError?'本次暂存':'保存在本机'}</p></div>}
    <details className="rc-next"><summary>看节奏图（可选）</summary><p>圆点表示拍一下，横线表示等待。每组数字是一拍，不需要先学会读图。</p><Phrase challenge={challenge} step={position.phraseStep} active={status==='playing'&&!position.countIn&&position.phase!==2}/></details>
    </article>
    <details className="rc-settings"><summary>调整声音和速度 <span>{locked?'先暂停再调整':`${settings.bpm} BPM · ${settings.rounds} 轮`}</span></summary>
    <fieldset disabled={locked}><legend>练习声音</legend><div className="rc-sounds">{(['click','clap','drum'] as const).map((sound,i)=><button type="button" key={sound} aria-pressed={settings.sound===sound} onClick={()=>state.update({sound})}>{['节拍器','拍手','鼓声'][i]}</button>)}</div><p>节拍器声音与跷跷板相同。</p></fieldset>
    <fieldset disabled={locked}><legend>练习速度与次数</legend><label className="rc-range">速度（BPM） <output>{settings.bpm} BPM</output><input type="range" min={40} max={180} step={1} value={settings.bpm} aria-label="挑战速度" aria-valuetext={`${settings.bpm} BPM`} onChange={e=>state.update({bpm:Number(e.target.value)})}/></label><div className="rc-tempo-buttons"><button type="button" disabled={settings.bpm<=40} onClick={()=>state.update({bpm:Math.max(40,settings.bpm-5)})} aria-label="减慢 5 BPM">−5</button><button type="button" onClick={()=>state.update({bpm:90})} disabled={settings.bpm===90}>90 BPM</button><button type="button" disabled={settings.bpm>=180} onClick={()=>state.update({bpm:Math.min(180,settings.bpm+5)})} aria-label="加快 5 BPM">+5</button></div><label className="rc-repeat">练习几轮<select value={settings.rounds} onChange={e=>state.update({rounds:Number(e.target.value)})}>{[1,2,3,4].map(n=><option value={n} key={n}>{n} 轮</option>)}</select></label><p>一轮包含上面的四个步骤。改轮次会重新开始。</p></fieldset>
    <fieldset disabled={locked}><legend>辅助打拍声</legend><label className="rc-toggle"><span>加上轻声滴答，帮助保持速度</span><input type="checkbox" checked={settings.reference} onChange={e=>state.update({reference:e.target.checked})}/></label><label className="rc-range">辅助声大小 <output>{settings.volume}%</output><input type="range" min={0} max={100} value={settings.volume} disabled={!settings.reference} aria-label="参考拍音量" onChange={e=>state.update({volume:Number(e.target.value)})}/></label><p>{settings.reference&&settings.volume>0?'自己拍时，仍会有轻声滴答帮你计时。':'自己拍时没有示范声或辅助声。'}开始前会先响四声，提醒你准备。</p></fieldset>
    {storageError&&<p role="alert" className="rc-error">{storageError}</p>}
    </details>
    <ChallengeCards selected={challenge.id} disabled={locked} onStart={id=>void state.play(id)}/>
  </section>
}
