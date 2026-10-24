import { randomUUID } from 'node:crypto';
import { ToolResultSchema, type BehaviorSelection, type CapabilityVersion, type JsonObject, type Principal, type ToolRequest, type ToolResult } from '@ae/contracts';
import { AuthorizedTicketHost, ToolBroker, ticketCapabilities, type PreparedTool, type Ticket } from '@ae/capabilities';
import { authorize, digest, PolicyError, samePrincipal, type ApprovalView } from '@ae/policy';
import { releasedCatalog } from '@ae/control-plane';
import { PersistentStore, type StoredRun } from './store.js';
/** A host owns its durable operation ledger and atomic business mutation. AE never supplies its database. */
export interface DurableTicketHost {
  /** Explicit adapter implementation attestation; absent adapters reject selected behavior. */
  readonly behaviorRegistryHash?: string;
  currentPrincipal(principal: Principal): Promise<Principal>;
  /** Optional current host capability revocation/version view; cannot expand the fixed registry. */
  currentCapabilities?(principal: Principal): Promise<CapabilityVersion[]>;
  read(principal: Principal, ticketId: string, behavior?: BehaviorSelection): Promise<Ticket>;
  write(principal: Principal, request: ToolRequest, signal?: AbortSignal): Promise<ToolResult>;
  query(principal: Principal, operationId: string): Promise<ToolResult>;
}
export class PersistentToolBroker {
  constructor(readonly store: PersistentStore, readonly host: DurableTicketHost, private fault?: (point: string) => Promise<void>) {}
  async current(principal: Principal, write = false): Promise<Principal> { const identity = structuredClone(principal); const p = await this.host.currentPrincipal(structuredClone(identity)); if (!samePrincipal(p, identity)) throw new PolicyError('PRINCIPAL_CHANGED'); authorize(p, write); return p; }
  async catalog(principal: Principal, run?: StoredRun): Promise<CapabilityVersion[]> {
    const current = await this.current(principal);
    const hostCatalog = this.host.currentCapabilities ? await this.host.currentCapabilities(structuredClone(current)) : ticketCapabilities;
    const catalog = ticketCapabilities.filter(c => hostCatalog.some(h => h.capabilityId === c.capabilityId && h.version === c.version && h.bindingHash === c.bindingHash)).filter(c => { try { authorize(current, c.risk !== 'read'); return true; } catch { return false; } });
    return run?.release ? releasedCatalog(run.release, current, catalog) : structuredClone(catalog);
  }
  async assertCapability(run: StoredRun, name: string): Promise<void> {
    await this.current(run.principal, name !== 'read_ticket');
    if (!(await this.catalog(run.principal, run)).some(c => c.capabilityId === name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
  }
  async prepare(principal: Principal, runId: string, callId: string, name: string, args: JsonObject): Promise<PreparedTool> {
    const p = await this.current(principal, name !== 'read_ticket');
    if (typeof args.ticketId !== 'string') throw new PolicyError('INVALID_ARGUMENTS');
    const ticket = await this.host.read(p, args.ticketId);
    // Reuse the existing broker's schemas, operation identity, tenant/version validation and exact preview.
    const broker = new ToolBroker(new AuthorizedTicketHost({ readTicket: () => ticket, changePriority: () => { throw new Error('Planning facade cannot write'); } }));
    return broker.prepare(p, runId, callId, name, args);
  }
  approval(principal: Principal, prepared: PreparedTool, releaseId: string): ApprovalView {
    const broker = new ToolBroker(new AuthorizedTicketHost({ readTicket: () => { throw new Error('Unused'); }, changePriority: () => { throw new Error('Unused'); } }));
    return broker.requestApproval(principal, prepared, releaseId);
  }
  async execute(run: StoredRun, name: string, args: JsonObject, callId: string, approvalId?: string, signal?: AbortSignal): Promise<ToolResult> {
    if (run.release?.configuration.behavior && this.host.behaviorRegistryHash !== run.release.configuration.behavior.registryHash) throw new PolicyError('HOST_BEHAVIOR_NOT_SUPPORTED');
    await this.assertCapability(run, name);
    const write = name !== 'read_ticket';
    const p = await this.current(run.principal);
    const operationId = digest({ runId: run.view.runId, callId, tenant: p.tenantId, application: p.applicationId });
    const existing = (await this.store.pool.query('SELECT * FROM ae_operations_v1 WHERE id=$1', [operationId])).rows[0];
    if (existing) {
      const saved = existing.prepared as PreparedTool;
      if (saved.request.capabilityId !== name || digest(saved.request.arguments) !== digest(args)) throw new PolicyError('IDEMPOTENCY_CONFLICT');
      await this.host.read(p, saved.request.targetId); // current authority even for cached successful receipts
      if (existing.result) return existing.result as ToolResult;
      if (!saved.write) { const result: ToolResult = { status: 'succeeded', operationId, receiptId: randomUUID(), data: { ...await this.host.read(p, saved.request.targetId, run.release?.configuration.behavior) } }; await this.record(run.view.runId, operationId, result); return result; }
      // Reservation survived a crash: never dispatch again, even if the host has no receipt.
      const result = validateHostResult(operationId, await this.host.query(p, operationId));
      if (result.status === 'succeeded') await this.record(run.view.runId, operationId, result);
      return result;
    }
    const prepared = await this.prepare(p, run.view.runId, callId, name, args);
    await this.store.update(run.view.runId, async (r, c) => {
      await this.assertCapability(r, name);
      if (r.cancelled || signal?.aborted) throw new PolicyError('CANCELLED');
      const raced = await c.query('SELECT id FROM ae_operations_v1 WHERE id=$1', [operationId]);
      if (raced.rows.length) throw new PolicyError('OPERATION_ALREADY_RESERVED');
      if (prepared.write) {
        const row = (await c.query('SELECT * FROM ae_approvals_v1 WHERE id=$1 AND run_id=$2 FOR UPDATE', [approvalId, r.view.runId])).rows[0];
        if (!row || row.state !== 'approved') throw new PolicyError('APPROVAL_NOT_AVAILABLE');
        const b = (row.view as ApprovalView).binding, q = prepared.request;
        if (!samePrincipal(b.principal, p) || Date.parse(b.expiresAt) <= Date.now()) throw new PolicyError('APPROVAL_EXPIRED_OR_SUBJECT');
        if (b.runId !== q.runId || b.invocationId !== q.invocationId || b.argumentsHash !== digest(q.arguments) || b.targetId !== q.targetId || b.resourceVersion !== q.expectedResourceVersion || b.operationId !== q.operationId || b.capabilityId !== q.capabilityId || b.capabilityVersion !== q.capabilityVersion || b.releaseId !== r.releaseId || b.policyVersion !== r.pins.policy) throw new PolicyError('APPROVAL_BINDING_MISMATCH');
        await c.query('UPDATE ae_approvals_v1 SET state=$2 WHERE id=$1', [approvalId, 'consumed']);
      }
      await c.query('INSERT INTO ae_operations_v1(id,run_id,request_hash,prepared) VALUES($1,$2,$3,$4)', [operationId, r.view.runId, digest(prepared.request), JSON.stringify(prepared)]);
      r.pending = prepared;
      this.store.event(r, 'tool-request', { capabilityId: name, invocationId: callId, targetId: prepared.request.targetId });
    });
    if (write) await this.fault?.('after-reservation');
    let result: ToolResult;
    if (write) {
      let dispatched = false;
      try {
        const current = await this.current(p, true); const latest = await this.store.load(run.view.runId);
        await this.assertCapability(latest, name);
        if (latest.cancelled || signal?.aborted) throw new PolicyError('CANCELLED');
        dispatched = true;
        result = validateHostResult(operationId, await abortable(this.host.write(current, prepared.request, signal), signal));
        await this.fault?.('after-host-write');
      } catch (e) {
        // Once entered, a throwing host may have committed, even when its exception looks like a policy error.
        result = !dispatched && e instanceof PolicyError ? { status: 'denied', code: e.code, message: e.code }
          : { status: 'outcome-unknown', operationId, message: 'Host write may have completed. Query the same operation; never blindly retry.' };
      }
    } else result = { status: 'succeeded', operationId, receiptId: randomUUID(), data: { ...await this.host.read(p, prepared.request.targetId, run.release?.configuration.behavior) } };
    result = await this.record(run.view.runId, operationId, result);
    if (write) await this.fault?.('after-receipt');
    return result;
  }
  async record(runId: string, operationId: string, result: ToolResult, reconcile = false): Promise<ToolResult> {
    return this.store.update(runId, async (r, c) => {
      const row = (await c.query('SELECT result FROM ae_operations_v1 WHERE id=$1 AND run_id=$2', [operationId, runId])).rows[0];
      if (!row) throw new PolicyError('OPERATION_NOT_FOUND');
      if (reconcile && (r.pending?.request.operationId !== operationId || !['outcome-unknown', 'manual-review', 'reconciling', 'succeeded'].includes(r.view.status))) throw new PolicyError('RUN_NOT_UNKNOWN');
      // A confirmed receipt is monotonic. Delayed unknown/cancel responses cannot erase it.
      const canonical = row.result?.status === 'succeeded' ? row.result as ToolResult : result;
      await c.query('UPDATE ae_operations_v1 SET result=$2 WHERE id=$1', [operationId, JSON.stringify(canonical)]);
      if (!r.view.receipts.some(v => 'operationId' in v && v.operationId === operationId && v.status === canonical.status)) { r.view.receipts.push(canonical); this.store.event(r, 'tool-result', { ...canonical }); }
      if (reconcile) {
        this.store.status(r, canonical.status === 'succeeded' ? 'succeeded' : 'manual-review');
        r.view.message = canonical.status === 'succeeded' ? 'The host receipt confirms completion. No write was retried.' : 'The outcome remains unknown; manual host reconciliation is required. No write was retried.';
      }
      return canonical;
    });
  }
}

/** Stop waiting, not the external effect. The host must retain/query its operation receipt. */
export async function abortable<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  let remove = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    const stop = () => reject(new PolicyError('CANCELLED'));
    if (signal.aborted) stop(); else { signal.addEventListener('abort', stop, { once: true }); remove = () => signal.removeEventListener('abort', stop); }
  });
  try { return await Promise.race([pending, aborted]); } finally { remove(); }
}

export function validateHostResult(operationId: string, value: unknown): ToolResult { const result = ToolResultSchema.parse(value); if ('operationId' in result && result.operationId !== operationId) throw new PolicyError('HOST_RECEIPT_OPERATION_MISMATCH'); return result; }
