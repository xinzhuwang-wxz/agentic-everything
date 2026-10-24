/**
 * @author: @dorianbaffier
 * @description: Status Island
 * @version: 1.0.0
 * @date: 2026-10-15
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 * AE adaptation: one server run, full status union, scoped CSS, no fake progress,
 * timers, auto-dismiss or task actions. Retains focus handoff / Escape / outside-pointer logic.
 */
import React, { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { RunView } from '../types.js';
export function StatusIsland({run,label}:{run:RunView;label:string}){
 const [open,setOpen]=useState(false);
 const islandRef=useRef<HTMLDivElement>(null);
 const pillRef=useRef<HTMLButtonElement>(null);
 const listRef=useRef<HTMLDivElement>(null);
 const focusList=useRef(false);
 const focusPill=useRef(false);
 const id=useId();
 useEffect(()=>{
  if(open&&focusList.current){focusList.current=false;listRef.current?.focus({preventScroll:true})}
  else if(!open&&focusPill.current){focusPill.current=false;pillRef.current?.focus({preventScroll:true})}
 },[open]);
 useEffect(()=>{
  if(!open)return;
  const close=(event:globalThis.PointerEvent)=>{if(!islandRef.current?.contains(event.target as Node))setOpen(false)};
  document.addEventListener('pointerdown',close);
  return()=>document.removeEventListener('pointerdown',close);
 },[open]);
 const handleBlur=useCallback((event:FocusEvent<HTMLDivElement>)=>{
  if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);
 },[]);
 const handleKeyDown=useCallback((event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.stopPropagation();focusPill.current=Boolean(islandRef.current?.contains(document.activeElement));setOpen(false)}
 },[]);
 const running=['queued','running','reconciling'].includes(run.status);
 const warning=['outcome-unknown','manual-review','failed'].includes(run.status);
 return <div className={`ae-island ${warning?'ae-island-warning':''}`} ref={islandRef} onBlur={handleBlur} onKeyDown={handleKeyDown}>
  <button type="button" ref={pillRef} aria-expanded={open} aria-controls={id} className="ae-island-pill" onClick={()=>{focusList.current=!open;setOpen(!open)}}>
   <span className={`ae-island-dot ${running?'ae-island-running':''}`} aria-hidden="true"/>
   <span role="status">{label}</span><span className="ae-island-count">{run.events.length} 条事件</span><span aria-hidden="true">{open?'−':'+'}</span>
  </button>
  {open&&<div className="ae-island-detail" id={id} tabIndex={-1} ref={listRef} aria-label="执行状态详情">
   <span className="ae-eyebrow">SERVER-REPORTED STATE</span><dl><div><dt>Run</dt><dd>{run.runId}</dd></div><div><dt>状态</dt><dd>{run.status}</dd></div><div><dt>回执</dt><dd>{run.receipts.length}</dd></div></dl>
   <p>此状态来自运行时，不是模型推断。完整参数与事件请查看执行记录。</p><button type="button" onClick={()=>{focusPill.current=true;setOpen(false)}}>收起详情</button>
  </div>}
 </div>;
}
