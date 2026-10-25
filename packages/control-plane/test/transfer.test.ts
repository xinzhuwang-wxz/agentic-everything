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
