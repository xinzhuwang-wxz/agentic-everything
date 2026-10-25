import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ToolBroker, ticketCapabilityDefinitions, validateDefinitions, parseCapabilityArguments, inventoryCapabilityDefinitions } from '../src/index.js';
import { InMemoryApprovalLedger, PolicyError } from '@ae/policy';
import type { TrustedCapabilityHost } from '../src/host-boundary.js';
import type { Principal } from '@ae/contracts';

const alice: Principal = { subjectId: 'alice', applicationId: 'test', tenantId: 'a', roles: ['operator'], scopes: ['inventory:read', 'inventory:reserve'] };
function host(): TrustedCapabilityHost {
  return { policyVersion: 'inventory-policy-v1', definitions: inventoryCapabilityDefinitions, current: p => p, supports: name => Object.hasOwn(inventoryCapabilityDefinitions, name),
    authorizeCapability(p, name) { if (!p.scopes.includes(name === 'read_stock' ? 'inventory:read' : 'inventory:reserve')) throw new PolicyError('SCOPE_DENIED'); },
    referenceTarget: (_name, args) => String(args.sku), prepareTarget: (_p, _name, args) => ({ targetId: String(args.sku), expectedResourceVersion: '1', preview: { sku: String(args.sku) } }), assertReadable() {}, readResult: () => ({ available: 12 }),
    write: (_p, request) => ({ status: 'succeeded', operationId: request.operationId, receiptId: 'one', data: { available: 11 } }), query: (_p, operationId) => ({ status: 'outcome-unknown', operationId, message: 'No receipt' }),
  };
}
test('reviewed registry rejects absent/loose/mismatched schemas and unapproved writes', () => {
  assert.throws(() => validateDefinitions({}), /HOST_CAPABILITY_DEFINITIONS_REQUIRED/);
  const original = ticketCapabilityDefinitions.read_ticket!;
  assert.throws(() => validateDefinitions({ read_ticket: { ...original, parameters: z.object({ ticketId: z.string() }) } }), /HOST_CAPABILITY_SCHEMA_REQUIRED|HOST_CAPABILITY_SCHEMA_MISMATCH/);
  assert.throws(() => validateDefinitions({ alias: original }), /HOST_CAPABILITY_SCHEMA_MISMATCH/);
  const write = inventoryCapabilityDefinitions.reserve_stock!;
  assert.throws(() => validateDefinitions({ reserve_stock: { ...write, capability: { ...write.capability, approvalRequired: false } } }), /HOST_WRITE_APPROVAL_REQUIRED/);
  assert.throws(() => parseCapabilityArguments(inventoryCapabilityDefinitions, 'reserve_stock', { sku: 'x', orderId: 'o', quantity: 1, expectedVersion: 1, principal: alice }), /INVALID_ARGUMENTS/);
});
test('host policy binds approval independently of ticket roles and rejects a different ledger policy', async () => {
  const h = host(); assert.throws(() => new ToolBroker(h, { approvals: new InMemoryApprovalLedger() }), /HOST_POLICY_MISMATCH/);
  const broker = new ToolBroker(h), prepared = broker.prepare(alice, 'run', 'call', 'reserve_stock', { sku: 'x', orderId: 'o', quantity: 1, expectedVersion: 1 });
  const approval = broker.requestApproval(alice, prepared, 'release');
  assert.equal(approval.binding.policyVersion, 'inventory-policy-v1');
  assert.equal((await broker.execute(alice, prepared, 'release')).status, 'denied');
  broker.approvals.decide(alice, { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' });
  assert.equal((await broker.execute(alice, prepared, 'release', approval.binding.approvalId)).status, 'succeeded');
});
test('an entered custom-host write throwing a policy error is unknown and never redispatched', async () => {
  let calls = 0; const h = host(); h.write = () => { calls++; throw new PolicyError('ERROR_AFTER_COMMIT'); };
  const broker = new ToolBroker(h), prepared = broker.prepare(alice, 'run', 'call', 'reserve_stock', { sku: 'x', orderId: 'o', quantity: 1, expectedVersion: 1 });
  const approval = broker.requestApproval(alice, prepared, 'release'); broker.approvals.decide(alice, { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' });
  assert.equal((await broker.execute(alice, prepared, 'release', approval.binding.approvalId)).status, 'outcome-unknown');
  assert.equal((await broker.execute(alice, prepared, 'release', approval.binding.approvalId)).status, 'outcome-unknown');
  assert.equal(calls, 1);
});
test('custom-host cached result and query are still guarded by live read authority', async () => {
  const h = host(), broker = new ToolBroker(h), prepared = broker.prepare(alice, 'read-run', 'call', 'read_stock', { sku: 'x' });
  assert.equal((await broker.execute(alice, prepared, 'r')).status, 'succeeded');
  h.assertReadable = () => { throw new PolicyError('RESOURCE_DENIED'); };
  const denied = await broker.execute(alice, prepared, 'r'); assert.equal(denied.status, 'denied');
  assert.throws(() => broker.reconcile(alice, prepared), /RESOURCE_DENIED/);
});
test('trusted target preview cannot switch the strictly resolved resource', () => {
  const h = host(); h.prepareTarget = () => ({ targetId: 'other', preview: {} });
  const broker = new ToolBroker(h);
  assert.throws(() => broker.prepare(alice, 'r', 'c', 'read_stock', { sku: 'one' }), /HOST_TARGET_BINDING_MISMATCH/);
});
