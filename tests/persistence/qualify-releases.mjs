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
import { ticketCapabilities } from '@ae/capabilities';
import { SyntheticDurableHost, validateDatabaseUrl } from './host.mjs';

const [databaseUrl, suppliedDirectory] = process.argv.slice(2);
validateDatabaseUrl(databaseUrl);
const directory = suppliedDirectory ?? mkdtempSync(join(tmpdir(), 'ae-persistence-qualification-'));
const prefix = randomUUID();
const workerPath = fileURLToPath(new URL('./release-worker.mjs', import.meta.url));
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
  constructor(killPoint = '') {
    super();
    this.pending = new Map();
    this.events = [];
    this.nextId = 1;
    this.output = '';
    this.dead = false;
    this.label = `${++workerNumber}-${killPoint || 'normal'}`;
    this.log = join(directory, `${this.label}.log`);
    this.child = spawn(process.execPath, [workerPath, databaseUrl, killPoint], {
      env: { PATH: '/usr/bin:/bin', HOME: directory, TZ: 'UTC', NODE_OPTIONS: '--max-old-space-size=768' },
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
        if (!line.startsWith('AE_PERSISTENCE ')) continue;
        const event = JSON.parse(line.slice('AE_PERSISTENCE '.length));
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
      this.child.stdin.write(`${JSON.stringify({ id, method, args })}\n`);
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

const admin={tenantId:'release-tenant',applicationId:'release-app',subjectId:'admin',roles:['agentic:admin'],scopes:[]};
const control=new PostgresControlPlane(databaseUrl,ticketCapabilities);
const decision=approval=>({approvalId:approval.binding.approvalId,expectedHash:approval.expectedHash,decision:'approve'});
const principal=name=>({...admin,subjectId:`${prefix}-${name}`,roles:['editor'],scopes:['tickets:read','tickets:write']});
const fixtures=[];
try {
  await host.setup();await control.initialize();
  await host.pool.query('CREATE SCHEMA qualification_control; CREATE TABLE qualification_control.disabled(subject_id text,capability_id text); CREATE TABLE qualification_control.catalogs(run_id text, tools jsonb)');
  for(const name of ['old','revoked','new','bounded']){const p=principal(name),ticketId=`${name}-${prefix}`;await host.seed(p,ticketId);fixtures.push({p,ticketId,input:{principal:p,input:`qualification-ticket:${ticketId}`}});}
  const [old,revoked,fresh,bounded]=fixtures;
  const draft=await control.save(admin,{name:'Pinned A',instructions:'RELEASE_A_PINNED_INSTRUCTION',capabilityIds:ticketCapabilities.map(c=>c.capabilityId),bounds:{maxTurns:4,maxElapsedMs:10000}});
  const releaseA=await control.publish(admin,draft.draftId,1);
  let worker=new Worker();await worker.ready();
  await assert.rejects(worker.request('start-active',{...old.input,release:releaseA}),/EXTERNAL_RELEASE_DENIED/);
  await assert.rejects(worker.request('start',{...old.input,releaseId:releaseA.releaseId}),/RELEASE_SNAPSHOT_REQUIRED/);
  await assert.rejects(worker.request('start',{...old.input,releaseId:releaseA.releaseId,release:{...releaseA,contentHash:'0'.repeat(64)}}),/RELEASE_INTEGRITY_DENIED/);
  await assert.rejects(worker.request('start',{...old.input,principal:{...old.p,tenantId:'wrong'},releaseId:releaseA.releaseId,release:releaseA}),/RELEASE_TENANT_DENIED/);
  const runA=await worker.request('start-active',old.input),runRevoked=await worker.request('start-active',revoked.input);
  assert.equal(runA.status,'awaiting-approval');assert.equal(runRevoked.status,'awaiting-approval');assert.equal(runA.releaseId,releaseA.releaseId);assert.equal(runA.approval.binding.releaseId,releaseA.releaseId);
  const changed=await control.save(admin,{...draft.configuration,name:'Pinned B',instructions:'RELEASE_B_NEW_INSTRUCTION',capabilityIds:['read_ticket'],bounds:{maxTurns:2,maxElapsedMs:10000}},draft.draftId,1);const releaseB=await control.publish(admin,changed.draftId,2);
  await worker.kill();worker=new Worker();await worker.ready();
  const restored=await worker.request('get',runA.runId,old.p);assert.equal(restored.releaseId,releaseA.releaseId);assert.equal(restored.approval.binding.releaseId,releaseA.releaseId);
  const completed=await worker.request('decide',runA.runId,old.p,decision(restored.approval));assert.equal(completed.status,'succeeded');assert.equal(completed.releaseId,releaseA.releaseId);
  const oldRow=(await host.pool.query('SELECT body FROM ae_runs_v1 WHERE id=$1',[runA.runId])).rows[0].body;assert.deepEqual(oldRow.release,releaseA);
  const messages=(await host.pool.query('SELECT messages FROM qualification_host.model_calls WHERE run_id=$1 AND worker_pid=$2',[runA.runId,worker.child.pid])).rows.flatMap(row=>row.messages);assert(messages.length>0,'Restarted worker must observe the pinned instructions');assert(messages.some(m=>m.content.includes('RELEASE_A_PINNED_INSTRUCTION')));assert(!messages.some(m=>m.content.includes('RELEASE_B_NEW_INSTRUCTION')));
  await host.pool.query('INSERT INTO qualification_control.disabled VALUES($1,$2)',[revoked.p.subjectId,'change_ticket_priority']);
  const denied=await worker.request('decide',runRevoked.runId,revoked.p,decision(runRevoked.approval));assert.equal(denied.status,'failed');assert.match(denied.message,/CAPABILITY_NOT_ALLOWED/);
  assert.equal((await host.inspect(revoked.p,revoked.ticketId)).mutationCount,0);
  const next=await worker.request('start-active',fresh.input);assert.equal(next.status,'succeeded');assert.equal(next.releaseId,releaseB.releaseId);assert.equal(next.approval,undefined);
  const catalogs=(await host.pool.query('SELECT tools FROM qualification_control.catalogs WHERE run_id=$1',[next.runId])).rows;assert(catalogs.length>0);for(const row of catalogs)assert.deepEqual(row.tools,['read_ticket']);
  assert.equal((await host.inspect(fresh.p,fresh.ticketId)).mutationCount,0);
  assert.equal((await host.inspect(old.p,old.ticketId)).mutationCount,1);
  const boundedDraft=await control.save(admin,{...changed.configuration,name:'Bounded C',bounds:{maxTurns:1,maxElapsedMs:10000}},draft.draftId,2);
  const releaseC=await control.publish(admin,boundedDraft.draftId,3);
  const boundedRun=await worker.request('start-active',bounded.input);assert.equal(boundedRun.releaseId,releaseC.releaseId);assert.equal(boundedRun.status,'failed');
  assert.equal((await host.pool.query('SELECT count(*)::integer AS count FROM qualification_host.model_calls WHERE run_id=$1',[boundedRun.runId])).rows[0].count,1,'Pinned turn bound must actually stop the model loop');
  assert.equal((await host.inspect(bounded.p,bounded.ticketId)).mutationCount,0);
  // Corrupt persisted snapshots fail closed after storage reload, not just at initial API admission.
  await host.pool.query("UPDATE ae_runs_v1 SET body=jsonb_set(body,'{release,contentHash}',to_jsonb($2::text)) WHERE id=$1",[next.runId,'0'.repeat(64)]);
  await assert.rejects(worker.request('get',next.runId,fresh.p),/RELEASE_INTEGRITY_DENIED/);
  await assert.rejects(worker.request('list',fresh.p),/RELEASE_INTEGRITY_DENIED/);
  await host.pool.query("UPDATE ae_runs_v1 SET body=body-'release' WHERE id=$1",[next.runId]);
  await assert.rejects(worker.request('get',next.runId,fresh.p),/RELEASE_BINDING_DENIED/);
  await worker.shutdown();
  observe('release-composition-pass',{oldRelease:releaseA.releaseId,newRelease:releaseB.releaseId,oldRun:runA.runId,newRun:next.runId,mutationCount:1});
  writeFileSync(join(directory,'release-summary.json'),JSON.stringify({status:'PASS',scope:'isolated PG17 + DBOS + simulated provider; published release pins survive SIGKILL, new release only changes new runs, current revocation denies old writes, hash corruption fails closed'},null,2));
} finally {for(const worker of activeWorkers)if(!worker.dead)await worker.kill();await control.close();await host.close();}
