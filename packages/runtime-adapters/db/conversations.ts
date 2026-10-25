import { MemorySession, type AgentInputItem } from '@openai/agents';
import { ConversationClientIntentIdSchema, ConversationContextSchema, ConversationRunBindingSchema, ConversationViewSchema, type ConversationContext, type ConversationRunBinding, type ConversationView, type Principal, type RunStatus } from '@ae/contracts';
import { digest, PolicyError, samePrincipal } from '@ae/policy';
import type { PersistentStore, Queryable, StoredRun } from './store.js';
import type { PersistentToolBroker } from './broker.js';

interface ConversationRow { id: string; principal: Principal; context: ConversationContext; authority_hash: string; created_at: Date; expires_at: Date }
const terminal = new Set<RunStatus>(['succeeded', 'failed', 'rejected', 'cancelled']);
const maxBytes = 128 * 1024;
/** AE owns only bounded durable text/turn records. SDK owns message composition; DBOS owns execution. */
export class ConversationStore {
  constructor(private readonly store: PersistentStore, private readonly broker: PersistentToolBroker) {}
  async authority(principal: Principal, context: ConversationContext): Promise<string> {
    const current = await this.broker.current(principal);
    const policy = this.broker.host.conversationHistory;
    if (!policy) throw new PolicyError('CONVERSATIONS_NOT_SUPPORTED');
    try {
      const parsed = ConversationContextSchema.parse(policy.parseContext(structuredClone(context)));
      // A stripping schema must not accidentally accept authority/unknown fields.
      if (digest(parsed) !== digest(context)) throw new Error('Context was not strictly accepted');
    } catch { throw new PolicyError('CONVERSATION_CONTEXT_DENIED'); }
    const revision = await policy.authority(structuredClone(current), structuredClone(context));
    if (typeof revision !== 'string' || !revision.trim() || revision.length > 1024) throw new PolicyError('HISTORY_AUTHORITY_DENIED');
    const catalog = await this.broker.catalog(current);
    return digest({ principal: { ...current, roles: [...current.roles].sort(), scopes: [...current.scopes].sort() }, context, revision,
      capabilities: catalog.map(c => [c.capabilityId, c.version, c.bindingHash]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
  }
  private async load(id: string, principal: Principal, client: Queryable = this.store.pool, lock = false): Promise<ConversationRow> {
    const row = (await client.query(`SELECT * FROM ae_conversations_v1 WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id])).rows[0] as ConversationRow | undefined;
    if (!row || !samePrincipal(row.principal, principal)) throw new PolicyError('CONVERSATION_NOT_FOUND');
    if (row.expires_at.getTime() <= Date.now()) throw new PolicyError('CONVERSATION_EXPIRED');
    if (row.authority_hash !== await this.authority(principal, row.context)) throw new PolicyError('CONVERSATION_HISTORY_DENIED');
    return row;
  }
  async create(principal: Principal, context: ConversationContext, intent: string): Promise<ConversationView> {
    const id = `conversation-${digest([principal.tenantId, principal.applicationId, principal.subjectId, intent])}`;
    const authority = await this.authority(principal, context);
    const created = new Date(), expires = new Date(created.getTime() + 24 * 60 * 60 * 1000);
    await this.store.pool.query('INSERT INTO ae_conversations_v1(id,principal,context,authority_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING', [id, JSON.stringify(principal), JSON.stringify(context), authority, created, expires]);
    const row = await this.load(id, principal);
    if (digest(row.context) !== digest(context)) throw new PolicyError('IDEMPOTENCY_CONFLICT');
    return this.get(id, principal);
  }
  async get(id: string, principal: Principal): Promise<ConversationView> {
    const row = await this.load(id, principal);
    const turns = (await this.store.pool.query("SELECT t.*,r.body->'view'->>'status' AS status,r.id IS NOT NULL AS materialized FROM ae_conversation_turns_v1 t LEFT JOIN ae_runs_v1 r ON r.id=t.run_id WHERE t.conversation_id=$1 ORDER BY t.turn", [id])).rows;
    const messages: ConversationView['messages'] = [], runs: ConversationView['runs'] = [];
    let activeRunId: string | undefined;
    for (const t of turns) {
      const status = (t.status ?? 'queued') as RunStatus;
      runs.push({ runId: t.run_id, releaseId: t.release_id, status, materialized: t.materialized, ...(t.client_intent_id === null ? {} : { clientIntentId: t.client_intent_id }) });
      messages.push({ messageId: `${t.run_id}:user`, sequence: (t.turn - 1) * 2, runId: t.run_id, role: 'user', text: t.input, createdAt: t.created_at.toISOString() });
      if (t.output !== null) messages.push({ messageId: `${t.run_id}:assistant`, sequence: (t.turn - 1) * 2 + 1, runId: t.run_id, role: 'assistant', text: t.output, createdAt: t.completed_at.toISOString() });
      if (!terminal.has(status)) activeRunId = t.run_id;
    }
    // Recheck after fetching material, not merely before the database read.
    await this.load(id, principal);
    return ConversationViewSchema.parse({ conversationId: id, context: row.context, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(), messages, runs, ...(activeRunId ? { activeRunId } : {}) });
  }
  async reserve(client: Queryable, id: string, principal: Principal, runId: string, releaseId: string, input: string, clientIntentId: string, context?: ConversationContext): Promise<ConversationRunBinding> {
    const row = await this.load(id, principal, client, true);
    if (context && digest(context) !== digest(row.context)) throw new PolicyError('CONVERSATION_CONTEXT_DENIED');
    ConversationClientIntentIdSchema.parse(clientIntentId);
    const turns = (await client.query("SELECT t.*,r.body->'view'->>'status' AS status FROM ae_conversation_turns_v1 t LEFT JOIN ae_runs_v1 r ON r.id=t.run_id WHERE t.conversation_id=$1 ORDER BY t.turn", [id])).rows;
    // Correlation is insert-only, never a second replay authority. Existing intents bypass reserve.
    if (turns.some(t => t.client_intent_id === clientIntentId)) throw new PolicyError('IDEMPOTENCY_CONFLICT');
    if (turns.some(t => !terminal.has((t.status ?? 'queued') as RunStatus))) throw new PolicyError('CONVERSATION_RUN_UNFINISHED');
    if (turns.length >= 20 || Buffer.byteLength(input) + turns.reduce((bytes, t) => bytes + Buffer.byteLength(t.input) + Buffer.byteLength(t.output ?? ''), 0) + 65536 > maxBytes) throw new PolicyError('CONVERSATION_CAPACITY_REACHED');
    const turn = turns.length + 1;
    await client.query('INSERT INTO ae_conversation_turns_v1(conversation_id,turn,run_id,release_id,input,client_intent_id,created_at) VALUES($1,$2,$3,$4,$5,$6,now())', [id, turn, runId, releaseId, input, clientIntentId]);
    return { conversationId: id, authorityHash: row.authority_hash, turn };
  }
  async assertRun(run: StoredRun, client: Queryable = this.store.pool): Promise<void> {
    if (!run.conversation) return;
    const binding = ConversationRunBindingSchema.parse(run.conversation);
    const row = await this.load(binding.conversationId, run.principal, client);
    const turn = (await client.query('SELECT run_id FROM ae_conversation_turns_v1 WHERE conversation_id=$1 AND turn=$2', [binding.conversationId, binding.turn])).rows[0];
    if (row.authority_hash !== binding.authorityHash || turn?.run_id !== run.view.runId) throw new PolicyError('CONVERSATION_BINDING_DENIED');
  }
  async assertTarget(run: StoredRun, capabilityId: string, targetId: string, client: Queryable = this.store.pool): Promise<void> {
    if (!run.conversation) return;
    const row = await this.load(run.conversation.conversationId, run.principal, client);
    await this.broker.host.conversationHistory!.authorizeTarget(await this.broker.current(run.principal), structuredClone(row.context), { capabilityId, targetId });
  }
  async session(run: StoredRun): Promise<MemorySession | undefined> {
    if (!run.conversation) return undefined;
    await this.assertRun(run);
    const rows = (await this.store.pool.query('SELECT input,output FROM ae_conversation_turns_v1 WHERE conversation_id=$1 AND turn<$2 AND output IS NOT NULL ORDER BY turn', [run.conversation.conversationId, run.conversation.turn])).rows;
    const items: AgentInputItem[] = rows.flatMap(row => [
      { type: 'message' as const, role: 'user' as const, content: row.input as string },
      { type: 'message' as const, role: 'assistant' as const, status: 'completed' as const, content: [{ type: 'output_text' as const, text: row.output as string }] },
    ]);
    await this.assertRun(run);
    return new MemorySession({ sessionId: run.conversation.conversationId, initialItems: items });
  }
  /** Called inside the same transaction that makes the run successful. Idempotent on DBOS replay. */
  async complete(run: StoredRun, client: Queryable): Promise<void> {
    if (!run.conversation) return;
    await this.assertRun(run, client);
    await client.query('UPDATE ae_conversation_turns_v1 SET output=$3,completed_at=COALESCE(completed_at,now()) WHERE conversation_id=$1 AND run_id=$2 AND output IS NULL', [run.conversation.conversationId, run.view.runId, run.view.message ?? '']);
    await this.assertRun(run, client); // transaction rolls back if authority changed during persistence
  }
}
