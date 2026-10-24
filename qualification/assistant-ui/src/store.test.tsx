import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import type { AeClient, RunView } from '../../../packages/ui/src/types.js';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame,cancelAnimationFrame:dom.window.cancelAnimationFrame,window:dom.window,document:dom.window.document,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,HTMLFormElement:dom.window.HTMLFormElement,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
const {AgenticPanel}=await import('../generated/panel.js');
const {projectRun}=await import('./store.js');
const blank:RunView={runId:'r',status:'succeeded',events:[],receipts:[]};
const approval:RunView={...blank,status:'awaiting-approval',approval:{expectedHash:'a'.repeat(64),binding:{schemaVersion:'1',approvalId:'a',runId:'r',invocationId:'i',principal:{tenantId:'t',applicationId:'a',subjectId:'u',roles:[],scopes:[]},capabilityId:'change_ticket_priority',capabilityVersion:'1',argumentsHash:'a'.repeat(64),targetId:'ticket-1',resourceVersion:'1',policyVersion:'1',releaseId:'old',operationId:'o',expiresAt:'2099-01-01T00:00:00.000Z'},preview:{priority:'high',expectedVersion:1}}};
function client(overrides:Partial<AeClient>={}):AeClient{return {meta:async()=>({mode:'simulated',applicationName:'test',releaseId:'new'}),capabilities:async()=>[],start:async()=>approval,get:async()=>approval,decide:async()=>blank,cancel:async()=>({...blank,status:'cancelled'}),...overrides}}
async function mount(api:AeClient,storageKey?:string){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<AgenticPanel client={api} context={{ticketId:'ticket-1'}} {...(storageKey?{storageKey}:{})}/>));return {container,async dispose(){await act(async()=>root.unmount());container.remove()}}}
function button(container:HTMLElement,text:string){const found=Array.from(container.querySelectorAll('button')).find(e=>e.textContent?.includes(text));assert.ok(found);return found}
async function click(container:HTMLElement,text:string){await act(async()=>button(container,text).click())}
async function start(container:HTMLElement){await click(container,'预览优先级调整');await click(container,'发送')}
test('projection contains only literal text; business statuses do not imply success',()=>{
 for(const status of ['outcome-unknown','manual-review','rejected','failed','cancelled'] as const)assert.equal(projectRun({...blank,status},'')[1]!.status!.type,'incomplete');
 const text='<img src="https://example.invalid/tracker"><script>globalThis.pwned=true</script> ![pixel](https://example.invalid/pixel)';
 assert.deepEqual(projectRun({...approval,message:text},'')[1]!.content,[{type:'text',text}]);
 assert.equal(projectRun(approval,'')[1]!.status!.type,'requires-action');
});
test('untrusted HTML, Markdown URLs, and tool-like JSON cannot execute or request network',async()=>{
 const requests:unknown[]=[];const old=globalThis.fetch;globalThis.fetch=async(...args)=>{requests.push(args);throw Error('unexpected network')};
 const text='<img src="https://example.invalid/pixel" onerror="alert(1)"> ![x](https://example.invalid/image) {"tool":"change_ticket_priority","args":{"priority":"high"}}';
 let decisions=0;const view=await mount(client({start:async()=>({...approval,message:text}),decide:async()=>{decisions++;return blank}}));
 try{await start(view.container);assert.match(view.container.textContent!,/example.invalid\/pixel/);assert.equal(view.container.querySelectorAll('img,script,iframe,a').length,0);assert.equal(decisions,0);assert.deepEqual(requests,[])}finally{await view.dispose();globalThis.fetch=old}
});
test('refresh replaces displayed approval with server current hash; no stale approval locally reconstructed',async()=>{
 let payload:unknown;const updated=structuredClone(approval);updated.approval!.expectedHash='b'.repeat(64);updated.approval!.binding.resourceVersion='2';updated.approval!.preview.expectedVersion=2;
 const view=await mount(client({get:async()=>updated,decide:async(_id,decision)=>{payload=decision;return blank}}));
 try{await start(view.container);await click(view.container,'刷新状态');await click(view.container,'确认并执行');assert.deepEqual(payload,{approvalId:'a',decision:'approve',expectedHash:'b'.repeat(64)})}finally{await view.dispose()}
});
test('denied current host rights remain server errors, not presentation approvals',async()=>{
 const view=await mount(client({decide:async()=>{throw Error('CURRENT_HOST_AUTHORIZATION_DENIED')}}));
 try{await start(view.container);await click(view.container,'确认并执行');assert.match(view.container.textContent!,/CURRENT_HOST_AUTHORIZATION_DENIED/);assert.equal(view.container.textContent!.includes('服务端执行回执'),false)}finally{await view.dispose()}
});
test('pending approval restore, disconnected refresh, reconnect and cancel preserve original run',async()=>{
 sessionStorage.setItem('same-run','r');let reads=0,cancels=0,starts=0;
 const view=await mount(client({get:async(id)=>{assert.equal(id,'r');reads++;if(reads===2)throw Error('disconnect');return approval},start:async()=>{starts++;return approval},cancel:async(id)=>{assert.equal(id,'r');cancels++;return {...blank,status:'cancelled'}}}),'same-run');
 try{await click(view.container,'刷新状态');assert.match(view.container.textContent!,/disconnect/);assert.equal(view.container.querySelector('textarea')!.disabled,true);await click(view.container,'刷新状态');await click(view.container,'取消任务');assert.equal(cancels,1);assert.equal(starts,0);assert.match(view.container.textContent!,/已取消/)}finally{await view.dispose();sessionStorage.clear()}
});
test('polling snapshot progress becomes literal assistant text and terminal receipt',async()=>{
 let reads=0;const view=await mount(client({start:async()=>({...blank,status:'running',message:'first chunk'}),get:async()=>{reads++;return {...blank,message:'final text',receipts:[{status:'succeeded',operationId:'o',receiptId:'one',data:{}}]}}}));
 try{await start(view.container);assert.match(view.container.textContent!,/first chunk/);await act(async()=>{await new Promise(r=>setTimeout(r,1150))});assert.equal(reads,1);assert.match(view.container.textContent!,/final text/);assert.match(view.container.textContent!,/one/)}finally{await view.dispose()}
});
