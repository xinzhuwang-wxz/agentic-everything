import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export interface FloatingPosition { x:number; y:number }
export interface FloatingRect { left:number; top:number; right:number; bottom:number }
export interface FloatingAssistantOptions {
 /** Stable host application namespace, not an identity or credential. */
 applicationId:string;
 /** Host-owned viewport rectangles (toolbars, critical actions) the launcher must avoid. */
 reservedAreas?:readonly FloatingRect[];
 /** Suspend while a host modal owns focus. Does not cancel or restart the run. */
 suspended?:boolean;
 /** Keep below host modal layers. Default 40; host owns the stacking contract. */
 layer?:number;
}
const SIZE=56, GAP=12;
export function placeFloatingLauncher(position:FloatingPosition,width:number,height:number,areas:readonly FloatingRect[]=[]):FloatingPosition {
 const maxX=Math.max(0,width-SIZE-GAP),maxY=Math.max(0,height-SIZE-GAP);
 const minX=Math.min(GAP,maxX),minY=Math.min(GAP,maxY);
 const clamp=(p:FloatingPosition)=>({x:Math.min(maxX,Math.max(minX,p.x)),y:Math.min(maxY,Math.max(minY,p.y))});
 const desired=clamp(position);
 const free=(p:FloatingPosition)=>!areas.some(a=>p.x<a.right+GAP&&p.x+SIZE>a.left-GAP&&p.y<a.bottom+GAP&&p.y+SIZE>a.top-GAP);
 const xs=[desired.x,minX,maxX,...areas.flatMap(a=>[a.left-SIZE-GAP,a.right+GAP])];
 const ys=[desired.y,minY,maxY,...areas.flatMap(a=>[a.top-SIZE-GAP,a.bottom+GAP])];
 const candidates=xs.flatMap(x=>ys.map(y=>clamp({x,y}))).filter(free);
 return candidates.sort((a,b)=>Math.hypot(a.x-desired.x,a.y-desired.y)-Math.hypot(b.x-desired.x,b.y-desired.y))[0]??desired;
}
/** Presentation only. The parent keeps the single run/approval lifecycle mounted. */
export function FloatingAssistant({applicationId,reservedAreas=[],suspended=false,layer=40,children}:FloatingAssistantOptions&{children:React.ReactNode}) {
 if(!applicationId.trim())throw new Error('floating.applicationId must identify the host application');
 const id=useId();const launcher=useRef<HTMLButtonElement>(null);const closeButton=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false);const [position,setPosition]=useState<FloatingPosition>({x:12,y:12});
 const [viewport,setViewport]=useState({width:0,height:0});
 const drag=useRef<{id:number;start:FloatingPosition;origin:FloatingPosition;moved:boolean}|undefined>(undefined);
 const suppressClick=useRef(false);const positionRef=useRef(position);positionRef.current=position;
 const key=`ae:launcher:v1:${encodeURIComponent(applicationId)}`;
 const areasRef=useRef(reservedAreas);areasRef.current=reservedAreas;
 const persist=(p:FloatingPosition)=>{try{localStorage.setItem(key,JSON.stringify({x:p.x,y:p.y}))}catch{}};
 function move(p:FloatingPosition){const next=placeFloatingLauncher(p,window.innerWidth,window.innerHeight,areasRef.current);positionRef.current=next;setPosition(next);persist(next)}
 const areaSignature=JSON.stringify(reservedAreas);
 useEffect(()=>{
  let stored:FloatingPosition={x:window.innerWidth-SIZE-24,y:window.innerHeight-SIZE-24};
  try{const value:unknown=JSON.parse(localStorage.getItem(key)??'null');if(value&&typeof value==='object'&&'x'in value&&'y'in value&&typeof value.x==='number'&&typeof value.y==='number'&&Number.isFinite(value.x)&&Number.isFinite(value.y))stored={x:value.x,y:value.y}}catch{}
  const next=placeFloatingLauncher(stored,window.innerWidth,window.innerHeight,areasRef.current);setPosition(next);positionRef.current=next;setViewport({width:window.innerWidth,height:window.innerHeight});
  const resize=()=>{move(positionRef.current);setViewport({width:window.innerWidth,height:window.innerHeight})};window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
  return()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize)};
 },[key]);
 useEffect(()=>{move(positionRef.current)},[areaSignature]);
 const wasOpen=useRef(false);
 useEffect(()=>{if(open&&!wasOpen.current&&!suspended)closeButton.current?.focus();wasOpen.current=open},[open,suspended]);
 function close(){setOpen(false);launcher.current?.focus()}
 const panelWidth=Math.min(440,Math.max(0,viewport.width-24));
 const besideLeft=position.x-panelWidth-GAP>=GAP;
 const besideRight=position.x+SIZE+GAP+panelWidth<=viewport.width-GAP;
 const beside=besideLeft||besideRight;
 const above=position.y-GAP*2;
 const below=viewport.height-position.y-SIZE-GAP*2;
 const panelTop=beside||above>=below?GAP:position.y+SIZE+GAP;
 const panelHeight=beside?viewport.height-GAP*2:Math.max(above,below);
 const panelLeft=besideLeft?position.x-panelWidth-GAP:besideRight?position.x+SIZE+GAP:Math.max(GAP,Math.min(position.x+SIZE-panelWidth,viewport.width-panelWidth-GAP));
 if(typeof document==='undefined')return null;
 return createPortal(<div className="ae-floating-layer" hidden={suspended} style={{zIndex:layer}}>
  <button ref={launcher} type="button" className="ae-floating-launcher" style={{left:position.x,top:position.y}} aria-label={open?'关闭业务助手':'打开业务助手'} aria-expanded={open} aria-controls={id} aria-describedby={`${id}-help`}
   onPointerDown={e=>{if(e.button!==0)return;suppressClick.current=false;drag.current={id:e.pointerId,start:{x:e.clientX,y:e.clientY},origin:positionRef.current,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId)}}
   onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.start.x,dy=e.clientY-d.start.y;if(Math.hypot(dx,dy)>6)d.moved=true;if(d.moved){suppressClick.current=true;move({x:d.origin.x+dx,y:d.origin.y+dy})}}}
   onPointerUp={e=>{if(drag.current?.id!==e.pointerId)return;const moved=drag.current.moved;suppressClick.current=moved;drag.current=undefined;if(e.pointerType==='touch'&&!moved){if(open)close();else setOpen(true);suppressClick.current=true;}if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
   onPointerCancel={()=>{drag.current=undefined;suppressClick.current=true}}
   onLostPointerCapture={()=>{drag.current=undefined}}
   onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}if(open)close();else setOpen(true)}}
   onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();close();return}if(e.key==='Enter'||e.key===' ')suppressClick.current=false;const delta:Record<string,FloatingPosition>={ArrowLeft:{x:-16,y:0},ArrowRight:{x:16,y:0},ArrowUp:{x:0,y:-16},ArrowDown:{x:0,y:16}};const step=delta[e.key];if(step){e.preventDefault();move({x:position.x+step.x,y:position.y+step.y})}if(e.key==='Home'){e.preventDefault();move({x:window.innerWidth-SIZE-24,y:window.innerHeight-SIZE-24})}}}>ae<span aria-hidden="true">·</span></button>
  <span id={`${id}-help`} className="ae-visually-hidden">拖动移动；方向键移动，Home 复位；Enter 打开，Escape 关闭。</span>
  <section id={id} role="dialog" aria-modal="false" aria-label="业务助手对话" className="ae-floating-dialog ae-panel" hidden={!open} style={{left:panelLeft,width:panelWidth,top:panelTop,maxHeight:Math.max(0,panelHeight)}} onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();e.stopPropagation();close()}}}>
   <header className="ae-floating-heading"><strong>业务助手</strong><button type="button" onClick={()=>move({x:window.innerWidth-SIZE-24,y:window.innerHeight-SIZE-24})}>复位位置</button><button ref={closeButton} type="button" onClick={close} aria-label="收起业务助手">关闭</button></header>
   {children}
  </section>
 </div>,document.body);
}
