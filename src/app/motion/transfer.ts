import {flushSync} from 'react-dom'
let cleanup: (()=>void)|undefined
export function cancelTransfer(){cleanup?.();cleanup=undefined}
/** Semantic selection is immediate. Animation is a disposable visual bridge. */
export function transferToPractice(button:HTMLElement,action:()=>void){
 cancelTransfer()
 const root=document.getElementById('bn')!,main=root.querySelector('main')!,card=button.closest('.bn-record') as HTMLElement
 if(!card||matchMedia('(prefers-reduced-motion:reduce)').matches){action();main.scrollTop=0;return}
 const start=card.getBoundingClientRect(),base=root.getBoundingClientRect(),mainRect=main.getBoundingClientRect(),front=card.cloneNode(true) as HTMLElement
 front.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));front.inert=true
 flushSync(action);main.scrollTop=0
 const target=root.querySelector<HTMLElement>('.bn-session')!,end=target.getBoundingClientRect()
 const layer=document.createElement('div');layer.className='bn-transfer-layer';layer.setAttribute('aria-hidden','true');layer.style.top=(mainRect.top-base.top)+'px';layer.style.height=mainRect.height+'px'
 const surface=document.createElement('div');surface.className='bn-transfer-surface';Object.assign(surface.style,{left:end.left-base.left+'px',top:end.top-mainRect.top+'px',width:end.width+'px',height:end.height+'px',borderRadius:getComputedStyle(target).borderRadius,transformOrigin:'0 0'})
 const flip=document.createElement('div');flip.className='bn-transfer-flip'
 const face=document.createElement('div');face.className='bn-transfer-face bn-transfer-front';face.style.background='var(--white)';Object.assign(front.style,{width:start.width+'px',height:start.height+'px'})
 const back=document.createElement('div');back.className='bn-transfer-face bn-transfer-back'
 const clone=target.cloneNode(true) as HTMLElement;clone.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));clone.removeAttribute('id');clone.inert=true;Object.assign(clone.style,{width:end.width+'px',height:end.height+'px',minHeight:end.height+'px'})
 face.append(front);back.append(clone);flip.append(face,back);surface.append(flip);layer.append(surface);root.append(layer)
 const move:Keyframe[]=[],turn:Keyframe[]=[],content:Keyframe[]=[]
 const bez=(a:number,b:number,c:number,t:number)=>(1-t)*(1-t)*a+2*(1-t)*t*b+t*t*c
 for(let i=0;i<=60;i++){const t=i/60,u=1-Math.pow(1-t,3),x=bez(start.left,base.left+10,end.left,u),y=bez(start.top,Math.min(start.top,end.top)-45,end.top,u),w=bez(start.width,Math.min(base.width-20,end.width*1.12),end.width,u),h=bez(start.height,end.height*1.08,end.height,u),sx=w/end.width,sy=h/end.height,f=Math.max(0,Math.min(1,(t-.08)/.82));move.push({offset:t,transform:`translate(${x-end.left}px,${y-end.top}px) scale(${sx},${sy})`});turn.push({offset:t,transform:`rotateY(${-180*(f*f*(3-2*f))}deg)`});content.push({offset:t,transform:`scale(${(1+.05*Math.sin(Math.PI*t))/sx},${(1+.05*Math.sin(Math.PI*t))/sy})`})}
 const options:KeyframeAnimationOptions={duration:500,easing:'linear',fill:'both'}
 const animations=[surface.animate(move,options),flip.animate(turn,options),front.animate(content,options),target.animate([{opacity:0},{opacity:0}],options)]
 const reduce=matchMedia('(prefers-reduced-motion:reduce)')
 const finish=()=>{animations.forEach(a=>a.cancel());layer.remove();window.removeEventListener('resize',cancelTransfer);reduce.removeEventListener('change',cancelTransfer);if(cleanup===finish)cleanup=undefined}
 cleanup=finish;window.addEventListener('resize',cancelTransfer);reduce.addEventListener('change',cancelTransfer);animations[0].finished.then(finish,()=>{if(cleanup===finish)finish()})
}
