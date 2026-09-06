import {useEffect,useMemo,useRef,useState} from 'react'
import {BOOM_BAP_PATTERNS,findPattern} from '../core/pattern/fixtures'
import {DRUM_IDS,type DrumId,type Pattern,type Meter} from '../core/pattern/types'
import {withMeter,togglePatternStep,meterForPattern} from '../core/pattern/editor'
import {readCombinations,writeCombinations,type Combination} from '../storage/combinations'
import {readFavorites,writeFavorites} from '../storage/favorites'
import {readPractice,savePractice,PHASE_LABELS,phaseIds,type PracticeSettings} from '../storage/practice'
import type {TrainingProgram,TrainingMix} from '../audio/types'
import {useDrumMachine} from './useDrumMachine'
export type Page='practice'|'library'|'machine'|'metronome'|'calendar'
export function useBeatNex(){
 const [settings,setSettings]=useState(()=>{const saved=readPractice();return {...saved,freeTargets:saved.freeTargets??[...saved.targets]}})
 const [pattern,setPattern]=useState(()=>findPattern(settings.patternName,settings.difficulty))
 const meterDrafts=useRef<Partial<Record<Meter,Pattern>>>({})
 const [source,setSource]=useState<Pattern>(pattern)
 const [page,setPage]=useState<Page>('practice')
 const [muted,setMuted]=useState<DrumId[]>([])
 const [history,setHistory]=useState<Pattern[]>([]),[future,setFuture]=useState<Pattern[]>([])
 const [combinations,setCombinations]=useState(()=>readCombinations())
 const [favorites,setFavorites]=useState(()=>readFavorites())
 const [activeId,setActiveId]=useState<string>()
 const [toast,setToast]=useState(''),[completed,setCompleted]=useState(false),[saveOpen,setSaveOpen]=useState(false),[feedback,setFeedback]=useState('')
 const [landscape,setLandscape]=useState(false),[follow,setFollow]=useState(false)
 const notifyTimer=useRef<ReturnType<typeof setTimeout>>()
 const notice=(text:string)=>{setToast(text);clearTimeout(notifyTimer.current);notifyTimer.current=setTimeout(()=>setToast(''),2800)}
 const totalBars=settings.phases.reduce((n,p)=>n+p.bars,0)
 const program=useMemo<TrainingProgram|undefined>(()=>page==='practice'?settings.phases.map(p=>({bars:p.bars,mix:{mode:({full:'full',solo:'solo',focus:'weaken',normal:'full',muteTarget:'mute-target',check:'full'} as Record<string,TrainingMix['mode']>)[p.id],targets:settings.targets}})):undefined,[page,settings.phases,settings.targets])
 // Independent transports retain exact pause positions while only the active mode plays.
 const routeAudio=useDrumMachine(pattern,settings.bpm,program,settings.repeat==='infinite')
 const freeAudio=useDrumMachine(pattern,settings.bpm)
 const audio=page==='practice'&&!settings.routeEnabled?freeAudio:routeAudio
 const selectedDrums=settings.routeEnabled?settings.targets:(settings.freeTargets??settings.targets)
 const {snapshot}=audio
 const playing=snapshot.status==='playing',loading=audio.loading||snapshot.status==='loading'
 const round=settings.repeat==='infinite'?Math.floor(snapshot.cycle/totalBars)+1:1
 const cycle=completed?totalBars:settings.repeat==='infinite'?snapshot.cycle%totalBars:snapshot.cycle
 let boundary=0;const found=settings.phases.findIndex(p=>{boundary+=p.bars;return cycle<boundary});const activeIndex=found<0?settings.phases.length-1:found
 useEffect(()=>{if(settings.routeEnabled&&program&&settings.repeat==='once'&&snapshot.cycle>=totalBars&&!completed){audio.stop();setCompleted(true);setFeedback('')}},[settings.routeEnabled,program,settings.repeat,snapshot.cycle,totalBars,completed,audio.stop])
 useEffect(()=>{DRUM_IDS.forEach(d=>{routeAudio.updateMix(d,{muted:page==='practice'?false:muted.includes(d)});freeAudio.updateMix(d,{muted:!(settings.freeTargets??settings.targets).includes(d)})})},[muted,settings.targets,settings.freeTargets,page,routeAudio.updateMix,freeAudio.updateMix])
 const warned=useRef(false)
 useEffect(()=>{if(!savePractice(settings)&&!warned.current){warned.current=true;notice('设置仅在本次保留：无法写入本机存储')}},[settings])
 useEffect(()=>{const error=combinations.error||favorites.error;if(error)notice(error);return()=>clearTimeout(notifyTimer.current)},[])
 const patch=(values:Partial<PracticeSettings>)=>setSettings(s=>({...s,...values}))
 const reset=()=>{audio.stop();if(settings.routeEnabled){setCompleted(false);setFeedback('')}}
 const resetAll=()=>{routeAudio.stop();freeAudio.stop();setCompleted(false);setFeedback('')}
 const switchPage=(next:Page)=>{if(next===page)return;resetAll();setPage(next);if(next!=='machine')setLandscape(false)}
 const changeBpm=(bpm:number)=>patch({bpm})
 const togglePlayback=()=>{if(playing)audio.pause();else{if(settings.routeEnabled&&completed)reset();void audio.play()}}
 const selectDrum=(drum:DrumId,remove:boolean)=>{const next=remove?selectedDrums.filter(d=>d!==drum):Array.from(new Set([...selectedDrums,drum]));patch(settings.routeEnabled?{targets:next}:{freeTargets:next})}
 const choosePattern=(id:string)=>{const next=BOOM_BAP_PATTERNS.find(p=>p.id===id);if(!next)return;resetAll();meterDrafts.current={};setPattern(next);setSource(next);setActiveId(undefined);setMuted([]);setHistory([]);setFuture([]);patch({bpm:next.recommendedBpm,patternName:next.name,difficulty:next.difficulty});setPage('practice')}
 const changePattern=(next:Pattern)=>{setHistory(h=>[...h.slice(-49),pattern]);setFuture([]);setPattern(next)}
 const toggleStep=(drum:DrumId,step:number)=>changePattern(togglePatternStep(pattern,drum,step))
 const changeMeter=(meter:Meter)=>{if(meter===meterForPattern(pattern))return;resetAll();meterDrafts.current[meterForPattern(pattern)]=pattern;changePattern(meterDrafts.current[meter]??withMeter(pattern,meter))}
 const undo=()=>{const next=history.at(-1);if(next){setFuture(f=>[...f,pattern]);setHistory(h=>h.slice(0,-1));setPattern(next)}}
 const redo=()=>{const next=future.at(-1);if(next){setHistory(h=>[...h,pattern]);setFuture(f=>f.slice(0,-1));setPattern(next)}}
 const restore=()=>{changePattern(withMeter(source,`${pattern.beatsPerBar}/${pattern.beatUnit??4}` as Meter));notice('已恢复来源组合，仍可撤销')}
 const toggleMute=(drum:DrumId)=>setMuted(s=>s.includes(drum)?s.filter(d=>d!==drum):[...s,drum])
 const save=(name:string,practice:boolean)=>{
  const id=activeId??crypto.randomUUID()
  const entry:Combination={id,name:name.trim(),bpm:settings.bpm,pattern:{...pattern,name:name.trim(),id},muted,sourceId:source.id}
  const entries=[entry,...combinations.value.filter(x=>x.id!==entry.id)]
  const result=writeCombinations(entries)
  if(!result.ok){notice(result.error??'保存失败');return false}
  setCombinations({value:entries,error:null});setActiveId(entry.id);setPattern(entry.pattern);setSource(entry.pattern);setSaveOpen(false);notice('已保存到节奏库');if(practice){resetAll();patch({targets:DRUM_IDS.filter(d=>!muted.includes(d)),freeTargets:DRUM_IDS.filter(d=>!muted.includes(d))});setPage('practice')}return true
 }
 const load=(id:string,destination:Page)=>{const entry=combinations.value.find(x=>x.id===id);if(!entry)return;resetAll();meterDrafts.current={};setPattern(entry.pattern);setSource(entry.pattern);setActiveId(id);setMuted(entry.muted);setHistory([]);setFuture([]);patch({bpm:entry.bpm,targets:DRUM_IDS.filter(d=>!entry.muted.includes(d)),freeTargets:DRUM_IDS.filter(d=>!entry.muted.includes(d))});setPage(destination);notice(destination==='practice'?'已使用 '+entry.name:'已打开 '+entry.name)}
 const toggleFavorite=(id:string)=>{const value=favorites.value.includes(id)?favorites.value.filter(x=>x!==id):[...favorites.value,id];const result=writeFavorites(value);if(!result.ok){notice(result.error??'收藏未能保存');return}setFavorites({value,error:null})}
 const changeRoute=(phases:PracticeSettings['phases'])=>{reset();patch({phases})}
 const reorder=(from:number,to:number)=>{if(to<0||to>=settings.phases.length)return;const next=[...settings.phases];next.splice(to,0,next.splice(from,1)[0]);changeRoute(next)}
 const removePhase=(id:string)=>{if(settings.phases.length>1)changeRoute(settings.phases.filter(p=>p.instanceId!==id))}
 const addPhase=(index:number)=>{if(settings.phases.length>=16){notice('这份路线最多 16 个阶段');return}changeRoute([...settings.phases,{id:phaseIds[index],instanceId:crypto.randomUUID(),bars:4}])}
 const changeBars=(id:string,bars:number)=>changeRoute(settings.phases.map(p=>p.instanceId===id?{...p,bars}:p))
 const changeRepeat=(repeat:PracticeSettings['repeat'])=>{if(playing||loading||!settings.routeEnabled||repeat===settings.repeat)return;reset();patch({repeat})}
 const toggleRoute=()=>{audio.pause();patch({routeEnabled:!settings.routeEnabled,freeTargets:settings.freeTargets??[...settings.targets]});notice('已切换到'+(settings.routeEnabled?'自由练习':'路线练习')+'，点击播放开始或继续')}
 const endFree=()=>{notice('本次自由练习 '+Math.floor(snapshot.elapsed/60).toString().padStart(2,'0')+':'+Math.floor(snapshot.elapsed%60).toString().padStart(2,'0'));reset()}
 const phases=settings.phases.map(p=>({...p,label:PHASE_LABELS[phaseIds.indexOf(p.id as never)]}))
 const submitFeedback=(value:string)=>{setFeedback(value);try{localStorage.setItem('beatnex:last-training-feedback',value)}catch{notice('反馈仅保留在本次练习')}}
 return {settings,selectedDrums,pattern,source,page,muted,history,future,combinations:combinations.value,favorites:favorites.value,activeId,toast,completed:settings.routeEnabled&&completed,saveOpen,setSaveOpen,feedback,submitFeedback,landscape,setLandscape,follow,setFollow,notice,audio,snapshot,playing,loading,totalBars,cycle,round,changeRepeat,activeIndex,phases,switchPage,changeBpm,togglePlayback,selectDrum,choosePattern,toggleStep,changeMeter,undo,redo,restore,toggleMute,save,load,toggleFavorite,reorder,removePhase,addPhase,changeBars,toggleRoute,endFree,reset,setCompleted}
}
export type BeatNex=ReturnType<typeof useBeatNex>
