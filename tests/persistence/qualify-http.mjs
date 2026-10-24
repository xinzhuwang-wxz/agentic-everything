// Real AE + Agents SDK + DBOS + PostgreSQL, with a visibly simulated model and host.
// SIGKILL destroys workers. Host truth, approvals, decisions and receipts survive in PG.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgresControlPlane } from '../../dist/packages/control-plane/src/postgres.js';
import { digest } from '@ae/policy';
import { ticketCapabilities } from '@ae/capabilities';
import { SyntheticDurableHost, validateDatabaseUrl } from './host.mjs';
import { qualifyJoined } from './qualify-joined.mjs';

const [databaseUrl, suppliedDirectory] = process.argv.slice(2);
validateDatabaseUrl(databaseUrl);
const directory = suppliedDirectory ?? mkdtempSync(join(tmpdir(), 'ae-persistence-qualification-'));
const prefix = randomUUID();
const port=55341;let bootPrincipal;
const workerPath = fileURLToPath(new URL('./http-worker.mjs', import.meta.url));
const host = new SyntheticDurableHost(databaseUrl);
const activeWorkers = new Set();
const cases = [];
const observe = (event, detail = {}) => {
  const observation = { event, timestamp: new Date().toISOString(), ...detail };
  appendFileSync(join(directory, 'observations.jsonl'), `${JSON.stringify(observation)}\n`);
  console.log(JSON.stringify(observation));
};
let workerNumber = 0;

class Worker extends EventEmitter {
  constructor(killPoint = '', allowedOrigin) {
    super();
    this.pending = new Map();
    this.events = [];
    this.nextId = 1;
    this.output = '';
    this.dead = false;
    this.label = `${++workerNumber}-${killPoint || 'normal'}`;
    this.log = join(directory, `${this.label}.log`);
    this.child = spawn(process.execPath, [workerPath, databaseUrl, String(port), JSON.stringify(bootPrincipal), killPoint, ...(allowedOrigin ? [allowedOrigin] : [])], {
      env: { PATH: '/usr/bin:/bin', HOME: directory, TZ: 'UTC', NODE_OPTIONS: '--max-old-space-size=640' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeWorkers.add(this);
    let buffer = '';
    this.child.stdout.on('data', chunk => {
      this.output += chunk; appendFileSync(this.log, chunk); buffer += chunk;
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline === -1) break;
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line.startsWith('AE_HTTP ')) continue;
        const event = JSON.parse(line.slice('AE_HTTP '.length));
        this.events.push(event);
        if (event.event === 'response') {
          const pending = this.pending.get(event.id);
          if (pending) {
            this.pending.delete(event.id); clearTimeout(pending.timer);
            if (event.error) pending.reject(Object.assign(new Error(event.error.message), { code: event.error.code }));
            else pending.resolve(event.result);
          }
        }
        this.emit('event', event);
      }
    });
    this.child.stderr.on('data', chunk => { this.output += chunk; appendFileSync(this.log, chunk); });
    this.child.on('error', error => this.emit('worker-error', error));
    this.closed = new Promise(resolve => this.child.on('exit', (code, signal) => {
      this.dead = true; activeWorkers.delete(this);
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(`Worker ${this.label} exited ${code}/${signal}`)); }
      this.pending.clear(); this.emit('worker-exit', { code, signal }); resolve({ code, signal });
    }));
  }
  async event(name, predicate = () => true, timeout = 60_000) {
    const existing = this.events.find(event => event.event === name && predicate(event));
    if (existing) return existing;
    if (this.dead) throw new Error(`Worker ${this.label} already exited: ${this.output}`);
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.off('event', onEvent); this.off('worker-error', onError); this.off('worker-exit', onExit); };
      const onEvent = event => { if (event.event === name && predicate(event)) { cleanup(); resolve(event); } };
      const onError = error => { cleanup(); reject(error); };
      const onExit = info => onError(new Error(`Worker ${this.label} exited before ${name}: ${JSON.stringify(info)}\n${this.output}`));
      const timer = setTimeout(() => onError(new Error(`Timed out waiting for ${name} in ${this.label}: ${this.output}`)), timeout);
      this.on('event', onEvent); this.once('worker-error', onError); this.once('worker-exit', onExit);
    });
  }
  async ready() { return this.event('ready'); }
  request(method, ...args) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out calling ${method} in ${this.label}: ${this.output}`)); }, 60_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ id, method, principal:args[0] })}\n`);
    });
  }
  async kill() {
    assert.equal(this.dead, false, 'Only a live worker can prove a SIGKILL boundary');
    this.child.kill('SIGKILL');
    const exit = await this.closed;
    assert.equal(exit.signal, 'SIGKILL');
    return exit;
  }
  async shutdown() {
    if (this.dead) return;
    await this.request('shutdown');
    let timer;
    try {
      const exit = await Promise.race([this.closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Shutdown timed out: ${this.label}`)), 10_000); })]);
      assert.equal(exit.code, 0, this.output);
    } finally { clearTimeout(timer); }
  }
}

const admin={tenantId:'http-tenant',applicationId:'http-app',subjectId:`${prefix}-admin`,roles:['editor','agentic:admin'],scopes:['tickets:read','tickets:write']};
const viewer={...admin,subjectId:`${prefix}-viewer`,roles:['viewer'],scopes:['tickets:read']};
const other={...admin,tenantId:'other',subjectId:`${prefix}-other`};bootPrincipal=admin;
const ticketId=`http-${prefix}`,crashTicket=`crash-${prefix}`,origin=`http://127.0.0.1:${port}`;
const request=async(path,body,key)=>{const response=await fetch(origin+path,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),headers:{origin,'content-type':'application/json',...(key?{'idempotency-key':key}:{}),'x-role':'agentic:admin'}});return {status:response.status,body:await response.json()};};
const post=async(path,body,key)=>{const r=await request(path,body,key);assert(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
const decision=run=>({approvalId:run.approval.binding.approvalId,expectedHash:run.approval.expectedHash,decision:'approve'});
const until=async fn=>{for(let i=0;i<100;i++){const value=await fn();if(value)return value;await delay(100);}throw new Error('Timed out waiting for HTTP restored intent');};
try{
  await host.setup();await host.seed(admin,ticketId);await host.seed(viewer,`viewer-${prefix}`);await host.seed(other,`other-${prefix}`);
  await host.pool.query("INSERT INTO qualification_host.tickets(tenant_id,application_id,id,title,priority,version) VALUES($1,$2,$3,'Crash fixture','low',1)",[admin.tenantId,admin.applicationId,crashTicket]);
  await host.pool.query('CREATE SCHEMA qualification_http;CREATE TABLE qualification_http.disabled(subject_id text,capability_id text);CREATE TABLE qualification_http.catalogs(run_id text,tools jsonb)');
  let worker=new Worker();await worker.ready();
  assert.equal((await request('/api/meta')).body.durability,'postgres_qualified');
  assert.equal((await request('/api/runs',{input:`qualification-ticket:${ticketId}`},'before-release')).status,409);
  let draft=await post('/api/configuration/drafts',{configuration:{name:'HTTP A',instructions:'HTTP_RELEASE_A',capabilityIds:ticketCapabilities.map(c=>c.capabilityId),bounds:{maxTurns:4,maxElapsedMs:10000}}});
  const releaseA=await post(`/api/configuration/drafts/${draft.draftId}/publish`,{expectedRevision:1});
  assert.equal((await request('/api/runs',{input:'x',release:releaseA},'forged')).status,400);assert.equal((await request('/api/runs',{input:'x',runId:'forged'},'forged-id')).status,400);
  const body={input:`qualification-ticket:${ticketId}`};const [run,repeat]=await Promise.all([post('/api/runs',body,'one-intent'),post('/api/runs',body,'one-intent')]);assert.equal(run.runId,repeat.runId);assert.equal(run.status,'awaiting-approval');
  assert.equal((await request('/api/runs',{input:'different'},'one-intent')).status,409);
  draft=await post('/api/configuration/drafts',{draftId:draft.draftId,expectedRevision:1,configuration:{...draft.configuration,name:'HTTP B',instructions:'HTTP_RELEASE_B',capabilityIds:['read_ticket']}});
  const releaseB=await post(`/api/configuration/drafts/${draft.draftId}/publish`,{expectedRevision:2});await worker.kill();worker=new Worker();await worker.ready();
  const restored=await post('/api/runs',body,'one-intent');assert.equal(restored.runId,run.runId);assert.equal(restored.releaseId,releaseA.releaseId);assert.equal(restored.approval.binding.releaseId,releaseA.releaseId);
  assert.equal((await request('/api/meta')).body.releaseId,releaseB.releaseId);assert.equal((await request('/api/configuration')).body.releases.length,2);
  const done=await post(`/api/runs/${run.runId}/approval`,decision(restored));assert.equal(done.status,'succeeded');assert.equal((await host.inspect(admin,ticketId)).mutationCount,1);
  assert.equal((await post('/api/runs',body,'one-intent')).runId,run.runId);assert.equal((await host.inspect(admin,ticketId)).mutationCount,1);
  const next=await post('/api/runs',body,'new-intent');assert.equal(next.releaseId,releaseB.releaseId);assert.equal(next.status,'succeeded');for(const row of (await host.pool.query('SELECT tools FROM qualification_http.catalogs WHERE run_id=$1',[next.runId])).rows)assert.deepEqual(row.tools,['read_ticket']);
  await worker.request('session',viewer);assert.equal((await request('/api/configuration')).body.drafts.length,0);assert.equal((await request('/api/configuration/drafts',{configuration:draft.configuration})).status,403);assert.equal((await request(`/api/runs/${run.runId}`)).status,404);
  const viewerIntent=await post('/api/runs',body,'one-intent');assert.notEqual(viewerIntent.runId,run.runId);assert.equal((await host.inspect(admin,ticketId)).mutationCount,1);
  await worker.request('session',other);assert.equal((await request('/api/configuration')).body.releases.length,0);assert.equal((await request(`/api/runs/${run.runId}`)).status,404);
  await worker.request('session',admin);
  // Restore write capability for a fresh, separately identified run; current host removal still wins.
  draft=await post('/api/configuration/drafts',{draftId:draft.draftId,expectedRevision:2,configuration:{...draft.configuration,capabilityIds:ticketCapabilities.map(c=>c.capabilityId)}});await post(`/api/configuration/drafts/${draft.draftId}/publish`,{expectedRevision:3});
  const revoked=await post('/api/runs',{input:`qualification-ticket:${crashTicket}`},'revoked-intent');assert.equal(revoked.status,'awaiting-approval');
  await host.pool.query('INSERT INTO qualification_http.disabled VALUES($1,$2)',[admin.subjectId,'change_ticket_priority']);const denied=await post(`/api/runs/${revoked.runId}/approval`,decision(revoked));assert.equal(denied.status,'failed');assert.equal((await host.inspect(admin,crashTicket)).mutationCount,0);
  await host.pool.query('DELETE FROM qualification_http.disabled');await worker.shutdown();
  worker=new Worker('after-intent-persist');await worker.ready();const pending=request('/api/runs',{input:`qualification-ticket:${crashTicket}`},'crash-intent').catch(()=>null);await worker.event('fault');const row=(await host.pool.query("SELECT run_id,start FROM ae_api.intents WHERE start->>'input'=$1 ORDER BY run_id",[`qualification-ticket:${crashTicket}`])).rows.find(row=>row.run_id!==revoked.runId);assert(row);await worker.kill();await pending;
  const damagedToken='damaged-ledger';const damagedKey=digest([admin.tenantId,admin.applicationId,admin.subjectId,damagedToken]);const damagedStart={...row.start,runId:`intent-${damagedKey}`};
  await host.pool.query('INSERT INTO ae_api.intents(intent_key,intent_token,input_hash,run_id,start_hash,start) VALUES($1,$2,$3,$4,$5,$6)',[damagedKey,damagedToken,'corrupt-input-hash',damagedStart.runId,digest(damagedStart),JSON.stringify(damagedStart)]);
  worker=new Worker();await worker.ready();const startup=await worker.event('startup-recovery');assert(startup.report.blocked.some(item=>item.runId===damagedStart.runId&&item.code==='INTENT_BINDING_DENIED'));assert.equal((await host.pool.query('SELECT count(*)::integer AS count FROM ae_runs_v1 WHERE id=$1',[damagedStart.runId])).rows[0].count,0,'Corrupt row metadata must never submit a workflow');const recovered=await until(async()=>{const r=await request(`/api/runs/${row.run_id}`);return r.status===200&&r.body.status==='awaiting-approval'?r.body:undefined;});assert.equal(recovered.releaseId,row.start.releaseId);
  const recoveredRepeat=await post('/api/runs',{input:`qualification-ticket:${crashTicket}`},'crash-intent');assert.equal(recoveredRepeat.runId,row.run_id);assert.equal((await host.inspect(admin,crashTicket)).mutationCount,0);
  await host.pool.query("UPDATE ae_api.intents SET start=jsonb_set(start,'{input}',to_jsonb('tampered'::text)) WHERE run_id=$1",[run.runId]);
  assert.equal((await request('/api/runs',body,'one-intent')).status,403);assert.equal((await host.inspect(admin,ticketId)).mutationCount,1);
  await worker.shutdown();
  const unknownTicket=`unknown-${prefix}`;await host.pool.query("INSERT INTO qualification_host.tickets(tenant_id,application_id,id,title,priority,version) VALUES($1,$2,$3,'Unknown fixture','low',1)",[admin.tenantId,admin.applicationId,unknownTicket]);
  worker=new Worker('unknown-write');await worker.ready();const unknownInput={input:`qualification-ticket:${unknownTicket}`};const unknownPaused=await post('/api/runs',unknownInput,'unknown-http');
  const unknown=await post(`/api/runs/${unknownPaused.runId}/approval`,decision(unknownPaused));assert.equal(unknown.status,'outcome-unknown');
  const unknownRetry=await post('/api/runs',unknownInput,'unknown-http');assert.equal(unknownRetry.runId,unknown.runId);assert.equal(unknownRetry.status,'outcome-unknown');
  const decisionRetry=await post(`/api/runs/${unknownPaused.runId}/approval`,decision(unknownPaused));assert.equal(decisionRetry.status,'outcome-unknown');assert.equal((await host.inspect(admin,unknownTicket)).mutationCount,1);
  assert.equal((await host.pool.query("SELECT count(*)::integer AS count FROM qualification_host.calls WHERE kind='write' AND target_id=$1",[unknownTicket])).rows[0].count,1,'Unknown HTTP retries never redispatch the host write');
  await worker.shutdown();
  await qualifyJoined({ databaseUrl, directory, host, Worker, admin, origin, observe });
  observe('http-release-composition-pass',{runId:run.runId,newRun:next.runId,crashRecovered:recovered.runId,mutationCount:1});
}catch(error){observe('http-release-composition-failed',{message:error.message});throw error;}finally{for(const worker of activeWorkers)if(!worker.dead)await worker.kill();await host.close();}
