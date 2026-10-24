import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { ConfigurationPanel, createConfigurationClient, type ConfigurationClient } from '../src/configuration.js';
import { InMemoryControlPlane } from '../../control-plane/src/index.js';
import { ticketCapabilities } from '@ae/capabilities';
import type { Principal } from '@ae/contracts';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
const admin:Principal={tenantId:'a',applicationId:'app',subjectId:'admin',roles:['agentic:admin'],scopes:[]};
function setup(overrides:Partial<ConfigurationClient>={}){const store=new InMemoryControlPlane(ticketCapabilities);const client:ConfigurationClient={state:async()=>store.state(admin),save:async(config,draft)=>store.save(admin,config,draft?.draftId,draft?.revision),validate:async draft=>store.validate(admin,draft.draftId,draft.revision),publish:async draft=>store.publish(admin,draft.draftId,draft.revision),...overrides};return {store,client};}
async function mount(client:ConfigurationClient){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<ConfigurationPanel client={client}/>));return {container,async dispose(){await act(async()=>root.unmount());container.remove();}};}
function button(container:HTMLElement,text:string){const result=[...container.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(result);return result;}
async function click(container:HTMLElement,text:string){await act(async()=>button(container,text).click());}
test('configuration UI saves real draft, validates changes and publishes immutable snapshot; disabled write remains absent',async()=>{
  const {store,client}=setup();const view=await mount(client);try{
    assert.equal(button(view.container,'发布不可变版本').disabled,true);
    const checks=view.container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');await act(async()=>checks[0]!.click());
    await click(view.container,'保存草稿');assert.equal(store.state(admin).drafts.length,1);assert.equal(store.state(admin).releases.length,0);
    await click(view.container,'校验与查看变更');assert.match(view.container.textContent!,/Initial release/);assert.equal(button(view.container,'发布不可变版本').disabled,false);
    await click(view.container,'发布不可变版本');assert.equal(store.state(admin).releases.length,1);assert.deepEqual(store.activeRelease(admin)!.configuration.capabilityIds,['read_ticket']);assert.match(view.container.textContent!,/仅新任务使用新版本/);
    assert.equal(button(view.container,'发布不可变版本').disabled,true);
  }finally{await view.dispose();}
});
test('permission denial never renders configuration mutation controls',async()=>{const {client}=setup({state:async()=>({durability:'memory_fixture',canConfigure:false,capabilities:[],drafts:[],releases:[]})});const view=await mount(client);try{assert.match(view.container.textContent!,/没有配置管理权限/);assert.equal(view.container.querySelector('form'),null);}finally{await view.dispose();}});
test('server save failure gets keyboard focus and cannot enable publishing',async()=>{const {client}=setup({save:async()=>{throw new Error('CONFIGURATION_ADMIN_DENIED');}});const view=await mount(client);try{await click(view.container,'保存草稿');assert.match(view.container.textContent!,/CONFIGURATION_ADMIN_DENIED/);assert.equal(document.activeElement,view.container.querySelector('[role=alert]'));assert.equal(button(view.container,'发布不可变版本').disabled,true);}finally{await view.dispose();}});
test('editing saved draft invalidates validation and blocks publishing until saved again',async()=>{const {client}=setup();const view=await mount(client);try{await click(view.container,'保存草稿');await click(view.container,'校验与查看变更');assert.equal(button(view.container,'发布不可变版本').disabled,false);await act(async()=>view.container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());assert.equal(button(view.container,'发布不可变版本').disabled,true);assert.equal(button(view.container,'校验与查看变更').disabled,true);}finally{await view.dispose();}});
test('pending save disables repeat actions; refresh uses same backend state',async()=>{const base=setup();let resolve!:()=>void,calls=0;const {client}=setup({save:async(config,draft)=>{calls++;await new Promise<void>(r=>{resolve=r;});return base.client.save(config,draft);},state:()=>base.client.state()});const view=await mount(client);try{await click(view.container,'保存草稿');assert.equal(button(view.container,'保存草稿').matches(':disabled'),true);await click(view.container,'保存草稿');assert.equal(calls,1);await act(async()=>resolve());await click(view.container,'重新加载配置');assert.equal(base.store.state(admin).drafts.length,1);}finally{await view.dispose();}});
test('HTTP configuration client uses one origin API and never emits role/identity fields',async()=>{const original=globalThis.fetch;let url='',body='';globalThis.fetch=async(input,init)=>{url=String(input);body=String(init?.body??'');return new Response(JSON.stringify({draftId:'d'}),{status:201,headers:{'content-type':'application/json'}});};try{const client=createConfigurationClient('/api');await client.save({name:'A',instructions:'B',capabilityIds:[],bounds:{maxTurns:1,maxElapsedMs:1000}});assert.equal(url,'/api/configuration/drafts');assert.deepEqual(Object.keys(JSON.parse(body)),['configuration']);}finally{globalThis.fetch=original;}});
