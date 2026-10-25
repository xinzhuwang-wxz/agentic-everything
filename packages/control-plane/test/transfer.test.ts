import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketCapabilities } from '@ae/capabilities';
import { digest } from '@ae/policy';
import { ConfigurationTransfer, InMemoryControlPlane, asAsyncControlPlane } from '../src/index.js';
import { createConfigurationRoutes } from '../src/http.js';
const admin={tenantId:'a',applicationId:'app',subjectId:'admin',roles:['agentic:admin'],scopes:[]};
const config={name:'Exported fixture',instructions:'Use registered tools.',capabilityIds:['read_ticket'],bounds:{maxTurns:4,maxElapsedMs:10000}};
const seal=(value:Record<string,unknown>)=>{const {contentHash,...content}=value;return {...content,contentHash:digest(content)};};
test('configuration transfer previews read-only and imports new draft without publication or overwrite',async()=>{
  const store=new InMemoryControlPlane(ticketCapabilities),transfer=new ConfigurationTransfer(asAsyncControlPlane(store)),draft=store.save(admin,config);
  const envelope=await transfer.export(admin,draft.draftId,1),before=store.state(admin),preview=await transfer.preview(admin,envelope);
  assert.equal(preview.valid,true);assert.deepEqual(store.state(admin),before);
  const imported=await transfer.import(admin,envelope,preview.previewHash);assert.notEqual(imported.draftId,draft.draftId);assert.equal(imported.revision,1);assert.deepEqual(imported.configuration,config);assert.equal(store.state(admin).releases.length,0);assert.deepEqual(store.state(admin).drafts[0],draft);
});
test('transfer rejects schema/secret fields, corrupt hash, wrong scope, capability drift and stale active-release preview',async()=>{
  const store=new InMemoryControlPlane(ticketCapabilities),transfer=new ConfigurationTransfer(asAsyncControlPlane(store)),draft=store.save(admin,config),envelope=await transfer.export(admin,draft.draftId,1);
  for(const bad of [{...envelope,schemaVersion:'2'},{...envelope,apiKey:'not-allowed'},{...envelope,configuration:{...config,providerKey:'not-allowed'}},{...envelope,contentHash:'0'.repeat(64)},seal({...envelope,tenantId:'other'}),seal({...envelope,capabilities:envelope.capabilities.map(c=>({...c,version:'2'}))}),seal({...envelope,capabilities:[]}),seal({...envelope,configuration:{...config,behavior:{baselineHash:'a'.repeat(64),candidateCodeHash:'b'.repeat(64),registryHash:'c'.repeat(64),enabled:[]}}})]){
    const preview=await transfer.preview(admin,bad);assert.equal(preview.valid,false);await assert.rejects(transfer.import(admin,bad,preview.previewHash),/IMPORT_CONFLICT/);
  }
  const preview=await transfer.preview(admin,envelope);store.publish(admin,draft.draftId,1);await assert.rejects(transfer.import(admin,envelope,preview.previewHash),/PREVIEW_CONFLICT/);
  assert.equal(store.state(admin).drafts.length,1);
});
test('transfer rechecks live administration and HTTP refuses forged identities',async()=>{
  let revoked=false;const store=new InMemoryControlPlane(ticketCapabilities,p=>revoked?{...p,roles:[]}:p),transfer=new ConfigurationTransfer(asAsyncControlPlane(store)),draft=store.save(admin,config),envelope=await transfer.export(admin,draft.draftId,1),preview=await transfer.preview(admin,envelope);
  revoked=true;await assert.rejects(transfer.import(admin,envelope,preview.previewHash),/ADMIN_DENIED/);revoked=false;
  const app=createConfigurationRoutes(store,()=>admin),send=(path:string,data:unknown)=>app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  assert.equal((await send('/transfer/export',{draftId:draft.draftId,expectedRevision:1})).status,200);
  assert.equal((await send('/transfer/import',{envelope,expectedPreviewHash:preview.previewHash,principal:admin})).status,400);
  assert.equal((await send('/transfer/preview',{envelope})).status,200);
  assert.equal((await send('/transfer/import',{envelope,expectedPreviewHash:preview.previewHash})).status,201);
});

test('HTTP transfer round-trips accepted multibyte drafts beyond the draft body cap, with a separate finite envelope cap',async()=>{
  const capabilities=Array.from({length:32},(_,i)=>({...ticketCapabilities[0]!,capabilityId:`cap_${String(i).padStart(3,'0')}_${'x'.repeat(109)}`}));
  const configuration={...config,instructions:'中'.repeat(8000),capabilityIds:capabilities.map(c=>c.capabilityId)};
  const store=new InMemoryControlPlane(capabilities),app=createConfigurationRoutes(store,()=>admin);
  const send=(path:string,data:unknown)=>app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  assert.ok(Buffer.byteLength(JSON.stringify({configuration}))<32768);
  const saved=await send('/drafts',{configuration});assert.equal(saved.status,201);const draft=await saved.json();
  const exported=await send('/transfer/export',{draftId:draft.draftId,expectedRevision:1});assert.equal(exported.status,200);const envelope=await exported.json();
  assert.ok(Buffer.byteLength(JSON.stringify({envelope}))>32768);
  const previewed=await send('/transfer/preview',{envelope});assert.equal(previewed.status,200);const preview=await previewed.json();assert.equal(preview.valid,true);
  const imported=await send('/transfer/import',{envelope,expectedPreviewHash:preview.previewHash});assert.equal(imported.status,201);const newDraft=await imported.json();
  assert.notEqual(newDraft.draftId,draft.draftId);assert.deepEqual(newDraft.configuration,configuration);assert.equal(store.state(admin).releases.length,0);
  for(const path of ['/transfer/preview','/transfer/import']){const denied=await send(path,{envelope:'x'.repeat(128*1024)});assert.equal(denied.status,400);assert.equal((await denied.json()).error.code,'PAYLOAD_TOO_LARGE');}
  const oversizedDraft=await send('/drafts',{configuration:{...configuration,instructions:'中'.repeat(12000)}});assert.equal(oversizedDraft.status,400);assert.equal((await oversizedDraft.json()).error.code,'PAYLOAD_TOO_LARGE');
  assert.equal(store.state(admin).drafts.length,2);
  // Do not return an apparently usable export if trusted catalog metadata itself exceeds the import bound.
  const oversizedStore=new InMemoryControlPlane([{...ticketCapabilities[0]!,version:'v'.repeat(128*1024)}]);
  const oversized=oversizedStore.save(admin,{...config,capabilityIds:[ticketCapabilities[0]!.capabilityId]});
  const oversizedExport=await createConfigurationRoutes(oversizedStore,()=>admin).request('/transfer/export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({draftId:oversized.draftId,expectedRevision:1})});
  assert.equal(oversizedExport.status,400);assert.equal((await oversizedExport.json()).error.code,'PAYLOAD_TOO_LARGE');
});
