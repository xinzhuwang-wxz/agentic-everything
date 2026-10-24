import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { ConfigurationPanel, createConfigurationClient, type ConfigurationClient, type ConfigurationState } from '../src/configuration.js';
import { InMemoryControlPlane } from '../../control-plane/src/index.js';
import { ticketCapabilities } from '@ae/capabilities';
import type { Principal } from '@ae/contracts';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
const admin:Principal={tenantId:'a',applicationId:'app',subjectId:'admin',roles:['agentic:admin'],scopes:[]};
function setup(overrides:Partial<ConfigurationClient>={}){const store=new InMemoryControlPlane(ticketCapabilities);const client:ConfigurationClient={state:async()=>store.state(admin),save:async(config,draft)=>store.save(admin,config,draft?.draftId,draft?.revision),validate:async draft=>store.validate(admin,draft.draftId,draft.revision),publish:async draft=>store.publish(admin,draft.draftId,draft.revision),...overrides};return {store,client};}
async function mount(client:ConfigurationClient, mode: 'configuration' | 'behavior' = 'configuration'){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<ConfigurationPanel client={client} mode={mode}/>));return {container,async render(nextMode: 'configuration' | 'behavior'){await act(async()=>root.render(<ConfigurationPanel client={client} mode={nextMode}/>));},async dispose(){await act(async()=>root.unmount());container.remove();}};}
function button(container:HTMLElement,text:string){const result=[...container.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(result);return result;}
async function click(container:HTMLElement,text:string){await act(async()=>button(container,text).click());}
test('configuration UI saves real draft, validates changes and publishes immutable snapshot; disabled write remains absent',async()=>{
  const {store,client}=setup();const view=await mount(client);try{
    assert.equal(button(view.container,'发布不可变版本').disabled,true);
    const checks=view.container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');await act(async()=>checks[0]!.click());
    await click(view.container,'保存草稿');assert.equal(store.state(admin).drafts.length,1);assert.equal(store.state(admin).releases.length,0);
    await click(view.container,'校验与查看变更');assert.match(view.container.textContent!,/Initial release/);assert.equal(button(view.container,'发布不可变版本').disabled,false);
    await click(view.container,'发布不可变版本');assert.equal(store.state(admin).releases.length,1);assert.deepEqual(store.activeRelease(admin)!.configuration.capabilityIds,['read_ticket']);assert.match(view.container.textContent!,/普通页面后续读取使用当前发布，已启动任务固定原版本/);
    assert.equal(button(view.container,'发布不可变版本').disabled,true);
  }finally{await view.dispose();}
});
test('permission denial never renders configuration mutation controls',async()=>{const {client}=setup({state:async()=>({durability:'memory_fixture',canConfigure:false,capabilities:[],drafts:[],releases:[]})});const view=await mount(client);try{assert.match(view.container.textContent!,/没有配置管理权限/);assert.equal(view.container.querySelector('form'),null);}finally{await view.dispose();}});
test('server save failure gets keyboard focus and cannot enable publishing',async()=>{const {client}=setup({save:async()=>{throw new Error('CONFIGURATION_ADMIN_DENIED');}});const view=await mount(client);try{await click(view.container,'保存草稿');assert.match(view.container.textContent!,/CONFIGURATION_ADMIN_DENIED/);assert.equal(document.activeElement,view.container.querySelector('[role=alert]'));assert.equal(view.container.querySelector('form'),null);}finally{await view.dispose();}});
test('editing saved draft invalidates validation and blocks publishing until saved again',async()=>{const {client}=setup();const view=await mount(client);try{await click(view.container,'保存草稿');await click(view.container,'校验与查看变更');assert.equal(button(view.container,'发布不可变版本').disabled,false);await act(async()=>view.container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());assert.equal(button(view.container,'发布不可变版本').disabled,true);assert.equal(button(view.container,'校验与查看变更').disabled,true);}finally{await view.dispose();}});
test('pending save disables repeat actions; refresh uses same backend state',async()=>{const base=setup();let resolve!:()=>void,calls=0;const {client}=setup({save:async(config,draft)=>{calls++;await new Promise<void>(r=>{resolve=r;});return base.client.save(config,draft);},state:()=>base.client.state()});const view=await mount(client);try{await click(view.container,'保存草稿');assert.equal(button(view.container,'保存草稿').matches(':disabled'),true);await click(view.container,'保存草稿');assert.equal(calls,1);await act(async()=>resolve());await click(view.container,'重新加载配置');assert.equal(base.store.state(admin).drafts.length,1);}finally{await view.dispose();}});
test('HTTP configuration client uses one origin API and never emits role/identity fields',async()=>{const original=globalThis.fetch;let url='',body='';globalThis.fetch=async(input,init)=>{url=String(input);body=String(init?.body??'');return new Response(JSON.stringify({draftId:'d'}),{status:201,headers:{'content-type':'application/json'}});};try{const client=createConfigurationClient('/api');await client.save({name:'A',instructions:'B',capabilityIds:[],bounds:{maxTurns:1,maxElapsedMs:1000}});assert.equal(url,'/api/configuration/drafts');assert.deepEqual(Object.keys(JSON.parse(body)),['configuration']);}finally{globalThis.fetch=original;}});
test('late response from previous identity cannot expose its drafts in a new configuration session',async()=>{
  const base=setup();let resolve!:()=>void;const old={...base.client,save:async(config:Parameters<ConfigurationClient['save']>[0])=>{await new Promise<void>(r=>{resolve=r;});return base.client.save(config);}};
  const denied=setup({state:async()=>({durability:'memory_fixture',canConfigure:false,capabilities:[],drafts:[],releases:[]})}).client;
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  try{await act(async()=>root.render(<ConfigurationPanel client={old}/>));await click(container,'保存草稿');await act(async()=>root.render(<ConfigurationPanel client={denied}/>));await act(async()=>resolve());assert.match(container.textContent!,/没有配置管理权限/);assert.equal(container.querySelector('form'),null);assert.equal(container.textContent!.includes('草稿已保存'),false);}finally{await act(async()=>root.unmount());container.remove();}
});
test('publish rejection preserves server error and never announces a release',async()=>{const {client}=setup({publish:async()=>{throw new Error('CONFIGURATION_REVISION_CONFLICT')}});const view=await mount(client);try{await click(view.container,'保存草稿');await click(view.container,'校验与查看变更');await click(view.container,'发布不可变版本');assert.match(view.container.querySelector('[role=alert]')!.textContent!,/CONFIGURATION_REVISION_CONFLICT/);assert.equal(view.container.textContent!.includes('已发布 '),false);assert.equal(document.activeElement,view.container.querySelector('[role=alert]'))}finally{await view.dispose()}});
test('load failure never exposes configuration inputs',async()=>{const {client}=setup({state:async()=>{throw new Error('HTTP_403')}});const view=await mount(client);try{assert.match(view.container.textContent!,/HTTP_403/);assert.equal(view.container.querySelector('form'),null)}finally{await view.dispose()}});
test('late initial admin fetch is discarded after switching configuration client',async()=>{let resolve!:(state:Awaited<ReturnType<ConfigurationClient['state']>>)=>void;const base=setup();const slow={...base.client,state:()=>new Promise<Awaited<ReturnType<ConfigurationClient['state']>>>(r=>{resolve=r})};const denied={...base.client,state:async()=>({durability:'memory_fixture' as const,canConfigure:false,capabilities:[],drafts:[],releases:[]})};const container=document.createElement('div');document.body.append(container);const root=createRoot(container);try{await act(async()=>root.render(<ConfigurationPanel client={slow}/>));await act(async()=>root.render(<ConfigurationPanel client={denied}/>));await act(async()=>resolve(base.store.state(admin)));assert.equal(container.querySelector('form'),null);assert.match(container.textContent!,/没有配置管理权限/)}finally{await act(async()=>root.unmount());container.remove()}});

const behaviorCatalog: NonNullable<ConfigurationState['behaviorCatalog']> = {baselineHash:'a'.repeat(64),candidateCodeHash:'b'.repeat(64),registryHash:'c'.repeat(64),improvements:[{id:'pagination-end',version:'1',category:'business-behavior',reason:'修正末页边界',evidence:['synthetic exact-end fixture'],impact:'末页不再显示下一页',risk:'客户端分页导航改变',defaultEnabled:false,reversibility:'关闭后仅新任务恢复旧行为',examples:{before:'末页显示下一页',after:'末页不显示下一页'},expectedAllowedDiff:[{caseId:'exact-end',path:['output','hasMore'],before:true,after:false}]}]};
function behaviorSetup(active = false, mismatch = false) {
  const configuration = {name:'现有助手',instructions:'保留原指令',capabilityIds:['read_ticket'],bounds:{maxTurns:4,maxElapsedMs:10000},...(active ? {behavior:{baselineHash:mismatch?'d'.repeat(64):behaviorCatalog.baselineHash,candidateCodeHash:behaviorCatalog.candidateCodeHash,registryHash:behaviorCatalog.registryHash,enabled:[{id:'pagination-end',version:'1'}]}} : {})};
  const release = {schemaVersion:'1' as const,releaseId:'release-existing',tenantId:'a',applicationId:'app',draftId:'draft-existing',draftRevision:1,configuration,capabilities:[],publishedAt:'2026-10-24T00:00:00.000Z',publishedBy:'admin',contentHash:'e'.repeat(64)};
  const saved: Parameters<ConfigurationClient['save']>[0][] = [];
  const state: ConfigurationState = {durability:'memory_fixture',canConfigure:true,capabilities:ticketCapabilities,drafts:[],releases:[release],activeReleaseId:release.releaseId,behaviorCatalog};
  const client: ConfigurationClient = {state:async()=>state,save:async config=>{saved.push(config);return {draftId:'draft-new',tenantId:'a',applicationId:'app',revision:1,configuration:config,updatedAt:'2026-10-24T00:00:00.000Z'};},validate:async()=>({valid:true,changes:['behavior changed']}),publish:async()=>release};
  return {client,saved,state};
}
test('behavior review defaults OFF and exposes evidence, risk, bindings and exact deltas',async()=>{
  const {client}=behaviorSetup();const view=await mount(client,'behavior');try {
    const radios=view.container.querySelectorAll<HTMLInputElement>('input[type=radio]');assert.equal(radios.length,2);assert.equal(radios[0]!.checked,true);assert.equal(radios[1]!.checked,false);
    for(const text of ['行为改进','synthetic exact-end fixture','客户端分页导航改变','exact-end','hasMore',behaviorCatalog.baselineHash,behaviorCatalog.candidateCodeHash,behaviorCatalog.registryHash,'不撤销历史写入','安全、权限和数据完整性']) assert.ok(view.container.textContent!.includes(text),text);
    assert.equal(view.container.querySelector('input[type=checkbox]'),null);
  } finally {await view.dispose();}
});
test('behavior selection survives switching to ordinary config and saving; active config is preserved',async()=>{
  const {client,saved}=behaviorSetup();const view=await mount(client,'behavior');try {
    await act(async()=>view.container.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]!.click());await view.render('configuration');await click(view.container,'保存草稿');
    assert.deepEqual(saved[0]!.behavior?.enabled,[{id:'pagination-end',version:'1'}]);assert.equal(saved[0]!.name,'现有助手');assert.deepEqual(saved[0]!.capabilityIds,['read_ticket']);
    await view.render('behavior');assert.equal(view.container.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]!.checked,true);
    await click(view.container,'校验与查看变更');assert.equal(button(view.container,'发布不可变版本').disabled,false);
    await act(async()=>view.container.querySelectorAll<HTMLInputElement>('input[type=radio]')[0]!.click());assert.equal(button(view.container,'发布不可变版本').disabled,true);await click(view.container,'保存草稿');assert.deepEqual(saved[1]!.behavior?.enabled,[]);
  } finally {await view.dispose();}
});
test('ordinary configuration initializes from active release without wiping enabled behavior',async()=>{
  const {client,saved}=behaviorSetup(true);const view=await mount(client);try {await click(view.container,'保存草稿');assert.deepEqual(saved[0]!.behavior?.enabled,[{id:'pagination-end',version:'1'}]);const history=view.container.querySelector('.ae-config-history')!;assert.match(history.textContent!,/发布者：admin/);assert.match(history.textContent!,/pagination-end@1/);assert.ok(history.textContent!.includes(behaviorCatalog.registryHash));assert.ok(history.textContent!.includes(behaviorCatalog.baselineHash));} finally {await view.dispose();}
});
test('mismatched evidence bindings are not silently migrated by behavior controls',async()=>{
  const {client,saved}=behaviorSetup(true,true);const view=await mount(client,'behavior');try {assert.equal(view.container.querySelector('input[type=radio]'),null);assert.match(view.container.textContent!,/不能自动迁移选择/);await click(view.container,'保存草稿');assert.equal(saved[0]!.behavior?.baselineHash,'d'.repeat(64));} finally {await view.dispose();}
});
test('behavior review respects configuration management permission and missing catalogs',async()=>{
  const {client,state,saved}=behaviorSetup(true);delete state.behaviorCatalog;
  const view=await mount(client,'behavior');try {assert.match(view.container.textContent!,/未提供可审阅/);await click(view.container,'保存草稿');assert.equal(saved[0]!.behavior?.enabled.length,1);state.canConfigure=false;await click(view.container,'重新加载配置');assert.equal(view.container.querySelector('form'),null);} finally {await view.dispose();}
});
test('non-business catalog entries never expose compatibility switches',async()=>{
  const {client,state}=behaviorSetup();state.behaviorCatalog={...behaviorCatalog,improvements:[{...behaviorCatalog.improvements[0]!,category:'security'} as unknown as NonNullable<ConfigurationState['behaviorCatalog']>['improvements'][number]]};
  const view=await mount(client,'behavior');try {assert.equal(view.container.querySelector('input[type=radio]'),null);assert.match(view.container.textContent!,/不能作为兼容性开关/);} finally {await view.dispose();}
});
