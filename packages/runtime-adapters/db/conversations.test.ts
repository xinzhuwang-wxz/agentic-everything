import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationClientIntentIdSchema, ConversationViewSchema, type Principal } from '@ae/contracts';
import { ConversationStore } from './conversations.js';
import type { PersistentToolBroker } from './broker.js';
import type { PersistentStore, Queryable } from './store.js';

const principal: Principal = { tenantId: 'tenant', applicationId: 'app', subjectId: 'user', roles: ['reader'], scopes: ['read'] };
const id = `conversation-${'a'.repeat(64)}`, context = { ticketId: 'ticket' };
interface Turn { turn: number; run_id: string; release_id: string; input: string; output: string | null; created_at: Date; completed_at: Date | null; status: string | null; materialized: boolean; client_intent_id: string | null }

// Query doubles test the public projection/authorization contract, not PostgreSQL durability.
async function fixture() {
  let revision = 'v1', revokeOnRead = false;
  const turns: Turn[] = [];
  const row = { id, principal, context, authority_hash: '', created_at: new Date(), expires_at: new Date(Date.now() + 60000) };
  const query: Queryable['query'] = async (sql, values = []) => {
    if (sql.includes('SELECT * FROM ae_conversations_v1')) return { rows: values[0] === id ? [row] : [], rowCount: 1 };
    if (sql.includes('SELECT t.*')) {
      if (revokeOnRead) revision = 'revoked';
      return { rows: turns, rowCount: turns.length };
    }
    if (sql.startsWith('INSERT INTO ae_conversation_turns_v1')) {
      turns.push({ turn: Number(values[1]), run_id: String(values[2]), release_id: String(values[3]), input: String(values[4]), client_intent_id: String(values[5]), output: null, created_at: new Date(), completed_at: null, status: null, materialized: false });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const client = { query };
  const store = { pool: client } as unknown as PersistentStore;
  const broker = {
    current: async (p: Principal) => p, catalog: async () => [],
    host: { conversationHistory: { parseContext: (value: unknown) => value, authority: async () => revision } },
  } as unknown as PersistentToolBroker;
  const conversations = new ConversationStore(store, broker);
  row.authority_hash = await conversations.authority(principal, context);
  return { conversations, client, turns, revoke: () => { revision = 'revoked'; }, revokeDuringRead: () => { revokeOnRead = true; } };
}

test('conversation correlation accepts legacy projections and strictly bounds optional client nonces', () => {
  const base = { conversationId: id, context, createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(), messages: [], runs: [{ runId: 'run', releaseId: 'release', status: 'queued' }] };
  assert(ConversationViewSchema.safeParse(base).success);
  assert(ConversationClientIntentIdSchema.safeParse('A_.:-9').success);
  assert(ConversationClientIntentIdSchema.safeParse('a'.repeat(128)).success);
  for (const token of ['', 'a'.repeat(129), 'space token', 'slash/token', 'token\n', null]) assert.equal(ConversationClientIntentIdSchema.safeParse(token).success, false);
  for (const run of [{ ...base.runs[0], clientIntentId: null }, { ...base.runs[0], materialized: 'false' }, { ...base.runs[0], principal }]) assert.equal(ConversationViewSchema.safeParse({ ...base, runs: [run] }).success, false);
});

test('reserved turns expose original nonce and queued materialization without inventing a run', async () => {
  const f = await fixture();
  await f.conversations.reserve(f.client, id, principal, 'run', 'release', 'Text', 'original-nonce', context);
  const pending = await f.conversations.get(id, principal);
  assert.deepEqual(pending.runs, [{ runId: 'run', releaseId: 'release', status: 'queued', materialized: false, clientIntentId: 'original-nonce' }]);
  assert.equal(pending.activeRunId, 'run');
  f.turns[0]!.materialized = true; f.turns[0]!.status = 'succeeded';
  const materialized = await f.conversations.get(id, principal);
  assert.equal(materialized.runs[0]!.clientIntentId, 'original-nonce');
  assert.equal(materialized.runs[0]!.materialized, true);
  assert.equal(materialized.activeRunId, undefined);
});

test('legacy NULL correlation stays absent and cannot be claimed by text or inferred nonce', async () => {
  const f = await fixture();
  f.turns.push({ turn: 1, run_id: 'legacy', release_id: 'release', input: 'same text', output: null, created_at: new Date(), completed_at: null, status: 'succeeded', materialized: true, client_intent_id: null });
  const legacy = await f.conversations.get(id, principal);
  assert.equal(Object.hasOwn(legacy.runs[0]!, 'clientIntentId'), false);
  await f.conversations.reserve(f.client, id, principal, 'new-run', 'release', 'same text', 'new-nonce', context);
  assert.equal(f.turns[0]!.client_intent_id, null);
  assert.equal(f.turns[1]!.client_intent_id, 'new-nonce');
});

test('correlation never supplies replay authority and reserve fails closed on duplicate/context/nonce', async () => {
  const f = await fixture();
  await f.conversations.reserve(f.client, id, principal, 'run', 'release', 'Text', 'original', context);
  f.turns[0]!.status = 'succeeded'; f.turns[0]!.materialized = true;
  await assert.rejects(f.conversations.reserve(f.client, id, principal, 'another-run', 'release', 'Changed', 'original', context), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(f.conversations.reserve(f.client, id, principal, 'another-run', 'release', 'Text', 'different', { ticketId: 'other' }), /CONVERSATION_CONTEXT_DENIED/);
  await assert.rejects(f.conversations.reserve(f.client, id, principal, 'another-run', 'release', 'Text', 'invalid token', context));
  assert.equal(f.turns.length, 1); assert.equal(f.turns[0]!.client_intent_id, 'original');
});

test('nonce projection does not disclose across principals or before/after current-authority revocation', async () => {
  const f = await fixture();
  await f.conversations.reserve(f.client, id, principal, 'run', 'release', 'Text', 'private-nonce', context);
  for (const changed of [{ subjectId: 'other' }, { tenantId: 'other' }, { applicationId: 'other' }]) {
    await assert.rejects(f.conversations.get(id, { ...principal, ...changed }), /CONVERSATION_NOT_FOUND/);
    await assert.rejects(f.conversations.reserve(f.client, id, { ...principal, ...changed }, 'other-run', 'release', 'Text', 'other', context), /CONVERSATION_NOT_FOUND/);
  }
  f.revoke();
  await assert.rejects(f.conversations.get(id, principal), /CONVERSATION_HISTORY_DENIED/);
  const late = await fixture();
  await late.conversations.reserve(late.client, id, principal, 'run', 'release', 'Text', 'private-nonce', context);
  late.revokeDuringRead();
  await assert.rejects(late.conversations.get(id, principal), /CONVERSATION_HISTORY_DENIED/);
});
