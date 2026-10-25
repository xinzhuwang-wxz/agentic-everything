import { randomUUID } from 'node:crypto';
import { type BehaviorSelection, type CapabilityVersion, type JsonObject, type Principal, type ToolResult } from '@ae/contracts';
import { validateDefinitions, parseCapabilityArguments, prepareCapabilityRequest, validateCapabilityResult, type CapabilityDefinitions, type CapabilityTarget, type PreparedTool } from '@ae/capabilities';
import { InMemoryApprovalLedger, digest, PolicyError, samePrincipal, type ApprovalView } from '@ae/policy';
import { releasedCatalog } from '@ae/control-plane';
import { PersistentStore, type Queryable, type StoredRun } from './store.js';
import { durableAuthority, type DurableHost, type DurableCapabilityAuthority } from './host-boundary.js';
export { asDurableHost } from './host-boundary.js';
export type { DurableHost, DurableTicketHost, DurableCapabilityAuthority } from './host-boundary.js';
export class PersistentToolBroker<Host extends DurableHost = DurableHost> {
  readonly authority: DurableCapabilityAuthority;
  readonly definitions: CapabilityDefinitions;
  get policyVersion(): string { return this.authority.policyVersion; }
  constructor(readonly store: PersistentStore, readonly host: Host, private fault?: (point: string) => Promise<void>, private liveConversation?: (run: StoredRun, target: { capabilityId: string; targetId: string }, client?: Queryable) => Promise<void>, private reconciledConversation?: (run: StoredRun, client: Queryable) => Promise<void>) { this.authority = durableAuthority(host); this.definitions = validateDefinitions(this.authority.definitions); }
  async current(principal: Principal, write = false): Promise<Principal> { const identity = structuredClone(principal); const p = await this.host.currentPrincipal(structuredClone(identity)); if (!samePrincipal(p, identity)) throw new PolicyError('PRINCIPAL_CHANGED'); await this.authority.authorize(p, undefined, write); return p; }
  async catalog(principal: Principal, run?: StoredRun): Promise<CapabilityVersion[]> {
    const current = await this.current(principal);
    const declared = await this.authority.catalog(structuredClone(current));
    const catalog: CapabilityVersion[] = [];
    for (const definition of Object.values(this.definitions)) {
      const c = definition.capability;
      if (!declared.some(h => h.capabilityId === c.capabilityId && h.version === c.version && h.bindingHash === c.bindingHash)) continue;
      try { await this.authority.authorize(current, c.capabilityId); catalog.push(structuredClone(c)); } catch { /* Denied capabilities never reach the model. */ }
    }
    return run?.release ? releasedCatalog(run.release, current, catalog) : catalog;
  }
  isWrite(name: string): boolean {
    if (!Object.hasOwn(this.definitions, name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    return this.definitions[name]!.capability.risk !== 'read';
  }
  async assertCapability(run: StoredRun, name: string): Promise<void> {
    const current = await this.current(run.principal);
    await this.authority.authorize(current, name);
    if (!(await this.catalog(current, run)).some(c => c.capabilityId === name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
  }
  async assertReadable(principal: Principal, target: CapabilityTarget): Promise<void> { await this.authority.assertReadable(await this.current(principal), target); }
  referenceTarget(name: string, args: JsonObject): string {
    const target = this.authority.referenceTarget(name, parseCapabilityArguments(this.definitions, name, args));
    if (typeof target !== 'string' || !target.trim()) throw new PolicyError('HOST_TARGET_BINDING_MISMATCH');
    return target;
  }
  async prepare(principal: Principal, runId: string, callId: string, name: string, args: JsonObject): Promise<PreparedTool> {
    const parsed = parseCapabilityArguments(this.definitions, name, args);
    const current = await this.current(principal);
    await this.authority.authorize(current, name);
    if (!(await this.catalog(current)).some(c => c.capabilityId === name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    const reference = this.referenceTarget(name, parsed);
    const target = await this.authority.prepareTarget(current, name, parsed);
    if (target.targetId !== reference) throw new PolicyError('HOST_TARGET_BINDING_MISMATCH');
    return prepareCapabilityRequest(current, runId, callId, this.definitions[name]!, parsed, target);
  }
  approval(principal: Principal, prepared: PreparedTool, releaseId: string): ApprovalView {
    return new InMemoryApprovalLedger(Date.now, this.policyVersion).create(principal, prepared.request, releaseId, prepared.preview);
  }
  async execute(run: StoredRun, name: string, args: JsonObject, callId: string, approvalId?: string, signal?: AbortSignal): Promise<ToolResult> {
    if (run.release?.configuration.behavior && this.host.behaviorRegistryHash !== run.release.configuration.behavior.registryHash) throw new PolicyError('HOST_BEHAVIOR_NOT_SUPPORTED');
    await this.assertCapability(run, name);
    const write = this.isWrite(name);
    const p = await this.current(run.principal);
    const operationId = digest({ runId: run.view.runId, callId, tenant: p.tenantId, application: p.applicationId });
    const existing = (await this.store.pool.query('SELECT * FROM ae_operations_v1 WHERE id=$1', [operationId])).rows[0];
    if (existing) {
      const saved = existing.prepared as PreparedTool;
      if (saved.request.capabilityId !== name || digest(saved.request.arguments) !== digest(args)) throw new PolicyError('IDEMPOTENCY_CONFLICT');
      await this.assertReadable(p, saved.request); // Current authority even for cached receipts.
      if (existing.result) return existing.result as ToolResult;
      if (!saved.write) { const result: ToolResult = { status: 'succeeded', operationId, receiptId: randomUUID(), data: await this.readData(p, saved, run.release?.configuration.behavior) }; await this.record(run.view.runId, operationId, result); return result; }
      // Reservation survived a crash: never dispatch again, even if the host has no receipt.
      const result = this.definitions[name]!.capability.supportsOutcomeQuery ? validateHostResult(operationId, await this.host.query(p, operationId)) : { status: 'outcome-unknown' as const, operationId, message: 'Host does not support outcome queries; do not retry.' };
      if (result.status === 'succeeded') await this.record(run.view.runId, operationId, result);
      return result;
    }
    await this.liveConversation?.(run, { capabilityId: name, targetId: this.referenceTarget(name, args) });
    const prepared = await this.prepare(p, run.view.runId, callId, name, args);
    await this.store.update(run.view.runId, async (r, c) => {
      await this.assertCapability(r, name);
      await this.liveConversation?.(r, { capabilityId: name, targetId: prepared.request.targetId }, c);
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
        await this.liveConversation?.(latest, { capabilityId: name, targetId: prepared.request.targetId });
        const dispatchRun = await this.store.load(run.view.runId);
        if (dispatchRun.cancelled || signal?.aborted) throw new PolicyError('CANCELLED');
        dispatched = true;
        result = validateHostResult(operationId, await abortable(this.host.write(current, prepared.request, signal), signal));
        await this.fault?.('after-host-write');
      } catch (e) {
        // Once entered, a throwing host may have committed, even when its exception looks like a policy error.
        result = !dispatched && e instanceof PolicyError ? { status: 'denied', code: e.code, message: e.code }
          : { status: 'outcome-unknown', operationId, message: 'Host write may have completed. Query the same operation; never blindly retry.' };
      }
    } else result = { status: 'succeeded', operationId, receiptId: randomUUID(), data: await this.readData(p, prepared, run.release?.configuration.behavior) };
    result = await this.record(run.view.runId, operationId, result);
    if (write) await this.fault?.('after-receipt');
    return result;
  }
  private async readData(principal: Principal, prepared: PreparedTool, behavior?: BehaviorSelection): Promise<JsonObject> {
    return this.authority.readResult(await this.current(principal), prepared.request, behavior);
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
        if (canonical.status === 'succeeded' && r.conversation && this.reconciledConversation) {
          // A content-policy change must not erase a proven host outcome. Roll back only
          // the optional text projection; current run/history reads will still fail closed.
          await c.query('SAVEPOINT ae_reconciled_history');
          try { await this.reconciledConversation(r, c); }
          catch (error) { await c.query('ROLLBACK TO SAVEPOINT ae_reconciled_history'); if (!(error instanceof PolicyError)) throw error; }
          await c.query('RELEASE SAVEPOINT ae_reconciled_history');
        }
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

export const validateHostResult = validateCapabilityResult;
