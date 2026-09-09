import {useEffect,useMemo,useRef,useState} from 'react'
import {BOOM_BAP_PATTERNS,findPattern} from '../core/pattern/fixtures'
import {DRUM_IDS,type DrumId,type Pattern,type Meter} from '../core/pattern/types'
import {withMeter,withSubdivision,togglePatternStep,meterForPattern,resizePatternBars} from '../core/pattern/editor'
import {appendRevision,changeVersion,currentCombination,decodeVersions,VERSIONS_KEY,makeSnapshot,readVersions,writeVersions,type VersionAction,type Snapshot,type VersionedCombination} from '../storage/versions'
import {createBackup,mergeBackup,backupValues,type Backup} from '../storage/backup'
import {recoverImport,commitImport,assertNoImport} from '../storage/transaction'
import {PRACTICE_KEY,isPracticeSettings} from '../storage/practice'
import {readFavorites,writeFavorites} from '../storage/favorites'
import {readPractice,savePractice,PHASE_LABELS,phaseIds,type PracticeSettings} from '../storage/practice'
import type {TrainingProgram,TrainingMix} from '../audio/types'
import {useDrumMachine} from './useDrumMachine'
import {useLibraryPreview} from './useLibraryPreview'
import {callPhrase,callProgram,callStage} from '../core/training/callResponse'
export type Page='practice'|'library'|'machine'|'metronome'|'calendar'
export function useBeatNex(){
 const [startupError]=useState(()=>typeof window==='undefined'?null:recoverImport())
 const [settings,setSettings]=useState(()=>{const saved=readPractice();return {...saved,freeTargets:saved.freeTargets??[...saved.targets]}})
 const [pattern,setPattern]=useState(()=>settings.workspace?.pattern??findPattern(settings.patternName,settings.difficulty))
 const meterDrafts=useRef<Partial<Record<Meter,Pattern>>>({})
 const [source,setSource]=useState<Pattern>(()=>settings.workspace?.source??pattern)
 const [page,setPage]=useState<Page>('practice')
 const [muted,setMuted]=useState<DrumId[]>(()=>settings.workspace?.muted??[])
 const restoreStates=useRef(new WeakMap<Pattern,{settings:typeof settings;source:Pattern;muted:DrumId[];activeId?:string}>())
 const restoreState=(p:Pattern)=>{const value=restoreStates.current.get(p);if(value){resetAll();setSettings(value.settings);setSource(value.source);setMuted(value.muted);setActiveId(library.value.some(item=>item.id===value.activeId&&!item.deletedAt)?value.activeId:undefined)}}
 const [history,setHistory]=useState<Pattern[]>([]),[future,setFuture]=useState<Pattern[]>([])
 const [library,setLibrary]=useState(()=>readVersions(settings))
 const combinations={value:library.value.filter(item=>!item.deletedAt).map(currentCombination),error:library.error}
 const [favorites,setFavorites]=useState(()=>readFavorites())
 const [activeId,setActiveId]=useState<string|undefined>(()=>settings.workspace?.activeId)
 const [toast,setToast]=useState(''),[completed,setCompleted]=useState(false),[saveOpen,setSaveOpen]=useState(false),[feedback,setFeedback]=useState('')
 const [versionPanel,setVersionPanel]=useState<{id?:string;trash?:boolean}|null>(null)
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
 useEffect(()=>{const error=startupError||combinations.error||favorites.error;if(error)notice(error);return()=>clearTimeout(notifyTimer.current)},[])
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
 const changeSubdivision=(subdivision:Pattern['subdivision'])=>{if(subdivision===pattern.subdivision)return;changePattern(withSubdivision(pattern,subdivision));notice('已切换细分，撤销可恢复原鼓点')}
 const changePatternBars=(bars:number)=>{if(bars===pattern.bars)return;const next=resizePatternBars(pattern,bars);resetAll();meterDrafts.current={};changePattern(next);notice(bars<pattern.bars?'已缩短小节，撤销可恢复鼓点':'已添加空白小节')}
 const changeMeter=(meter:Meter)=>{if(meter===meterForPattern(pattern))return;resetAll();meterDrafts.current[meterForPattern(pattern)]=pattern;changePattern((meterDrafts.current[meter]?.bars===pattern.bars?meterDrafts.current[meter]:undefined)??withMeter(pattern,meter))}
 const undo=()=>{const next=history.at(-1);if(next){setFuture(f=>[...f,pattern]);setHistory(h=>h.slice(0,-1));setPattern(next);restoreState(next)}}
 const redo=()=>{const next=future.at(-1);if(next){setHistory(h=>[...h,pattern]);setFuture(f=>f.slice(0,-1));setPattern(next);restoreState(next)}}
 const restore=()=>{changePattern(withMeter(source,`${pattern.beatsPerBar}/${pattern.beatUnit??4}` as Meter));notice('已恢复来源组合，仍可撤销')}
 const toggleMute=(drum:DrumId)=>setMuted(s=>s.includes(drum)?s.filter(d=>d!==drum):[...s,drum])
 const persistLibrary=(items:VersionedCombination[])=>{
  if(library.error){notice(library.error);return false}
  const result=writeVersions(items);if(!result.ok){notice(result.error??'保存失败');return false}
  setLibrary({value:items,error:null});return true
 }
 const save=(name:string,practice:boolean)=>{
  try {
   const id=activeId??crypto.randomUUID(),nextPattern={...pattern,name:name.trim(),id}
   const entries=appendRevision(library.value,id,name,source.id,makeSnapshot(nextPattern,settings.bpm,muted,settings))
   if(!persistLibrary(entries))return false
   setActiveId(id);setPattern(nextPattern);setSource(nextPattern);setSaveOpen(false);notice(activeId?'已保存新版本':'已保存到节奏库')
   if(practice){resetAll();setPage('practice')}return true
  }catch(error){notice(error instanceof Error?error.message:'保存失败');return false}
 }
 const applySnapshot=(value:Snapshot,id:string)=>{
  resetAll();meterDrafts.current={};setPattern(value.pattern);setSource(value.pattern);setActiveId(id);setMuted(value.muted)
  setSettings({...value.training,freeTargets:value.training.freeTargets??[...value.training.targets]})
 }
 const load=(id:string,destination:Page)=>{const item=library.value.find(x=>x.id===id&&!x.deletedAt);if(!item)return
  const value=item.versions.find(v=>v.id===item.currentId)!.snapshot
  applySnapshot({...value,pattern:{...value.pattern,name:item.name}},id);setHistory([]);setFuture([]);setPage(destination);notice(destination==='practice'?'已使用 '+item.name:'已打开 '+item.name)
 }
 const restoreVersion=(id:string,revisionId?:string)=>{
  const item=library.value.find(x=>x.id===id&&!x.deletedAt);if(!item)return
  const value=revisionId?item.versions.find(v=>v.id===revisionId&&!v.deletedAt)?.snapshot:item.original
  if(!value)return
  const previous=pattern,next=structuredClone(value.pattern)
  restoreStates.current.set(previous,{settings,source,muted,activeId})
  restoreStates.current.set(next,{settings:{...value.training,freeTargets:value.training.freeTargets??[...value.training.targets]},source:next,muted:value.muted,activeId:id})
  changePattern(next);applySnapshot({...value,pattern:next},id);setPage('machine');notice('已恢复到草稿，保存后生成新版本；可撤销')
 }
 const manageVersion=(id:string,action:VersionAction,revisionId?:string,name?:string)=>{
  try{
   const entries=changeVersion(library.value,id,action,revisionId,name)
   if(!persistLibrary(entries))return false
   if(action==='trash'||action==='purge'){preview.stop();if(!revisionId&&activeId===id)setActiveId(undefined)}
   notice(action==='rename'?'名称已更新':action==='trash'?'已移入回收站':action==='restore'?'已移出回收站':'已永久删除');return true
  }catch(error){notice(error instanceof Error?error.message:'操作失败');return false}
 }
 const exportBackup=()=>{
  if(library.error||favorites.error)throw new Error(library.error||favorites.error!)
  assertNoImport(window.localStorage)
  const stored=localStorage.getItem(VERSIONS_KEY)
  if(stored!==null)decodeVersions(stored)
  const favoriteError=readFavorites().error
  if(favoriteError)throw new Error(favoriteError)
  const raw=localStorage.getItem(PRACTICE_KEY)
  if(raw!==null&&!isPracticeSettings(JSON.parse(raw)))throw new Error('练习存储无效，请先保留原数据')
  return createBackup(library.value,favorites.value,{...settings,workspace:{pattern,source,muted,activeId}})
 }
 const importBackup=(incoming:Backup,restorePractice:boolean)=>{
  try{
   const merged=mergeBackup(exportBackup(),incoming,restorePractice)
   const result=commitImport(backupValues(merged))
   if(!result.ok){notice(result.error??'导入失败');return false}
   resetAll();setLibrary({value:merged.combinations,error:null});setFavorites({value:merged.favorites,error:null})
   if(restorePractice){
    const next=merged.practice,w=next.workspace,p=w?.pattern??findPattern(next.patternName,next.difficulty)
    setSettings({...next,freeTargets:next.freeTargets??[...next.targets]});setPattern(p);setSource(w?.source??p);setMuted(w?.muted??[]);setActiveId(w?.activeId);setHistory([]);setFuture([]);meterDrafts.current={}
   }
   notice('备份已导入');return true
  }catch(error){notice(error instanceof Error?error.message:'导入失败');return false}
 }
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
 return {versionPanel,setVersionPanel,library:library.value,restoreVersion,manageVersion,exportBackup,importBackup,settings,mode,isCall,callBars,callStage:callStage(cycle,callBars,snapshot.isCountIn),changeMode,changeCallBars,preview,selectedDrums,pattern,source,page,muted,history,future,combinations:combinations.value,favorites:favorites.value,activeId,toast,completed:page==='practice'&&(isCall||settings.routeEnabled)&&currentCompleted,saveOpen,setSaveOpen,feedback,submitFeedback,landscape,setLandscape,follow,setFollow,notice,audio,snapshot,playing,loading,totalBars,cycle,round,changeRepeat,activeIndex,phases,switchPage,changeBpm,togglePlayback,changeFreeVolume,selectDrum,choosePattern,toggleStep,changeMeter,changePatternBars,changeSubdivision,undo,redo,restore,toggleMute,save,load,toggleFavorite,reorder,removePhase,addPhase,changeBars,toggleRoute,endFree,reset,setCompleted:dismissComplete}
}
export type BeatNex=ReturnType<typeof useBeatNex>
