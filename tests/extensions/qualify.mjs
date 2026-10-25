import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ClientFactory } from '@a2a-js/sdk/client';
import { AgentCard, SendMessageRequest, GetTaskRequest, CancelTaskRequest, TaskState } from '@a2a-js/sdk';
import { SyntheticDurableHost, validateDatabaseUrl } from '../persistence/host.mjs';

const [databaseUrl, directory] = process.argv.slice(2);
validateDatabaseUrl(databaseUrl);
const host = new SyntheticDurableHost(databaseUrl), workers = new Set(), cases = [];
const prefix = randomUUID();
class Worker extends EventEmitter {
  constructor(fault = '') {
    super(); this.pending = new Map(); this.events = []; this.id = 0;
    this.child = spawn(process.execPath, [fileURLToPath(new URL('./worker.mjs', import.meta.url)), databaseUrl, fault], { env: { PATH: process.env.PATH, HOME: directory, TZ: 'UTC', NODE_OPTIONS: '--max-old-space-size=384' }, stdio: ['pipe', 'pipe', 'pipe'] });
    workers.add(this); let buffer = '';
    this.child.stdout.on('data', chunk => { appendFileSync(join(directory, 'worker.log'), chunk); buffer += chunk; for (;;) {
      const at = buffer.indexOf('\n'); if (at < 0) break;
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1); if (!line.startsWith('AE_EXTENSION ')) continue;
      const event = JSON.parse(line.slice(13)); this.events.push(event); this.emit('event', event);
      if (event.event === 'response') { const item = this.pending.get(event.id); if (item) { this.pending.delete(event.id); clearTimeout(item.timer); event.error ? item.reject(new Error(event.error.message)) : item.resolve(event.result); } }
    } });
    this.child.stderr.on('data', chunk => appendFileSync(join(directory, 'worker.log'), chunk));
    this.closed = new Promise(resolve => this.child.on('exit', (code, signal) => { workers.delete(this); for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('Fixture worker exited')); } this.pending.clear(); resolve({ code, signal }); }));
  }
  event(name) {
    const prior = this.events.find(event => event.event === name); if (prior) return Promise.resolve(prior);
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.off('event', listener); reject(new Error(`Timed out waiting for ${name}`)); }, 45000); const listener = event => { if (event.event === name) { clearTimeout(timer); this.off('event', listener); resolve(event); } }; this.on('event', listener); });
  }
  call(method, ...args) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out ${method}`)); }, 45000); this.pending.set(id, { resolve, reject, timer }); this.child.stdin.write(`${JSON.stringify({ id, method, args })}\n`); });
  }
  async stop() { await this.call('shutdown'); assert.equal((await this.closed).code, 0); }
}
function record(name, detail = {}) { const row = { name, status: 'pass', ...detail }; cases.push(row); console.log(JSON.stringify(row)); }
const principal = { tenantId: 'extension-fixture', applicationId: 'synthetic-helpdesk', subjectId: prefix, roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] };
const ticketId = `extension-${prefix}`;
const input = `Raise qualification-ticket:${ticketId} to high priority.`;
const occurrence = new Date(Math.floor(Date.now() / 60000) * 60000 - 120000);
const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(occurrence);
const spec = { automationId: `daily-${prefix}`, principal, input, hour: Number(local.find(p => p.type === 'hour').value), minute: Number(local.find(p => p.type === 'minute').value), timezone: 'Europe/Berlin', startsAt: new Date(occurrence.getTime() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), maxLatenessMs: 3600000 };
const range = [new Date(occurrence.getTime() - 1000).toISOString(), new Date(occurrence.getTime() + 1000).toISOString()];
try {
  await host.setup(); await host.seed(principal, ticketId);
  let worker = new Worker('before-approval-checkpoint'); await worker.event('ready');
  const name = await worker.call('create', spec, principal);
  const schedule = await worker.call('schedule', name);
  assert.equal(schedule.cronTimezone, spec.timezone); assert.equal(schedule.automaticBackfill, false);
  const pending = worker.call('backfill', name, ...range).catch(error => error);
  await worker.event('fault'); worker.child.kill('SIGKILL'); assert.equal((await worker.closed).signal, 'SIGKILL'); await pending;
  worker = new Worker(); const ready = await worker.event('ready');
  let runs;
  for (let i = 0; i < 300; i++) { runs = await worker.call('list', principal); if (runs[0]?.status === 'awaiting-approval') break; await delay(100); }
  assert.equal(runs.length, 1); assert.equal(runs[0].status, 'awaiting-approval');
  const runId = runs[0].runId;
  await worker.call('backfill', name, ...range); await worker.call('dispatch', occurrence.toISOString(), spec);
  assert.equal((await worker.call('list', principal)).length, 1);
  const inspection = await host.inspect(principal, ticketId, runId);
  const operations = await host.pool.query('SELECT count(*)::int AS count FROM ae_operations_v1 WHERE run_id=$1', [runId]);
  assert.equal(inspection.model.length, 2); assert.equal(operations.rows[0].count, 1); assert.equal(runs[0].receipts.length, 1); assert.equal(inspection.mutationCount, 0);
  record('DBOS timezone backfill + SIGKILL recovery + duplicate deduplication', { runId, modelCalls: inspection.model.length, governedOperations: operations.rows[0].count, hostAuthorizationAndReadChecks: inspection.calls.filter(c => c.kind === 'read').length, mutations: 0 });
  await worker.call('pause', spec, principal, true); assert.equal((await worker.call('schedule', name)).status, 'PAUSED');
  await worker.stop(); worker = new Worker(); const restart = await worker.event('ready');
  assert.equal((await worker.call('schedule', name)).status, 'PAUSED');
  assert.deepEqual(await worker.call('dispatch', occurrence.toISOString(), spec), { status: 'skipped', reason: 'paused-or-deleted' });
  await worker.call('pause', spec, principal, false); assert.equal((await worker.call('schedule', name)).status, 'ACTIVE');
  record('Pause/resume state survives process replacement');
  const dst = { ...spec, automationId: `dst-${prefix}`, hour: 2, minute: 30 };
  const dstName = await worker.call('create', dst, principal);
  assert.equal((await worker.call('backfill', dstName, '2026-03-29T00:00:00Z', '2026-03-29T03:00:00Z')).length, 0);
  const fold = await worker.call('backfill', dstName, '2026-10-25T00:00:00Z', '2026-10-25T03:00:00Z');
  assert.equal(fold.length, 2);
  assert.equal((await worker.call('list', principal)).length, 1, 'Out-of-window DST qualification must not create a runtime task');
  record('Installed DBOS timezone scheduler: spring gap zero / fall fold two UTC occurrences', { gap: 0, fold: fold.length, outOfWindowRuntimeStarts: 0 });
  await worker.call('principal', principal);
  const card = AgentCard.fromJSON({ name: 'AE local qualification', version: '0.1.0', description: 'Local fixture only', supportedInterfaces: [{ url: `http://127.0.0.1:${restart.port}/a2a`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }], capabilities: { streaming: false, pushNotifications: false }, defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'] });
  const sdk = await new ClientFactory().createFromAgentCard(card);
  const options = { serviceParameters: { Authorization: 'Bearer local-fixture-only' } };
  const request = SendMessageRequest.fromJSON({ message: { messageId: `a2a-${prefix}`, role: 'ROLE_USER', parts: [{ text: input, mediaType: 'text/plain' }] } });
  const task = await sdk.sendMessage(request, options); assert.ok('id' in task); assert.equal(task.status.state, TaskState.TASK_STATE_INPUT_REQUIRED);
  assert.equal((await sdk.getTask(GetTaskRequest.fromJSON({ id: task.id }), options)).id, task.id);
  assert.equal((await sdk.cancelTask(CancelTaskRequest.fromJSON({ id: task.id }), options)).status.state, TaskState.TASK_STATE_CANCELED);
  await assert.rejects(sdk.getTask(GetTaskRequest.fromJSON({ id: task.id })));
  record('Official A2A v1 SDK loopback HTTP to real PersistentRuntime: send/get/cancel/auth');
  const session = { principal, origin: 'https://fixture.invalid', expiresAt: Date.now() + 60000 };
  const mobile = await worker.call('mobile', { version: '1', operation: 'start', requestId: 'mobile', input }, session);
  assert.equal(mobile.qualification, 'contract-fixture-only'); assert.equal(mobile.run.status, 'awaiting-approval');
  await worker.call('mobile', { version: '1', operation: 'cancel', requestId: 'cancel', runId: mobile.run.runId }, session);
  assert.equal((await host.inspect(principal, ticketId)).mutationCount, 0);
  record('Mobile contract fixture reaches governed runtime without an approval bypass');
  await host.pool.query('DELETE FROM qualification_host.principals WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3', [principal.tenantId, principal.applicationId, principal.subjectId]);
  await assert.rejects(worker.call('dispatch', occurrence.toISOString(), spec), /HOST_PRINCIPAL_NOT_FOUND/);
  await assert.rejects(sdk.getTask(GetTaskRequest.fromJSON({ id: task.id }), options));
  record('Live host identity revocation blocks recovered triggers and protocol reads');
  await worker.stop();
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ status: 'pass', scope: 'owned local fixture only; simulated model; mobile real platform unverified', versions: { node: process.version, dbos: '5.3.0', a2aSdk: '1.3.0', a2aProtocol: '1.0', postgres: '17.11' }, cases }, null, 2) + '\n');
} finally {
  for (const worker of workers) { worker.child.kill('SIGKILL'); await worker.closed; }
  await host.close();
}
