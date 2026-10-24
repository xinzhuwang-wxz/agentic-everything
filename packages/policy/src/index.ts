import { createHash, randomUUID } from 'node:crypto';
import type { ApprovalBinding, ApprovalDecision, JsonObject, Principal, ToolRequest } from '@ae/contracts';

/** Canonical JSON is also the exact-byte boundary for approval and IPC evidence. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}
export function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function samePrincipal(a: Principal, b: Principal): boolean {
  return a.tenantId === b.tenantId && a.applicationId === b.applicationId && a.subjectId === b.subjectId;
}
export class PolicyError extends Error {
  constructor(public readonly code: string, message: string = code) { super(message); }
}
export function authorize(principal: Principal, write: boolean): void {
  if (!principal.roles.includes(write ? 'editor' : 'viewer') && !principal.roles.includes('editor')) throw new PolicyError('ROLE_DENIED');
  if (!principal.scopes.includes(write ? 'tickets:write' : 'tickets:read')) throw new PolicyError('SCOPE_DENIED');
}
export interface ApprovalView { binding: ApprovalBinding; expectedHash: string; preview: JsonObject }
interface RecordEntry { view: ApprovalView; state: 'pending' | 'approved' | 'rejected' | 'consumed' }
/** Qualification-only synchronous ledger. Not a distributed transaction or durable store. */
export class InMemoryApprovalLedger {
  private records = new Map<string, RecordEntry>();
  constructor(private now: () => number = Date.now) {}
  create(principal: Principal, request: ToolRequest, releaseId: string, preview: JsonObject, ttlMs = 300_000): ApprovalView {
    const binding: ApprovalBinding = {
      schemaVersion: '1', approvalId: randomUUID(), runId: request.runId, invocationId: request.invocationId,
      principal: structuredClone(principal), capabilityId: request.capabilityId, capabilityVersion: request.capabilityVersion,
      argumentsHash: digest(request.arguments), targetId: request.targetId,
      ...(request.expectedResourceVersion ? { resourceVersion: request.expectedResourceVersion } : {}),
      policyVersion: 'tickets-policy-v1', releaseId, operationId: request.operationId,
      expiresAt: new Date(this.now() + ttlMs).toISOString(),
    };
    const view = { binding, expectedHash: digest(binding), preview: structuredClone(preview) };
    this.records.set(binding.approvalId, { view, state: 'pending' });
    return structuredClone(view);
  }
  decide(principal: Principal, decision: ApprovalDecision): ApprovalView {
    const entry = this.entry(decision.approvalId);
    this.check(entry, principal);
    if (decision.expectedHash !== entry.view.expectedHash) throw new PolicyError('APPROVAL_HASH_MISMATCH');
    if (entry.state !== 'pending') throw new PolicyError('APPROVAL_ALREADY_DECIDED');
    entry.state = decision.decision === 'approve' ? 'approved' : 'rejected';
    return structuredClone(entry.view);
  }
  consume(approvalId: string, principal: Principal, request: ToolRequest, releaseId: string): void {
    const entry = this.entry(approvalId);
    this.check(entry, principal);
    const binding = entry.view.binding;
    if (entry.state !== 'approved') throw new PolicyError('APPROVAL_NOT_AVAILABLE');
    if (binding.runId !== request.runId || binding.invocationId !== request.invocationId ||
      binding.argumentsHash !== digest(request.arguments) || binding.targetId !== request.targetId ||
      binding.resourceVersion !== request.expectedResourceVersion || binding.operationId !== request.operationId ||
      binding.capabilityId !== request.capabilityId || binding.capabilityVersion !== request.capabilityVersion ||
      binding.releaseId !== releaseId || binding.policyVersion !== 'tickets-policy-v1') throw new PolicyError('APPROVAL_BINDING_MISMATCH');
    // No await between check and consume: atomic only within this single-process fixture.
    entry.state = 'consumed';
  }
  private entry(id: string): RecordEntry { const entry = this.records.get(id); if (!entry) throw new PolicyError('APPROVAL_NOT_FOUND'); return entry; }
  private check(entry: RecordEntry, principal: Principal): void {
    if (!samePrincipal(entry.view.binding.principal, principal)) throw new PolicyError('APPROVAL_SUBJECT_MISMATCH');
    if (Date.parse(entry.view.binding.expiresAt) <= this.now()) throw new PolicyError('APPROVAL_EXPIRED');
  }
}
