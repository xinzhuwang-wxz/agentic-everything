import test from 'node:test';
import assert from 'node:assert/strict';
import type { ModelProvider, ModelRequest, ModelResponse, Principal } from '@ae/contracts';
import { AuthorizedTicketHost, ToolBroker } from '@ae/capabilities';
import { GovernedRuntime } from '../src/index.js';
import { editor, memberFixture, viewer } from '../../capabilities/test/member-fixture.js';

function setup(options: { loseWriteResponse?: boolean; readOnly?: boolean; assigneeId?: string } = {}) {
  const f = memberFixture(options);
  const requests: ModelRequest[] = [];
  const model: ModelProvider = { async complete(request) {
    requests.push(request);
    const response: ModelResponse = { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: '', toolCalls: [], finishReason: 'tool-calls' };
    if (requests.length === 1) response.toolCalls = [{ callId: 'members', name: 'read_ticket_members', arguments: { ticketId: 'ticket-1' } }];
    else if (requests.length === 2) response.toolCalls = [{ callId: 'ticket', name: 'read_ticket', arguments: { ticketId: 'ticket-1' } }];
    else if (requests.length === 3 && !options.readOnly) response.toolCalls = [{ callId: 'assign', name: 'change_ticket_assignee', arguments: { ticketId: 'ticket-1', assigneeId: options.assigneeId ?? 'member-a', expectedVersion: 1 } }];
    else { response.finishReason = 'stop'; response.message = options.readOnly ? 'Accessible members and ticket inspected.' : 'The host receipt confirms the assignment.'; }
    return response;
  } };
  return { ...f, requests, runtime: new GovernedRuntime({ model, broker: f.broker }) };
}
const start = (f: ReturnType<typeof setup>, principal: Principal = editor) => f.runtime.start({ principal, releaseId: 'release-1', input: 'Inspect ticket-1 and its members, then assign it to Alex.' });

test('official SDK reads members without approval, then pauses and performs exactly one approved assignment', async () => {
  const f = setup(); const run = await start(f);
  assert.equal(run.status, 'awaiting-approval', JSON.stringify(run));
  assert.equal(f.host.mutationCount, 0); assert.equal(f.requests.length, 3);
  assert.equal(run.receipts.length, 2); assert.equal(run.receipts[0]!.status, 'succeeded');
  assert.match(JSON.stringify(run.receipts[0]), /"members"/);
  assert.doesNotMatch(JSON.stringify(run.receipts), /FOREIGN_PRIVATE_NAME/);
  assert.equal(run.approval!.binding.capabilityId, 'change_ticket_assignee');
  assert.equal(run.events.filter(event => event.type === 'approval-required').length, 1);
  assert.deepEqual(f.requests[0]!.tools.map(tool => tool.name).sort(), ['change_ticket_assignee', 'change_ticket_priority', 'read_ticket', 'read_ticket_members']);
  const approval = run.approval!;
  const complete = await f.runtime.decide(run.runId, editor, { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' });
  assert.equal(complete.status, 'succeeded', JSON.stringify(complete));
  assert.equal(f.ticket.assigneeId, 'member-a'); assert.equal(f.ticket.version, 2); assert.equal(f.host.mutationCount, 1);
  assert.equal(f.requests.length, 4); assert.match(JSON.stringify(f.requests[3]), /receiptId/);
  assert.equal(complete.receipts.at(-1)!.status, 'succeeded');
  await assert.rejects(f.runtime.decide(run.runId, editor, { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' }), /RUN_NOT_AWAITING_THIS_APPROVAL/);
  assert.equal(f.host.mutationCount, 1);
});

test('viewer member read completes without a grant and no write tools are advertised', async () => {
  const f = setup({ readOnly: true }); const run = await start(f, viewer);
  assert.equal(run.status, 'succeeded', JSON.stringify(run));
  assert.equal(run.approval, undefined); assert.equal(run.receipts.length, 2);
  assert.deepEqual(f.requests[0]!.tools.map(tool => tool.name).sort(), ['read_ticket', 'read_ticket_members']);
  assert.equal(f.host.mutationCount, 0);
});

test('SDK old hosts advertise only the original two tools', async () => {
  const f = memberFixture(); const requests: ModelRequest[] = [];
  const broker = new ToolBroker(new AuthorizedTicketHost({ readTicket: f.business.readTicket, changePriority: f.business.changePriority }));
  const runtime = new GovernedRuntime({ broker, model: { async complete(request) {
    requests.push(request); return { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: 'No action.', toolCalls: [], finishReason: 'stop' };
  } } });
  assert.equal((await runtime.start({ principal: editor, releaseId: 'r', input: 'Inspect the available tool list.' })).status, 'succeeded');
  assert.deepEqual(requests[0]!.tools.map(tool => tool.name).sort(), ['change_ticket_priority', 'read_ticket']);
});

test('rejecting, cancelling, or tampering with the assignment approval cannot mutate', async () => {
  for (const mode of ['reject', 'cancel', 'tamper'] as const) {
    const f = setup(); const run = await start(f); const approval = run.approval!;
    if (mode === 'cancel') assert.equal(f.runtime.cancel(run.runId, editor).status, 'cancelled');
    else if (mode === 'reject') assert.equal((await f.runtime.decide(run.runId, editor, { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'reject' })).status, 'rejected');
    else await assert.rejects(f.runtime.decide(run.runId, editor, { approvalId: approval.binding.approvalId, expectedHash: '0'.repeat(64), decision: 'approve' }), /APPROVAL_HASH_MISMATCH/);
    assert.equal(f.host.mutationCount, 0); assert.equal(f.ticket.assigneeId, undefined);
  }
});

test('invalid model-proposed assignee never receives approval or writes', async () => {
  for (const assigneeId of ['member-inactive', 'member-b', 'missing']) {
    const f = setup({ assigneeId }); const run = await start(f);
    assert.equal(run.status, 'failed'); assert.equal(run.approval, undefined);
    assert.equal(f.host.mutationCount, 0); assert.equal(f.ticket.assigneeId, undefined);
  }
});

test('execution checks member eligibility and ticket drift after SDK approval pause', async () => {
  for (const drift of ['inactive', 'ticket']) {
    const f = setup(); const run = await start(f); const approval = run.approval!;
    if (drift === 'inactive') f.members[0]!.active = false; else f.ticket.version++;
    const result = await f.runtime.decide(run.runId, editor, { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' });
    assert.equal(result.status, 'failed', JSON.stringify(result)); assert.equal(f.host.mutationCount, 0);
  }
});

test('member-dependent run views require current host ticket and member-read authority', async () => {
  const f = setup(); const run = await start(f);
  f.membersReadable(false);
  assert.throws(() => f.runtime.get(run.runId, editor), /MEMBERS_DENIED/);
  assert.throws(() => f.runtime.list(editor), /MEMBERS_DENIED/);
  assert.throws(() => f.runtime.cancel(run.runId, editor), /MEMBERS_DENIED/);
  await assert.rejects(f.runtime.decide(run.runId, editor, { approvalId: run.approval!.binding.approvalId, expectedHash: run.approval!.expectedHash, decision: 'approve' }), /MEMBERS_DENIED/);
  f.membersReadable(true); assert.deepEqual(f.runtime.get(run.runId, editor), run);
  f.readable(false); assert.throws(() => f.runtime.get(run.runId, editor), /RESOURCE_DENIED/);
  assert.equal(f.host.mutationCount, 0);
});

test('unknown assignment stops SDK and reconciliation does not call model or mutate again', async () => {
  const f = setup({ loseWriteResponse: true }); const run = await start(f); const approval = run.approval!;
  const result = await f.runtime.decide(run.runId, editor, { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' });
  assert.equal(result.status, 'outcome-unknown', JSON.stringify(result));
  assert.equal(f.requests.length, 3); assert.equal(f.host.mutationCount, 1);
  const reconciled = f.runtime.reconcile(run.runId, editor);
  assert.equal(reconciled.status, 'succeeded'); assert.equal(reconciled.receipts.at(-1)!.status, 'succeeded');
  assert.equal(f.requests.length, 3); assert.equal(f.host.mutationCount, 1);
  assert.equal(f.ticket.assigneeId, 'member-a');
});
