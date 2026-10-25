import assert from 'node:assert/strict';
import type { ModelProvider, ModelRequest, ModelResponse } from '@ae/contracts';
import { launchJava, javaAlice as alice, javaBob as bob, javaMallory as mallory } from './java-process.js';

export const javaRuntimeAssertions = ['real-spring-managed-bean', 'shared-official-agents-runtime', 'read-before-proposal', 'no-write-before-approval', 'one-approved-reservation', 'duplicate-approval-denied', 'exact-host-replay', 'read-only-catalog', 'cross-tenant-denied', 'token-identity-mismatch-denied', 'strict-arguments-denied', 'current-host-revocation-zero-write', 'actual-lost-http-response-unknown', 'receipt-reconciliation-no-redispatch', 'owned-host-stopped'];
function simulation(orderId: string, quantity: number, expectedVersion: number) {
  const requests: ModelRequest[] = [];
  const model: ModelProvider = { async complete(request) {
    requests.push(request);
    const response: ModelResponse = { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: '', toolCalls: [], finishReason: 'tool-calls' };
    if (requests.length === 1) response.toolCalls = [{ callId: 'stock', name: 'read_stock', arguments: { sku: 'desk-01' } }];
    else if (requests.length === 2) { assert.match(JSON.stringify(request.messages), /available/); response.toolCalls = [{ callId: 'reserve', name: 'reserve_stock', arguments: { sku: 'desk-01', orderId, quantity, expectedVersion } }]; }
    else { response.finishReason = 'stop'; response.message = 'The Java host receipt confirms the reservation.'; }
    return response;
  } };
  return { model, requests };
}
export async function runJavaRuntime(classes: string, database: string, deadlineAt: number) {
  const { JavaSpringInventoryHost, ToolBroker } = await import('@ae/capabilities');
  const { GovernedRuntime } = await import('@ae/runtime-core');
  const server = await launchJava(classes, database, deadlineAt);
  try {
    const host = new JavaSpringInventoryHost({ endpoint: server.endpoint, credentialFor: p => server.tokens.get(p.subjectId)!, deadlineAt }), broker = new ToolBroker(host);
    const stock = () => host.readResult(alice, broker.prepare(alice, 'probe', 'read', 'read_stock', { sku: 'desk-01' }).request);
    const model = simulation('order-first', 3, 1), runtime = new GovernedRuntime({ broker, model: model.model });
    const paused = await runtime.start({ principal: alice, releaseId: 'java-fixture-release', input: 'Read stock then reserve three desks.' });
    assert.equal(paused.status, 'awaiting-approval'); assert.equal((await server.control()).mutationCount, 0);
    assert.deepEqual(model.requests[0]!.tools.map(tool => tool.name).sort(), ['read_stock', 'reserve_stock']);
    assert.equal(paused.approval!.binding.policyVersion, 'java-spring-inventory-policy-v1');
    const approval = paused.approval!, decision = { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' as const };
    const prepared = broker.prepare(alice, paused.runId, approval.binding.invocationId, 'reserve_stock', { sku: 'desk-01', orderId: 'order-first', quantity: 3, expectedVersion: 1 });
    const done = await runtime.decide(paused.runId, alice, decision); assert.equal(done.status, 'succeeded'); assert.equal(stock().available, 9);
    assert.equal((await server.control()).mutationCount, 1);
    await assert.rejects(runtime.decide(paused.runId, alice, decision), /RUN_NOT_AWAITING_THIS_APPROVAL/);
    assert.deepEqual(host.write(alice, prepared.request), host.query(alice, prepared.request.operationId, prepared.request));
    assert.equal((await server.control()).mutationCount, 1);
    assert.deepEqual(broker.catalog(bob).map(c => c.capabilityId), ['read_stock']);
    assert.throws(() => broker.prepare(mallory, 'foreign', 'read', 'read_stock', { sku: 'desk-01' }), /HOST_RESOURCE_DENIED/);
    assert.throws(() => broker.prepare(alice, 'strict', 'write', 'reserve_stock', { sku: 'desk-01', orderId: 'bad', quantity: 1, expectedVersion: 2, tenantId: 'tenant-b' }), /INVALID_ARGUMENTS/);
    assert.throws(() => new JavaSpringInventoryHost({ endpoint: server.endpoint, credentialFor: () => server.tokens.get('bob')!, deadlineAt }).current(alice), /HOST_IDENTITY_DENIED/);
    const revoked = new GovernedRuntime({ broker, model: simulation('revoked', 1, 2).model });
    const pending = await revoked.start({ principal: alice, releaseId: 'java-fixture-release', input: 'Reserve one desk.' }); assert.equal(pending.status, 'awaiting-approval');
    await server.control({ identities: { ...server.identities, [server.tokens.get('alice')!]: { ...alice, scopes: ['inventory:read'] } } });
    await assert.rejects(revoked.decide(pending.runId, alice, { approvalId: pending.approval!.binding.approvalId, expectedHash: pending.approval!.expectedHash, decision: 'approve' }), /RELEASE_CAPABILITY_DENIED/);
    assert.equal((await server.control()).mutationCount, 1); await server.control({ identities: server.identities });
    const lost = new GovernedRuntime({ broker, model: simulation('lost-reply', 2, 2).model });
    const toLose = await lost.start({ principal: alice, releaseId: 'java-fixture-release', input: 'Reserve two desks.' });
    assert.equal(toLose.status, 'awaiting-approval'); const before = (await server.control()).writeRequests;
    await server.control({ loseNextWrite: true });
    const unknown = await lost.decide(toLose.runId, alice, { approvalId: toLose.approval!.binding.approvalId, expectedHash: toLose.approval!.expectedHash, decision: 'approve' });
    assert.equal(unknown.status, 'outcome-unknown'); assert.equal((await server.control()).mutationCount, 2);
    assert.equal(lost.reconcile(toLose.runId, alice).status, 'succeeded');
    const after = await server.control(); assert.equal(after.writeRequests, before + 1); assert.equal(after.mutationCount, 2);
    const finalStock = stock(); assert.deepEqual(finalStock, { sku: 'desk-01', tenantId: 'tenant-a', available: 7, version: 3 });
    return { status: 'pass', runtime: 'official-agents-sdk-memory', modelMode: 'simulated', assertions: javaRuntimeAssertions, finalStock, mutationCount: 2, spring: '6.2.19', managedInventory: true };
  } finally { await server.stop(); }
}
