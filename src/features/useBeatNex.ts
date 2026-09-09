import {useEffect,useMemo,useRef,useState} from 'react'
import {BOOM_BAP_PATTERNS,findPattern} from '../core/pattern/fixtures'
import {DRUM_IDS,type DrumId,type Pattern,type Meter} from '../core/pattern/types'
import {withMeter,togglePatternStep,meterForPattern,resizePatternBars} from '../core/pattern/editor'
import {readCombinations,writeCombinations,type Combination} from '../storage/combinations'
import {readFavorites,writeFavorites} from '../storage/favorites'
import {readPractice,savePractice,PHASE_LABELS,phaseIds,type PracticeSettings} from '../storage/practice'
import type {TrainingProgram,TrainingMix} from '../audio/types'
import {useDrumMachine} from './useDrumMachine'
import {useLibraryPreview} from './useLibraryPreview'
import {callPhrase,callProgram,callStage} from '../core/training/callResponse'
export type Page='practice'|'library'|'machine'|'metronome'|'calendar'
export function useBeatNex(){
 const [settings,setSettings]=useState(()=>{const saved=readPractice();return {...saved,freeTargets:saved.freeTargets??[...saved.targets]}})
 const [pattern,setPattern]=useState(()=>settings.workspace?.pattern??findPattern(settings.patternName,settings.difficulty))
 const meterDrafts=useRef<Partial<Record<Meter,Pattern>>>({})
 const [source,setSource]=useState<Pattern>(()=>settings.workspace?.source??pattern)
 const [page,setPage]=useState<Page>('practice')
 const [muted,setMuted]=useState<DrumId[]>(()=>settings.workspace?.muted??[])
 const [history,setHistory]=useState<Pattern[]>([]),[future,setFuture]=useState<Pattern[]>([])
 const [combinations,setCombinations]=useState(()=>readCombinations())
 const [favorites,setFavorites]=useState(()=>readFavorites())
 const [activeId,setActiveId]=useState<string|undefined>(()=>settings.workspace?.activeId)
 const [toast,setToast]=useState(''),[completed,setCompleted]=useState(false),[saveOpen,setSaveOpen]=useState(false),[feedback,setFeedback]=useState('')
 const [landscape,setLandscape]=useState(false),[follow,setFollow]=useState(false)
 const notifyTimer=useRef<ReturnType<typeof setTimeout>>()
 const notice=(text:string)=>{setToast(text);clearTimeout(notifyTimer.current);notifyTimer.current=setTimeout(()=>setToast(''),2800)}
 const isCall=!!settings.callEnabled
 const callBars=settings.callBars??1
 const mode=isCall?'call':settings.routeEnabled?'route':'free'
 const [callCompleted,setCallCompleted]=useState(false)
 const currentCompleted=isCall?callCompleted:completed
 const totalBars=isCall?callBars*3:settings.phases.reduce((n,p)=>n+p.bars,0)
 const program=useMemo<TrainingProgram|undefined>(()=>page==='practice'?settings.phases.map(p=>({bars:p.bars,mix:{mode:({full:'full',solo:'solo',focus:'weaken',normal:'full',muteTarget:'mute-target',check:'full'} as Record<string,TrainingMix['mode']>)[p.id],targets:settings.targets}})):undefined,[page,settings.phases,settings.targets])
 // Independent transports retain exact pause positions while only the active mode plays.
 const routeAudio=useDrumMachine(pattern,settings.bpm,program,settings.repeat==='infinite')
 const freeAudio=useDrumMachine(pattern,settings.bpm)
 const phrase=useMemo(()=>callPhrase(pattern,callBars),[pattern,callBars])
 const responseProgram=useMemo(()=>callProgram(callBars,settings.targets),[callBars,settings.targets])
 const callAudio=useDrumMachine(phrase,settings.bpm,responseProgram,false,true)
 const preview=useLibraryPreview(page==='library',()=>{routeAudio.pause();freeAudio.pause();callAudio.pause()})
 const audio=page==='practice'?(isCall?callAudio:settings.routeEnabled?routeAudio:freeAudio):routeAudio
 const selectedDrums=(isCall||settings.routeEnabled)?settings.targets:(settings.freeTargets??settings.targets)
 const {snapshot}=audio
 const playing=snapshot.status==='playing',loading=audio.loading||snapshot.status==='loading'
 const round=!isCall&&settings.repeat==='infinite'?Math.floor(snapshot.cycle/totalBars)+1:1
 const cycle=currentCompleted?totalBars:!isCall&&settings.repeat==='infinite'?snapshot.cycle%totalBars:snapshot.cycle
 let boundary=0;const found=settings.phases.findIndex(p=>{boundary+=p.bars;return cycle<boundary});const activeIndex=found<0?settings.phases.length-1:found
 useEffect(()=>{if(page==='practice'&&(isCall||settings.routeEnabled)&&program&&(isCall||settings.repeat==='once')&&snapshot.cycle>=totalBars&&!currentCompleted){audio.stop();if(isCall)setCallCompleted(true);else setCompleted(true);setFeedback('')}},[page,isCall,settings.routeEnabled,program,settings.repeat,snapshot.cycle,totalBars,currentCompleted,audio.stop])
 useEffect(()=>{DRUM_IDS.forEach(d=>{routeAudio.updateMix(d,{muted:page==='practice'?false:muted.includes(d)});freeAudio.updateMix(d,{muted:!(settings.freeTargets??settings.targets).includes(d),volume:0.82*(settings.freeVolumes?.[d]??100)/100})})},[muted,settings.targets,settings.freeTargets,settings.freeVolumes,page,routeAudio.updateMix,freeAudio.updateMix])
 const warned=useRef(false)
 useEffect(()=>{if(!savePractice({...settings,workspace:{pattern,source,muted,activeId}})&&!warned.current){warned.current=true;notice('设置和鼓机修改仅在本次保留：无法写入本机存储')}},[settings,pattern,source,muted,activeId])
 useEffect(()=>{const error=combinations.error||favorites.error;if(error)notice(error);return()=>clearTimeout(notifyTimer.current)},[])
 const patch=(values:Partial<PracticeSettings>)=>setSettings(s=>({...s,...values}))
 const reset=()=>{audio.stop();if(isCall)setCallCompleted(false);else setCompleted(false);setFeedback('')}
 const resetAll=()=>{routeAudio.stop();freeAudio.stop();callAudio.stop();preview.stop();setCallCompleted(false);setCompleted(false);setFeedback('')}
 const switchPage=(next:Page)=>{if(next===page)return;resetAll();setPage(next);if(next!=='machine')setLandscape(false)}
 const changeBpm=(bpm:number)=>patch({bpm})
 const togglePlayback=()=>{if(playing)audio.pause();else{if(currentCompleted)reset();void audio.play()}}
 const changeFreeVolume=(drum:DrumId,percent:number)=>{if(isCall||settings.routeEnabled||!Number.isFinite(percent))return;setSettings(s=>({...s,freeVolumes:{...s.freeVolumes,[drum]:Math.max(0,Math.min(100,Math.round(percent)))}}))}
 const selectDrum=(drum:DrumId,remove:boolean)=>{if((isCall||settings.routeEnabled)&&(playing||loading))return;const next=remove?selectedDrums.filter(d=>d!==drum):Array.from(new Set([...selectedDrums,drum]));if(isCall||settings.routeEnabled){callAudio.stop();setCallCompleted(false)}patch((isCall||settings.routeEnabled)?{targets:next}:{freeTargets:next})}
 const choosePattern=(id:string)=>{const next=BOOM_BAP_PATTERNS.find(p=>p.id===id);if(!next)return;resetAll();meterDrafts.current={};setPattern(next);setSource(next);setActiveId(undefined);setMuted([]);setHistory([]);setFuture([]);patch({bpm:next.recommendedBpm,patternName:next.name,difficulty:next.difficulty});setPage('practice')}
 const changePattern=(next:Pattern)=>{setHistory(h=>[...h.slice(-49),pattern]);setFuture([]);setPattern(next)}
 const toggleStep=(drum:DrumId,step:number)=>changePattern(togglePatternStep(pattern,drum,step))
 const changePatternBars=(bars:number)=>{if(bars===pattern.bars)return;const next=resizePatternBars(pattern,bars);resetAll();meterDrafts.current={};changePattern(next);notice(bars<pattern.bars?'已缩短小节，撤销可恢复鼓点':'已添加空白小节')}
 const changeMeter=(meter:Meter)=>{if(meter===meterForPattern(pattern))return;resetAll();meterDrafts.current[meterForPattern(pattern)]=pattern;changePattern((meterDrafts.current[meter]?.bars===pattern.bars?meterDrafts.current[meter]:undefined)??withMeter(pattern,meter))}
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
 const changeMode=(next:'free'|'route'|'call')=>{if(next===mode)return;audio.pause();patch({callEnabled:next==='call',routeEnabled:next!=='free',freeTargets:settings.freeTargets??[...settings.targets]});setFeedback('')}
 const toggleRoute=()=>changeMode(mode==='route'?'free':'route')
 const changeCallBars=(bars:number)=>{if(playing||loading||!Number.isInteger(bars)||bars<1||bars>4)return;callAudio.stop();setCallCompleted(false);patch({callBars:bars})}
 const dismissComplete=(value:boolean)=>{if(isCall)setCallCompleted(value);else setCompleted(value)}
 const endFree=()=>{notice('本次自由练习 '+Math.floor(snapshot.elapsed/60).toString().padStart(2,'0')+':'+Math.floor(snapshot.elapsed%60).toString().padStart(2,'0'));reset()}
 const phases=settings.phases.map(p=>({...p,label:PHASE_LABELS[phaseIds.indexOf(p.id as never)]}))
 const submitFeedback=(value:string)=>{setFeedback(value);try{localStorage.setItem('beatnex:last-training-feedback',value)}catch{notice('反馈仅保留在本次练习')}}
 return {settings,mode,isCall,callBars,callStage:callStage(cycle,callBars,snapshot.isCountIn),changeMode,changeCallBars,preview,selectedDrums,pattern,source,page,muted,history,future,combinations:combinations.value,favorites:favorites.value,activeId,toast,completed:page==='practice'&&(isCall||settings.routeEnabled)&&currentCompleted,saveOpen,setSaveOpen,feedback,submitFeedback,landscape,setLandscape,follow,setFollow,notice,audio,snapshot,playing,loading,totalBars,cycle,round,changeRepeat,activeIndex,phases,switchPage,changeBpm,togglePlayback,changeFreeVolume,selectDrum,choosePattern,toggleStep,changeMeter,changePatternBars,undo,redo,restore,toggleMute,save,load,toggleFavorite,reorder,removePhase,addPhase,changeBars,toggleRoute,endFree,reset,setCompleted:dismissComplete}
}
export type BeatNex=ReturnType<typeof useBeatNex>
