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
import { SyntheticDurableHost, validateDatabaseUrl } from './host.mjs';

const [databaseUrl, suppliedDirectory] = process.argv.slice(2);
validateDatabaseUrl(databaseUrl);
const directory = suppliedDirectory ?? mkdtempSync(join(tmpdir(), 'ae-persistence-qualification-'));
const prefix = randomUUID();
const workerPath = fileURLToPath(new URL('./worker.mjs', import.meta.url));
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
      env: { PATH: '/usr/bin:/bin', HOME: directory, TZ: 'UTC' },
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

const decision = approval => ({ approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' });
const count = (inspection, kind) => inspection.calls.filter(call => call.kind === kind).length;
const principalFor = name => ({ tenantId: 'qualification-a', applicationId: 'synthetic-helpdesk', subjectId: `${prefix}-${name}`, roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] });
async function fixture(name) {
  const principal = principalFor(name), ticketId = `${name}-${prefix}`;
  await host.seed(principal, ticketId);
  return { principal, ticketId, input: { principal, releaseId: 'qualification-release-v1', input: `Raise qualification-ticket:${ticketId} to high priority.`, context: { ticketId } } };
}
async function startWorker(point) { const worker = new Worker(point); await worker.ready(); return worker; }
async function waitFor(worker, runId, principal, statuses) {
  const deadline = Date.now() + 45_000;
  let view;
  while (Date.now() < deadline) {
    view = await worker.request('get', runId, principal);
    if (statuses.includes(view.status)) return view;
    if (['succeeded', 'failed', 'cancelled', 'rejected', 'manual-review', 'outcome-unknown'].includes(view.status)) {
      assert.fail(`Unexpected terminal status while awaiting ${statuses.join('/')}: ${JSON.stringify(view)}`);
    }
    await delay(75);
  }
  assert.fail(`Timed out recovering ${runId}: ${JSON.stringify(view)}`);
}
function eventIntegrity(view) {
  assert.equal(new Set(view.events.map(event => event.eventId)).size, view.events.length, 'Persisted event IDs must be unique');
  assert.deepEqual(view.events.map(event => event.sequence), view.events.map((_, index) => index), 'Events must have contiguous monotonic sequence');
  assert.ok(view.events.every(event => event.runId === view.runId));
  assert.equal(Object.hasOwn(view, 'snapshot'), false, 'Private SDK checkpoint must not appear in a RunView');
  assert.equal(view.persistence, 'postgres-dbos');
}
function assertOneCommittedWrite(view, inspection, operationId) {
  assert.equal(view.status, 'succeeded', JSON.stringify(view));
  assert.equal(inspection.mutationCount, 1);
  assert.equal(count(inspection, 'write'), 1, 'Recovery must query the old operation, not dispatch a second write');
  assert.equal(inspection.receipts.length, 1);
  assert.equal(inspection.receipts[0].operationId, operationId);
  assert.equal(inspection.ticket.priority, 'high');
  assert.equal(inspection.ticket.version, 2);
  assert.deepEqual(inspection.receipts[0].data, inspection.ticket, 'Receipt and independent host readback must agree');
  const exposed = view.receipts.filter(receipt => receipt.operationId === operationId && receipt.status === 'succeeded');
  assert.ok(exposed.length > 0, 'Runtime must expose the authoritative write receipt');
  assert.ok(exposed.every(receipt => receipt.receiptId === inspection.receipts[0].receiptId));
  eventIntegrity(view);
}

try {
  await host.setup();
  const version = (await host.pool.query('SHOW server_version')).rows[0].server_version;
  assert.match(version, /^17\.11(?:\D|$)/, 'Pinned real PostgreSQL qualification');

  // Main application path: an actual SDK approval checkpoint survives process death.
  {
    const f = await fixture('approval-restart');
    let worker = await startWorker();
    const firstPid = worker.child.pid;
    await assert.rejects(worker.request('start', { ...f.input, release: { releaseId: 'unqualified-dynamic-release' } }),
      error => error.code === 'DYNAMIC_RELEASE_UNSUPPORTED', 'Unqualified dynamic releases must be rejected, never silently ignored');
    const paused = await worker.request('start', f.input);
    assert.equal(paused.status, 'awaiting-approval', JSON.stringify(paused));
    assert.ok(paused.approval);
    const before = await host.inspect(f.principal, f.ticketId, paused.runId);
    assert.equal(before.mutationCount, 0);
    assert.deepEqual(before.model.map(call => call.stage), ['read', 'write']);
    await worker.kill();
    worker = await startWorker();
    assert.notEqual(worker.child.pid, firstPid);
    const recovered = await worker.request('get', paused.runId, f.principal);
    assert.equal(recovered.status, 'awaiting-approval');
    assert.deepEqual(recovered.approval, paused.approval, 'Approval ID, hash, expiry, principal and exact operation binding must survive');
    assert.deepEqual(recovered.events, paused.events, 'An idle approval must not manufacture replay events');
    // These are valid independent host principals, not missing-user denials.
    for (const [scope, changes] of [['tenant', { tenantId: 'qualification-b' }], ['subject', { subjectId: `${prefix}-other-subject` }], ['application', { applicationId: 'other-application' }]]) {
      const other = { ...f.principal, ...changes };
      await host.seed(other, `other-${scope}-${prefix}`);
      await assert.rejects(worker.request('get', paused.runId, other), error => error.code === 'RUN_NOT_FOUND');
      await assert.rejects(worker.request('decide', paused.runId, other, decision(paused.approval)), error => error.code === 'RUN_NOT_FOUND');
    }
    const result = await worker.request('decide', paused.runId, f.principal, decision(paused.approval));
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    assertOneCommittedWrite(result, inspection, paused.approval.binding.operationId);
    assert.deepEqual(inspection.model.map(call => call.stage), ['read', 'write', 'final'], 'Checkpointed model turns must not rerun after process restart');
    assert.equal(inspection.model[0].worker_pid, firstPid);
    assert.equal(inspection.model[2].worker_pid, worker.child.pid);
    assert.match(JSON.stringify(inspection.model[2].messages), new RegExp(inspection.receipts[0].receiptId), 'Model final turn must receive the real receipt');
    const duplicate = await worker.request('decide', paused.runId, f.principal, decision(paused.approval));
    assert.deepEqual(duplicate, result, 'Duplicate identical decision returns the same persisted result');
    await assert.rejects(worker.request('decide', paused.runId, f.principal, { ...decision(paused.approval), decision: 'reject' }), /ALREADY_DECIDED/);
    assert.deepEqual(await host.inspect(f.principal, f.ticketId, paused.runId), inspection, 'Duplicate/conflicting decisions must not call model or host again');
    await worker.shutdown();
    // A third process must read the exact same terminal result and receipt.
    worker = await startWorker();
    assert.deepEqual(await worker.request('get', paused.runId, f.principal), result);
    await worker.shutdown();
    cases.push('dynamic release rejected; approval checkpoint survives SIGKILL; exact approval, receipt and event replay; duplicate decision; tenant/subject/application isolation');
    observe('passed', { case: 'approval-restart', runId: paused.runId, receiptId: inspection.receipts[0].receiptId });
  }

  {
    const f = await fixture('before-approval-checkpoint');
    let worker = await startWorker('before-approval-checkpoint');
    const pending = worker.request('start', f.input).then(value => ({ value }), error => ({ error }));
    await worker.event('fault', event => event.point === 'before-approval-checkpoint');
    // The API has not returned a run ID. Discover this synthetic run only from durable model evidence.
    const found = await host.pool.query('SELECT DISTINCT run_id FROM qualification_host.model_calls WHERE messages::text LIKE $1', [`%qualification-ticket:${f.ticketId}%`]);
    assert.equal(found.rows.length, 1);
    const runId = found.rows[0].run_id;
    const before = await worker.request('get', runId, f.principal);
    assert.equal(before.status, 'running');
    assert.equal(before.approval, undefined, 'Fault must happen before the approval transaction');
    const evidence = await host.inspect(f.principal, f.ticketId, runId);
    assert.deepEqual(evidence.model.map(call => call.stage), ['read', 'write']);
    assert.equal(evidence.mutationCount, 0);
    await worker.kill();
    assert.ok((await pending).error);
    worker = await startWorker();
    const paused = await waitFor(worker, runId, f.principal, ['awaiting-approval']);
    assert.deepEqual(paused.receipts, before.receipts, 'Checkpointed read result survives recovery without a new receipt');
    const recoveredEvidence = await host.inspect(f.principal, f.ticketId, runId);
    assert.deepEqual(recoveredEvidence.model, evidence.model, 'Both completed model turns are replayed from DBOS, not called again');
    assert.equal(paused.events.filter(event => event.type === 'approval-required').length, 1);
    const result = await worker.request('decide', runId, f.principal, decision(paused.approval));
    assertOneCommittedWrite(result, await host.inspect(f.principal, f.ticketId, runId), paused.approval.binding.operationId);
    await worker.shutdown();
    cases.push('SIGKILL before approval transaction; durable model/read checkpoints replay without new calls; one recovered approval then one write');
    observe('passed', { case: 'before-approval-checkpoint', runId });
  }

  for (const point of ['after-decision', 'after-host-write', 'after-reservation', 'after-receipt']) {
    const f = await fixture(point);
    let worker = await startWorker(point);
    const paused = await worker.request('start', f.input);
    assert.equal(paused.status, 'awaiting-approval', JSON.stringify(paused));
    const pending = worker.request('decide', paused.runId, f.principal, decision(paused.approval)).then(value => ({ value }), error => ({ error }));
    await worker.event('fault', event => event.point === point);
    const atFault = await host.inspect(f.principal, f.ticketId, paused.runId);
    assert.equal(atFault.mutationCount, ['after-host-write', 'after-receipt'].includes(point) ? 1 : 0, 'Fault must be at the claimed business boundary');
    await worker.kill();
    assert.ok((await pending).error, 'Interrupted API caller must not receive fabricated success');
    worker = await startWorker();
    const recovered = await waitFor(worker, paused.runId, f.principal, point === 'after-reservation' ? ['outcome-unknown', 'manual-review'] : ['succeeded']);
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    if (point === 'after-reservation') {
      assert.equal(inspection.mutationCount, 0);
      assert.equal(count(inspection, 'write'), 0, 'Reserved but unconfirmed operation must not be dispatched blindly after a crash');
      assert.equal(inspection.receipts.length, 0);
      const reconciled = await worker.request('reconcile', paused.runId, f.principal);
      assert.equal(reconciled.status, 'manual-review');
      const duplicate = await worker.request('decide', paused.runId, f.principal, decision(paused.approval));
      assert.equal(duplicate.status, 'manual-review');
      assert.equal(count(await host.inspect(f.principal, f.ticketId, paused.runId), 'write'), 0);
      eventIntegrity(reconciled);
    } else {
      assertOneCommittedWrite(recovered, inspection, paused.approval.binding.operationId);
      assert.deepEqual(inspection.model.map(call => call.stage), ['read', 'write', 'final']);
      if (point === 'after-host-write') assert.ok(count(inspection, 'query') >= 1, 'Lost acknowledgement must query the original operation receipt');
      if (point === 'after-receipt') assert.equal(count(inspection, 'query'), 0, 'Checkpointed AE receipt must be reused without another host query or write');
      const duplicate = await worker.request('decide', paused.runId, f.principal, decision(paused.approval));
      assert.deepEqual(duplicate, recovered);
    }
    await worker.shutdown();
    cases.push(`${point}: SIGKILL/new process, ${point === 'after-reservation' ? 'unknown outcome retained, zero mutations, manual reconciliation' : 'automatic recovery, one mutation, same operation receipt'}`);
    observe('passed', { case: point, runId: paused.runId, mutationCount: inspection.mutationCount });
  }

  {
    const f = await fixture('checkpoint-revocation');
    let worker = await startWorker('after-tool-checkpoint');
    const paused = await worker.request('start', f.input);
    assert.equal(paused.status, 'awaiting-approval');
    const pending = worker.request('decide', paused.runId, f.principal, decision(paused.approval)).then(value => ({ value }), error => ({ error }));
    await worker.event('fault', event => event.point === 'after-tool-checkpoint');
    const atFault = await host.inspect(f.principal, f.ticketId, paused.runId);
    assert.equal(atFault.mutationCount, 1);
    assert.equal(atFault.receipts.length, 1);
    assert.deepEqual(atFault.model.map(call => call.stage), ['read', 'write']);
    await worker.kill();
    assert.ok((await pending).error);
    await host.revokeWrite(f.principal);
    worker = await startWorker();
    const recovered = await waitFor(worker, paused.runId, f.principal, ['failed']);
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    assert.deepEqual(inspection.model, atFault.model, 'Replaying a checkpointed tool result must not disclose it to a new model turn after authority revocation');
    assert.equal(inspection.mutationCount, 1);
    assert.equal(count(inspection, 'write'), 1);
    assert.deepEqual(inspection.receipts, atFault.receipts, 'Revocation does not erase an already committed authoritative receipt');
    assert.ok(recovered.receipts.some(receipt => receipt.status === 'succeeded' && receipt.receiptId === atFault.receipts[0].receiptId));
    assert.match(JSON.stringify(recovered), /ROLE_DENIED|SCOPE_DENIED/);
    eventIntegrity(recovered);
    await worker.shutdown();
    cases.push('SIGKILL after DBOS tool checkpoint then revoke authority; cached result cannot trigger a new model disclosure; existing committed receipt retained');
    observe('passed', { case: 'checkpoint-revocation', runId: paused.runId });
  }

  {
    const f = await fixture('unknown-checkpoint');
    let worker = await startWorker('unknown-checkpoint');
    const paused = await worker.request('start', f.input);
    const pending = worker.request('decide', paused.runId, f.principal, decision(paused.approval)).then(value => ({ value }), error => ({ error }));
    await worker.event('fault', event => event.point === 'after-tool-checkpoint');
    const stored = await host.pool.query('SELECT result FROM ae_operations_v1 WHERE id=$1', [paused.approval.binding.operationId]);
    assert.equal(stored.rows[0].result.status, 'outcome-unknown', 'Crash occurs after an unknown result has been saved, not only a NULL reservation');
    await worker.kill();
    assert.ok((await pending).error);
    await host.revokeWrite(f.principal);
    worker = await startWorker();
    const recovered = await waitFor(worker, paused.runId, f.principal, ['outcome-unknown']);
    assert.equal(recovered.status, 'outcome-unknown', 'Revocation cannot misclassify a saved unresolved mutation as ordinary failure');
    const cancelled = await worker.request('cancel', paused.runId, f.principal);
    assert.equal(cancelled.status, 'outcome-unknown', 'Cancellation also preserves a saved unresolved mutation');
    const reconciled = await worker.request('reconcile', paused.runId, f.principal);
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    assertOneCommittedWrite(reconciled, inspection, paused.approval.binding.operationId);
    assert.deepEqual(inspection.model.map(call => call.stage), ['read', 'write']);
    await worker.shutdown();
    cases.push('checkpointed unknown result survives restart with revoked write access and cancellation; exact receipt reconciled without retry');
    observe('passed', { case: 'unknown-checkpoint', runId: paused.runId });
  }

  {
    const f = await fixture('cancel-unknown-checkpoint');
    let worker = await startWorker('unknown-checkpoint');
    const paused = await worker.request('start', f.input);
    const pending = worker.request('decide', paused.runId, f.principal, decision(paused.approval)).then(value => ({ value }), error => ({ error }));
    await worker.event('fault', event => event.point === 'after-tool-checkpoint');
    const held = await worker.request('get', paused.runId, f.principal);
    assert.equal(held.status, 'running', 'Cancellation is tested before outer runtime unknown classification');
    const stored = await host.pool.query('SELECT result FROM ae_operations_v1 WHERE id=$1', [paused.approval.binding.operationId]);
    assert.equal(stored.rows[0].result.status, 'outcome-unknown');
    const cancelled = await worker.request('cancel', paused.runId, f.principal);
    assert.equal(cancelled.status, 'outcome-unknown', 'A non-NULL unknown receipt must be detected immediately at cancellation, not mislabelled cancelled');
    await worker.kill();
    await pending;
    worker = await startWorker();
    assert.equal((await worker.request('get', paused.runId, f.principal)).status, 'outcome-unknown');
    const reconciled = await worker.request('reconcile', paused.runId, f.principal);
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    assertOneCommittedWrite(reconciled, inspection, paused.approval.binding.operationId);
    assert.deepEqual(inspection.model.map(call => call.stage), ['read', 'write']);
    await worker.shutdown();
    cases.push('cancel while checkpointed non-NULL unknown result is held; immediate unknown classification survives restart and reconciles one original receipt');
    observe('passed', { case: 'cancel-unknown-checkpoint', runId: paused.runId });
  }

  {
    const f = await fixture('reconcile-race');
    const worker = await startWorker('reconcile-race');
    const paused = await worker.request('start', f.input);
    const unknown = await worker.request('decide', paused.runId, f.principal, decision(paused.approval));
    assert.equal(unknown.status, 'outcome-unknown');
    const delayed = worker.request('reconcile', paused.runId, f.principal);
    const captured = await worker.event('query-unknown-captured');
    assert.equal(captured.operationId, paused.approval.binding.operationId);
    const confirmed = await worker.request('reconcile', paused.runId, f.principal);
    assert.equal(confirmed.status, 'succeeded');
    const authoritative = await host.inspect(f.principal, f.ticketId, paused.runId);
    assertOneCommittedWrite(confirmed, authoritative, paused.approval.binding.operationId);
    await worker.request('release-query');
    const late = await delayed;
    assert.equal(late.status, 'succeeded', 'A late inconclusive result must return the canonical success, not downgrade it');
    const final = await worker.request('get', paused.runId, f.principal);
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    assertOneCommittedWrite(final, inspection, paused.approval.binding.operationId);
    assert.deepEqual(final, confirmed, 'A stale reconciliation must neither replace success nor append downgrade events');
    assert.deepEqual(late, confirmed, 'Both concurrent callers must receive the canonical succeeded state');
    const canonical = await host.pool.query('SELECT result FROM ae_operations_v1 WHERE id=$1', [paused.approval.binding.operationId]);
    assert.deepEqual(canonical.rows[0].result, authoritative.receipts[0], 'AE operation ledger retains the authoritative receipt under a stale-response race');
    assert.deepEqual(inspection.model.map(call => call.stage), ['read', 'write']);
    await worker.shutdown();
    cases.push('concurrent reconciliation: delayed unknown delivered after success cannot overwrite canonical receipt/status or append downgrade events');
    observe('passed', { case: 'reconcile-race', runId: paused.runId });
  }

  {
    const f = await fixture('cancel-inflight');
    let worker = await startWorker('after-host-write');
    const paused = await worker.request('start', f.input);
    const pending = worker.request('decide', paused.runId, f.principal, decision(paused.approval)).then(value => ({ value }), error => ({ error }));
    await worker.event('fault', event => event.point === 'after-host-write');
    const committed = await host.inspect(f.principal, f.ticketId, paused.runId);
    assert.equal(committed.mutationCount, 1);
    const cancelled = await worker.request('cancel', paused.runId, f.principal);
    assert.equal(cancelled.status, 'outcome-unknown', 'Cancellation must not claim rollback of a committed host write');
    await worker.kill();
    await pending;
    worker = await startWorker();
    const recovered = await worker.request('get', paused.runId, f.principal);
    assert.equal(recovered.status, 'outcome-unknown');
    const reconciled = await worker.request('reconcile', paused.runId, f.principal);
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    assertOneCommittedWrite(reconciled, inspection, paused.approval.binding.operationId);
    assert.deepEqual(inspection.receipts, committed.receipts, 'Cancellation and reconciliation retain the exact committed host receipt');
    assert.deepEqual(inspection.model.map(call => call.stage), ['read', 'write'], 'A cancelled phase must not resume the model loop');
    await worker.shutdown();
    cases.push('cancel after host commit before receipt persistence; restart remains unknown; same receipt reconciled with no retry or resumed model');
    observe('passed', { case: 'cancel-inflight', runId: paused.runId });
  }

  {
    const f = await fixture('timeout-host');
    const worker = await startWorker('timeout-host');
    const paused = await worker.request('start', f.input);
    assert.equal(paused.status, 'awaiting-approval', JSON.stringify(paused));
    const began = Date.now();
    const pending = worker.request('decide', paused.runId, f.principal, decision(paused.approval));
    await worker.event('host-committed-before-timeout');
    const unknown = await pending;
    assert.equal(unknown.status, 'outcome-unknown', 'Deadline cannot classify an unacknowledged committed write as safely cancelled');
    assert.ok(Date.now() - began < 4000, 'Runtime must stop waiting before the deliberately delayed 5-second acknowledgement');
    const reconciled = await worker.request('reconcile', paused.runId, f.principal);
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    assertOneCommittedWrite(reconciled, inspection, paused.approval.binding.operationId);
    assert.deepEqual(inspection.model.map(call => call.stage), ['read', 'write']);
    await worker.shutdown();
    cases.push('host acknowledgement exceeds deadline after commit; unknown outcome returned promptly, exact receipt reconciled, one write');
    observe('passed', { case: 'timeout-host', runId: paused.runId });
  }

  {
    const f = await fixture('revoked-principal');
    let worker = await startWorker();
    const paused = await worker.request('start', f.input);
    assert.equal(paused.status, 'awaiting-approval');
    await host.revokeWrite(f.principal);
    await worker.kill();
    worker = await startWorker();
    const result = await worker.request('decide', paused.runId, f.principal, decision(paused.approval));
    assert.equal(result.status, 'failed', JSON.stringify(result));
    assert.match(JSON.stringify(result), /ROLE_DENIED|SCOPE_DENIED/, 'Denied authority must remain distinguishable from adapter failure');
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    assert.equal(inspection.mutationCount, 0);
    assert.equal(inspection.receipts.length, 0);
    assert.equal(count(inspection, 'write'), 0, 'Runtime must recheck current authority before host dispatch');
    assert.equal(inspection.ticket.priority, 'low');
    await worker.shutdown();
    cases.push('write authority revoked while paused; fresh-process execution denied; zero effects');
    observe('passed', { case: 'revoked-principal', runId: paused.runId });
  }

  for (const action of ['cancel', 'reject']) {
    const f = await fixture(action);
    let worker = await startWorker();
    const paused = await worker.request('start', f.input);
    const stopped = action === 'cancel' ? await worker.request('cancel', paused.runId, f.principal)
      : await worker.request('decide', paused.runId, f.principal, { ...decision(paused.approval), decision: 'reject' });
    assert.equal(stopped.status, action === 'cancel' ? 'cancelled' : 'rejected');
    await worker.kill();
    worker = await startWorker();
    assert.deepEqual(await worker.request('get', paused.runId, f.principal), stopped);
    await assert.rejects(worker.request('decide', paused.runId, f.principal, decision(paused.approval)));
    const inspection = await host.inspect(f.principal, f.ticketId, paused.runId);
    assert.equal(inspection.mutationCount, 0);
    assert.equal(count(inspection, 'write'), 0);
    await worker.shutdown();
    cases.push(`${action} persists across SIGKILL; later approval cannot revive the run`);
    observe('passed', { case: action, runId: paused.runId });
  }

  {
    const f = await fixture('tampered-decision');
    const worker = await startWorker();
    const paused = await worker.request('start', f.input);
    assert.equal(paused.status, 'awaiting-approval');
    await assert.rejects(worker.request('decide', paused.runId, f.principal, { ...decision(paused.approval), expectedHash: '0'.repeat(64) }), /HASH_MISMATCH/);
    // Rejected inputs must not poison the legitimate durable workflow identity.
    const result = await worker.request('decide', paused.runId, f.principal, decision(paused.approval));
    assertOneCommittedWrite(result, await host.inspect(f.principal, f.ticketId, paused.runId), paused.approval.binding.operationId);
    await worker.shutdown();
    cases.push('tampered decision denied without poisoning subsequent valid approval');
    observe('passed', { case: 'tampered-decision', runId: paused.runId });
  }

  const report = { passed: true, prefix, directory, postgres: version, workerProcesses: workerNumber, cases,
    scope: 'Real AE persistent runtime + pinned Agents SDK + DBOS/PostgreSQL. Separate worker processes, transactional synthetic host, deterministic simulated model. No paid provider, production data, multi-worker race, database crash/failover, or arbitrary external exactly-once claim.' };
  writeFileSync(join(directory, 'result.json'), JSON.stringify(report, null, 2));
  observe('qualification-complete', report);
} catch (error) {
  writeFileSync(join(directory, 'failure.json'), JSON.stringify({ passed: false, prefix, directory, cases, message: error.message, stack: error.stack }, null, 2));
  observe('qualification-failed', { message: error.message, completedCases: cases.length });
  throw error;
} finally {
  for (const worker of activeWorkers) if (!worker.dead) worker.child.kill('SIGKILL');
  await Promise.all([...activeWorkers].map(worker => worker.closed));
  await host.close();
}
