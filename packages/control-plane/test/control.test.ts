import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentReleaseSchema, type AgentConfiguration, type Principal } from '@ae/contracts';
import { ticketCapabilities } from '@ae/capabilities';
import { InMemoryControlPlane, releasedCatalog, verifyRelease } from '../src/index.js';
import { createConfigurationRoutes } from '../src/http.js';
const admin: Principal = {tenantId:'a',applicationId:'app',subjectId:'admin',roles:['agentic:admin'],scopes:[]};
const config: AgentConfiguration = {name:'Software assistant',instructions:'Use registered capabilities only.',capabilityIds:['read_ticket'],bounds:{maxTurns:4,maxElapsedMs:10000}};
test('draft validate publish is immutable, hashed, bounded, idempotent and revision protected',()=>{
  const control=new InMemoryControlPlane(ticketCapabilities);const draft=control.save(admin,config);
  assert.deepEqual(control.validate(admin,draft.draftId,1).changes,['Initial release']);
  const release=control.publish(admin,draft.draftId,1);assert.ok(AgentReleaseSchema.safeParse(release).success);verifyRelease(release);
  assert.deepEqual(control.publish(admin,draft.draftId,1),release);
  const next=control.save(admin,{...config,name:'Next',capabilityIds:[]},draft.draftId,1);
  assert.deepEqual(control.validate(admin,next.draftId,2).changes,['name changed','Disable read_ticket']);
  assert.throws(()=>control.publish(admin,next.draftId,1),/DRAFT_REVISION_CONFLICT/);
  assert.throws(()=>control.save(admin,config,next.draftId,1),/DRAFT_REVISION_CONFLICT/);
  assert.equal(control.activeRelease(admin)!.configuration.name,'Software assistant');
  release.configuration.name='tampered';assert.throws(()=>verifyRelease(release),/RELEASE_INTEGRITY_DENIED/);
  assert.equal(control.activeRelease(admin)!.configuration.name,'Software assistant');
  assert.notEqual(control.publish(admin,next.draftId,2).releaseId,release.releaseId);
});
test('configuration admin is independent of host editor, tenants/applications and current revocation',()=>{
  let revoked=false;const control=new InMemoryControlPlane(ticketCapabilities,p=>revoked?{...p,roles:[]}:p);
  const editor={...admin,roles:['editor'],scopes:['tickets:read','tickets:write']};
  assert.throws(()=>control.save(editor,config),/ADMIN_DENIED/);
  const draft=control.save(admin,config);for(const p of [{...admin,tenantId:'b'},{...admin,applicationId:'other'}]){
    assert.deepEqual(control.state(p).drafts,[]);assert.throws(()=>control.publish(p,draft.draftId,1),/NOT_FOUND/);
  }
  revoked=true;assert.throws(()=>control.publish(admin,draft.draftId,1),/ADMIN_DENIED/);assert.equal(control.state(admin).canConfigure,false);
});
test('registered capabilities only; no arbitrary endpoint, secret or elevated bounds',()=>{
  const control=new InMemoryControlPlane(ticketCapabilities);
  for(const input of [{...config,capabilityIds:['https://evil.example/tool']},{...config,providerKey:'secret'},{...config,bounds:{maxTurns:17,maxElapsedMs:10000}},{...config,capabilityIds:['read_ticket','read_ticket']}])assert.throws(()=>control.save(admin,input));
});
test('published catalog intersects pinned capabilities and current exact host capability versions',()=>{
  const control=new InMemoryControlPlane(ticketCapabilities);const d=control.save(admin,config);const release=control.publish(admin,d.draftId,1);
  assert.deepEqual(releasedCatalog(release,admin,ticketCapabilities).map(c=>c.capabilityId),['read_ticket']);
  assert.deepEqual(releasedCatalog(release,admin,[]),[]);
  assert.deepEqual(releasedCatalog(release,admin,ticketCapabilities.map(c=>({...c,version:'2'}))),[]);
  assert.throws(()=>releasedCatalog(release,{...admin,tenantId:'b'},ticketCapabilities),/TENANT_DENIED/);
});
test('HTTP trusted identity cannot be forged using role headers/body; actual save validate publish routes',async()=>{
  const control=new InMemoryControlPlane(ticketCapabilities);let principal:Principal|undefined=undefined;
  const app=createConfigurationRoutes(control,()=>principal);
  const send=(path:string,data:unknown)=>app.request(path,{method:'POST',headers:{'content-type':'application/json','x-role':'agentic:admin'},body:JSON.stringify(data)});
  assert.equal((await send('/drafts',{configuration:config})).status,401);
  principal={...admin,roles:['editor']};assert.equal((await send('/drafts',{configuration:config})).status,403);
  principal=admin;assert.equal((await send('/drafts',{configuration:config,roles:['agentic:admin']})).status,400);
  const saved=await send('/drafts',{configuration:config});assert.equal(saved.status,201);const draft=await saved.json() as {draftId:string};
  assert.equal((await send(`/drafts/${draft.draftId}/validate`,{expectedRevision:1})).status,200);
  assert.equal((await send(`/drafts/${draft.draftId}/publish`,{expectedRevision:2})).status,409);
  const published=await send(`/drafts/${draft.draftId}/publish`,{expectedRevision:1});assert.equal(published.status,200);
  const state=await (await app.request('/')).json() as {releases:unknown[]};assert.equal(state.releases.length,1);
  principal={...admin,tenantId:'b'};assert.equal((await send(`/drafts/${draft.draftId}/publish`,{expectedRevision:1})).status,404);
});
test('in-place current principal mutation cannot silently change identity',()=>{for(const field of ['tenantId','applicationId','subjectId'] as const){const p=structuredClone(admin);const control=new InMemoryControlPlane(ticketCapabilities,current=>{current[field]='attacker';return current;});assert.throws(()=>control.state(p),/CONFIGURATION_IDENTITY_DENIED/);assert.deepEqual(p,admin);}});
