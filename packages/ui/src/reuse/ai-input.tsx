/**
 * @author: @kokonutui
 * @description: AI Input Search
 * @version: 4.0.0
 * @date: 2026-10-18
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 * AE adaptation: controlled value/submit, scoped CSS, no demo, files or model menus.
 * Frame/textarea interaction and resize hook derived from fixed source in vendor/kokonut.
 */
import React, { useEffect, useId } from 'react';
import { useAutoResizeTextarea } from './use-auto-resize-textarea.js';
export interface AIInputProps {
 value:string; onChange:(value:string)=>void; onSubmit:()=>void;
 disabled:boolean; busy:boolean; contextLabel:string; submitLabel?:string;
}
export function AIInput({value,onChange,onSubmit,disabled,busy,contextLabel,submitLabel='发送'}:AIInputProps){
 const id=useId();
 const {textareaRef,adjustHeight}=useAutoResizeTextarea({minHeight:72,maxHeight:200});
 useEffect(()=>adjustHeight(),[value,adjustHeight]);
 const submit=()=>{if(value.trim()&&!disabled&&!busy)onSubmit()};
 // Pointer shortcut retained from Kokonut; keyboard controls remain native.
 const handleContainerClick=(target:EventTarget)=>{
  if(target instanceof Element&&target.closest('button, [role=menu]'))return;
  textareaRef.current?.focus();
 };
 return <form className="ae-input" onSubmit={event=>{event.preventDefault();submit()}}>
  <label htmlFor={id}>告诉助手你想完成什么</label>
  <div className="ae-input-frame" onClick={event=>handleContainerClick(event.target)}>
   <div className="ae-input-caption"><span className="ae-context-mark" aria-hidden="true">◈</span><span>当前上下文</span><strong>{contextLabel}</strong><span className="ae-input-boundary">服务端权限边界</span></div>
   <div className="ae-input-card">
    <textarea ref={textareaRef} id={id} value={value} rows={2} disabled={disabled||busy}
     placeholder="描述你的目标，助手会先展示修改预览…"
     onChange={event=>{onChange(event.target.value);adjustHeight()}}
     onKeyDown={event=>{
      // Composition Enter must never submit Chinese/Japanese IME candidates.
      if(event.nativeEvent.isComposing||event.keyCode===229)return;
      if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();submit()}
     }}/>
    <div className="ae-input-toolbar"><span><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m8 1 5 2v4c0 4-5 7-5 7S3 11 3 7V3z"/><path d="m5.5 7.5 1.5 1.5 3.5-3.5"/></svg>修改前需确认</span><button type="submit" className="ae-primary" disabled={!value.trim()||disabled||busy}>{busy?'处理中…':submitLabel}<span aria-hidden="true">↗</span></button></div>
   </div>
  </div>
  <div className="ae-input-help"><span>执行以服务端回执为准</span><span>Enter 换行 · Ctrl / ⌘ + Enter 发送</span></div>
 </form>;
}
