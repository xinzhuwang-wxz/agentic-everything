import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { AgentRelease, Principal, RunStatus, RunEvent, ToolResult, ApprovalDecision, JsonObject } from '@ae/contracts';
import { PolicyError, samePrincipal, type ApprovalView } from '@ae/policy';
import { verifyRelease } from '@ae/control-plane';
import type { PreparedTool } from '@ae/capabilities';
export interface Queryable { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, any>[]; rowCount: number | null }> }
interface Client extends Queryable { release(): void }
interface Pool extends Queryable { connect(): Promise<Client>; end(): Promise<void> }
const PgPool = (createRequire(import.meta.url)('pg') as { Pool: new(options: { connectionString: string }) => Pool }).Pool;
export interface PersistentRunView { runId: string; releaseId?: string; status: RunStatus; events: RunEvent[]; approval?: ApprovalView; message?: string; receipts: ToolResult[]; persistence: 'postgres-dbos'; modelMode: 'configured-model-port' }
export interface StoredRun { view: PersistentRunView; principal: Principal; releaseId: string; release?: AgentRelease; input: string; pins: { sdk: '0.21.0'; workflow: 'ae-v1'; policy: 'tickets-policy-v1'; capability: '1'; releaseHash?: string }; snapshot?: string; pending?: PreparedTool; cancelled: boolean; phase: string }
// AE business ledger, never a scheduler. DBOS owns all execution/recovery.
export const migration = `
CREATE TABLE IF NOT EXISTS ae_runs_v1 (id text PRIMARY KEY, body jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS ae_approvals_v1 (id text PRIMARY KEY, run_id text NOT NULL REFERENCES ae_runs_v1(id), view jsonb NOT NULL, state text NOT NULL, decision jsonb);
CREATE TABLE IF NOT EXISTS ae_operations_v1 (id text PRIMARY KEY, run_id text NOT NULL REFERENCES ae_runs_v1(id), request_hash text NOT NULL, prepared jsonb NOT NULL, result jsonb);
`;
export class PersistentStore {
  readonly pool: Pool;
  constructor(databaseUrl: string) { this.pool = new PgPool({ connectionString: databaseUrl }); }
  async migrate(): Promise<void> { await this.pool.query(migration); }
  async close(): Promise<void> { await this.pool.end(); }
  async transaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T> { const c = await this.pool.connect(); try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } }
  async load(id: string, principal?: Principal, client: Queryable = this.pool, lock = false): Promise<StoredRun> {
    const result = await client.query(`SELECT body FROM ae_runs_v1 WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id]);
    const run = result.rows[0]?.body as StoredRun | undefined;
    if (!run || (principal && !samePrincipal(run.principal, principal))) throw new PolicyError('RUN_NOT_FOUND');
    if (run.pins.sdk !== '0.21.0' || run.pins.workflow !== 'ae-v1' || run.pins.policy !== 'tickets-policy-v1' || run.pins.capability !== '1') throw new PolicyError('RUN_VERSION_UNSUPPORTED');
    if (run.release !== undefined || run.pins.releaseHash !== undefined || /^release-[a-f0-9]{64}$/.test(run.releaseId)) {
      if (!run.release) throw new PolicyError('RELEASE_BINDING_DENIED');
      verifyRelease(run.release);
      if (run.pins.releaseHash !== run.release.contentHash) throw new PolicyError('RELEASE_BINDING_DENIED');
      if (run.releaseId !== run.release.releaseId || run.release.tenantId !== run.principal.tenantId || run.release.applicationId !== run.principal.applicationId) throw new PolicyError('RELEASE_BINDING_DENIED');
      if (run.view.releaseId !== run.releaseId) throw new PolicyError('RELEASE_BINDING_DENIED');
    }
    return run;
  }
  async put(run: StoredRun, client: Queryable): Promise<void> { await client.query('UPDATE ae_runs_v1 SET body=$2 WHERE id=$1', [run.view.runId, JSON.stringify(run)]); }
  async update<T>(id: string, fn: (run: StoredRun, client: Queryable) => Promise<T>): Promise<T> { return this.transaction(async c => { const r = await this.load(id, undefined, c, true); const result = await fn(r, c); await this.put(r, c); return result; }); }
  event(run: StoredRun, type: RunEvent['type'], payload: JsonObject): void { run.view.events.push({ schemaVersion: '1', eventId: randomUUID(), sequence: run.view.events.length, runId: run.view.runId, type, timestamp: new Date().toISOString(), payload }); }
  status(run: StoredRun, status: RunStatus): void { if (run.view.status !== status) { run.view.status = status; this.event(run, 'run-status', { status }); } }
  async validateDecision(id: string, principal: Principal, decision: ApprovalDecision): Promise<void> {
    const r = await this.load(id, principal);
    const row = (await this.pool.query('SELECT * FROM ae_approvals_v1 WHERE id=$1 AND run_id=$2', [decision.approvalId, id])).rows[0];
    if (!row) throw new PolicyError('APPROVAL_NOT_FOUND');
    const view = row.view as ApprovalView;
    if (view.expectedHash !== decision.expectedHash) throw new PolicyError('APPROVAL_HASH_MISMATCH');
    if (row.decision) { if (row.decision.decision !== decision.decision || row.decision.expectedHash !== decision.expectedHash) throw new PolicyError('APPROVAL_ALREADY_DECIDED'); return; }
    if (r.cancelled || r.view.status !== 'awaiting-approval' || row.state !== 'pending') throw new PolicyError('RUN_NOT_AWAITING_THIS_APPROVAL');
    if (Date.parse(view.binding.expiresAt) <= Date.now()) throw new PolicyError('APPROVAL_EXPIRED');
  }
  async decision(id: string, principal: Principal, decision: ApprovalDecision): Promise<string | null> {
    return this.update(id, async (r, c) => {
      if (!samePrincipal(r.principal, principal)) throw new PolicyError('RUN_NOT_FOUND');
      const rows = await c.query('SELECT * FROM ae_approvals_v1 WHERE id=$1 AND run_id=$2 FOR UPDATE', [decision.approvalId, id]);
      const a = rows.rows[0]; if (!a) throw new PolicyError('APPROVAL_NOT_FOUND');
      const view = a.view as ApprovalView;
      if (view.expectedHash !== decision.expectedHash) throw new PolicyError('APPROVAL_HASH_MISMATCH');
      if (a.decision) { if (a.decision.decision !== decision.decision || a.decision.expectedHash !== decision.expectedHash) throw new PolicyError('APPROVAL_ALREADY_DECIDED'); return decision.decision === 'approve' ? decision.approvalId : null; }
      if (r.cancelled || r.view.status !== 'awaiting-approval' || a.state !== 'pending') throw new PolicyError('RUN_NOT_AWAITING_THIS_APPROVAL');
      if (Date.parse(view.binding.expiresAt) <= Date.now()) throw new PolicyError('APPROVAL_EXPIRED');
      await c.query('UPDATE ae_approvals_v1 SET state=$2, decision=$3 WHERE id=$1', [decision.approvalId, decision.decision === 'approve' ? 'approved' : 'rejected', JSON.stringify(decision)]);
      delete r.view.approval; r.phase = decision.approvalId;
      this.status(r, decision.decision === 'approve' ? 'queued' : 'rejected');
      return decision.decision === 'approve' ? decision.approvalId : null;
    });
  }
}
