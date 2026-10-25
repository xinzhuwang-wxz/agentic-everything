import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import { createInventoryUiFixture } from '../../../tests/support/inventory-ui.js';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame,cancelAnimationFrame:dom.window.cancelAnimationFrame,window:dom.window,document:dom.window.document,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver,sessionStorage:dom.window.sessionStorage,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
const {AgenticMount,createAeClient}=await import('../../host-sdk/src/mount.js');
const {createConfigurationClient}=await import('../src/configuration.js');
function button(text:string){const element=Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item=>item.textContent?.includes(text));assert.ok(element,`missing ${text}`);return element}
async function until(check:()=>boolean){for(let i=0;i<200&&!check();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))});assert.ok(check(),'condition did not settle')}

test('actual mounted generic SDK/HTTP/Python inventory preserves one approval through floating and administration',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'ae-mounted-inventory-')),container=document.createElement('div');document.body.append(container);let root=createRoot(container),app:Hono;
 const server=serve({hostname:'127.0.0.1',port:0,fetch:request=>app.fetch(request)});await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 try{
  const fixture=createInventoryUiFixture({directory,apiOrigin:base,allowedOrigin:base});app=fixture.app;
  let starts=0,refreshes=0;const contexts:unknown[]=[];
  const client=createAeClient({apiBase:base+'/api',fetch:async(input,init)=>{if(String(input).endsWith('/runs')&&init?.method==='POST'){starts++;contexts.push(JSON.parse(init.body as string).context)}return fetch(input,{...init,headers:{...init?.headers,Origin:base}})}});
  const configuration=createConfigurationClient(base+'/api');
  const onRunChange=(run:{status:string})=>{if(run.status==='succeeded'){refreshes++;assert.equal(fixture.stock().available,9)}};
  const render=(visible:boolean)=>root.render(<AgenticMount apiBase={base+'/api'} context={{sku:'desk-01'}} contextLabel="Inventory desk stock" suggestions={[{label:'Reserve inventory',input:'Reserve 3 desks for order-ui'}]} sessionKey="synthetic-alice" client={client} configurationClient={configuration} floating={{applicationId:'inventory-mounted'}} managementVisible={visible} onRunChange={onRunChange}/>);
  await act(async()=>render(false));await until(()=>!!document.querySelector<HTMLTextAreaElement>('textarea')&&!document.querySelector<HTMLTextAreaElement>('textarea')!.disabled);
  await act(async()=>document.querySelector<HTMLButtonElement>('.ae-floating-launcher')!.click());assert.doesNotMatch(document.body.textContent!,/工单|优先级/);
  await act(async()=>button('Reserve inventory').click());assert.equal(starts,0);
  await act(async()=>document.querySelector('.ae-input')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  await until(()=>document.querySelectorAll('.ae-approval').length===1);assert.deepEqual(contexts,[{sku:'desk-01'}]);assert.equal(fixture.host.mutationDispatchCount,0);assert.equal(fixture.stock().available,12);
  await act(async()=>button('关闭').click());await act(async()=>render(true));await act(async()=>{const tab=button('配置与发布');tab.focus();tab.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}))});await until(()=>!!document.querySelector('.ae-configuration form'));assert.equal(starts,1);assert.equal(fixture.host.mutationDispatchCount,0);
  await act(async()=>document.querySelector<HTMLButtonElement>('.ae-floating-launcher')!.click());assert.equal(document.querySelectorAll('.ae-approval').length,1);
  // Reload the mounted scope. SDK recovery reads the existing server run; it does not start again.
  await act(async()=>root.unmount());root=createRoot(container);await act(async()=>render(false));await until(()=>document.querySelectorAll('.ae-approval').length===1);await act(async()=>document.querySelector<HTMLButtonElement>('.ae-floating-launcher')!.click());assert.equal(starts,1);
  await act(async()=>{button('确认并执行').click();button('确认并执行').click()});await until(()=>fixture.host.mutationDispatchCount===1&&!document.querySelector('.ae-approval'));assert.equal(starts,1);assert.equal(refreshes,1);assert.equal(fixture.stock().available,9);
  assert.doesNotMatch(JSON.stringify(sessionStorage),/desk-01|synthetic-alice|Reserve 3|expectedHash|Inventory desk/);assert.match(Object.keys(sessionStorage)[0]!,/^ae:run:v2:[a-f0-9]{64}$/);
 }finally{await act(async()=>root.unmount());container.remove();sessionStorage.clear();localStorage.clear();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(directory,{recursive:true,force:true})}
});
