import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryControlPlane } from '@ae/control-plane';
import { ticketCapabilities } from '@ae/capabilities';
import { digest } from '@ae/policy';
import { validateIntentRow,recoverIntentBatch,STARTUP_RECOVERY_LIMIT,type IntentRow } from '../src/intents.js';
const principal={tenantId:'t',applicationId:'a',subjectId:'s',roles:['agentic:admin'],scopes:[]};
const control=new InMemoryControlPlane(ticketCapabilities);const draft=control.save(principal,{name:'Test',instructions:'Test',capabilityIds:['read_ticket'],bounds:{maxTurns:2,maxElapsedMs:1000}});const release=control.publish(principal,draft.draftId,1);
function row(intent='key'):IntentRow{const key=digest([principal.tenantId,principal.applicationId,principal.subjectId,intent]);const start={runId:`intent-${key}`,principal,releaseId:release.releaseId,release,input:'hello'};return {intent_key:key,intent_token:intent,input_hash:digest({input:'hello'}),run_id:start.runId,start_hash:digest(start),start};}
test('shared row validation rejects damaged metadata before startup submission',async()=>{
  assert.equal(validateIntentRow(row()).principal.subjectId,'s');
  const broken=['intent_key','intent_token','input_hash','run_id','start_hash'].map(field=>({...row(),[field]:'damaged'}));
  const changed=row();const start=structuredClone(changed.start) as ReturnType<typeof validateIntentRow>;start.principal.subjectId='other';changed.start=start;changed.start_hash=digest(start);broken.push(changed);
  let submitted=0;const report=await recoverIntentBatch(broken,async()=>{submitted++;}).result;assert.equal(submitted,0);assert.equal(report.blocked.length,broken.length);assert.equal(report.accepted,0);
  assert.throws(()=>validateIntentRow(row(),{principal:{...principal,subjectId:'other'},intent:'key'}),/BINDING_DENIED/);
});
test('startup batch is capped and concurrency never exceeds two',async()=>{
  let active=0,maximum=0,calls=0;const rows=Array.from({length:STARTUP_RECOVERY_LIMIT+5},(_,i)=>row(`key${i}`));
  const report=await recoverIntentBatch(rows,async()=>{calls++;active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,1));active--;}).result;
  assert.equal(calls,STARTUP_RECOVERY_LIMIT);assert.equal(maximum,2);assert.equal(report.deferred,true);
});
test('stopping recovery waits in-flight work and does not admit queued rows',async()=>{
  const releaseWork:(()=>void)[]=[];let calls=0,settled=false;const batch=recoverIntentBatch([row('one'),row('two'),row('three')],async()=>{calls++;await new Promise<void>(r=>releaseWork.push(r));});batch.stop();void batch.result.then(()=>{settled=true;});await Promise.resolve();assert.equal(settled,false);assert.equal(calls,2);for(const release of releaseWork)release();const report=await batch.result;assert.equal(report.accepted,2);assert.equal(report.deferred,true);assert.equal(calls,2);
});
