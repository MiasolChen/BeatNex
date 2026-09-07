import {useEffect,useRef,useState,type PointerEvent} from 'react'
import type {DrumId} from '../core/pattern/types'

export const volumeFromDrag=(volume:number,startY:number,y:number)=>Math.max(0,Math.min(100,Math.round(volume+(startY-y)/1.5)))

/** Hold before dragging so taps continue to select instruments. */
export function usePadVolume(enabled:boolean,volumes:Partial<Record<DrumId,number>>|undefined,onChange:(drum:DrumId,value:number)=>void){
 const [adjusting,setAdjusting]=useState<DrumId|null>(null)
 const gesture=useRef<{drum:DrumId;id:number;x:number;y:number;volume:number;active:boolean;button:HTMLButtonElement}|null>(null)
 const timer=useRef<ReturnType<typeof setTimeout>>()
 const suppress=useRef(0)
 const change=useRef(onChange);change.current=onChange
 const clear=()=>{clearTimeout(timer.current);const g=gesture.current;gesture.current=null;if(g?.active)suppress.current=performance.now()+500;if(g?.button.hasPointerCapture(g.id))g.button.releasePointerCapture(g.id);setAdjusting(null)}
 useEffect(()=>{clear();window.addEventListener('blur',clear);return()=>{window.removeEventListener('blur',clear);clear()}},[enabled])
 return {adjusting,consumeClick:()=>performance.now()<suppress.current,
  onPointerDown:(drum:DrumId,e:PointerEvent<HTMLButtonElement>)=>{
   if(!enabled||e.button!==0||gesture.current)return
   const g={drum,id:e.pointerId,x:e.clientX,y:e.clientY,volume:volumes?.[drum]??100,active:false,button:e.currentTarget}
   gesture.current=g
   g.button.setPointerCapture(g.id)
   timer.current=setTimeout(()=>{if(gesture.current!==g)return;g.active=true;setAdjusting(drum);suppress.current=Infinity},350)
  },
  onPointerMove:(e:PointerEvent<HTMLButtonElement>)=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;if(!g.active){if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>8)clear();return}e.preventDefault();change.current(g.drum,volumeFromDrag(g.volume,g.y,e.clientY))},
  onPointerEnd:(e:PointerEvent<HTMLButtonElement>)=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;if(g.active)suppress.current=performance.now()+500;clear()},
 }
}
