import { useEffect, useRef, useState } from 'react'
import type { BeatNex } from '../../features/useBeatNex'
import { parseBackup, type Backup } from '../../storage/backup'
import { Modal } from './Modal'

export function VersionManager({app}:{app:BeatNex}) {
 const panel=app.versionPanel!,item=app.library.find(x=>x.id===panel.id)
 const [rename,setRename]=useState<{id:string;revisionId?:string;name:string}|null>(null)
 const [purge,setPurge]=useState<{id:string;revisionId?:string;name:string}|null>(null)
 const [incoming,setIncoming]=useState<Backup|null>(null),[restore,setRestore]=useState(false),[error,setError]=useState('')
 const content=useRef<HTMLDivElement>(null)
 useEffect(()=>{content.current?.querySelector<HTMLElement>('input,button')?.focus()},[!!rename,!!purge,!!incoming,panel.trash])
 const close=()=>app.setVersionPanel(null)
 const download=()=>{try{
  const value=app.exportBackup(),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}))
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`BeatNex-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }catch(e){setError(e instanceof Error?e.message:'导出失败')}}
 const action=(id:string,type:'rename'|'trash'|'restore'|'purge',revisionId?:string,name?:string)=>{
  if(app.manageVersion(id,type,revisionId,name)){setRename(null);setPurge(null);if(!revisionId&&(type==='trash'||type==='purge')&&panel.id)close()}
 }
 const trash=app.library.flatMap(x=>x.deletedAt?[{id:x.id,name:x.name,revisionId:undefined as string|undefined}]:x.versions.filter(v=>v.deletedAt).map(v=>({id:x.id,name:`${x.name} · v${v.number} ${v.name}`,revisionId:v.id})))
 return <Modal onClose={close}><div className="bn-version-panel" ref={content}><div className="bn-row"><h2 id="bn-dialog-title">{purge?'永久删除':rename?'重命名':incoming?'导入备份':panel.trash?'回收站':item?'版本历史':'管理组合'}</h2><button className="bn-smallbtn" aria-label="关闭版本管理" onClick={close}>×</button></div>
 {error&&<p role="alert">{error}</p>}
 {purge?<><p>永久删除“{purge.name}”？此操作不可恢复。</p><div className="bn-version-actions"><button onClick={()=>setPurge(null)}>取消</button><button onClick={()=>action(purge.id,'purge',purge.revisionId)}>确认永久删除</button></div></>
 :rename?<form onSubmit={e=>{e.preventDefault();action(rename.id,'rename',rename.revisionId,rename.name)}}><label>名称<input aria-label="新的名称" maxLength={40} value={rename.name} onChange={e=>setRename({...rename,name:e.target.value})}/></label><div className="bn-version-actions"><button type="button" onClick={()=>setRename(null)}>取消</button><button disabled={!rename.name.trim()}>保存名称</button></div></form>
 :incoming?<><p>{incoming.combinations.length} 个组合 · {incoming.combinations.reduce((n,x)=>n+x.versions.length,0)} 个版本</p><p className="bn-muted">合并备份，冲突组合将另存副本。</p><label className="bn-backup-restore"><input type="checkbox" checked={restore} onChange={e=>setRestore(e.target.checked)}/>同时恢复备份的练习设置与草稿</label><div className="bn-version-actions"><button onClick={()=>setIncoming(null)}>取消导入</button><button onClick={()=>{if(app.importBackup(incoming,restore))close()}}>确认导入</button></div></>
 :panel.trash?<>{!trash.length&&<p className="bn-muted">回收站为空</p>}{trash.map(x=><div className="bn-version-entry" key={x.id+':'+(x.revisionId??'')}><strong>{x.name}</strong><div className="bn-version-actions"><button onClick={()=>action(x.id,'restore',x.revisionId)}>恢复</button><button onClick={()=>setPurge(x)}>永久删除</button></div></div>)}</>
 :item?<><p className="bn-version-name">{item.name}</p><div className="bn-version-actions"><button onClick={()=>setRename({id:item.id,name:item.name})}>重命名组合</button><button onClick={()=>action(item.id,'trash')}>移入回收站</button><button onClick={()=>{app.restoreVersion(item.id);close()}}>最初版本</button></div>{[...item.versions].filter(v=>!v.deletedAt).sort((a,b)=>b.number-a.number).map(v=><div className="bn-version-entry" key={v.id}><strong>v{v.number} · {v.name}{v.id===item.currentId?' · 当前':''}</strong><small>{v.createdAt?new Date(v.createdAt).toLocaleString():'迁移版本 · 训练设置按迁移时补全'}</small><div className="bn-version-actions"><button onClick={()=>{app.restoreVersion(item.id,v.id);close()}}>恢复到草稿</button><button onClick={()=>setRename({id:item.id,revisionId:v.id,name:v.name})}>重命名版本</button><button onClick={()=>action(item.id,'trash',v.id)}>删除版本</button></div></div>)}</>
 :<div className="bn-management-menu"><button onClick={()=>app.setVersionPanel({trash:true})}>回收站{trash.length?` · ${trash.length}`:''}</button><button onClick={download}>导出 JSON 备份</button><label>导入 JSON 备份<input type="file" accept=".json,application/json" aria-label="导入 JSON 备份" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setError('');try{setIncoming(parseBackup(await file.text()))}catch(cause){setError(cause instanceof Error?cause.message:'无法读取备份')}}}/></label></div>}
 </div></Modal>
}
