import type { ConversationContext, ConversationView } from '@ae/contracts';
import type { AeConversationClient, RunView } from './types.js';

const terminal = new Set(['succeeded', 'failed', 'rejected', 'cancelled']);
const nonce = /^[a-zA-Z0-9_.:-]{1,128}$/;
interface Journal { version: 1; createIntent: string; conversationId?: string; pending?: { intent: string; inputHash: string; runId?: string } }
export interface ConversationSnapshot { conversation?: ConversationView; run?: RunView; connected: boolean; busy: boolean; pending: boolean; error: string; recoveryInputRequired: boolean }
const initial: ConversationSnapshot = { connected: false, busy: false, pending: false, error: '', recoveryInputRequired: false };
const canonical = (value: unknown): string => value && typeof value === 'object' ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}` : JSON.stringify(value);
async function inputHash(input: string, context: ConversationContext) { return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical({ input, context }))))).map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function readJournal(storageKey: string | undefined): Journal | undefined {
  if (!storageKey) return undefined;
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return undefined;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('恢复记录无效，不能安全创建新请求。');
  const j = value as Partial<Journal>;
  if (j.version !== 1 || typeof j.createIntent !== 'string' || !nonce.test(j.createIntent) || (j.conversationId !== undefined && (typeof j.conversationId !== 'string' || !j.conversationId.startsWith('conversation-'))) || (j.pending !== undefined && (!j.conversationId || !nonce.test(j.pending.intent) || !/^[a-f0-9]{64}$/.test(j.pending.inputHash) || (j.pending.runId !== undefined && typeof j.pending.runId !== 'string')))) throw new Error('恢复记录无效，不能安全创建新请求。');
  return { version: 1, createIntent: j.createIntent, ...(j.conversationId ? { conversationId: j.conversationId } : {}), ...(j.pending ? { pending: { intent: j.pending.intent, inputHash: j.pending.inputHash, ...(j.pending.runId ? { runId: j.pending.runId } : {}) } } : {}) };
}
function definitiveAdmissionRejection(error:unknown){return ['INVALID_INPUT','CONVERSATION_CAPACITY_REACHED','CONVERSATION_RUN_UNFINISHED','RELEASE_REQUIRED'].includes((error as {code?:string})?.code??'')}
function authorityFailure(error: unknown) { const e = error as { status?: number; code?: string }; return e?.status === 401 || e?.status === 403 || e?.code === 'CONVERSATION_EXPIRED' || e?.code === 'CONVERSATION_NOT_FOUND' || e?.code === 'CONVERSATION_RESPONSE_MISMATCH'; }
/** Presentation coordinator only. Server history, intent ledger and DBOS remain authoritative. */
export class ConversationSession {
  private snapshot: ConversationSnapshot = initial;
  private listeners = new Set<() => void>();
  private journal?: Journal;
  private epoch = 0;
  private alive = false;
  private admitting = false;
  private acting = false;
  private readVersion = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private originalInput: string | undefined;
  constructor(private readonly client: AeConversationClient, private readonly getRun: (id: string) => Promise<RunView>, private readonly context: ConversationContext, private readonly storageKey?: string) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(change: Partial<ConversationSnapshot>) { this.snapshot = { ...this.snapshot, ...change }; for (const listener of this.listeners) listener(); }
  private save() { if (this.storageKey) sessionStorage.setItem(this.storageKey, JSON.stringify(this.journal)); }
  private current(epoch: number) { return this.alive && this.epoch === epoch; }
  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : '连接中断';
    if (authorityFailure(error)) { this.snapshot = { ...initial, pending: !!this.journal?.pending, error: `${message}。当前无法读取历史；这不代表之前没有执行。请核查原操作，不要重复提交。` }; for (const listener of this.listeners) listener(); }
    else this.publish({ error: `${message}。执行结果尚未确认；刷新只核对状态，不会重新执行。` });
  }
  async connect() {
    this.alive = true; const epoch = ++this.epoch;
    this.publish({ busy: true, connected: false, error: '' });
    try {
      this.journal ??= readJournal(this.storageKey) ?? { version: 1, createIntent: globalThis.crypto.randomUUID() };
      this.save(); // Persist the creation nonce before even an empty conversation is created.
      if (!this.journal.conversationId) {
        const created = await this.client.create(this.context, this.journal.createIntent);
        if (!this.current(epoch)) return;
        this.journal.conversationId = created.conversationId; this.save();
      }
      await this.refresh();
    } catch (error) { if (this.current(epoch)) this.fail(error); }
    finally { if (this.current(epoch)) this.publish({ busy: false }); }
  }
  dispose() { this.alive = false; this.epoch++; this.readVersion++; clearTimeout(this.timer); }
  private schedule() {
    clearTimeout(this.timer);
    if (this.alive && (this.journal?.pending || this.snapshot.conversation?.activeRunId)) this.timer = setTimeout(() => { void this.refresh(); }, 1000);
  }
  async refresh() {
    const id = this.journal?.conversationId; if (!id || !this.alive) return;
    const epoch = this.epoch, version = ++this.readVersion;
    try {
      const conversation = await this.client.get(id);
      if (!this.current(epoch) || version !== this.readVersion) return;
      if (conversation.conversationId !== id || canonical(conversation.context) !== canonical(this.context)) throw Object.assign(new Error('会话响应与当前上下文不符'),{code:'CONVERSATION_RESPONSE_MISMATCH'});
      const pending = this.journal?.pending;
      const correlated = pending ? conversation.runs.find(run => run.clientIntentId === pending.intent) : undefined;
      if (correlated && pending) { pending.runId = correlated.runId; this.save(); }
      // Never correlate on message text, run order or an untrusted local run ID.
      const selected = pending ? correlated : conversation.runs.find(run => run.runId === conversation.activeRunId) ?? conversation.runs.at(-1);
      const run = selected && selected.materialized !== false ? await this.getRun(selected.runId) : undefined;
      if (!this.current(epoch) || version !== this.readVersion) return;
      if (run && run.runId !== selected?.runId) throw Object.assign(new Error('运行响应与当前会话不符'),{code:'CONVERSATION_RESPONSE_MISMATCH'});
      if (correlated && run && this.journal && pending && this.journal.pending?.intent === pending.intent) {
        delete this.journal.pending;
        try{this.save()}catch(error){this.journal.pending=pending;throw error}
        this.originalInput=undefined;
      }
      this.snapshot = { conversation, ...(run ? { run } : {}), connected: true, busy: this.acting || (this.admitting && !run), pending: !!this.journal?.pending, error: '', recoveryInputRequired: !!this.journal?.pending && !this.originalInput };
      for (const listener of this.listeners) listener(); this.schedule();
    } catch (error) { if (this.current(epoch) && version === this.readVersion) { this.fail(error); clearTimeout(this.timer); } }
  }
  canStart() { return this.alive && this.snapshot.connected && !this.snapshot.busy && !this.journal?.pending && !this.snapshot.conversation?.activeRunId && (!this.snapshot.run || terminal.has(this.snapshot.run.status)); }
  async start(input: string) {
    const text = input.trim(); if (!text || !this.canStart() || this.admitting) return;
    if(text.length>16384){this.publish({error:'请求不能超过16384个字符。'});return;}
    this.admitting = true; const epoch = this.epoch; let submitted=false; let intent:string|undefined;
    this.publish({ busy: true, error: '' });
    try {
      const hash = await inputHash(text, this.context); if (!this.current(epoch)) return;
      this.journal!.pending = { intent: globalThis.crypto.randomUUID(), inputHash: hash }; this.originalInput = text;
      try{this.save()}catch(error){delete this.journal!.pending;this.originalInput=undefined;throw error}
      intent=this.journal!.pending.intent; this.publish({ pending: true }); this.schedule(); submitted=true;
      await this.client.start(this.journal!.conversationId!, text, intent);
      if (this.current(epoch)) await this.refresh();
    } catch (error) { if (this.current(epoch)) {
      if(submitted&&definitiveAdmissionRejection(error)&&this.journal&&this.journal.pending?.intent===intent){delete this.journal.pending;this.originalInput=undefined;this.save();this.publish({pending:false})}
      if(!submitted||this.journal?.pending?.intent===intent||authorityFailure(error)||definitiveAdmissionRejection(error))this.fail(error);
    } }
    finally { if (this.current(epoch)) { this.admitting = false; this.publish({ busy: this.acting }); } }
  }
  /** Only an explicit user action retries the exact nonce and hashed original body. */
  async retry(input: string) {
    const pending = this.journal?.pending, id = this.journal?.conversationId;
    if (!this.alive || !pending || !id || this.admitting || this.acting || !this.snapshot.connected) return;
    const text = (this.originalInput ?? input).trim(), epoch = this.epoch;
    this.admitting = true; this.publish({ busy: true, error: '' });
    try {
      if (!text || await inputHash(text, this.context) !== pending.inputHash) throw new Error('请原样输入上次请求；不同内容不会被提交');
      if (!this.current(epoch)) return;
      this.save();
      await this.client.start(id, text, pending.intent); if (this.current(epoch)) await this.refresh();
    } catch (error) { if (this.current(epoch)) this.fail(error); }
    finally { if (this.current(epoch)) { this.admitting = false; this.publish({ busy: false }); } }
  }
  async perform(action: (runId: string) => Promise<RunView>) {
    const run = this.snapshot.run; if (!this.alive || !run || !this.snapshot.connected || this.acting) return;
    const epoch = this.epoch; this.acting = true; this.publish({ busy: true, error: '' });
    try { await action(run.runId); if (this.current(epoch)) await this.refresh(); }
    catch (error) { if (this.current(epoch)) this.fail(error); }
    finally { if (this.current(epoch)) { this.acting = false; this.publish({ busy: false }); } }
  }
  async newConversation() {
    if (!this.canStart() || this.admitting || this.acting) return;
    this.journal = { version: 1, createIntent: globalThis.crypto.randomUUID() }; this.originalInput = undefined;
    this.snapshot = initial; await this.connect();
  }
}
