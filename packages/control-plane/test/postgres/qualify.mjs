import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PostgresControlPlane } from '../../../../dist/packages/control-plane/src/postgres.js';
import { createConfigurationRoutes } from '../../../../dist/packages/control-plane/src/http.js';
import { ticketCapabilities } from '@ae/capabilities';
const url=process.argv[2],run=promisify(execFile);
const worker=async(action,data)=>JSON.parse((await run(process.execPath,['packages/control-plane/test/postgres/worker.mjs',url,action,...(data?[JSON.stringify(data)]:[])])).stdout);
const admin={tenantId:'tenant-a',applicationId:'app',subjectId:'admin',roles:['agentic:admin'],scopes:[]};
const draft=await worker('save');
// Separate Node processes compete to publish precisely the same draft revision.
const [release,repeat]=await Promise.all([worker('publish',draft),worker('publish',draft)]);assert.deepEqual(repeat,release);
const restarted=await worker('state');assert.equal(restarted.durability,'postgres_qualified');assert.deepEqual(restarted.releases,[release]);assert.equal(restarted.activeReleaseId,release.releaseId);assert.deepEqual(restarted.drafts,[draft]);
const store=new PostgresControlPlane(url,ticketCapabilities);
try {
  const next=await store.save(admin,{...draft.configuration,name:'New release',capabilityIds:[]},draft.draftId,1);
  await assert.rejects(store.save(admin,draft.configuration,draft.draftId,1),/DRAFT_REVISION_CONFLICT/);
  const latest=await store.publish(admin,next.draftId,2);assert.notEqual(latest.releaseId,release.releaseId);
  assert.deepEqual(await store.publish(admin,draft.draftId,1),release);assert.equal((await store.activeRelease(admin)).releaseId,latest.releaseId);
  for(const p of [{...admin,tenantId:'other'},{...admin,applicationId:'other'}]){assert.equal((await store.state(p)).releases.length,0);await assert.rejects(store.publish(p,draft.draftId,1),/CONFIGURATION_NOT_FOUND/);}
  const viewer={...admin,roles:['editor']};const state=await store.state(viewer);assert.equal(state.canConfigure,false);assert.deepEqual(state.drafts,[]);assert.deepEqual(state.releases,[]);assert.deepEqual(state.capabilities,[]);await assert.rejects(store.publish(viewer,draft.draftId,1),/ADMIN_DENIED/);
  for(const invalid of [{...draft.configuration,bounds:{maxTurns:17,maxElapsedMs:1000}},{...draft.configuration,capabilityIds:['unregistered']},{...draft.configuration,providerKey:'not-a-secret'}])await assert.rejects(store.save(admin,invalid));
  const app=createConfigurationRoutes(store,()=>admin);const stale=await app.request('/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({configuration:draft.configuration,draftId:draft.draftId,expectedRevision:1})});assert.equal(stale.status,409);
  for(const field of ['tenantId','applicationId','subjectId']){const bad=new PostgresControlPlane(url,ticketCapabilities,p=>{p[field]='mutated';return p;});try{for(const operation of [()=>bad.state(admin),()=>bad.activeRelease(admin),()=>bad.publish(admin,draft.draftId,1)])await assert.rejects(operation(),/IDENTITY_DENIED/);}finally{await bad.close();}}
  let calls=0;const revoking=new PostgresControlPlane(url,ticketCapabilities,p=>({...p,roles:++calls>=3?[]:p.roles}));try{await assert.rejects(revoking.save(admin,{...draft.configuration,name:'Must roll back'}),/ADMIN_DENIED/);}finally{await revoking.close();}assert.equal((await store.state(admin)).drafts.length,1);
  const final=await worker('state');assert.equal(final.activeReleaseId,latest.releaseId);assert.equal(final.releases.length,2);assert.deepEqual(final.releases.find(r=>r.releaseId===release.releaseId),release);
  console.log('PASS: real PG process restart, concurrent immutable publish, atomic active pointer, stale edit 409, tenant/application/admin boundaries, in-place identity mutation rejection, role revocation rollback, fixed capabilities/bounds, non-admin data minimization, old publish never rolls active pointer back.');
} finally {await store.close();}
