// Bounded real HTTP disconnect/cancel race at the transactional host-commit boundary.
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createPersistentApi } from '../../dist/apps/api/src/persistent.js';
import { SyntheticDurableHost, validateDatabaseUrl } from '../../tests/persistence/host.mjs';
const [databaseUrl, directory] = process.argv.slice(2); validateDatabaseUrl(databaseUrl);
const principal = { tenantId: 'm1-negative', applicationId: 'synthetic-host', subjectId: 'owner', roles: ['editor', 'agentic:admin'], scopes: ['tickets:read', 'tickets:write'] };
const ticketId = 'm1-inflight', origin = 'http://127.0.0.1:55984', host = new SyntheticDurableHost(databaseUrl);
const evidence = { status: 'pending', startedAt: new Date().toISOString(), events: [], modelCalls: 0, abortedHttpResponses: 0, scope: 'Actual PostgreSQL transaction + HTTP transport abort + current AE/DBOS cancellation and receipt reconciliation; deterministic simulated model only' };
const observe = (event, detail = {}) => evidence.events.push({ event, at: new Date().toISOString(), ...detail });
let composed, server, release, reached;
const committed = new Promise(resolve => { reached = resolve; }), hold = new Promise(resolve => { release = resolve; });
const waitUntil = async fn => { const deadline = Date.now() + 5000; while (!await fn()) { assert(Date.now() < deadline, 'Bounded observed condition timed out'); await new Promise(resolve => setTimeout(resolve, 10)); } };
const request = async (path, body, key, signal) => { const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { origin, 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal ?? AbortSignal.timeout(10000) }); return { status: response.status, value: await response.json() }; };
const post = async (path, body, key) => { const response = await request(path, body, key); assert(response.status >= 200 && response.status < 300, JSON.stringify(response)); return response.value; };
try {
  await host.setup(); await host.seed(principal, ticketId);
  composed = await createPersistentApi({ databaseUrl, host, resolvePrincipal: () => host.currentPrincipal(principal), currentConfigurationPrincipal: value => value,
    applicationName: 'M1 negative qualification', apiOrigin: origin, allowedOrigin: origin,
    model: { async complete(input) { evidence.modelCalls++; const tools = input.messages.filter(message => message.role === 'tool');
      return { schemaVersion: '1', requestId: input.requestId, mode: 'simulated', message: tools.length < 2 ? '' : 'Actual receipt received', finishReason: tools.length < 2 ? 'tool-calls' : 'stop', toolCalls: tools.length === 0 ? [{ callId: 'read', name: 'read_ticket', arguments: { ticketId } }] : tools.length === 1 ? [{ callId: 'write', name: 'change_ticket_priority', arguments: { ticketId, priority: 'high', expectedVersion: 1 } }] : [] }; } },
    fault: async point => { if (point === 'after-host-write') { observe('host-transaction-committed-before-response'); reached(); await hold; } },
  });
  const draft = await composed.controlPlane.save(principal, { name: 'M1 cancellation', instructions: 'Synthetic exact ticket priority write', capabilityIds: ['read_ticket', 'change_ticket_priority'], bounds: { maxTurns: 4, maxElapsedMs: 20000 } });
  await composed.controlPlane.publish(principal, draft.draftId, 1);
  server = await new Promise(resolve => { const http = serve({ fetch: composed.app.fetch, hostname: '127.0.0.1', port: 55984 }, () => resolve(http)); });
  server.on('request', (req, res) => { if (req.url?.endsWith('/approval')) res.once('close', () => { if (!res.writableEnded) { evidence.abortedHttpResponses++; observe('actual-approval-http-response-closed-before-end'); } }); });
  const body = { input: 'Set priority high with explicit approval', context: { ticketId } }, run = await post('/api/runs', body, 'one-inflight-intent');
  assert.equal(run.status, 'awaiting-approval'); const binding = run.approval.binding;
  const decision = { approvalId: binding.approvalId, expectedHash: run.approval.expectedHash, decision: 'approve' };
  const controller = new AbortController();
  const response = request(`/api/runs/${run.runId}/approval`, decision, undefined, controller.signal).then(value => ({ value }), error => ({ error: { name: error.name, message: error.message } }));
  let boundaryTimer; try { await Promise.race([committed, new Promise((_, reject) => { boundaryTimer = setTimeout(() => reject(Error('Host commit boundary not reached within 5 seconds')), 5000); })]); } finally { clearTimeout(boundaryTimer); }
  const beforeCancel = await host.inspect(principal, ticketId, run.runId);
  assert.equal(beforeCancel.mutationCount, 1); assert.equal(beforeCancel.receipts.length, 1); assert.equal(beforeCancel.calls.filter(call => call.kind === 'write').length, 1);
  assert.equal(beforeCancel.ticket.version, 2); assert.equal(beforeCancel.ticket.priority, 'high');
  const reservation = (await host.pool.query('SELECT result FROM ae_operations_v1 WHERE id=$1', [binding.operationId])).rows[0]; assert.equal(reservation.result, null);
  observe('independent-host-truth-proves-one-commit-and-no-AE-receipt-yet', { mutationCount: 1, operationId: binding.operationId });
  controller.abort(); assert.equal((await response).error?.name, 'AbortError'); await waitUntil(() => evidence.abortedHttpResponses === 1);
  const cancelled = await post(`/api/runs/${run.runId}/cancel`, {}); assert.equal(cancelled.status, 'outcome-unknown'); assert.equal(cancelled.approval, undefined);
  observe('cancel-after-disconnect-preserves-unknown-not-rollback'); release();
  await waitUntil(async () => (await request(`/api/runs/${run.runId}`)).value.status === 'outcome-unknown');
  // Reconciliation is the existing trusted runtime API, not an invented HTTP endpoint.
  const reconciled = await composed.runtime.reconcile(run.runId, principal); assert.equal(reconciled.status, 'succeeded');
  const after = await host.inspect(principal, ticketId, run.runId);
  assert.equal(after.mutationCount, 1); assert.equal(after.calls.filter(call => call.kind === 'write').length, 1);
  assert.deepEqual(after.receipts, beforeCancel.receipts); assert.equal(evidence.modelCalls, 2, 'Cancelled phase must not resume the model');
  assert(reconciled.receipts.some(receipt => receipt.operationId === binding.operationId && receipt.receiptId === beforeCancel.receipts[0].receiptId));
  const conflict = await request(`/api/runs/${run.runId}/approval`, { ...decision, decision: 'reject' }); assert.equal(conflict.status, 409); assert.equal(conflict.value.error.code, 'APPROVAL_ALREADY_DECIDED');
  const replay = await post('/api/runs', body, 'one-inflight-intent'); assert.equal(replay.runId, run.runId); assert.equal(replay.status, 'succeeded');
  assert.equal((await host.inspect(principal, ticketId, run.runId)).calls.filter(call => call.kind === 'write').length, 1); assert.equal(evidence.modelCalls, 2);
  observe('exact-original-receipt-reconciles-without-new-write-model-or-intent', { operationId: binding.operationId, receiptId: beforeCancel.receipts[0].receiptId, conflictingLateDecisionStatus: conflict.status });
  evidence.status = 'PASS'; evidence.hostWrites = 1; evidence.runId = run.runId; evidence.operationId = binding.operationId;
} catch (error) { evidence.failure = String(error); throw error; }
finally {
  release?.();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (composed) await composed.close(); await host.close();
  evidence.cleanup = { httpServer: 'closed', runtime: 'closed', hostPool: 'closed' }; evidence.completedAt = new Date().toISOString();
  const runtime = realpathSync(new URL('../../dist/packages/runtime-adapters/db/runtime.js', import.meta.url).pathname);
  evidence.runtimeCompiledHash = createHash('sha256').update(readFileSync(runtime)).digest('hex');
  writeFileSync(join(directory, 'inflight-summary.json'), JSON.stringify(evidence, null, 2) + '\n'); console.log(JSON.stringify(evidence, null, 2));
}
