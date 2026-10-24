import test from 'node:test';
import assert from 'node:assert/strict';
import type { JsonObject } from '@ae/contracts';
import { AuthorizedTicketHost, syntheticTitleCatalog, ticketCapabilities, ToolBroker } from '../src/index.js';
import { digest } from '@ae/policy';
import { approveAssignee, editor, memberFixture, prepareAssignee, viewer } from './member-fixture.js';

const ids = (broker: ToolBroker, principal = editor) => broker.catalog(principal).map(capability => capability.capabilityId).sort();

test('member capabilities require explicit host methods; old bindings and two-tool hosts are unchanged', () => {
  const f = memberFixture();
  const legacy = { readTicket: f.business.readTicket, changePriority: f.business.changePriority };
  assert.deepEqual(ids(new ToolBroker(new AuthorizedTicketHost(legacy))), ['change_ticket_priority', 'read_ticket']);
  assert.deepEqual(ids(new ToolBroker(new AuthorizedTicketHost({ ...legacy, changeAssignee: f.business.changeAssignee! }))), ['change_ticket_priority', 'read_ticket']);
  assert.deepEqual(ids(new ToolBroker(new AuthorizedTicketHost({ ...legacy, listMembers: f.business.listMembers! }))), ['change_ticket_priority', 'read_ticket', 'read_ticket_members']);
  assert.deepEqual(ids(f.broker), ['change_ticket_assignee', 'change_ticket_priority', 'read_ticket', 'read_ticket_members']);
  assert.deepEqual(ids(f.broker, viewer), ['read_ticket', 'read_ticket_members']);
  for (const name of ['read_ticket', 'change_ticket_priority']) {
    const capability = ticketCapabilities.find(capability => capability.capabilityId === name)!;
    assert.equal(capability.sourceRevision, 'fixture-host-v1');
    assert.equal(capability.bindingHash, digest({ name, version: '1', source: 'fixture-host-v1' }));
  }
  for (const name of ['read_ticket_members', 'change_ticket_assignee']) {
    const capability = ticketCapabilities.find(capability => capability.capabilityId === name)!;
    assert.equal(capability.sourceRevision, 'fixture-ticket-members-v1');
    assert.equal(capability.bindingHash, digest({ name, version: '1', source: 'fixture-ticket-members-v1' }));
  }
  f.rights(viewer);
  assert.deepEqual(ids(f.broker), ['read_ticket', 'read_ticket_members'], 'catalog refreshes host rights');
});

test('member reads are read-only and scoped to the currently accessible ticket and tenant', async () => {
  const f = memberFixture();
  const prepared = f.broker.prepare(viewer, 'run-1', 'members', 'read_ticket_members', { ticketId: 'ticket-1' });
  assert.equal(prepared.write, false);
  const result = await f.broker.execute(viewer, prepared, 'release-1');
  assert.equal(result.status, 'succeeded');
  if (result.status !== 'succeeded') throw new Error('Expected member receipt');
  assert.deepEqual(result.data, { ticketId: 'ticket-1', members: f.members.filter(member => member.tenantId === 'tenant-a') });
  assert.equal(f.host.mutationCount, 0);
  assert.doesNotMatch(JSON.stringify(result), /FOREIGN_PRIVATE_NAME|member-b/);
  assert.throws(() => f.broker.prepare(viewer, 'r', 'c', 'read_ticket_members', { ticketId: 'ticket-other' }), /RESOURCE_DENIED/);
  assert.throws(() => f.broker.prepare({ ...viewer, tenantId: 'tenant-b' }, 'r', 'c', 'read_ticket_members', { ticketId: 'ticket-1' }), /RESOURCE_DENIED/);
  assert.throws(() => f.broker.prepare({ ...viewer, scopes: [] }, 'r', 'c', 'read_ticket_members', { ticketId: 'ticket-1' }), /SCOPE_DENIED/);
  f.leakForeign();
  assert.throws(() => f.host.members(viewer, 'ticket-1'), /TENANT_DENIED/);
  const denied = await f.broker.execute(viewer, prepared, 'release-1');
  assert.equal(denied.status, 'denied', 'cached member data is not disclosed after adapter scope violation');
  assert.doesNotMatch(JSON.stringify(denied), /FOREIGN_PRIVATE_NAME/);
});

test('assignment needs write authority and exact approval, mutates once, and replays the same receipt', async () => {
  const f = memberFixture(); const prepared = prepareAssignee(f.broker);
  assert.deepEqual(prepared.preview, { ticketId: 'ticket-1', title: '  Printer offline  ', before: null, after: 'member-a', assigneeName: 'Alex', version: 1 });
  assert.throws(() => f.broker.prepare(viewer, 'r', 'c', 'change_ticket_assignee', prepared.request.arguments), /DENIED/);
  assert.throws(() => f.host.write(viewer, prepared.request), /DENIED/);
  assert.equal((await f.broker.execute(editor, prepared, 'release-1')).status, 'denied');
  assert.equal((await f.broker.execute(editor, prepared, 'release-1', 'model-approved')).status, 'denied');
  assert.equal(f.host.mutationCount, 0);
  const approved = approveAssignee(f.broker, prepared);
  const result = await f.broker.execute(editor, prepared, 'release-1', approved.approvalId);
  assert.equal(result.status, 'succeeded');
  assert.equal(f.ticket.assigneeId, 'member-a'); assert.equal(f.ticket.version, 2); assert.equal(f.ticket.priority, 'low');
  assert.equal(f.host.mutationCount, 1);
  assert.deepEqual(await f.broker.execute(editor, prepared, 'release-1', approved.approvalId), result);
  assert.deepEqual(f.host.write(viewer, prepared.request), result, 'cached receipt requires read, not obsolete write authority/version');
  assert.throws(() => f.broker.approvals.decide(editor, { approvalId: approved.approvalId, expectedHash: approved.approval.expectedHash, decision: 'approve' }), /APPROVAL_ALREADY_DECIDED/);
  f.readable(false);
  assert.equal((await f.broker.execute(editor, prepared, 'release-1', approved.approvalId)).status, 'denied');
  assert.throws(() => f.host.query(editor, prepared.request.operationId), /RESOURCE_DENIED/);
  assert.equal(f.host.mutationCount, 1);
});

test('invalid, inactive, foreign and strict-schema assignees never reach mutation', () => {
  const f = memberFixture();
  for (const assigneeId of ['missing', 'member-inactive', 'member-b']) {
    assert.throws(() => f.broker.prepare(editor, 'r', 'c', 'change_ticket_assignee', { ticketId: 'ticket-1', assigneeId, expectedVersion: 1 }), /ASSIGNEE_DENIED/);
  }
  const invalidArguments: JsonObject[] = [
    { ticketId: 'ticket-1', assigneeId: 'member-a', expectedVersion: 0 },
    { ticketId: 'ticket-1', assigneeId: 'member-a', expectedVersion: 1, approved: true },
    { ticketId: 'ticket-1', assigneeId: 'member-a', expectedVersion: 1, tenantId: 'tenant-b' },
  ];
  for (const arguments_ of invalidArguments) assert.throws(() => f.broker.prepare(editor, 'r', 'c', 'change_ticket_assignee', arguments_), /INVALID_ARGUMENTS/);
  f.leakForeign();
  assert.throws(() => prepareAssignee(f.broker), /TENANT_DENIED/);
  assert.equal(f.host.mutationCount, 0);
});

test('approval refuses tampered member, version, target, capability, classification and release', async () => {
  for (const field of ['member', 'version', 'argument-version', 'target', 'capability', 'classification', 'release'] as const) {
    const f = memberFixture(); const { prepared, approvalId } = approveAssignee(f.broker);
    if (field === 'member') prepared.request.arguments.assigneeId = 'member-other';
    if (field === 'version') prepared.request.expectedResourceVersion = '2';
    if (field === 'argument-version') prepared.request.arguments.expectedVersion = 2;
    if (field === 'target') prepared.request.targetId = 'ticket-other';
    if (field === 'capability') { prepared.request.capabilityId = 'change_ticket_priority'; prepared.request.arguments = { ticketId: 'ticket-1', priority: 'high', expectedVersion: 1 }; }
    if (field === 'classification') prepared.write = false;
    const result = await f.broker.execute(editor, prepared, field === 'release' ? 'other-release' : 'release-1', approvalId);
    assert.equal(result.status, 'denied', field); assert.equal(f.host.mutationCount, 0, field);
  }
});

test('execution rechecks revoked authority, ticket version and current member eligibility', async () => {
  for (const drift of ['role', 'scope', 'ticket', 'inactive', 'removed', 'tenant', 'members-access'] as const) {
    const f = memberFixture(); const { prepared, approvalId } = approveAssignee(f.broker);
    if (drift === 'role') f.rights(viewer);
    if (drift === 'scope') f.rights({ ...editor, scopes: ['tickets:read'] });
    if (drift === 'ticket') f.ticket.version++;
    if (drift === 'inactive') f.members[0]!.active = false;
    if (drift === 'removed') f.members.shift();
    if (drift === 'tenant') f.members[0]!.tenantId = 'tenant-b';
    if (drift === 'members-access') f.membersReadable(false);
    assert.equal((await f.broker.execute(editor, prepared, 'release-1', approvalId)).status, 'denied', drift);
    assert.equal(f.host.mutationCount, 0, drift); assert.equal(f.ticket.assigneeId, undefined, drift);
  }
});

test('host independently rechecks assignee eligibility and version at the mutation boundary', () => {
  for (const drift of ['inactive', 'version'] as const) {
    const f = memberFixture(); const prepared = prepareAssignee(f.broker);
    if (drift === 'inactive') f.members[0]!.active = false; else f.ticket.version++;
    assert.throws(() => f.host.write(editor, prepared.request), /ASSIGNEE_DENIED|RESOURCE_VERSION_CONFLICT/);
    assert.equal(f.host.mutationCount, 0);
  }
});

test('lost assignment response reconciles to one receipt without blind retry, including after broker replacement', async () => {
  const f = memberFixture({ loseWriteResponse: true }); const { prepared, approvalId } = approveAssignee(f.broker);
  const unknown = await f.broker.execute(editor, prepared, 'release-1', approvalId);
  assert.equal(unknown.status, 'outcome-unknown');
  assert.deepEqual(await f.broker.execute(editor, prepared, 'release-1', approvalId), unknown);
  assert.equal(f.host.mutationCount, 1);
  const receipt = f.broker.reconcile(editor, prepared);
  assert.equal(receipt.status, 'succeeded');
  assert.deepEqual(await f.broker.execute(editor, prepared, 'release-1'), receipt);
  assert.deepEqual(new ToolBroker(f.host).reconcile(editor, prepared), receipt);
  assert.equal(f.host.mutationCount, 1);
});

test('operation identity binds capability and arguments for host dispatch and reconciliation', async () => {
  const f = memberFixture(); const { prepared, approvalId } = approveAssignee(f.broker);
  await f.broker.execute(editor, prepared, 'release-1', approvalId);
  const tampered = structuredClone(prepared);
  tampered.request.capabilityId = 'change_ticket_priority';
  tampered.request.arguments = { ticketId: 'ticket-1', priority: 'high', expectedVersion: 1 };
  assert.throws(() => f.host.write(editor, tampered.request), /IDEMPOTENCY_CONFLICT/);
  assert.throws(() => f.broker.reconcile(editor, tampered), /IDEMPOTENCY_CONFLICT/);
  assert.throws(() => new ToolBroker(f.host).reconcile(editor, tampered), /IDEMPOTENCY_CONFLICT/);
  assert.equal(f.host.mutationCount, 1); assert.equal(f.ticket.priority, 'low');
});

test('unqueryable assignment stays unknown and behavior projection keeps assignee data intact', async () => {
  const f = memberFixture({ loseWriteResponse: true, supportsOutcomeQuery: false });
  const { prepared, approvalId } = approveAssignee(f.broker);
  assert.equal((await f.broker.execute(editor, prepared, 'release-1', approvalId)).status, 'outcome-unknown');
  assert.equal(f.broker.reconcile(editor, prepared).status, 'outcome-unknown');
  const projected = f.host.read(editor, 'ticket-1', { registryHash: syntheticTitleCatalog.registryHash, baselineHash: syntheticTitleCatalog.baselineHash, candidateCodeHash: syntheticTitleCatalog.candidateCodeHash, enabled: [{ id: 'synthetic-ticket-title-trim', version: '1' }] });
  assert.equal(projected.title, 'Printer offline'); assert.equal(projected.assigneeId, 'member-a');
  assert.equal(projected.version, 2); assert.equal(f.ticket.title, '  Printer offline  '); assert.equal(f.host.mutationCount, 1);
});
