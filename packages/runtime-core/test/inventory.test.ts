import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inventoryRecipe } from '../../transformation/src/recipes/python-inventory.js';
import { runInventoryRuntimeQualification, inventoryRuntimeAssertions } from '../src/inventory-qualification.js';
import { PythonInventoryHost, ToolBroker } from '@ae/capabilities';
import { asDurableHost, PersistentToolBroker } from '../../runtime-adapters/db/broker.js';
import type { PersistentStore } from '../../runtime-adapters/db/store.js';
import type { Principal } from '@ae/contracts';
const alice: Principal = { tenantId: 'tenant-a', applicationId: 'inventory-fixture', subjectId: 'alice', roles: ['operator'], scopes: ['inventory:read', 'inventory:reserve'] };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ae-python-runtime-test-'));
  cpSync(resolve('fixtures/existing-python-inventory'), root, { recursive: true });
  const generated = inventoryRecipe.preview(path => path === 'inventory.py' ? 'present' : null)[0]!;
  mkdirSync(join(root, 'agentic')); writeFileSync(join(root, generated.path), generated.after);
  const options = { adapterPath: join(root, generated.path), databasePath: join(root, 'business.sqlite') };
  return { root, options };
}
test('one official SDK runtime governs unchanged Python SQLite reservations and recovery', async () => {
  const f = fixture();
  try { const result = await runInventoryRuntimeQualification(f.options); assert.deepEqual(result.assertions, inventoryRuntimeAssertions); assert.equal(result.mutationCount, 2); assert.equal(result.finalStock.available, 7); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('the same Python host composes with durable broker definitions and approvals without ticket scopes', async () => {
  const f = fixture();
  try {
    const host = new PythonInventoryHost(f.options), memory = new ToolBroker(host);
    // No database execution claimed: this checks the actual durable planning adapter contract.
    const durable = new PersistentToolBroker({} as PersistentStore, asDurableHost(host));
    assert.deepEqual(await durable.catalog(alice), memory.catalog(alice));
    const args = { sku: 'desk-01', orderId: 'order-1', quantity: 2, expectedVersion: 1 };
    const a = memory.prepare(alice, 'run', 'call', 'reserve_stock', args), b = await durable.prepare(alice, 'run', 'call', 'reserve_stock', args);
    assert.deepEqual(b, a); assert.equal(durable.approval(alice, b, 'r').binding.policyVersion, 'inventory-policy-v1');
    await durable.assertReadable(alice, b.request);
    assert.equal(host.mutationDispatchCount, 0);
    await assert.rejects(durable.prepare(alice, 'run', 'call', 'change_ticket_priority', { ticketId: 'ticket-1', priority: 'high', expectedVersion: 1 }), /CAPABILITY_NOT_ALLOWED/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('Python host rejects replaced identity and expired process budget before dispatch', () => {
  const f = fixture();
  try {
    assert.throws(() => new PythonInventoryHost({ ...f.options, deadlineAt: Date.now() - 1 }), /HOST_EXECUTION_BUDGET_EXPIRED/);
    const host = new PythonInventoryHost({ ...f.options, currentPrincipal: p => ({ ...p, subjectId: 'mallory' }) });
    assert.throws(() => host.current(alice), /PRINCIPAL_CHANGED/); assert.equal(host.mutationDispatchCount, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
