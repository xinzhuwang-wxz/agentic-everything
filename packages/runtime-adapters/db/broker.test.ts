import test from 'node:test';
import assert from 'node:assert/strict';
import type { Principal, ToolRequest, ToolResult } from '@ae/contracts';
import { ticketCapabilities, type Member, type PreparedTool, type Ticket } from '@ae/capabilities';
import { PolicyError, type ApprovalView } from '@ae/policy';
import { PersistentToolBroker, type DurableTicketHost } from './broker.js';
import type { PersistentStore, Queryable, StoredRun } from './store.js';

const editor: Principal = { tenantId: 'tenant-a', applicationId: 'fixture', subjectId: 'alice', roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] };
const viewer: Principal = { ...editor, roles: ['viewer'], scopes: ['tickets:read'] };
const members: Member[] = [
  { id: 'member-a', tenantId: 'tenant-a', displayName: 'Member A', active: true },
  { id: 'member-other', tenantId: 'tenant-a', displayName: 'Member Other', active: true },
  { id: 'member-inactive', tenantId: 'tenant-a', displayName: 'Inactive', active: false },
];

// Contract tests only: this deliberately is not a persistence qualification. Real
// process death and host-owned transactions are exercised in tests/persistence.
function fixture(principal = editor) {
  let rights = structuredClone(principal), readable = true, lostResponse = false;
  let ticket: Ticket = { id: 'ticket-a', tenantId: 'tenant-a', title: 'Synthetic ticket', priority: 'low', version: 1 };
  let available = structuredClone(members), writes = 0, queries = 0, memberReads = 0;
  const run: StoredRun = { view: { runId: 'run', releaseId: 'release', status: 'running', receipts: [], events: [], persistence: 'postgres-dbos', modelMode: 'configured-model-port' }, principal, releaseId: 'release', input: 'Assign a member', pins: { sdk: '0.21.0', workflow: 'ae-v1', capability: '1', policy: 'tickets-policy-v1' }, cancelled: false, phase: 'initial' };
  const operations = new Map<string, { prepared: PreparedTool; result: ToolResult | null }>();
  const approvals = new Map<string, { view: ApprovalView; state: string }>();
  const receipts = new Map<string, ToolResult>();
  const query: Queryable['query'] = async (sql, values = []) => {
    const id = String(values[0]);
    if (sql.startsWith('SELECT') && sql.includes('ae_operations_v1')) { const row = operations.get(id); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }; }
    if (sql.startsWith('SELECT') && sql.includes('ae_approvals_v1')) { const row = approvals.get(id); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }; }
    if (sql.startsWith('INSERT INTO ae_operations_v1')) operations.set(id, { prepared: JSON.parse(String(values[3])) as PreparedTool, result: null });
    else if (sql.startsWith('UPDATE ae_operations_v1')) operations.get(id)!.result = JSON.parse(String(values[1])) as ToolResult;
    else if (sql.startsWith('UPDATE ae_approvals_v1')) approvals.get(id)!.state = String(values[1]);
    else throw new Error(`Unexpected test query: ${sql}`);
    return { rows: [], rowCount: 1 };
  };
  const store = { pool: { query }, load: async () => run,
    update: async <T>(_id: string, fn: (value: StoredRun, client: Queryable) => Promise<T>) => fn(run, { query }),
    event: () => {}, status: (value: StoredRun, status: StoredRun['view']['status']) => { value.view.status = status; },
  } as unknown as PersistentStore;
  const host: DurableTicketHost = {
    currentPrincipal: async () => structuredClone(rights),
    currentCapabilities: async () => structuredClone(ticketCapabilities),
    read: async (p, id) => { if (!readable || p.tenantId !== ticket.tenantId || id !== ticket.id) throw new PolicyError('RESOURCE_DENIED'); return { ...ticket }; },
    listMembers: async (p, id) => { await host.read(p, id); memberReads++; return structuredClone(available); },
    write: async (_p, request: ToolRequest) => {
      writes++;
      assert.equal(request.capabilityId, 'change_ticket_assignee');
      ticket = { ...ticket, assigneeId: String(request.arguments.assigneeId), version: ticket.version + 1 };
      const result: ToolResult = { status: 'succeeded', operationId: request.operationId, receiptId: 'host-receipt', data: { ...ticket } };
      receipts.set(request.operationId, result);
      if (lostResponse) throw new Error('Synthetic response lost after commit');
      return result;
    },
    query: async (_p, operationId) => { queries++; return receipts.get(operationId) ?? { status: 'outcome-unknown', operationId, message: 'No confirmed receipt' }; },
  };
  const broker = new PersistentToolBroker(store, host);
  const approve = (prepared: PreparedTool) => { const approval = broker.approval(principal, prepared, run.releaseId); approvals.set(approval.binding.approvalId, { view: approval, state: 'approved' }); return approval; };
  return { broker, host, store, run, operations, approvals, approve, counts: () => ({ writes, queries, memberReads }), ticket: () => ticket,
    rights: (value: Principal) => { rights = structuredClone(value); }, readable: (value: boolean) => { readable = value; },
    members: (value: Member[]) => { available = structuredClone(value); }, version: (value: number) => { ticket.version = value; }, loseResponse: () => { lostResponse = true; },
  };
}
const args = { ticketId: 'ticket-a', assigneeId: 'member-a', expectedVersion: 1 };

test('persistent catalog requires exact host declaration and member method for new tools', async () => {
  const f = fixture();
  assert.equal((await f.broker.catalog(editor)).length, 4);
  delete f.host.listMembers;
  assert.deepEqual((await f.broker.catalog(editor)).map(c => c.capabilityId).sort(), ['change_ticket_priority', 'read_ticket']);
  const undeclared = fixture(); delete undeclared.host.currentCapabilities;
  assert.deepEqual((await undeclared.broker.catalog(editor)).map(c => c.capabilityId).sort(), ['change_ticket_priority', 'read_ticket']);
  const mismatched = fixture(); mismatched.host.currentCapabilities = async () => ticketCapabilities.map(c => c.capabilityId === 'read_ticket_members' ? { ...c, bindingHash: '0'.repeat(64) } : c);
  assert.equal((await mismatched.broker.catalog(editor)).some(c => c.capabilityId === 'read_ticket_members'), false);
  await assert.rejects(undeclared.broker.prepare(editor, 'run', 'call', 'change_ticket_assignee', args), /CAPABILITY_NOT_ALLOWED/);
});

test('persistent member read is genuinely read-only for a viewer and reuses its reserved read after interruption', async () => {
  const f = fixture(viewer);
  assert.deepEqual((await f.broker.catalog(viewer)).map(c => c.capabilityId).sort(), ['read_ticket', 'read_ticket_members']);
  await f.broker.assertCapability(f.run, 'read_ticket_members');
  const prepared = await f.broker.prepare(viewer, 'run', 'members', 'read_ticket_members', { ticketId: 'ticket-a' });
  assert.equal(prepared.write, false);
  f.operations.set(prepared.request.operationId, { prepared, result: null });
  const result = await f.broker.execute(f.run, 'read_ticket_members', { ticketId: 'ticket-a' }, 'members');
  assert.equal(result.status, 'succeeded');
  if (result.status === 'succeeded') assert.deepEqual(result.data, { ticketId: 'ticket-a', members });
  assert.equal(f.counts().writes, 0); assert.equal(f.counts().queries, 0);
  f.readable(false);
  await assert.rejects(f.broker.execute(f.run, 'read_ticket_members', { ticketId: 'ticket-a' }, 'members'), /RESOURCE_DENIED/);
});

test('persistent planning preserves member argument/version/tenant and active membership boundaries', async () => {
  for (const assigneeId of ['missing', 'member-inactive']) {
    const f = fixture();
    await assert.rejects(f.broker.prepare(editor, 'run', 'assign', 'change_ticket_assignee', { ...args, assigneeId }), /ASSIGNEE_DENIED/);
    assert.equal(f.counts().writes, 0);
  }
  const foreign = fixture(); foreign.members([{ id: 'member-a', tenantId: 'tenant-b', displayName: 'Foreign', active: true }]);
  await assert.rejects(foreign.broker.prepare(editor, 'run', 'assign', 'change_ticket_assignee', args), /TENANT_DENIED/);
  const stale = fixture(); stale.version(2);
  await assert.rejects(stale.broker.prepare(editor, 'run', 'assign', 'change_ticket_assignee', args), /RESOURCE_VERSION_CONFLICT/);
  await assert.rejects(stale.broker.prepare(editor, 'run', 'read', 'read_ticket_members', { ticketId: 'ticket-a', tenantId: 'tenant-b' }), /INVALID_ARGUMENTS/);
});

test('persistent assignment uses exact approval and consumes it only with the bound reservation', async () => {
  const f = fixture();
  const prepared = await f.broker.prepare(editor, 'run', 'assign', 'change_ticket_assignee', args);
  assert.equal(prepared.write, true); assert.equal(prepared.preview.after, 'member-a'); assert.equal(prepared.preview.assigneeName, 'Member A');
  const approval = f.approve(prepared);
  await assert.rejects(f.broker.execute(f.run, 'change_ticket_assignee', { ...args, assigneeId: 'member-other' }, 'assign', approval.binding.approvalId), /APPROVAL_BINDING_MISMATCH/);
  assert.equal(f.approvals.get(approval.binding.approvalId)?.state, 'approved'); assert.equal(f.counts().writes, 0);
  const result = await f.broker.execute(f.run, 'change_ticket_assignee', args, 'assign', approval.binding.approvalId);
  assert.equal(result.status, 'succeeded'); assert.equal(f.ticket().assigneeId, 'member-a');
  assert.equal(f.approvals.get(approval.binding.approvalId)?.state, 'consumed');
  assert.deepEqual(await f.broker.execute(f.run, 'change_ticket_assignee', args, 'assign', approval.binding.approvalId), result);
  assert.equal(f.counts().writes, 1);
});

test('persistent assignment rechecks role, member state and target version after approval before dispatch', async () => {
  for (const revoke of ['role', 'member', 'version']) {
    const f = fixture(); const prepared = await f.broker.prepare(editor, 'run', 'assign', 'change_ticket_assignee', args); const approval = f.approve(prepared);
    if (revoke === 'role') f.rights(viewer);
    if (revoke === 'member') f.members(members.map(member => ({ ...member, active: false })));
    if (revoke === 'version') f.version(2);
    await assert.rejects(f.broker.execute(f.run, 'change_ticket_assignee', args, 'assign', approval.binding.approvalId), /ROLE_DENIED|ASSIGNEE_DENIED|RESOURCE_VERSION_CONFLICT/);
    assert.equal(f.counts().writes, 0); assert.equal(f.operations.size, 0);
  }
});

test('persistent reserved assignment queries its operation instead of dispatching after interruption', async () => {
  const f = fixture(); const prepared = await f.broker.prepare(editor, 'run', 'assign', 'change_ticket_assignee', args);
  f.operations.set(prepared.request.operationId, { prepared, result: null });
  const result = await f.broker.execute(f.run, 'change_ticket_assignee', args, 'assign');
  assert.equal(result.status, 'outcome-unknown'); assert.equal(f.counts().writes, 0); assert.equal(f.counts().queries, 1);
});

test('persistent lost assignment response reconciles the original host receipt without another mutation', async () => {
  const f = fixture(); const prepared = await f.broker.prepare(editor, 'run', 'assign', 'change_ticket_assignee', args); const approval = f.approve(prepared); f.loseResponse();
  const unknown = await f.broker.execute(f.run, 'change_ticket_assignee', args, 'assign', approval.binding.approvalId);
  assert.equal(unknown.status, 'outcome-unknown'); f.run.view.status = 'outcome-unknown';
  const receipt = await f.host.query(editor, prepared.request.operationId);
  const canonical = await f.broker.record('run', prepared.request.operationId, receipt, true);
  assert.equal(canonical.status, 'succeeded'); assert.equal(f.run.view.status, 'succeeded');
  assert.equal(f.counts().writes, 1); assert.equal(f.ticket().version, 2);
  assert.deepEqual(await f.broker.execute(f.run, 'change_ticket_assignee', args, 'assign', approval.binding.approvalId), canonical);
  assert.equal(f.counts().writes, 1);
});
