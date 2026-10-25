// Real deterministic definitions + existing AE broker + DBOS + PostgreSQL. No model.
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
import { PersistentStore } from '../../dist/packages/runtime-adapters/db/store.js';
import { SyntheticDurableHost, validateDatabaseUrl } from '../persistence/host.mjs';

const [databaseUrl, suppliedDirectory] = process.argv.slice(2);
validateDatabaseUrl(databaseUrl);
const directory = suppliedDirectory ?? mkdtempSync(join(tmpdir(), 'ae-persistence-qualification-'));
const prefix = randomUUID();
const workerPath = fileURLToPath(new URL('./worker.mjs', import.meta.url));
const host = new SyntheticDurableHost(databaseUrl);
const inspectHost = host.inspect.bind(host);
host.inspect = async (...args) => { const value = await inspectHost(...args); return { ...value, writes: value.calls.filter(call => call.kind === 'write').length }; };
const activeWorkers = new Set();
const cases = [];
const observe = (event, detail = {}) => {
  const observation = { event, timestamp: new Date().toISOString(), ...detail };
  appendFileSync(join(directory, 'observations.jsonl'), `${JSON.stringify(observation)}\n`);
  console.log(JSON.stringify(observation));
};
let workerNumber = 0;

class Worker extends EventEmitter {
  constructor(killPoint = '', catalogVersion = 1) {
    super();
    this.pending = new Map();
    this.events = [];
    this.nextId = 1;
    this.output = '';
    this.dead = false;
    this.label = `${++workerNumber}-${killPoint || 'normal'}`;
    this.log = join(directory, `${this.label}.log`);
    this.child = spawn(process.execPath, [workerPath, databaseUrl, killPoint, String(catalogVersion)], {
      env: { PATH: '/usr/bin:/bin', HOME: directory, TZ: 'UTC', NODE_OPTIONS: '--max-old-space-size=384' },
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

const principal = name => ({ tenantId: 'workflow-tenant', applicationId: 'workflow-app', subjectId: `${prefix}-${name}`, roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] });
const decision = approval => ({ approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' });
const fixture = async name => { const p = principal(name), ticketId = `${name}-${prefix}`; await host.seed(p, ticketId); return { p, ticketId, input: { principal: p, workflowId: 'ticket-triage', version: 1, input: { ticketId } } }; };
const started = async (mode = '', version = 1) => { const worker = new Worker(mode, version); await worker.ready(); return worker; };
const count = async (kind, ticketId) => Number((await host.pool.query('SELECT count(*) FROM qualification_host.calls WHERE kind=$1 AND target_id=$2', [kind, ticketId])).rows[0].count);
const savedRun = async p => (await host.pool.query("SELECT body FROM ae_runs_v1 WHERE body->'principal'->>'subjectId'=$1", [p.subjectId])).rows[0]?.body;
async function settled(worker, runId, p, states = ['succeeded', 'outcome-unknown', 'failed', 'awaiting-approval']) {
  const deadline = Date.now() + 30000;
  for (;;) {
    const view = await worker.request('get', runId, p);
    if (states.includes(view.status)) return view;
    if (Date.now() >= deadline) throw Error(`Run did not settle: ${JSON.stringify(view)}`);
    await delay(50);
  }
}
const pass = (name, detail = {}) => { cases.push(name); observe('case-pass', { name, ...detail }); };
try {
  await host.setup();
  const pinned = await fixture('pinned'), revoked = await fixture('revoked'), cancelled = await fixture('cancelled'), rejected = await fixture('rejected'), fresh = await fixture('new-version'), stale = await fixture('stale-target');
  let worker = await started();
  const a = await worker.request('start', pinned.input), b = await worker.request('start', revoked.input), c = await worker.request('start', cancelled.input), d = await worker.request('start', rejected.input), e = await worker.request('start', stale.input);
  assert.equal(a.status, 'awaiting-approval'); assert.equal(a.modelMode, 'deterministic-workflow');
  assert.equal(a.workflow.cursor, 'write'); assert.deepEqual(a.workflow.completed, ['read', 'branch']);
  assert.equal(a.approval.binding.invocationId, 'workflow-v1:write'); assert.equal(a.approval.preview.after, 'high');
  assert.equal((await host.inspect(pinned.p, pinned.ticketId)).mutationCount, 0);
  // Cross-tenant/subject ownership is still the existing AE ledger gate.
  await assert.rejects(worker.request('get', a.runId, { ...pinned.p, subjectId: revoked.p.subjectId }), /RUN_NOT_FOUND/);
  await assert.rejects(worker.request('decide', a.runId, pinned.p, { ...decision(a.approval), expectedHash: '0'.repeat(64) }), /APPROVAL_HASH_MISMATCH/);
  await worker.request('cancel', c.runId, cancelled.p);
  await worker.request('decide', d.runId, rejected.p, { ...decision(d.approval), decision: 'reject' });
  await worker.kill();
  worker = await started('', 2); // Catalog no longer contains v1; old runs must use their pinned snapshot.
  const restored = await worker.request('get', a.runId, pinned.p);
  assert.deepEqual(restored.approval, a.approval); assert.deepEqual(restored.workflow, a.workflow);
  const completed = await worker.request('decide', a.runId, pinned.p, decision(a.approval));
  assert.equal(completed.status, 'succeeded'); assert.equal(completed.workflow.version, 1); assert.equal(completed.workflow.cursor, 'done');
  const again = await worker.request('decide', a.runId, pinned.p, decision(a.approval)); assert.deepEqual(again, completed);
  const truth = await host.inspect(pinned.p, pinned.ticketId); assert.equal(truth.mutationCount, 1); assert.equal(truth.writes, 1);
  pass('pinned-definition-and-exact-approval-survive-sigkill', { runId: a.runId, version: 1, writes: 1 });
  const next = await worker.request('start', { ...fresh.input, version: 2 });
  assert.equal(next.status, 'succeeded'); assert.equal(next.approval, undefined); assert.equal(next.workflow.version, 2);
  assert.equal((await host.inspect(fresh.p, fresh.ticketId)).mutationCount, 0);
  pass('new-version-changes-new-runs-only-and-false-branch-skips-write');
  await host.revokeWrite(revoked.p);
  const denied = await worker.request('decide', b.runId, revoked.p, decision(b.approval));
  assert.equal(denied.status, 'failed'); assert.match(denied.message, /ROLE_DENIED/); assert.equal((await host.inspect(revoked.p, revoked.ticketId)).mutationCount, 0);
  pass('current-write-rights-revoked-before-approved-resume');
  await host.pool.query('UPDATE qualification_host.tickets SET version=2 WHERE id=$1', [stale.ticketId]);
  const staleResult = await worker.request('decide', e.runId, stale.p, decision(e.approval));
  assert.equal(staleResult.status, 'failed'); assert.match(staleResult.message, /RESOURCE_VERSION_CONFLICT/);
  assert.equal((await host.inspect(stale.p, stale.ticketId)).writes, 0);
  pass('target-version-change-invalidates-exact-approval');
  assert.equal((await worker.request('get', c.runId, cancelled.p)).status, 'cancelled');
  await assert.rejects(worker.request('decide', c.runId, cancelled.p, decision(c.approval)), /RUN_NOT_AWAITING_THIS_APPROVAL/);
  assert.equal((await worker.request('get', d.runId, rejected.p)).status, 'rejected');
  await assert.rejects(worker.request('decide', d.runId, rejected.p, decision(d.approval)), /APPROVAL_ALREADY_DECIDED/);
  assert.equal((await host.inspect(cancelled.p, cancelled.ticketId)).writes, 0); assert.equal((await host.inspect(rejected.p, rejected.ticketId)).writes, 0);
  pass('cancel-and-reject-survive-restart-without-revival');
  const legacy = new PersistentStore(databaseUrl);
  await assert.rejects(legacy.load(a.runId), /RUN_VERSION_UNSUPPORTED/);
  const old = structuredClone(await savedRun(pinned.p)); old.view.runId = `legacy-${prefix}`; old.view.modelMode = 'configured-model-port'; old.pins.workflow = 'ae-v1';
  await host.pool.query('INSERT INTO ae_runs_v1(id,body) VALUES($1,$2)', [old.view.runId, JSON.stringify(old)]);
  assert.equal((await legacy.load(old.view.runId)).pins.workflow, 'ae-v1');
  await assert.rejects(worker.request('get', old.view.runId, pinned.p), /RUN_VERSION_UNSUPPORTED/);
  await legacy.close(); pass('legacy-and-deterministic-runtime-pins-never-cross-interpret');
  const corrupt = await savedRun(fresh.p), snapshot = JSON.parse(corrupt.snapshot); snapshot.revision.definition.name = 'corrupt'; corrupt.snapshot = JSON.stringify(snapshot);
  await host.pool.query('UPDATE ae_runs_v1 SET body=$2 WHERE id=$1', [next.runId, JSON.stringify(corrupt)]);
  await assert.rejects(worker.request('get', next.runId, fresh.p), /WORKFLOW_DEFINITION_PIN_MISMATCH/);
  pass('persisted-definition-hash-tampering-fails-closed');
  await worker.shutdown();

  for (const mode of ['retry-once', 'retry-exhaust', 'retry-crash']) {
    const f = await fixture(mode); worker = await started(mode);
    let view;
    if (mode === 'retry-crash') {
      const pending = worker.request('start', f.input); const stopped = pending.catch(() => null);
      await worker.event('fault'); const saved = await savedRun(f.p); assert(saved); await worker.kill(); await stopped;
      worker = await started('retry-once'); view = await settled(worker, saved.view.runId, f.p);
    } else view = await worker.request('start', f.input);
    assert.equal(view.status, mode === 'retry-exhaust' ? 'failed' : 'awaiting-approval');
    assert.equal(await count('read-attempt', f.ticketId), mode === 'retry-exhaust' ? 3 : 2);
    assert.equal((await host.inspect(f.p, f.ticketId)).writes, 0);
    // Failed attempts reuse the read reservation; exactly one successful read receipt.
    assert.equal(view.receipts.filter(value => value.status === 'succeeded').length, mode === 'retry-exhaust' ? 0 : 1);
    pass(mode, { attempts: await count('read-attempt', f.ticketId), status: view.status });
    if (view.approval) await worker.request('cancel', view.runId, f.p);
    await worker.shutdown();
  }

  for (const mode of ['after-reservation', 'after-host-write', 'after-receipt', 'lost-ack']) {
    const f = await fixture(mode); worker = await started(mode);
    const paused = await worker.request('start', f.input);
    if (mode === 'lost-ack') {
      const unknown = await worker.request('decide', paused.runId, f.p, decision(paused.approval)); assert.equal(unknown.status, 'outcome-unknown');
      const duplicate = await worker.request('decide', paused.runId, f.p, decision(paused.approval)); assert.deepEqual(duplicate, unknown); assert.equal((await host.inspect(f.p, f.ticketId)).writes, 1);
      await worker.request('cancel', paused.runId, f.p); await worker.kill();
    } else {
      const pending = worker.request('decide', paused.runId, f.p, decision(paused.approval)); const stopped = pending.catch(() => null);
      await worker.event('fault'); await worker.kill(); await stopped;
    }
    worker = await started();
    let result = await settled(worker, paused.runId, f.p, ['succeeded', 'outcome-unknown', 'failed']);
    assert.notEqual(result.status, 'failed', result.message);
    if (result.status === 'outcome-unknown') result = await worker.request('reconcile', paused.runId, f.p);
    const inspection = await host.inspect(f.p, f.ticketId);
    assert.equal(result.status, mode === 'after-reservation' ? 'manual-review' : 'succeeded');
    assert.equal(inspection.mutationCount, mode === 'after-reservation' ? 0 : 1);
    assert.equal(inspection.writes, mode === 'after-reservation' ? 0 : 1);
    if (mode !== 'after-reservation') {
      const receipt = result.receipts.find(value => value.status === 'succeeded' && value.data.priority === 'high');
      assert(receipt); assert.deepEqual(receipt, inspection.receipts[0]);
    }
    pass(mode, { status: result.status, writes: inspection.writes, mutations: inspection.mutationCount });
    await worker.shutdown();
  }

  // Revocation after an already-checkpointed read must block branch/approval on recovery.
  const f = await fixture('read-revoked'); worker = await started('after-tool-checkpoint');
  const pending = worker.request('start', f.input), stopped = pending.catch(() => null);
  await worker.event('fault'); const saved = await savedRun(f.p); await worker.kill(); await stopped;
  await host.pool.query('INSERT INTO qualification_host.read_denials VALUES($1,$2,$3,$4)', [f.p.tenantId, f.p.applicationId, f.p.subjectId, f.ticketId]);
  worker = await started();
  const deadline = Date.now() + 30000;
  while ((await savedRun(f.p)).view.status !== 'failed') { if (Date.now() > deadline) throw Error('Read revocation did not stop replay'); await delay(50); }
  await assert.rejects(worker.request('get', saved.view.runId, f.p), /RESOURCE_DENIED/);
  const row = await savedRun(f.p); assert.equal(row.view.approval, undefined); assert.equal((await host.inspect(f.p, f.ticketId)).writes, 0);
  pass('current-read-authority-check-outside-dbos-checkpoint');
  await worker.shutdown();
  assert.equal(Number((await host.pool.query('SELECT count(*) FROM qualification_host.model_calls')).rows[0].count), 0);
  writeFileSync(join(directory, 'workflow-summary.json'), JSON.stringify({ status: 'PASS', prefix, cases, workers: workerNumber, modelCalls: 0, scope: 'Finite definitions on DBOS 5.3.0 / PostgreSQL 17.11 with existing AE approval and host receipt protocol; no paid model, production or parallel-engine claim.' }, null, 2));
  observe('workflow-qualification-pass', { cases: cases.length, workers: workerNumber, directory });
} finally { for (const worker of activeWorkers) if (!worker.dead) await worker.kill(); await host.close(); }
