import test from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import type { ModelProvider, Principal } from '@ae/contracts';
import { GovernedRuntime, type RunView } from '@ae/runtime-core';
import { AuthorizedTicketHost, ToolBroker } from '@ae/capabilities';
import { readTicket, changePriority } from '../../../fixtures/existing-react-helpdesk/src/tickets.js';
import { createApi } from '../src/app.js';

const owner: Principal = { tenantId: 'tenant-a', applicationId: 'helpdesk', subjectId: 'alice', roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] };
test('actual HTTP fetch: existing business read/write, approval, isolation, idempotency, and browser boundary', async t => {
  const counts = new Map<string, number>();
  let modelCalls = 0;
  const model: ModelProvider = { async complete(request) {
    modelCalls++;
    const turn = counts.get(request.runId) ?? 0; counts.set(request.runId, turn + 1);
    const write = request.messages.some(m => m.role === 'user' && m.content.includes('raise'));
    const calls = turn === 0 ? [{ callId: `${request.runId}-read`, name: 'read_ticket', arguments: { ticketId: 'ticket-1' } }] : write && turn === 1 ? [{ callId: `${request.runId}-write`, name: 'change_ticket_priority', arguments: { ticketId: 'ticket-1', priority: 'high', expectedVersion: readTicket('tenant-a', 'ticket-1').version } }] : [];
    return { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: calls.length ? '' : 'Host receipt received.', toolCalls: calls, finishReason: calls.length ? 'tool-calls' : 'stop' };
  } };
  const host = new AuthorizedTicketHost({ readTicket, changePriority });
  const broker = new ToolBroker(host), runtime = new GovernedRuntime({ model, broker });
  let session: Principal | undefined = owner;
  let app: Hono;
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => app.fetch(request) });
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  app = createApi({ runtime, broker, resolvePrincipal: () => session, releaseId: 'test-release', applicationName: 'Fixture', apiOrigin: base, allowedOrigin: 'http://127.0.0.1:5173' });
  const post = (path: string, data: unknown, key = 'intent-1', headers: Record<string, string> = {}) => fetch(base + path, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json', 'Idempotency-Key': key, ...headers }, body: JSON.stringify(data) });
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  await t.test('metadata and catalog are honest', async () => {
    const meta = await (await fetch(base + '/api/meta')).json(); assert.equal(meta.simulationKind, 'subagent_api'); assert.equal(meta.durability, 'memory_fixture');
    const catalog = await (await fetch(base + '/api/capabilities')).json(); assert.equal(catalog.capabilities.length, 2);
  });
  let view: RunView;
  await t.test('concurrent same intent performs one run and remains paused without mutation', async () => {
    const responses = await Promise.all([post('/api/runs', { input: 'raise ticket priority', context: { ticketId: 'ticket-1' } }), post('/api/runs', { input: 'raise ticket priority', context: { ticketId: 'ticket-1' } })]);
    const [first, second] = await Promise.all(responses.map(r => r.json())) as RunView[];
    assert.ok(first && second); view = first;
    assert.equal(first.runId, second.runId); assert.equal(first.status, 'awaiting-approval'); assert.equal(modelCalls, 2); assert.equal(host.mutationCount, 0);
    assert.equal((await post('/api/runs', { input: 'different intent' })).status, 409);
  });
  await t.test('request cannot self-assign identity or bypass host tenant checks', async () => {
    assert.equal((await post('/api/runs', { input: 'read', principal: owner }, 'spoof')).status, 400);
    assert.equal((await fetch(base + '/api/tickets/ticket-2')).status, 404);
    session = { ...owner, subjectId: 'other' };
    assert.equal((await fetch(base + '/api/runs/' + view.runId)).status, 404);
    session = { ...owner, tenantId: 'tenant-b' };
    assert.equal((await fetch(base + '/api/runs/' + view.runId)).status, 404);
    session = owner;
  });
  await t.test('hash-bound approval executes existing business exactly once and refresh reads same state', async () => {
    assert.ok(view.approval);
    const path = `/api/runs/${view.runId}/approval`;
    assert.equal((await post(path, { approvalId: view.approval.binding.approvalId, decision: 'approve', expectedHash: '0'.repeat(64) })).status, 409);
    const decision = { approvalId: view.approval.binding.approvalId, decision: 'approve', expectedHash: view.approval.expectedHash };
    const result = await (await post(path, decision)).json() as RunView;
    assert.equal(result.status, 'succeeded'); assert.equal(host.mutationCount, 1);
    assert.equal((await post(path, decision)).status, 409); assert.equal(host.mutationCount, 1);
    const current = await (await fetch(base + '/api/tickets/ticket-1')).json(); assert.equal(current.ticket.priority, 'high'); assert.equal(current.ticket.version, 2);
    assert.equal(readTicket('tenant-a', 'ticket-1').version, current.ticket.version);
    const reconnected = await (await fetch(base + '/api/runs/' + view.runId)).json(); assert.equal(reconnected.status, 'succeeded');
  });
  await t.test('reject and cancel stay non-mutating and reconnectable', async () => {
    for (const action of ['reject', 'cancel']) {
      const paused = await (await post('/api/runs', { input: 'raise priority' }, action)).json() as RunView;
      assert.ok(paused.approval);
      const response = action === 'reject'
        ? await post(`/api/runs/${paused.runId}/approval`, { approvalId: paused.approval.binding.approvalId, decision: 'reject', expectedHash: paused.approval.expectedHash })
        : await post(`/api/runs/${paused.runId}/cancel`, {});
      const result = await response.json(); assert.equal(result.status, action === 'reject' ? 'rejected' : 'cancelled');
      assert.equal(host.mutationCount, 1);
    }
  });
  await t.test('origin, host, JSON, payload and missing-session defenses', async () => {
    assert.equal((await post('/api/runs', { input: 'read' }, 'cross-site', { Origin: 'https://evil.example' })).status, 403);
    const hostStatus = await new Promise<number | undefined>((resolve, reject) => { const req = httpRequest(base + '/api/meta', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }); req.on('error', reject); req.end(); });
    assert.equal(hostStatus, 403);
    assert.equal((await post('/api/runs', { input: 'read' }, 'plain', { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await fetch(base + '/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await post('/api/runs', { input: 'x'.repeat(40000) }, 'large')).status, 413);
    session = undefined; assert.equal((await fetch(base + '/api/meta')).status, 401); session = owner;
  });
});
