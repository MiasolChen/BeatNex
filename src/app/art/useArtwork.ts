import { useEffect } from 'react'
// Original hand-drawn paths from the approved prototype, measured into empty space.
export function useArtwork(){useEffect(()=>{
const root=document.getElementById('bn')!,main=root.querySelector('main')!,ns='http://www.w3.org/2000/svg';
const art=document.createElementNS(ns,'svg');art.classList.add('bn-composed-art');art.setAttribute('aria-hidden','true');art.setAttribute('focusable','false');root.append(art);const stageHost=root.querySelector('.bn-metro-stage')!,stageInk=document.createElementNS(ns,'svg');stageInk.classList.add('bn-stage-ink');stageInk.setAttribute('aria-hidden','true');stageInk.setAttribute('focusable','false');stageHost.prepend(stageInk);let queued=false;
function paint(){queued=false;if(!root.isConnected)return;const base=root.getBoundingClientRect(),view=main.getBoundingClientRect();art.setAttribute('viewBox',`0 0 ${base.width} ${base.height}`);art.replaceChildren();stageInk.replaceChildren();
function node(tag:string,attrs:Record<string,string|number>,parent:Element=art){const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));parent.append(e);return e}
const defs=node('defs',{}),clip=node('clipPath',{id:'bn-composed-clip'},defs);node('rect',{x:0,y:view.top-base.top,width:base.width,height:view.height},clip);const content=node('g',{'clip-path':'url(#bn-composed-clip)'});
function bounds(selector:string){const e=root.querySelector<HTMLElement>(selector);if(!e||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.left-base.left,y:r.top-base.top,w:r.width,h:r.height,right:r.right-base.left,bottom:r.bottom-base.top,el:e}}
function mark(d:string,x:number,y:number,scale=1,color='#2853ee',width=2,opacity=1,parent:Element=content){const g=node('g',{transform:`translate(${x} ${y}) scale(${scale})`,opacity},parent);node('path',{d,stroke:color,'stroke-width':width},g);return g}
// Header: one directional blue gesture, centered in the existing gap.
const brand=bounds('.bn-brand'),local=bounds('.bn-local');if(brand&&local){const gap=local.x-brand.right;if(gap>25){const w=Math.min(33,gap-13),x=brand.right+(gap-w)/2,y=brand.y+brand.h/2-7;mark('M1 12 25 3 M8 16 32 6 15 8 M28 0 31 3',x,y,w/33,'#244cff',2.1,1,art)}}
// Player: the supplied oval-and-cut gesture, subdued olive, beside the metadata.
const player=bounds('.bn-session'),title=bounds('#bn-pattern-title'),beats=bounds('.bn-session .bn-beats');if(player&&title){const top=title.bottom-7,available=(beats?beats.y:top+53)-top-3;const h=Math.min(49,Math.max(28,available)),x=player.right-100,y=top;
const g=node('g',{transform:`translate(${x} ${y}) scale(.94 ${h/58})`,opacity:.3},content);node('path',{d:'M9 34C0 6 61-6 87 11S94 53 58 52 4 42 13 25C20 15 31 11 42 8 M23 51 70 20 44 60 84 37 M3 57l-6 1 M96 53l7 7',stroke:'#d5dc60','stroke-width':2.8},g)}
// Section titles get a single deliberate underline, no border scratches.
const courseTitle=bounds('.bn-course h3');if(courseTitle){mark('M0 4 Q25 8 61 1 M12 8 47 5',courseTitle.x,courseTitle.bottom-1,Math.min(courseTitle.w/65,1.2),'#8770b6',2,.9)}
const heading=bounds('.bn-page:not([hidden]) .bn-heading h1');if(heading){mark('M0 5 Q26 10 68 1 M11 10 48 6',heading.x,heading.bottom-2,Math.min(heading.w/80,1.1),'#8770b6',2,.85)}
// A pair of dancing sneakers, only in measured empty space.
function shoes(x:number,y:number,scale=1){mark('M13 17 30 12 42 34 55 40 Q61 45 57 51 L12 51 Q4 49 7 43 L13 17 Z M9 43Q28 49 56 44 M17 21l15 3m-14 4 18 3m-16 4 18 3 M67 8 83 12 85 35 101 47Q106 53 99 57L62 48Q56 46 59 39L67 8Z M61 40l38 11 M70 17l11 5m-13 1 14 6m-15 1 15 6 M7 61q28 7 46 1 M68 66l29 5 M2 15l-5-8m11 2 1-8 M96 20l10-5m-10 12 14-1',x,y,scale,'#a9af8c',1.8,.75)}
const phases=bounds('#bn-phases');if(phases&&getComputedStyle(phases.el).visibility!=='hidden'){const children=[...phases.el.children];const occupied=Math.max(...children.map(e=>e.getBoundingClientRect().bottom-base.top));const empty=phases.bottom-occupied;if(empty>=76){const scale=Math.min(.78,(empty-14)/74);shoes(phases.x+phases.w-110*scale-16,occupied+8,scale)}}
const metro=bounds('.bn-metronome'),nav=bounds('#bn>.bn-nav');if(metro&&nav){const free=nav.y-metro.bottom;if(free>88){const scale=Math.min(1.1,(free-34)/78);shoes(base.width/2-55*scale,metro.bottom+(free-74*scale)/2,scale);if(free>150)mark('M0 14 16 14 22 1 29 27 38 7 45 17 60 17',base.width/2-28,metro.bottom+(free-90)/2+85,.85,'#8770b6',1.8,.65)}}
// Off-axis street collage: one dominant left mass and a descending loose trail.
const stage=bounds('.bn-metro-stage');if(stage){const left=stage.x,right=stage.right,top=stage.y,ground=stage.bottom-39;stageInk.setAttribute('viewBox',`0 0 ${stage.w} ${stage.h}`);const stageMarks=node('g',{transform:`translate(${-stage.x} ${-stage.y})`},stageInk);
// Dominant gesture: deliberately off-center and larger than every secondary mark.
mark('M8 47C-3 26 31-1 66 4S103 33 80 47 20 60 13 39C9 25 29 12 44 10 M20 57 79 15 47 68 95 40 M4 66l-9 4',left+8,top+16,1.38,'#7f8960',2.8,.62,stageMarks);
// A small torn-paper fragment follows the loop down and right, rather than facing a twin.
mark('M4 4 49 0 46 12 54 17 49 45 7 49 10 38 1 32 4 4 M11 11l23-3 M12 18l31-5 M15 25l18-3 M20 32l21-4 M3 56 33 51',left+stage.w*.54,top+104,.66,'#84719f',1.9,.8,stageMarks);
// Sparse high scratches extend the upper cluster in one direction.
mark('M0 14 38 4 M12 21 66 6 M56 1l8-2 M71 8l2-1',left+stage.w*.53,top+19,.92,'#a7aa93',1.7,.72,stageMarks);
// A compact cross sits at a different height, followed by a long broken downstroke.
mark('M4 1 36 38 M0 36 35 4 M8 2 40 32 M46 6l3-2 M52 13l2 1',right-49,top+77,.5,'#8f7aa7',2.1,.8,stageMarks);
mark('M4 0 0 24 6 29 5 59 M12 34l-3 15',right-21,top+114,.72,'#949b78',1.8,.7,stageMarks);
// Only one grounded scuff; its longer horizontal tail anchors the right-hand weight.
mark('M0 13 9 1 16 17 26 3 M-3 24l35-5 M18 29l43-7 M38 6l3-8',right-67,ground+12,.74,'#8c779c',2,.76,stageMarks);
}

// Day-record margin illustration: appear only beneath all visible record content.
const dayList=bounds('[data-view="calendar"][data-calendar-mode="day"] .bn-training-list'),daySheet=bounds('.bn-calendar-sheet');
if(dayList&&daySheet){const children=[...dayList.el.children],last=Math.max(dayList.y,...children.map(e=>e.getBoundingClientRect().bottom-base.top)),bottom=Math.min(dayList.bottom,daySheet.bottom-18),free=bottom-last;
if(free>110){const s=Math.min(.68,(free-42)/130,(dayList.w-48)/242),x=dayList.x+24,y=last+32;
mark('M6 18 111 1Q120 0 121 10L131 74Q132 83 122 85L18 101Q8 102 7 92L0 30Q-1 21 6 18Z M9 29 109 13 118 68 17 84 9 29 M28 35 94 24 101 57 35 68 28 35 M39 46c-8-5-11 8-3 11s13-8 3-11 M84 37c-8-5-11 8-3 11s13-8 3-11 M43 49l32-5 M39 76l3-11 43-7 7 10 M16 94l6-1 M114 78l5-1',x,y,s,'#9e91ab',1.7,.85);
mark('M114 22C137 8 148 17 142 36S135 64 154 57 172 41 181 47',x,y,s,'#a6ae89',2,.8);
mark('M5 115l43-6 M158 20l12-5',x,y,s,'#b1b49f',1.6,.7);
}}
// A small hand-drawn page curl at the calendar's lower free corner.
const sheet=bounds('.bn-calendar-sheet');if(sheet){mark('M0 0q-2 12-15 15 M-14 15q9-1 13-3l1-12',sheet.right-7,sheet.bottom-19,1,'#a2a887',1.7,.75)}
}
function request(){if(!queued){queued=true;requestAnimationFrame(paint)}}
main.addEventListener('scroll',request,{passive:true,capture:true});window.addEventListener('resize',request);root.addEventListener('click',request);const observer=new MutationObserver(request);observer.observe(root,{subtree:true,attributes:true,attributeFilter:['hidden']});const resize=new ResizeObserver(request);[root,main,root.querySelector('.bn-course'),root.querySelector('#bn-phases')].filter(Boolean).forEach(e=>resize.observe(e!));request();

return()=>{main.removeEventListener('scroll',request,true);window.removeEventListener('resize',request);root.removeEventListener('click',request);observer.disconnect();resize.disconnect();art.remove();stageInk.remove()};
},[])}
