import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import type { ModelProvider, Principal } from '@ae/contracts';
import { AuthorizedTicketHost, ToolBroker, type Ticket } from '@ae/capabilities';
import { GovernedRuntime } from '@ae/runtime-core';
import { PolicyError } from '@ae/policy';
import { createApi } from '../../apps/api/src/app.js';

const principal: Principal = { tenantId: 'a', applicationId: 'fixture', subjectId: 'alice', roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] };
function fixture(unknown = false) {
  let rights = structuredClone(principal), calls = 0;
  const denied = new Set<string>();
  const tickets: Ticket[] = ['first', 'second'].map(id => ({ id, tenantId: 'a', title: `SYNTHETIC_RESTRICTED_TITLE_${id}`, priority: 'low', version: 1 }));
  const host = new AuthorizedTicketHost({
    readTicket(tenant, id) { if (denied.has(id)) throw new PolicyError('RESOURCE_DENIED'); const ticket = tickets.find(t => t.tenantId === tenant && t.id === id); if (!ticket) throw new PolicyError('RESOURCE_DENIED'); return { ...ticket }; },
    changePriority(tenant, id, priority, version) { const ticket = tickets.find(t => t.tenantId === tenant && t.id === id); if (!ticket || ticket.version !== version) throw new Error('Conflict'); ticket.priority = priority; ticket.version++; return { ...ticket }; },
  }, () => structuredClone(rights));
  const broker = new ToolBroker(host, { loseWriteResponse: unknown });
  const model: ModelProvider = { async complete(request) {
    calls++;
    const toolCalls = calls <= 2 ? [{ callId: `read-${calls}`, name: 'read_ticket', arguments: { ticketId: calls === 1 ? 'first' : 'second' } }]
      : calls === 3 ? [{ callId: 'write', name: 'change_ticket_priority', arguments: { ticketId: 'second', priority: 'high', expectedVersion: 1 } }] : [];
    return { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: toolCalls.length ? '' : 'SYNTHETIC_RESTRICTED_TITLE_first', toolCalls, finishReason: toolCalls.length ? 'tool-calls' : 'stop' };
  } };
  const runtime = new GovernedRuntime({ broker, model });
  return { host, broker, runtime, denied, calls: () => calls, rights: (p: Principal) => { rights = structuredClone(p); } };
}
const start = (f: ReturnType<typeof fixture>) => f.runtime.start({ principal, releaseId: 'r', input: 'Read two tickets and change the second.' });

test('all memory views require current read authority for every contributing resource without changing canonical state', async () => {
  for (const stage of ['paused', 'completed', 'unknown']) {
    const f = fixture(stage === 'unknown'); let view = await start(f);
    if (stage !== 'paused') view = await f.runtime.decide(view.runId, principal, { approvalId: view.approval!.binding.approvalId, expectedHash: view.approval!.expectedHash, decision: 'approve' });
    assert.equal(view.status, stage === 'paused' ? 'awaiting-approval' : stage === 'completed' ? 'succeeded' : 'outcome-unknown');
    for (const revoke of ['role', 'scope', 'earlier-resource']) {
      if (revoke === 'role') f.rights({ ...principal, roles: [] });
      if (revoke === 'scope') f.rights({ ...principal, scopes: [] });
      if (revoke === 'earlier-resource') f.denied.add('first');
      assert.throws(() => f.runtime.get(view.runId, principal), /DENIED/);
      assert.throws(() => f.runtime.list(principal), /DENIED/);
      assert.throws(() => f.runtime.cancel(view.runId, principal), /DENIED/);
      if (stage === 'unknown') assert.throws(() => f.runtime.reconcile(view.runId, principal), /DENIED/);
      if (stage === 'paused') await assert.rejects(f.runtime.decide(view.runId, principal, { approvalId: view.approval!.binding.approvalId, expectedHash: view.approval!.expectedHash, decision: 'approve' }), /DENIED/);
      f.rights(principal); f.denied.clear();
      assert.deepEqual(f.runtime.get(view.runId, principal), view);
    }
    f.rights({ ...principal, roles: ['viewer'], scopes: ['tickets:read'] });
    assert.deepEqual(f.runtime.get(view.runId, principal), view);
    assert.equal(f.host.mutationCount, stage === 'paused' ? 0 : 1);
  }
});

test('host identity resolver cannot substitute or mutate tenant, application or subject on any path', () => {
  for (const field of ['tenantId', 'applicationId', 'subjectId'] as const) for (const mutate of [false, true]) {
    let businessReads = 0;
    const host = new AuthorizedTicketHost({ readTicket() { businessReads++; throw new Error('Must not read'); }, changePriority() { throw new Error('Must not write'); } }, p => { if (mutate) { p[field] = 'other'; return p; } return { ...p, [field]: 'other' }; });
    assert.throws(() => host.read(principal, 'first'), /PRINCIPAL_CHANGED/);
    assert.throws(() => host.query(principal, 'op'), /PRINCIPAL_CHANGED/);
    assert.throws(() => host.write(principal, { schemaVersion: '1', runId: 'r', invocationId: 'c', operationId: 'op', capabilityId: 'change_ticket_priority', capabilityVersion: '1', targetId: 'first', arguments: { ticketId: 'first', priority: 'high', expectedVersion: 1 } }), /PRINCIPAL_CHANGED/);
    assert.equal(businessReads, 0); assert.equal(principal[field], { tenantId: 'a', applicationId: 'fixture', subjectId: 'alice' }[field]);
  }
});

test('cached host and broker receipts need current resource reads, not write permission or obsolete pre-write version', async () => {
  const f = fixture();
  const prepared = f.broker.prepare(principal, 'r', 'c', 'change_ticket_priority', { ticketId: 'first', priority: 'high', expectedVersion: 1 });
  const approval = f.broker.requestApproval(principal, prepared, 'release');
  f.broker.approvals.decide(principal, { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' });
  const receipt = await f.broker.execute(principal, prepared, 'release', approval.binding.approvalId);
  f.rights({ ...principal, roles: ['viewer'], scopes: ['tickets:read'] });
  assert.deepEqual(f.host.write(principal, prepared.request), receipt);
  assert.deepEqual(f.host.query(principal, prepared.request.operationId), receipt);
  assert.deepEqual(await f.broker.execute(principal, prepared, 'release'), receipt);
  f.denied.add('first');
  assert.throws(() => f.host.write(principal, prepared.request), /RESOURCE_DENIED/);
  assert.throws(() => f.host.query(principal, prepared.request.operationId), /RESOURCE_DENIED/);
  assert.equal((await f.broker.execute(principal, prepared, 'release')).status, 'denied');
  f.denied.clear(); assert.deepEqual(f.host.query(principal, prepared.request.operationId), receipt);
  assert.equal(f.host.mutationCount, 1);
});

test('real HTTP repeated intent re-reads current authority and retains run identity without redispatch', async () => {
  const f = fixture(); let origin = '';
  const server = serve({ port: 0, hostname: '127.0.0.1', fetch: request => app.fetch(request) });
  await new Promise<void>(resolve => server.once('listening', resolve));
  const app = createApi({ runtime: f.runtime, broker: f.broker, resolvePrincipal: () => principal, releaseId: 'r', applicationName: 'Synthetic fixture', apiOrigin: origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, allowedOrigin: origin });
  const post = () => fetch(`${origin}/api/runs`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': 'same-intent' }, body: JSON.stringify({ input: 'Read two tickets and change the second.' }) });
  try {
    const first = await post(); assert.equal(first.status, 201); const view = await first.json(); const calls = f.calls();
    for (const revoke of ['role', 'scope', 'resource']) {
      if (revoke === 'role') f.rights({ ...principal, roles: [] });
      if (revoke === 'scope') f.rights({ ...principal, scopes: [] });
      if (revoke === 'resource') f.denied.add('first');
      for (const response of [await post(), await fetch(`${origin}/api/runs/${view.runId}`)]) { assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /SYNTHETIC_RESTRICTED_TITLE/); }
      assert.equal(f.calls(), calls); assert.equal(f.host.mutationCount, 0);
      f.rights(principal); f.denied.clear();
      const recovered = await post(); assert.equal(recovered.status, 200); assert.deepEqual(await recovered.json(), view);
    }
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});


test('revocation between a tool receipt and the next model turn prevents model history disclosure', async () => {
  let readable = true, reads = 0, modelCalls = 0;
  const host = new AuthorizedTicketHost({
    readTicket() {
      if (!readable) throw new PolicyError('RESOURCE_DENIED');
      // prepare, execute read guard, execute prepare, and actual read result.
      if (++reads === 4) readable = false;
      return { id: 'first', tenantId: 'a', title: 'SYNTHETIC_RESTRICTED_TITLE', priority: 'low', version: 1 };
    },
    changePriority() { throw new Error('Must not write'); },
  });
  const runtime = new GovernedRuntime({ broker: new ToolBroker(host), model: { async complete(request) {
    modelCalls++;
    return { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: '', toolCalls: [{ callId: 'read', name: 'read_ticket', arguments: { ticketId: 'first' } }], finishReason: 'tool-calls' };
  } } });
  await assert.rejects(runtime.start({ principal, releaseId: 'r', input: 'Read first.' }), /RESOURCE_DENIED/);
  assert.equal(modelCalls, 1, 'No subsequent model call receives revoked tool history');
  assert.equal(host.mutationCount, 0);
});
