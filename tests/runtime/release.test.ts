import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentRelease, ModelProvider, ModelRequest, ModelResponse, Principal } from '@ae/contracts';
import { InMemoryControlPlane } from '@ae/control-plane';
import { AuthorizedTicketHost, ticketCapabilities, ToolBroker, type Ticket } from '@ae/capabilities';
import { GovernedRuntime } from '@ae/runtime-core';
import { digest } from '@ae/policy';
const editor: Principal = { tenantId: 'a', applicationId: 'helpdesk', subjectId: 'alice', roles: ['editor', 'agentic:admin'], scopes: ['tickets:read', 'tickets:write'] };
const viewer: Principal = { ...editor, roles: ['viewer'], scopes: ['tickets:read'] };
function setup() {
  const ticket: Ticket = { id: 't1', tenantId: 'a', title: 'Printer offline', priority: 'low', version: 1 };
  const host = new AuthorizedTicketHost({ readTicket(tenant, id) { if (tenant !== ticket.tenantId || id !== ticket.id) throw new Error('Not found'); return { ...ticket }; }, changePriority(tenant, id, priority, expected) { if (tenant !== ticket.tenantId || id !== ticket.id || expected !== ticket.version) throw new Error('Conflict'); ticket.priority = priority; ticket.version++; return { ...ticket }; } });
  const broker = new ToolBroker(host), control = new InMemoryControlPlane(ticketCapabilities);
  const publish = (ids: string[], maxTurns = 8) => {
    const draft = control.save(editor, { name: 'Configured helpdesk', instructions: 'CUSTOM_RELEASE_INSTRUCTION: Be concise and reference the ticket version.', capabilityIds: ids, bounds: { maxTurns, maxElapsedMs: 1000 } });
    return control.publish(editor, draft.draftId, draft.revision);
  };
  return { host, broker, control, publish };
}
function callsModel(write = true) {
  const requests: ModelRequest[] = [], turns = new Map<string, number>();
  const model: ModelProvider = { async complete(request) {
    requests.push(request); const turn = (turns.get(request.runId) ?? 0) + 1; turns.set(request.runId, turn);
    const response: ModelResponse = { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: '', toolCalls: [], finishReason: 'tool-calls' };
    if (turn === 1) response.toolCalls = [{ callId: 'read', name: 'read_ticket', arguments: { ticketId: 't1' } }];
    else if (turn === 2 && write) response.toolCalls = [{ callId: 'write', name: 'change_ticket_priority', arguments: { ticketId: 't1', priority: 'high', expectedVersion: 1 } }];
    else { response.message = 'Completed according to the host receipt.'; response.finishReason = 'stop'; }
    return response;
  } };
  return { model, requests };
}
function rehash(release: AgentRelease): AgentRelease {
  const { releaseId: _id, contentHash: _hash, ...content } = release;
  const contentHash = digest(content); return { ...content, contentHash, releaseId: `release-${contentHash}` };
}
test('read-only release removes write tools and rejects a forged write call with zero mutation', async () => {
  const f = setup(), m = callsModel(); const release = f.publish(['read_ticket']);
  const runtime = new GovernedRuntime({ model: m.model, broker: f.broker });
  const result = await runtime.start({ principal: editor, releaseId: release.releaseId, release, input: 'Raise t1 priority.' });
  assert.equal(result.status, 'failed'); assert.equal(f.host.mutationCount, 0); assert.equal(result.approval, undefined);
  assert.ok(m.requests.every(r => r.tools.every(t => t.name === 'read_ticket')));
  assert.match(m.requests[0]!.messages[0]!.content, /CUSTOM_RELEASE_INSTRUCTION/);
});
test('published write capability does not grant a viewer host write authority', async () => {
  const f = setup(), m = callsModel(); const release = f.publish(['read_ticket', 'change_ticket_priority']);
  const result = await new GovernedRuntime({ model: m.model, broker: f.broker }).start({ principal: viewer, releaseId: release.releaseId, release, input: 'Raise t1 priority.' });
  assert.equal(result.status, 'failed'); assert.equal(f.host.mutationCount, 0);
  assert.ok(m.requests.every(r => r.tools.every(t => t.name !== 'change_ticket_priority')));
});
test('release hash, matching ID, tenant/application and capability-version integrity fail closed', async () => {
  for (const field of ['hash', 'id', 'tenant', 'application', 'version'] as const) {
    const f = setup(), m = callsModel(false); let release = f.publish(['read_ticket']); let releaseId = release.releaseId;
    if (field === 'hash') release.configuration.instructions = 'tampered';
    if (field === 'id') releaseId = 'wrong-release';
    if (field === 'tenant') release = rehash({ ...release, tenantId: 'b' });
    if (field === 'application') release = rehash({ ...release, applicationId: 'other' });
    if (field === 'version') release.capabilities[0]!.version = 'forged';
    if (field === 'tenant' || field === 'application') releaseId = release.releaseId;
    await assert.rejects(new GovernedRuntime({ model: m.model, broker: f.broker }).start({ principal: editor, releaseId, release, input: 'Read t1.' }), field);
    assert.equal(m.requests.length, 0); assert.equal(f.host.mutationCount, 0);
  }
});
test('valid old binding/version cannot execute against the current capability catalog', async () => {
  for (const field of ['version', 'bindingHash'] as const) {
    const f = setup(), m = callsModel(false); let release = f.publish(['read_ticket']);
    release.capabilities[0]![field] = field === 'version' ? 'obsolete' : '0'.repeat(64); release = rehash(release);
    const result = await new GovernedRuntime({ model: m.model, broker: f.broker }).start({ principal: editor, releaseId: release.releaseId, release, input: 'Read t1.' });
    assert.equal(result.status, 'failed'); assert.deepEqual(m.requests[0]!.tools, []); assert.equal(f.host.mutationCount, 0);
  }
});
test('new publication and mutation of caller snapshot cannot alter an already paused run', async () => {
  const f = setup(), m = callsModel(); const old = f.publish(['read_ticket', 'change_ticket_priority']);
  const runtime = new GovernedRuntime({ model: m.model, broker: f.broker });
  const paused = await runtime.start({ principal: editor, releaseId: old.releaseId, release: old, input: 'Raise t1 priority.' });
  assert.equal(paused.status, 'awaiting-approval');
  const latest = f.publish(['read_ticket']); old.configuration.capabilityIds = []; old.configuration.instructions = 'caller tampered after pause';
  const done = await runtime.decide(paused.runId, editor, { approvalId: paused.approval!.binding.approvalId, expectedHash: paused.approval!.expectedHash, decision: 'approve' });
  assert.equal(done.status, 'succeeded'); assert.equal(f.host.mutationCount, 1);
  assert.equal(paused.approval!.binding.releaseId, old.releaseId);
  const next = await runtime.start({ principal: editor, releaseId: latest.releaseId, release: latest, input: 'Raise t1 priority.' });
  assert.equal(next.status, 'failed'); assert.equal(f.host.mutationCount, 1);
});
test('current authenticated permission revocation prevents approval resume despite pinned write release', async () => {
  const f = setup(), m = callsModel(); const release = f.publish(['read_ticket', 'change_ticket_priority']);
  const runtime = new GovernedRuntime({ model: m.model, broker: f.broker });
  const paused = await runtime.start({ principal: editor, releaseId: release.releaseId, release, input: 'Raise t1 priority.' });
  await assert.rejects(runtime.decide(paused.runId, viewer, { approvalId: paused.approval!.binding.approvalId, expectedHash: paused.approval!.expectedHash, decision: 'approve' }), /RELEASE_CAPABILITY_DENIED/);
  assert.equal(f.host.mutationCount, 0);
});
test('configured model-turn bound applies without introducing another loop', async () => {
  const f = setup(), m = callsModel(false); const release = f.publish(['read_ticket'], 1);
  const result = await new GovernedRuntime({ model: m.model, broker: f.broker }).start({ principal: editor, releaseId: release.releaseId, release, input: 'Read t1.' });
  assert.equal(result.status, 'failed'); assert.equal(m.requests.length, 1); assert.equal(f.host.mutationCount, 0);
});
test('current registry removal or binding drift blocks pinned approval before consumption', async () => {
  for (const change of ['remove', 'binding']) {
    const f = setup(), m = callsModel(); const release = f.publish(['read_ticket', 'change_ticket_priority']);
    const runtime = new GovernedRuntime({ model: m.model, broker: f.broker });
    const paused = await runtime.start({ principal: editor, releaseId: release.releaseId, release, input: 'Raise t1 priority.' });
    assert.equal(paused.status, 'awaiting-approval');
    const originalCatalog = f.broker.catalog.bind(f.broker);
    f.broker.catalog = p => originalCatalog(p).flatMap(c => c.capabilityId !== 'change_ticket_priority' ? [c] : change === 'remove' ? [] : [{ ...c, bindingHash: 'f'.repeat(64) }]);
    await assert.rejects(runtime.decide(paused.runId, editor, { approvalId: paused.approval!.binding.approvalId, expectedHash: paused.approval!.expectedHash, decision: 'approve' }), /RELEASE_CAPABILITY_DENIED/);
    assert.equal(f.host.mutationCount, 0);
  }
});
test('released invocation rechecks current registry after model planning', async () => {
  const f = setup(); const release = f.publish(['read_ticket']); let reads = 0;
  const model: ModelProvider = { async complete(request) {
    assert.equal(request.tools.length, 1);
    // A registry update arrives while the model request is in flight.
    f.broker.catalog = () => [];
    reads++;
    return { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: '', toolCalls: [{ callId: 'read', name: 'read_ticket', arguments: { ticketId: 't1' } }], finishReason: 'tool-calls' };
  } };
  const result = await new GovernedRuntime({ model, broker: f.broker }).start({ principal: editor, releaseId: release.releaseId, release, input: 'Read t1.' });
  assert.equal(result.status, 'failed'); assert.equal(result.receipts.length, 0); assert.equal(reads, 1);
});
