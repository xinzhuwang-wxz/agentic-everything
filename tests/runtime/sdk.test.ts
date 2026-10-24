import test from 'node:test';
import assert from 'node:assert/strict';
import type { ModelProvider, ModelRequest, ModelResponse, Principal } from '@ae/contracts';
import { AuthorizedTicketHost, ToolBroker, type Ticket } from '@ae/capabilities';
import { GovernedRuntime } from '@ae/runtime-core';
const principal: Principal = { tenantId: 'a', applicationId: 'helpdesk', subjectId: 'alice', roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] };
function setup(extra?: { loseWriteResponse?: boolean }) {
  const ticket: Ticket = { id: 't1', tenantId: 'a', title: 'Broken printer', priority: 'low', version: 1 };
  const host = new AuthorizedTicketHost({ readTicket(tenant, id) { if (tenant !== ticket.tenantId || id !== ticket.id) throw Error('Not found'); return { ...ticket }; }, changePriority(tenant, id, priority, version) { if (tenant !== ticket.tenantId || id !== ticket.id || version !== ticket.version) throw Error('Conflict'); ticket.priority = priority; ticket.version++; return { ...ticket }; } });
  const requests: ModelRequest[] = [];
  // Deterministic unit fixture ONLY. Independent actor qualification is a separate executable.
  const model: ModelProvider = { async complete(request) {
    requests.push(request); const turn = requests.length;
    const response: ModelResponse = { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: '', toolCalls: [], finishReason: 'tool-calls' };
    if (turn === 1) response.toolCalls = [{ callId: 'read-1', name: 'read_ticket', arguments: { ticketId: 't1' } }];
    else if (turn === 2) response.toolCalls = [{ callId: 'write-1', name: 'change_ticket_priority', arguments: { ticketId: 't1', priority: 'high', expectedVersion: 1 } }];
    else { response.finishReason = 'stop'; response.message = 'The receipt confirms high priority.'; }
    return response;
  } };
  return { runtime: new GovernedRuntime({ model, broker: new ToolBroker(host, extra) }), host, requests };
}
test('official Agents Runner pauses, resumes exact write, then model receives actual receipt', async () => {
  const { runtime, host, requests } = setup();
  const run = await runtime.start({ principal, releaseId: 'release-1', input: 'Raise t1 to high.' });
  assert.equal(run.status, 'awaiting-approval', JSON.stringify(run));
  assert.equal(host.mutationCount, 0); assert.equal(requests.length, 2);
  const approval = run.approval!;
  const result = await runtime.decide(run.runId, principal, { approvalId: approval.binding.approvalId, decision: 'approve', expectedHash: approval.expectedHash });
  assert.equal(result.status, 'succeeded', JSON.stringify(result)); assert.equal(host.mutationCount, 1); assert.equal(requests.length, 3);
  assert.match(JSON.stringify(requests[2]), /receiptId/);
  assert.equal(result.events.filter(event => event.type === 'approval-required').length, 1);
  await assert.rejects(runtime.decide(run.runId, principal, { approvalId: approval.binding.approvalId, decision: 'approve', expectedHash: approval.expectedHash }));
  assert.equal(host.mutationCount, 1);
  assert.throws(() => runtime.get(run.runId, { ...principal, subjectId: 'mallory' }));
});
test('rejection and cancellation do not invoke host mutation', async () => {
  for (const mode of ['reject', 'cancel']) {
    const { runtime, host } = setup(); const run = await runtime.start({ principal, releaseId: 'r1', input: 'Raise t1 to high.' });
    assert.equal(run.status, 'awaiting-approval');
    const result = mode === 'cancel' ? runtime.cancel(run.runId, principal) : await runtime.decide(run.runId, principal, { approvalId: run.approval!.binding.approvalId, decision: 'reject', expectedHash: run.approval!.expectedHash });
    assert.equal(result.status, mode === 'cancel' ? 'cancelled' : 'rejected'); assert.equal(host.mutationCount, 0);
  }
});
test('unknown write stops SDK and reconciles without another model turn or write', async () => {
  const { runtime, host, requests } = setup({ loseWriteResponse: true }); const run = await runtime.start({ principal, releaseId: 'r1', input: 'Raise t1 to high.' });
  const result = await runtime.decide(run.runId, principal, { approvalId: run.approval!.binding.approvalId, decision: 'approve', expectedHash: run.approval!.expectedHash });
  assert.equal(result.status, 'outcome-unknown', JSON.stringify(result)); assert.equal(requests.length, 2); assert.equal(host.mutationCount, 1);
  assert.equal(runtime.reconcile(run.runId, principal).status, 'succeeded'); assert.equal(host.mutationCount, 1);
});
test('elapsed budget aborts a provider that never resolves and no tool is dispatched', async () => {
  const { host } = setup();
  const runtime = new GovernedRuntime({ model: { complete: () => new Promise(() => {}) }, broker: new ToolBroker(host), maxElapsedMs: 15 });
  const started = Date.now(); const result = await runtime.start({ principal, releaseId: 'r1', input: 'Read t1.' });
  assert.equal(result.status, 'cancelled'); assert.ok(Date.now() - started < 1000); assert.equal(host.mutationCount, 0);
});
