import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import type { JsonObject, ModelProvider, ModelRequest, ModelResponse, Principal } from '@ae/contracts';
import { PythonInventoryHost, ToolBroker, qualifiedPython } from '@ae/capabilities';
import { GovernedRuntime } from './index.js';

export const inventoryRuntimeAssertions = [
  'only-inventory-tools-advertised', 'read-before-proposal', 'no-write-before-approval', 'one-approved-reservation',
  'duplicate-approval-denied', 'strict-arguments-denied', 'read-only-catalog', 'cross-tenant-denied',
  'current-host-revocation-zero-write', 'lost-response-unknown', 'receipt-reconciled-without-redispatch',
] as const;
export interface InventoryRuntimeEvidence {
  status: 'pass'; modelMode: 'simulated'; runtime: 'official-agents-sdk-memory'; assertions: string[]; finalStock: JsonObject; mutationCount: number;
}
const alice: Principal = { tenantId: 'tenant-a', applicationId: 'inventory-fixture', subjectId: 'alice', roles: ['operator'], scopes: ['inventory:read', 'inventory:reserve'] };
const bob: Principal = { ...alice, subjectId: 'bob', roles: ['viewer'], scopes: ['inventory:read'] };
const mallory: Principal = { ...alice, tenantId: 'tenant-b', subjectId: 'mallory' };
function simulation(orderId: string, quantity: number, expectedVersion: number) {
  const requests: ModelRequest[] = [];
  const model: ModelProvider = { async complete(request) {
    requests.push(request);
    const response: ModelResponse = { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: '', toolCalls: [], finishReason: 'tool-calls' };
    if (requests.length === 1) response.toolCalls = [{ callId: 'stock', name: 'read_stock', arguments: { sku: 'desk-01' } }];
    else if (requests.length === 2) { assert.match(JSON.stringify(request.messages), /available/); response.toolCalls = [{ callId: 'reservation', name: 'reserve_stock', arguments: { sku: 'desk-01', orderId, quantity, expectedVersion } }]; }
    else { response.finishReason = 'stop'; response.message = 'The Python host receipt confirms the order reservation.'; }
    return response;
  } };
  return { model, requests };
}
function rights(adapterPath: string, databasePath: string, roles: string[], scopes: string[], deadlineAt: number) {
  // Owned synthetic host administration only. Never exported as an agent tool.
  const script = 'import json,sys; sys.path.insert(0,sys.argv[1]); from inventory import Inventory; Inventory(sys.argv[2]).set_principal_rights(json.loads(sys.argv[3]),json.loads(sys.argv[4]),json.loads(sys.argv[5]))';
  const interpreter = qualifiedPython(undefined, deadlineAt);
  const remaining = deadlineAt - Date.now(); assert.ok(remaining > 0, 'Inventory qualification budget expired');
  const result = spawnSync(interpreter, ['-I', '-B', '-c', script, resolve(dirname(adapterPath), '..'), databasePath, JSON.stringify(alice), JSON.stringify(roles), JSON.stringify(scopes)], { encoding: 'utf8', timeout: Math.min(5_000, remaining), killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.signal, null);
}
/** Executes only the caller's already verified owned synthetic fixture. Not an arbitrary-source sandbox. */
export async function runInventoryRuntimeQualification(options: { adapterPath: string; databasePath: string; deadlineAt?: number }): Promise<InventoryRuntimeEvidence> {
  const deadlineAt = Math.min(Date.now() + 240_000, options.deadlineAt ?? Number.POSITIVE_INFINITY);
  const host = new PythonInventoryHost({ ...options, deadlineAt }), broker = new ToolBroker(host);
  const stock = () => host.readResult(alice, broker.prepare(alice, 'probe', 'read', 'read_stock', { sku: 'desk-01' }).request);
  assert.deepEqual(stock(), { sku: 'desk-01', tenantId: 'tenant-a', available: 12, version: 1 });
  const model = simulation('order-first', 3, 1), runtime = new GovernedRuntime({ broker, model: model.model });
  const paused = await runtime.start({ principal: alice, releaseId: 'inventory-release', input: 'Reserve three desks for order-first after inspecting stock.', context: { sku: 'desk-01' } });
  assert.equal(paused.status, 'awaiting-approval', JSON.stringify(paused));
  assert.equal(paused.receipts.length, 1); assert.equal(paused.receipts[0]!.status, 'succeeded');
  assert.deepEqual(model.requests[0]!.tools.map(t => t.name).sort(), ['read_stock', 'reserve_stock']);
  assert.equal(host.mutationDispatchCount, 0); assert.equal(stock().available, 12);
  assert.equal(paused.approval!.binding.policyVersion, 'inventory-policy-v1');
  const approval = paused.approval!;
  const decision = { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' as const };
  const completed = await runtime.decide(paused.runId, alice, decision);
  assert.equal(completed.status, 'succeeded', JSON.stringify(completed)); assert.equal(host.mutationDispatchCount, 1);
  assert.deepEqual(stock(), { sku: 'desk-01', tenantId: 'tenant-a', available: 9, version: 2 });
  await assert.rejects(runtime.decide(paused.runId, alice, decision), /RUN_NOT_AWAITING_THIS_APPROVAL/);
  assert.equal(host.mutationDispatchCount, 1);
  assert.throws(() => broker.prepare(alice, 'strict', 'call', 'reserve_stock', { sku: 'desk-01', orderId: 'bad', quantity: 1, expectedVersion: 2, tenantId: 'tenant-b' }), /INVALID_ARGUMENTS/);
  assert.deepEqual(broker.catalog(bob).map(c => c.capabilityId), ['read_stock']);
  assert.throws(() => broker.prepare(mallory, 'foreign', 'call', 'read_stock', { sku: 'desk-01' }), /HOST_ACCESS_DENIED/);
  const revoked = new GovernedRuntime({ broker, model: simulation('order-revoked', 1, 2).model });
  const pending = await revoked.start({ principal: alice, releaseId: 'inventory-release', input: 'Reserve one desk.' });
  assert.equal(pending.status, 'awaiting-approval');
  rights(options.adapterPath, options.databasePath, ['viewer'], ['inventory:read'], deadlineAt);
  try {
    assert.deepEqual(broker.catalog(alice).map(c => c.capabilityId), []); // claim/host role intersection is empty
    await assert.rejects(revoked.decide(pending.runId, alice, { approvalId: pending.approval!.binding.approvalId, expectedHash: pending.approval!.expectedHash, decision: 'approve' }), /ROLE_DENIED/);
  } finally { rights(options.adapterPath, options.databasePath, ['operator'], ['inventory:read', 'inventory:reserve'], deadlineAt); }
  assert.equal(host.mutationDispatchCount, 1); assert.equal(stock().available, 9);
  const lostBroker = new ToolBroker(host, { loseWriteResponse: true }), lost = new GovernedRuntime({ broker: lostBroker, model: simulation('order-lost', 2, 2).model });
  const toLose = await lost.start({ principal: alice, releaseId: 'inventory-release', input: 'Reserve two desks.' });
  assert.equal(toLose.status, 'awaiting-approval');
  const unknown = await lost.decide(toLose.runId, alice, { approvalId: toLose.approval!.binding.approvalId, expectedHash: toLose.approval!.expectedHash, decision: 'approve' });
  assert.equal(unknown.status, 'outcome-unknown', JSON.stringify(unknown)); assert.equal(host.mutationDispatchCount, 2);
  const recovered = lost.reconcile(toLose.runId, alice);
  assert.equal(recovered.status, 'succeeded', JSON.stringify(recovered)); assert.equal(host.mutationDispatchCount, 2);
  const finalStock = stock(); assert.deepEqual(finalStock, { sku: 'desk-01', tenantId: 'tenant-a', available: 7, version: 3 });
  return { status: 'pass', modelMode: 'simulated', runtime: 'official-agents-sdk-memory', assertions: [...inventoryRuntimeAssertions], finalStock, mutationCount: 2 };
}
