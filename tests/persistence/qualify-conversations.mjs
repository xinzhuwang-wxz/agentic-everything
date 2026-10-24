import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgresControlPlane } from '../../dist/packages/control-plane/src/postgres.js';
import { ticketCapabilities } from '@ae/capabilities';
import { SyntheticDurableHost, validateDatabaseUrl } from './host.mjs';
const [databaseUrl, directory] = process.argv.slice(2);validateDatabaseUrl(databaseUrl);
const host=new SyntheticDurableHost(databaseUrl),control=new PostgresControlPlane(databaseUrl,ticketCapabilities);
const prefix=randomUUID(),port=Number(new URL(databaseUrl).port)+1,origin=`http://127.0.0.1:${port}`;
const p={tenantId:'conversation-tenant',applicationId:'conversation-app',subjectId:prefix,roles:['editor'],scopes:['tickets:read','tickets:write']};
const admin={...p,subjectId:'admin',roles:['agentic:admin'],scopes:[]};
const ticket=`ticket-${prefix}`,ticket2=`second-${prefix}`,ticket3=`third-${prefix}`,ticket4=`fourth-${prefix}`;
const active=new Set(),cases=[];let number=0;
const observe=name=>{cases.push(name);console.log(`PASS ${name}`);};
class Worker extends EventEmitter {
  constructor(fault='') {super();this.events=[];this.pending=new Map();this.next=1;this.dead=false;this.log=join(directory,`conversation-worker-${++number}.log`);
    this.child=spawn(process.execPath,[fileURLToPath(new URL('./conversation-worker.mjs',import.meta.url)),databaseUrl,String(port),JSON.stringify(p),fault],{env:{PATH:process.env.PATH,HOME:directory,TZ:'UTC',NODE_OPTIONS:'--max-old-space-size=640'},stdio:['pipe','pipe','pipe']});active.add(this);let buffer='';
    this.child.stdout.on('data',chunk=>{appendFileSync(this.log,chunk);buffer+=chunk;for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.startsWith('AE_CONVERSATION '))continue;const event=JSON.parse(line.slice(16));this.events.push(event);if(event.event==='response'){const pending=this.pending.get(event.id);if(pending){this.pending.delete(event.id);clearTimeout(pending.timer);event.error?pending.reject(new Error(event.error)):pending.resolve(event);}}this.emit('event',event);}});
    this.child.stderr.on('data',chunk=>appendFileSync(this.log,chunk));this.closed=new Promise(resolve=>this.child.on('exit',(code,signal)=>{this.dead=true;active.delete(this);for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('worker exited'));}this.pending.clear();this.emit('gone');resolve({code,signal});}));
  }
  async event(name){const prior=this.events.find(e=>e.event===name);if(prior)return prior;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error(`Timed out waiting ${name}: ${this.log}`));},60000);const listener=e=>{if(e.event===name){cleanup();resolve(e);}};const gone=()=>{cleanup();reject(new Error(`Worker exited: ${this.log}`));};const cleanup=()=>{clearTimeout(timer);this.off('event',listener);this.off('gone',gone);};this.on('event',listener);this.on('gone',gone);});}
  command(method,extra={}){const id=this.next++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('command timeout'));},15000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,method,...extra})+'\n');});}
  async kill(){this.child.kill('SIGKILL');assert.equal((await this.closed).signal,'SIGKILL');}
  async shutdown(){await this.command('shutdown');assert.equal((await this.closed).code,0);}
}
async function http(path,body,token,expected=200){const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{origin,'content-type':'application/json',...(token?{'idempotency-key':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.equal(response.status,expected,JSON.stringify(value));return value;}
const create=(key,context=ticket)=>http('/api/conversations',{context:{ticketId:context}},key,201);
const start=(c,key,input,expected=201,context=ticket)=>http(`/api/conversations/${c.conversationId}/runs`,{input,context:{ticketId:context}},key,expected);
const history=c=>http(`/api/conversations/${c.conversationId}`);
const approve=run=>http(`/api/runs/${run.runId}/approval`,{approvalId:run.approval.binding.approvalId,expectedHash:run.approval.expectedHash,decision:'approve'});
const calls=async()=>Number((await host.pool.query('SELECT count(*) AS n FROM qualification_host.model_calls')).rows[0].n);
let worker;
try {
  await host.setup();await host.seed(p,ticket);await control.initialize();
  await host.pool.query("INSERT INTO qualification_host.tickets(tenant_id,application_id,id,title,priority,version) VALUES($1,$2,$3,'Synthetic context B','low',1)",[p.tenantId,p.applicationId,ticket2]);
  await host.pool.query("INSERT INTO qualification_host.tickets(tenant_id,application_id,id,title,priority,version) VALUES($1,$2,$3,'Synthetic context C','low',1)",[p.tenantId,p.applicationId,ticket3]);
  await host.pool.query("INSERT INTO qualification_host.tickets(tenant_id,application_id,id,title,priority,version) VALUES($1,$2,$3,'Synthetic context D','low',1)",[p.tenantId,p.applicationId,ticket4]);
  await host.pool.query('CREATE SCHEMA qualification_conversations;CREATE TABLE qualification_conversations.authority(tenant_id text,application_id text,subject_id text,ticket_id text,revision text);CREATE TABLE qualification_conversations.disabled(subject_id text,capability_id text)');
  for(const target of [ticket,ticket2,ticket3,ticket4])await host.pool.query('INSERT INTO qualification_conversations.authority VALUES($1,$2,$3,$4,$5)',[p.tenantId,p.applicationId,p.subjectId,target,'field-grants-v1']);
  const draft=await control.save(admin,{name:'Conversation A',instructions:'PINNED_RELEASE_A',capabilityIds:['read_ticket','change_ticket_priority'],bounds:{maxTurns:5,maxElapsedMs:10000}}),releaseA=await control.publish(admin,draft.draftId,1);
  worker=new Worker();await worker.event('ready');
  const c=await create('create-one');assert.deepEqual(await create('create-one'),c);await create('another');
  await http('/api/conversations',{context:{ticketId:ticket},principal:p},'invalid',400);
  await http('/api/conversations',{context:{ticketId:ticket}},undefined,400);
  await http('/api/conversations',{context:{ticketId:ticket,roles:['editor']}},'forged-context',403);
  const first=await start(c,'turn-one',`READ FIRST qualification-ticket:${ticket}`);assert.equal(first.status,'succeeded');assert.equal(first.releaseId,releaseA.releaseId);
  const h1=await history(c);assert.equal(h1.messages.length,2);assert.deepEqual(h1.messages.map(m=>m.role),['user','assistant']);assert(!JSON.stringify(h1).includes('operationId'));assert(!JSON.stringify(h1).includes('function_call'));
  const before=await calls();await worker.kill();worker=new Worker();await worker.event('ready');assert.deepEqual(await history(c),h1);assert.equal(await calls(),before);
  observe('durable ordered text history survives SIGKILL without model or tool replay');
  const [second,duplicate]=await Promise.all([start(c,'turn-two','SECOND'),start(c,'turn-two','SECOND')]);assert.equal(second.runId,duplicate.runId);assert.equal(second.status,'succeeded');assert.equal(second.message,'SECOND recalled SYNTHETIC_SECRET_A.');
  const model2=(await host.pool.query('SELECT messages FROM qualification_host.model_calls WHERE run_id=$1',[second.runId])).rows;assert.equal(model2.length,1);assert.equal(model2[0].messages.filter(m=>m.role==='user').length,2);assert.equal(model2[0].messages.filter(m=>m.role==='tool').length,0);assert.equal((await host.pool.query('SELECT count(*)::integer AS n FROM ae_operations_v1 WHERE run_id=$1',[second.runId])).rows[0].n,0);
  assert.equal((await history(c)).messages.length,4);await start(c,'turn-two','different',409);
  observe('real SDK second turn sees only prior authorized text; duplicate intent is one run');
  const c2=await create('isolated',ticket2);const isolated=await start(c2,'turn-two','ISOLATED',201,ticket2);assert.notEqual(isolated.runId,second.runId);const isolatedRequest=(await host.pool.query('SELECT messages FROM qualification_host.model_calls WHERE run_id=$1',[isolated.runId])).rows[0].messages;assert(!JSON.stringify(isolatedRequest).includes('SYNTHETIC_SECRET_A'));await start(c,'wrong-context','SECOND',403,ticket2);
  for(const changed of [{subjectId:'other'},{tenantId:'other-tenant'},{applicationId:'other-app'}]){const outsider={...p,...changed};await host.pool.query('INSERT INTO qualification_host.principals VALUES($1,$2,$3,$4,$5)',[outsider.tenantId,outsider.applicationId,outsider.subjectId,JSON.stringify(outsider.roles),JSON.stringify(outsider.scopes)]);await worker.command('session',{principal:outsider});await http(`/api/conversations/${c.conversationId}`,undefined,undefined,404);await start(c,'intruder','SECOND',404);}await worker.command('session',{principal:p});
  const crossTarget=await start(c2,'cross-target',`READ qualification-ticket:${ticket}`,201,ticket2);assert.equal(crossTarget.status,'failed');assert.equal(crossTarget.message,'CONVERSATION_CONTEXT_DENIED');assert.equal((await host.pool.query('SELECT count(*)::integer AS n FROM ae_operations_v1 WHERE run_id=$1',[crossTarget.runId])).rows[0].n,0);
  observe('tenant/application/subject/context/conversation isolation and out-of-context tool denial');
  const revokedPending=await start(c2,'revoke-pending',`WRITE qualification-ticket:${ticket2}`,201,ticket2);assert.equal(revokedPending.status,'awaiting-approval');
  await worker.kill();worker=new Worker('after-decision');await worker.event('ready');
  const interruptedApproval=approve(revokedPending).catch(()=>null);await worker.event('fault');const beforeResumeRevoke=await calls();
  await host.pool.query('UPDATE qualification_conversations.authority SET revision=$1 WHERE subject_id=$2 AND ticket_id=$3',['field-grants-v2',p.subjectId,ticket2]);
  await worker.kill();await interruptedApproval;worker=new Worker();await worker.event('ready');
  for(let attempt=0;attempt<100;attempt++){const row=(await host.pool.query('SELECT body FROM ae_runs_v1 WHERE id=$1',[revokedPending.runId])).rows[0];if(row.body.view.status==='failed')break;if(attempt===99)assert.fail('Revoked restored SDK state did not terminate');await delay(50);}
  assert.equal(await calls(),beforeResumeRevoke);assert.equal((await host.inspect(p,ticket2)).mutationCount,0);await http(`/api/runs/${revokedPending.runId}`,undefined,undefined,403);
  observe('approved checkpoint restart cannot bypass changed field-grant authority or redisclose old SDK state');
  const midcall=await create('midcall',ticket2);await start(midcall,'midcall',`MIDCALL_REVOKE qualification-ticket:${ticket2}`,403,ticket2);await http(`/api/conversations/${midcall.conversationId}`,undefined,undefined,403);assert.equal((await host.pool.query('SELECT output FROM ae_conversation_turns_v1 WHERE conversation_id=$1',[midcall.conversationId])).rows[0].output,null);observe('mid-model field revocation prevents assistant text persistence and public response');
  const reservation=await create('reservation',ticket2);const reservedPending=await start(reservation,'reserve-write',`WRITE qualification-ticket:${ticket2}`,201,ticket2);assert.equal(reservedPending.status,'awaiting-approval');
  await worker.kill();worker=new Worker('revoke-after-reservation');await worker.event('ready');
  await http(`/api/runs/${reservedPending.runId}/approval`,{approvalId:reservedPending.approval.binding.approvalId,expectedHash:reservedPending.approval.expectedHash,decision:'approve'},undefined,403);
  assert.equal((await host.inspect(p,ticket2)).mutationCount,0);assert.equal((await host.inspect(p,ticket2)).calls.filter(call=>call.kind==='write' && call.target_id===ticket2).length,0);
  await worker.kill();worker=new Worker();await worker.event('ready');
  observe('field-grant revocation after operation reservation blocks host dispatch');
  const cancelConversation=await create('cancel-boundary',ticket2);const cancelPending=await start(cancelConversation,'cancel-write',`WRITE qualification-ticket:${ticket2}`,201,ticket2);assert.equal(cancelPending.status,'awaiting-approval');
  await worker.kill();worker=new Worker('cancel-during-target');await worker.event('ready');const cancellingApproval=fetch(origin+`/api/runs/${cancelPending.runId}/approval`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({approvalId:cancelPending.approval.binding.approvalId,expectedHash:cancelPending.approval.expectedHash,decision:'approve'})});await worker.event('target-wait');
  const cancelled=await http(`/api/runs/${cancelPending.runId}/cancel`,{});assert(['cancelled','outcome-unknown'].includes(cancelled.status));await worker.command('release-target');assert([200,500].includes((await cancellingApproval).status));for(let attempt=0;attempt<100;attempt++){const rows=(await host.pool.query("SELECT result FROM ae_operations_v1 WHERE run_id=$1 AND prepared->>'write'='true'",[cancelPending.runId])).rows;if(rows[0]?.result?.status==='denied' && rows[0].result.code==='CANCELLED')break;if(attempt===99)assert.fail('Cancelled broker did not persist a terminal denial');await delay(50);}assert.equal((await host.inspect(p,ticket2)).calls.filter(call=>call.kind==='write' && call.target_id===ticket2).length,0);
  await worker.kill();worker=new Worker();await worker.event('ready');observe('cancellation during final history-target authorization prevents host dispatch');
  const poolConversation=await create('pool-proof',ticket4);await worker.kill();worker=new Worker('exhaust-pool-at-completion');await worker.event('ready');const poolRun=await start(poolConversation,'pool-proof','ISOLATED',201,ticket4);assert.equal(poolRun.status,'succeeded');assert.deepEqual(await worker.event('pool-proof'),{event:'pool-proof',held:9,timedOut:false});
  await worker.kill();worker=new Worker();await worker.event('ready');observe('completion uses transaction client with all nine other PG pool connections occupied');
  const unknownConversation=await create('unknown',ticket3);const unknownPending=await start(unknownConversation,'unknown-write',`WRITE qualification-ticket:${ticket3}`,201,ticket3);assert.equal(unknownPending.status,'awaiting-approval');
  await worker.kill();worker=new Worker('unknown-after-write');await worker.event('ready');const unknown=await approve(unknownPending);assert.equal(unknown.status,'outcome-unknown');await start(unknownConversation,'blocked-unknown','SECOND',409,ticket3);assert.equal((await host.inspect(p,ticket3)).mutationCount,1);
  const reconciled=(await worker.command('reconcile',{runId:unknown.runId})).result;assert.equal(reconciled.status,'succeeded');const reconciledHistory=await history(unknownConversation);assert.equal(reconciledHistory.messages.length,2);assert.match(reconciledHistory.messages[1].text,/No write was retried/);
  const afterReconcile=await start(unknownConversation,'after-reconcile','SECOND',201,ticket3);const reconcileInput=(await host.pool.query('SELECT messages FROM qualification_host.model_calls WHERE run_id=$1',[afterReconcile.runId])).rows[0].messages;assert(reconcileInput.some(m=>m.role==='assistant' && m.content.includes('No write was retried')));assert.equal((await host.inspect(p,ticket3)).calls.filter(call=>call.kind==='write' && call.target_id===ticket3).length,1);
  await worker.kill();worker=new Worker();await worker.event('ready');observe('unknown blocks continuation; reconciliation atomically restores successful text history without repeating write');
  const rollbackHistory=await create('reconcile-revoke',ticket4);const rollbackPending=await start(rollbackHistory,'unknown-revoke',`WRITE qualification-ticket:${ticket4}`,201,ticket4);
  await worker.kill();worker=new Worker('revoke-reconcile-text');await worker.event('ready');const rollbackUnknown=await approve(rollbackPending);assert.equal(rollbackUnknown.status,'outcome-unknown');
  await assert.rejects(worker.command('reconcile',{runId:rollbackUnknown.runId}),/CONVERSATION_HISTORY_DENIED/);
  const rollbackRow=(await host.pool.query('SELECT body FROM ae_runs_v1 WHERE id=$1',[rollbackUnknown.runId])).rows[0].body;assert.equal(rollbackRow.view.status,'succeeded');assert(rollbackRow.view.receipts.some(r=>r.status==='succeeded'));
  assert.equal((await host.pool.query('SELECT output FROM ae_conversation_turns_v1 WHERE run_id=$1',[rollbackUnknown.runId])).rows[0].output,null);assert.equal((await host.inspect(p,ticket4)).mutationCount,1);assert.equal((await host.inspect(p,ticket4)).calls.filter(call=>call.kind==='write' && call.target_id===ticket4).length,1);await http(`/api/conversations/${rollbackHistory.conversationId}`,undefined,undefined,403);await http(`/api/runs/${rollbackUnknown.runId}`,undefined,undefined,403);
  await worker.kill();worker=new Worker();await worker.event('ready');observe('reconciliation text savepoint rolls back on late authority change while proven success receipt remains');
  const pending=await start(c,'turn-three',`WRITE qualification-ticket:${ticket}`);assert.equal(pending.status,'awaiting-approval');assert.equal(pending.approval.binding.invocationId,'same-write-call');await start(c,'blocked','SECOND',409);assert.equal((await start(c,'turn-three',`WRITE qualification-ticket:${ticket}`)).runId,pending.runId);
  await http(`/api/runs/${pending.runId}/approval`,{approvalId:pending.approval.binding.approvalId,expectedHash:'0'.repeat(64),decision:'approve'},undefined,409);
  const draftB=await control.save(admin,{...draft.configuration,name:'Conversation B',instructions:'PINNED_RELEASE_B',capabilityIds:['read_ticket']},draft.draftId,1),releaseB=await control.publish(admin,draftB.draftId,2);
  await worker.kill();worker=new Worker();await worker.event('ready');const restored=await http(`/api/runs/${pending.runId}`);assert.deepEqual(restored.approval,pending.approval);assert.equal((await history(c)).activeRunId,pending.runId);
  const completed=await approve(restored);assert.equal(completed.status,'succeeded');assert.equal(completed.releaseId,releaseA.releaseId);assert.equal((await approve(restored)).status,'succeeded');assert.equal((await host.inspect(p,ticket)).mutationCount,1);assert.equal((await host.inspect(p,ticket)).calls.filter(call=>call.kind==='write' && call.target_id===ticket).length,1);
  const afterApproval=await history(c);assert.equal(afterApproval.messages.length,6);assert.equal(afterApproval.activeRunId,undefined);assert(!JSON.stringify(afterApproval).includes('approvalId'));
  const fourth=await start(c,'turn-four','SECOND');assert.equal(fourth.releaseId,releaseB.releaseId);await http(`/api/runs/${fourth.runId}/approval`,{approvalId:pending.approval.binding.approvalId,expectedHash:pending.approval.expectedHash,decision:'approve'},undefined,409);
  observe('unfinished turn blocks continuation; exact approval/call ID/release survive restart; one host mutation');
  const callsBeforeRevoke=await calls();await host.pool.query('UPDATE qualification_conversations.authority SET revision=$1 WHERE subject_id=$2 AND ticket_id=$3',['field-grants-v2',p.subjectId,ticket]);
  // Host read still succeeds. Same owner/resource access does not authorize old field-derived text.
  await host.read(p,ticket);await http(`/api/conversations/${c.conversationId}`,undefined,undefined,403);await http(`/api/runs/${first.runId}`,undefined,undefined,403);await start(c,'revoked','SECOND',403);assert.equal(await calls(),callsBeforeRevoke);
  const fresh=await create('new-authority');const freshRun=await start(fresh,'fresh','ISOLATED');const freshRequest=(await host.pool.query('SELECT messages FROM qualification_host.model_calls WHERE run_id=$1',[freshRun.runId])).rows[0].messages;assert(!JSON.stringify(freshRequest).includes('SYNTHETIC_SECRET_A'));
  observe('field-grant epoch change blocks history and model disclosure despite unchanged owner/read access');
  await host.pool.query('INSERT INTO qualification_conversations.disabled VALUES($1,$2)',[p.subjectId,'change_ticket_priority']);await http(`/api/conversations/${fresh.conversationId}`,undefined,undefined,403);await host.pool.query('DELETE FROM qualification_conversations.disabled');
  await host.revokeWrite(p);await http(`/api/conversations/${fresh.conversationId}`,undefined,undefined,403);await host.pool.query('UPDATE qualification_host.principals SET roles=$4,scopes=$5 WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3',[p.tenantId,p.applicationId,p.subjectId,JSON.stringify(p.roles),JSON.stringify(p.scopes)]);
  await host.pool.query("UPDATE ae_conversations_v1 SET expires_at=now()-interval '1 second' WHERE id=$1",[fresh.conversationId]);await http(`/api/conversations/${fresh.conversationId}`,undefined,undefined,409);
  observe('current capability/role revocation and expiry fail closed');
  const beforeRecovery=await calls();await worker.kill();worker=new Worker('after-intent-persist');await worker.event('ready');const recover=await create('recover');const uncertain=start(recover,'recover-turn','ISOLATED').catch(()=>null);await worker.event('fault');await worker.kill();await uncertain;worker=new Worker();await worker.event('ready');const report=(await worker.event('recovery')).report;assert.equal(report.blocked.length,0);assert.equal(report.accepted,1);const recovered=await history(recover);assert.equal(recovered.messages.length,2);assert.equal(await calls(),beforeRecovery+1);assert.equal((await start(recover,'recover-turn','ISOLATED')).runId,recovered.runs[0].runId);
  observe('atomic conversation intent/turn reservation recovers commit-before-submit after SIGKILL');
  const bounded=await create('bounded');
  for(let i=1;i<=3;i++){const fakeId=`bounded-${prefix}-${i}`;await host.pool.query('INSERT INTO ae_runs_v1(id,body) VALUES($1,$2)',[fakeId,JSON.stringify({view:{status:'succeeded'}})]);await host.pool.query('INSERT INTO ae_conversation_turns_v1(conversation_id,turn,run_id,release_id,input,output,created_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,now(),now())',[bounded.conversationId,i,fakeId,releaseB.releaseId,'x'.repeat(16000),'y'.repeat(16000)]);}
  const beforeCapacity=await calls();await start(bounded,'over-capacity','ISOLATED',409);assert.equal(await calls(),beforeCapacity);
  observe('capacity admission rejects oversized retained text without dispatch or silent truncation');
  // Legacy route stays one-shot, not implicitly attached to an existing conversation.
  const legacy=await http('/api/runs',{input:'ISOLATED'},'legacy',201);assert.equal(legacy.status,'succeeded');assert.equal((await history(recover)).messages.length,2);
  await worker.shutdown();observe('legacy /api/runs remains independent and compatible');
  writeFileSync(join(directory,'conversation-summary.json'),JSON.stringify({status:'PASS',cases,scope:'Synthetic HTTP + PostgreSQL17.11 + DBOS5.3.0 + official Agents SDK0.21.0; no provider calls, no UI claim'},null,2)+'\n');
} finally {for(const item of active)if(!item.dead)await item.kill();await control.close();await host.close();}
