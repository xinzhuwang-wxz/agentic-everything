import test from 'node:test';
import assert from 'node:assert/strict';
import type { Principal } from '@ae/contracts';
import { AuthorizedTicketHost, ToolBroker, type Ticket, type TicketBusinessPort } from '@ae/capabilities';
import { InMemoryApprovalLedger } from '@ae/policy';

export const editor: Principal = { tenantId: 'tenant-a', applicationId: 'helpdesk', subjectId: 'alice', roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] };
export function fixture(options: { loseWriteResponse?: boolean; supportsOutcomeQuery?: boolean; approvals?: InMemoryApprovalLedger } = {}) {
  const tickets: Ticket[] = [
    { id: 'ticket-1', tenantId: 'tenant-a', title: 'Printer offline', priority: 'low', version: 1 },
    { id: 'ticket-2', tenantId: 'tenant-b', title: 'Access request', priority: 'low', version: 1 },
  ];
  const business: TicketBusinessPort = {
    readTicket(tenantId, ticketId) { const t = tickets.find(t => t.id === ticketId && t.tenantId === tenantId); if (!t) throw new Error('Not found'); return { ...t }; },
    changePriority(tenantId, ticketId, priority, expectedVersion) { const t = tickets.find(t => t.id === ticketId && t.tenantId === tenantId); if (!t || t.version !== expectedVersion) throw new Error('Conflict'); t.priority = priority; t.version++; return { ...t }; },
  };
  let revoked = false;
  const host = new AuthorizedTicketHost(business, p => revoked ? { ...p, roles: ['viewer'], scopes: ['tickets:read'] } : p);
  return { host, broker: new ToolBroker(host, options), business, revoke: () => { revoked = true; } };
}
function prepare(broker: ToolBroker) { return broker.prepare(editor, 'run-1', 'call-1', 'change_ticket_priority', { ticketId: 'ticket-1', priority: 'high', expectedVersion: 1 }); }
function approve(broker: ToolBroker, prepared = prepare(broker)) {
  const approval = broker.requestApproval(editor, prepared, 'release-1');
  broker.approvals.decide(editor, { approvalId: approval.binding.approvalId, decision: 'approve', expectedHash: approval.expectedHash });
  return { prepared, approval };
}

test('read and confirmed write execute actual business mutation once; replay returns exact receipt', async () => {
  const { broker, host } = fixture();
  const read = broker.prepare(editor, 'run-1', 'read-1', 'read_ticket', { ticketId: 'ticket-1' });
  assert.equal((await broker.execute(editor, read, 'release-1')).status, 'succeeded');
  const { prepared, approval } = approve(broker);
  const result = await broker.execute(editor, prepared, 'release-1', approval.binding.approvalId);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(await broker.execute(editor, prepared, 'release-1', approval.binding.approvalId), result);
  assert.equal(host.mutationCount, 1);
  assert.equal(host.read(editor, 'ticket-1').priority, 'high');
});
test('unapproved/model-forged approval and extra authority fields never write', async () => {
  const { broker, host } = fixture(); const prepared = prepare(broker);
  assert.equal((await broker.execute(editor, prepared, 'release-1')).status, 'denied');
  assert.equal((await broker.execute(editor, prepared, 'release-1', 'model-says-approved')).status, 'denied');
  assert.throws(() => broker.prepare(editor, 'r', 'c', 'change_ticket_priority', { ...prepared.request.arguments, approved: true }));
  assert.equal(host.mutationCount, 0);
});
test('tenant and role boundaries independently enforced by host', () => {
  const { broker, host } = fixture();
  assert.throws(() => broker.prepare(editor, 'r', 'c', 'read_ticket', { ticketId: 'ticket-2' }));
  const viewer = { ...editor, roles: ['viewer'], scopes: ['tickets:read'] };
  assert.throws(() => broker.prepare(viewer, 'r', 'c', 'change_ticket_priority', { ticketId: 'ticket-1', priority: 'high', expectedVersion: 1 }));
  assert.throws(() => host.write(viewer, prepare(broker).request));
  assert.equal(host.read({ ...editor, tenantId: 'tenant-b' }, 'ticket-2').tenantId, 'tenant-b');
  assert.equal(broker.catalog(viewer).length, 1);
});
test('approval bound to exact parameters, subject, tenant, release, resource version and expiry', async () => {
  for (const field of ['arguments', 'subject', 'tenant', 'release', 'version', 'expiry'] as const) {
    let now = Date.now(); const { broker, host } = fixture({ approvals: new InMemoryApprovalLedger(() => now) });
    const { prepared, approval } = approve(broker); let principal = editor; let release = 'release-1';
    if (field === 'arguments') prepared.request.arguments.priority = 'low';
    if (field === 'subject') principal = { ...editor, subjectId: 'mallory' };
    if (field === 'tenant') principal = { ...editor, tenantId: 'tenant-b' };
    if (field === 'release') release = 'release-2';
    if (field === 'version') prepared.request.expectedResourceVersion = '2';
    if (field === 'expiry') now += 300_001;
    assert.equal((await broker.execute(principal, prepared, release, approval.binding.approvalId)).status, 'denied', field);
    assert.equal(host.mutationCount, 0, field);
  }
});
test('resource drift and revoked host permission after preview reject mutation', async () => {
  for (const mode of ['drift', 'revoke']) {
    const f = fixture(); const { prepared, approval } = approve(f.broker);
    if (mode === 'drift') f.business.changePriority('tenant-a', 'ticket-1', 'low', 1); else f.revoke();
    assert.equal((await f.broker.execute(editor, prepared, 'release-1', approval.binding.approvalId)).status, 'denied');
    assert.equal(f.host.mutationCount, 0);
  }
});
test('lost write response is outcome-unknown, replay does not write, reconciliation retrieves receipt', async () => {
  const { broker, host } = fixture({ loseWriteResponse: true }); const { prepared, approval } = approve(broker);
  const result = await broker.execute(editor, prepared, 'release-1', approval.binding.approvalId);
  assert.equal(result.status, 'outcome-unknown');
  assert.deepEqual(await broker.execute(editor, prepared, 'release-1', approval.binding.approvalId), result);
  assert.equal(host.mutationCount, 1);
  assert.equal(broker.reconcile(editor, prepared).status, 'succeeded');
  assert.equal(host.mutationCount, 1);
});
test('adapter without outcome query remains unknown without retry', async () => {
  const { broker, host } = fixture({ loseWriteResponse: true, supportsOutcomeQuery: false }); const { prepared, approval } = approve(broker);
  await broker.execute(editor, prepared, 'release-1', approval.binding.approvalId);
  assert.equal(broker.reconcile(editor, prepared).status, 'outcome-unknown'); assert.equal(host.mutationCount, 1);
});
test('approval decision is one-use and rejects hash alteration', () => {
  const { broker } = fixture(); const prepared = prepare(broker); const view = broker.requestApproval(editor, prepared, 'release-1');
  assert.throws(() => broker.approvals.decide(editor, { approvalId: view.binding.approvalId, decision: 'approve', expectedHash: '0'.repeat(64) }));
  broker.approvals.decide(editor, { approvalId: view.binding.approvalId, decision: 'approve', expectedHash: view.expectedHash });
  assert.throws(() => broker.approvals.decide(editor, { approvalId: view.binding.approvalId, decision: 'approve', expectedHash: view.expectedHash }));
});
test('cached receipts do not bypass newly revoked host access', async () => {
  const f = fixture(); const { prepared, approval } = approve(f.broker);
  await f.broker.execute(editor, prepared, 'release-1', approval.binding.approvalId);
  f.revoke();
  // Revocation fixture retains read scope, so receipt remains readable but further writes are denied.
  const next = { ...prepared, request: { ...prepared.request, invocationId: 'other', operationId: 'other', arguments: { ticketId: 'ticket-1', priority: 'low', expectedVersion: 2 } } };
  assert.equal((await f.broker.execute(editor, next, 'release-1')).status, 'denied');
  assert.equal(f.host.mutationCount, 1);
});
