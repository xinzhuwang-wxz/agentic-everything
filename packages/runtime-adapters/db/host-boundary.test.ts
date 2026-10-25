import test from 'node:test';
import assert from 'node:assert/strict';
import { PersistentStore, type StoredRun } from './store.js';
import { durableAuthority } from './host-boundary.js';
import { ticketCapabilityDefinitions } from '@ae/capabilities';
import type { Principal } from '@ae/contracts';
const principal: Principal = { tenantId: 't', applicationId: 'a', subjectId: 's', roles: ['viewer'], scopes: ['tickets:read'] };
function row(policy: string): StoredRun { return { view: { runId: 'run', releaseId: 'r', status: 'queued', events: [], receipts: [], persistence: 'postgres-dbos', modelMode: 'configured-model-port' }, principal, releaseId: 'r', input: 'read', pins: { sdk: '0.21.0', workflow: 'ae-v1', policy, capability: '1' }, cancelled: false, phase: 'initial' }; }
test('store preserves legacy policy pins and refuses cross-host run recovery without migration', async () => {
  const ticket = new PersistentStore('postgres://unused.invalid/test');
  let saved = row('tickets-policy-v1'); ticket.pool.query = async () => ({ rows: [{ body: saved }], rowCount: 1 });
  assert.equal((await ticket.load('run')).pins.policy, 'tickets-policy-v1');
  saved = row('inventory-policy-v1'); await assert.rejects(ticket.load('run'), /RUN_VERSION_UNSUPPORTED/);
  const inventory = new PersistentStore('postgres://unused.invalid/test', 'inventory-policy-v1'); inventory.pool.query = async () => ({ rows: [{ body: saved }], rowCount: 1 });
  assert.equal((await inventory.load('run')).pins.policy, 'inventory-policy-v1');
  saved = row('tickets-policy-v1'); await assert.rejects(inventory.load('run'), /RUN_VERSION_UNSUPPORTED/);
  await ticket.close(); await inventory.close();
});
test('a host without explicit authority or the legacy ticket port is rejected', () => {
  assert.throws(() => durableAuthority({ currentPrincipal: async p => p, write: async () => { throw Error(); }, query: async () => { throw Error(); } }), /HOST_CAPABILITY_AUTHORITY_REQUIRED/);
});
test('legacy authority retains the original reviewed definitions and current scope checks', async () => {
  const authority = durableAuthority({ currentPrincipal: async p => p, read: async () => ({ id: 'x', tenantId: 't', title: 'x', priority: 'low', version: 1 }), write: async () => { throw Error(); }, query: async () => { throw Error(); } } as import('./host-boundary.js').DurableTicketHost);
  assert.equal(authority.policyVersion, 'tickets-policy-v1'); assert.equal(authority.definitions, ticketCapabilityDefinitions);
  await authority.authorize(principal, 'read_ticket'); await assert.rejects(authority.authorize(principal, 'change_ticket_priority'), /ROLE_DENIED/);
  assert.deepEqual((await authority.catalog(principal)).map(c => c.capabilityId), ['read_ticket', 'change_ticket_priority']);
});
test('durable target reference extraction performs no host I/O before conversation authority', async () => {
  let reads = 0;
  const authority = durableAuthority({ currentPrincipal: async p => p, read: async () => { reads++; throw Error('Read must not happen'); }, write: async () => { throw Error(); }, query: async () => { throw Error(); } } as import('./host-boundary.js').DurableTicketHost);
  assert.equal(authority.referenceTarget('read_ticket', { ticketId: 'secret' }), 'secret'); assert.equal(reads, 0);
  assert.throws(() => authority.referenceTarget('read_ticket', { ticketId: 'secret', tenantId: 'other' }), /INVALID_ARGUMENTS/); assert.equal(reads, 0);
});
test('conversation target denial happens before any host business read or reservation', async () => {
  const { PersistentToolBroker } = await import('./broker.js');
  let reads = 0;
  const host: import('./host-boundary.js').DurableTicketHost = { currentPrincipal: async p => p, read: async () => { reads++; throw Error('Forbidden business read'); }, write: async () => { throw Error('Forbidden write'); }, query: async () => { throw Error('Forbidden receipt'); } };
  const store = { pool: { query: async () => ({ rows: [], rowCount: 0 }) } } as unknown as PersistentStore;
  const broker = new PersistentToolBroker(store, host, undefined, async (_run, target) => { assert.equal(target.targetId, 'outside-context'); throw Error('CONVERSATION_CONTEXT_DENIED'); });
  await assert.rejects(broker.execute(row('tickets-policy-v1'), 'read_ticket', { ticketId: 'outside-context' }, 'call'), /CONVERSATION_CONTEXT_DENIED/);
  assert.equal(reads, 0);
});
