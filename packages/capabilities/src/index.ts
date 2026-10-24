import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { CapabilityVersion, JsonObject, Principal, ToolRequest, ToolResult } from '@ae/contracts';
import { authorize, digest, InMemoryApprovalLedger, PolicyError, type ApprovalView } from '@ae/policy';

export interface Ticket { id: string; tenantId: string; title: string; priority: 'low' | 'high'; version: number }
export interface TicketBusinessPort {
  readTicket(tenantId: string, ticketId: string): Ticket;
  changePriority(tenantId: string, ticketId: string, priority: 'low' | 'high', expectedVersion: number): Ticket;
}
const readArgs = z.strictObject({ ticketId: z.string().min(1).max(100) });
const writeArgs = z.strictObject({ ticketId: z.string().min(1).max(100), priority: z.enum(['low', 'high']), expectedVersion: z.number().int().positive() });
const schemas = { read_ticket: readArgs, change_ticket_priority: writeArgs };
export const ticketCapabilities: CapabilityVersion[] = Object.entries(schemas).map(([name, schema]) => ({
  schemaVersion: '1', capabilityId: name, version: '1', description: name === 'read_ticket' ? 'Read one accessible ticket using the authenticated host identity.' : 'Propose a ticket priority change at its exact current version; a trusted user approval is required before execution.',
  inputSchema: z.toJSONSchema(schema) as JsonObject, outputSchema: {}, risk: name === 'read_ticket' ? 'read' : 'write',
  requiredScopes: [name === 'read_ticket' ? 'tickets:read' : 'tickets:write'], sourceRevision: 'fixture-host-v1', bindingHash: digest({ name, version: '1', source: 'fixture-host-v1' }),
  approvalRequired: name !== 'read_ticket', idempotency: 'operation-key', supportsOutcomeQuery: true, timeoutMs: 10_000,
}));

/** Host adapter: retains ordinary permissions independently of model/broker approval. */
export class AuthorizedTicketHost {
  private operations = new Map<string, { hash: string; result: ToolResult }>();
  private writes = 0;
  constructor(private business: TicketBusinessPort, private currentPrincipal: (principal: Principal) => Principal = p => p) {}
  private key(p: Principal, operationId: string): string { return JSON.stringify([p.tenantId, p.applicationId, p.subjectId, operationId]); }
  read(principal: Principal, id: string): Ticket {
    const p = this.currentPrincipal(principal); authorize(p, false);
    const ticket = this.business.readTicket(p.tenantId, id);
    if (ticket.tenantId !== p.tenantId) throw new PolicyError('TENANT_DENIED');
    return structuredClone(ticket);
  }
  write(principal: Principal, request: ToolRequest): ToolResult {
    const p = this.currentPrincipal(principal); authorize(p, true);
    const args = writeArgs.parse(request.arguments);
    const key = this.key(p, request.operationId), hash = digest(request.arguments), existing = this.operations.get(key);
    if (existing) { if (existing.hash !== hash) throw new PolicyError('IDEMPOTENCY_CONFLICT'); return structuredClone(existing.result); }
    this.read(p, args.ticketId);
    const ticket = this.business.changePriority(p.tenantId, args.ticketId, args.priority, args.expectedVersion);
    this.writes++;
    const result: ToolResult = { status: 'succeeded', operationId: request.operationId, receiptId: randomUUID(), data: { ...ticket } };
    this.operations.set(key, { hash, result });
    return structuredClone(result);
  }
  query(principal: Principal, operationId: string): ToolResult {
    authorize(this.currentPrincipal(principal), false);
    return structuredClone(this.operations.get(this.key(principal, operationId))?.result ?? { status: 'outcome-unknown', operationId, message: 'No authoritative host receipt; manual reconciliation required.' });
  }
  get mutationCount(): number { return this.writes; }
}
export interface PreparedTool { request: ToolRequest; preview: JsonObject; write: boolean }
export interface BrokerAudit { timestamp: string; type: string; runId: string; invocationId: string; code?: string; operationId: string }
/** Single-process business ledger, not a scheduler, queue, or durable workflow implementation. */
export class ToolBroker {
  readonly approvals: InMemoryApprovalLedger;
  readonly audit: BrokerAudit[] = [];
  private ledger = new Map<string, { hash: string; result: ToolResult }>();
  constructor(readonly host: AuthorizedTicketHost, options: { approvals?: InMemoryApprovalLedger; loseWriteResponse?: boolean; supportsOutcomeQuery?: boolean } = {}) { this.approvals = options.approvals ?? new InMemoryApprovalLedger(); this.options = options; }
  private options: { loseWriteResponse?: boolean; supportsOutcomeQuery?: boolean };
  catalog(principal: Principal): CapabilityVersion[] { return ticketCapabilities.filter(c => { try { authorize(principal, c.risk !== 'read'); return true; } catch { return false; } }).map(c => structuredClone(c)); }
  prepare(principal: Principal, runId: string, callId: string, name: string, args: JsonObject): PreparedTool {
    if (!Object.hasOwn(schemas, name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    const parsed = schemas[name as keyof typeof schemas].safeParse(args);
    if (!parsed.success) throw new PolicyError('INVALID_ARGUMENTS');
    const write = name === 'change_ticket_priority'; authorize(principal, write);
    const ticket = this.host.read(principal, parsed.data.ticketId);
    if (write && ticket.version !== (parsed.data as z.infer<typeof writeArgs>).expectedVersion) throw new PolicyError('RESOURCE_VERSION_CONFLICT');
    const request: ToolRequest = { schemaVersion: '1', invocationId: callId, runId, capabilityId: name, capabilityVersion: '1', arguments: parsed.data, targetId: ticket.id, ...(write ? { expectedResourceVersion: String(ticket.version) } : {}), operationId: digest({ runId, callId, tenant: principal.tenantId, application: principal.applicationId }) };
    return { request, write, preview: write ? { ticketId: ticket.id, title: ticket.title, before: ticket.priority, after: (parsed.data as z.infer<typeof writeArgs>).priority, version: ticket.version } : { ticketId: ticket.id } };
  }
  requestApproval(principal: Principal, prepared: PreparedTool, releaseId: string): ApprovalView { return this.approvals.create(principal, prepared.request, releaseId, prepared.preview); }
  async execute(principal: Principal, prepared: PreparedTool, releaseId: string, approvalId?: string, signal?: AbortSignal): Promise<ToolResult> {
    const request = prepared.request;
    const key = JSON.stringify([principal.tenantId, principal.applicationId, principal.subjectId, request.operationId]);
    const hash = digest(request);
    try {
      if (signal?.aborted) throw new PolicyError('CANCELLED');
      authorize(principal, prepared.write);
      this.host.read(principal, request.targetId); // Re-authorize even cached receipts after role revocation.
      const existing = this.ledger.get(key);
      if (existing) { if (existing.hash !== hash) throw new PolicyError('IDEMPOTENCY_CONFLICT'); return structuredClone(existing.result); }
      // Re-resolve current host authorization/version after approval; never trust saved page data.
      this.prepare(principal, request.runId, request.invocationId, request.capabilityId, request.arguments);
      if (prepared.write) {
        if (!approvalId) throw new PolicyError('APPROVAL_REQUIRED');
        this.approvals.consume(approvalId, principal, request, releaseId);
      }
      let result: ToolResult;
      if (prepared.write) {
        // Mark dispatch before crossing the host boundary. An exception after this point is uncertain, not safely retryable.
        this.ledger.set(key, { hash, result: { status: 'outcome-unknown', operationId: request.operationId, message: 'Write dispatched; receipt not yet established.' } });
        try {
          result = this.host.write(principal, request);
          if (this.options.loseWriteResponse) throw new Error('Injected lost host response');
        } catch (error) {
          if (error instanceof PolicyError) result = { status: 'denied', code: error.code, message: error.message };
          else result = { status: 'outcome-unknown', operationId: request.operationId, message: 'Host write outcome unknown. Do not retry; query the operation receipt.' };
        }
      } else result = { status: 'succeeded', operationId: request.operationId, receiptId: randomUUID(), data: { ...this.host.read(principal, request.targetId) } };
      this.ledger.set(key, { hash, result });
      this.audit.push({ timestamp: new Date().toISOString(), type: result.status, runId: request.runId, invocationId: request.invocationId, operationId: request.operationId });
      return structuredClone(result);
    } catch (error) {
      const code = error instanceof PolicyError ? error.code : 'HOST_PRECONDITION_FAILED';
      this.audit.push({ timestamp: new Date().toISOString(), type: 'denied', runId: request.runId, invocationId: request.invocationId, operationId: request.operationId, code });
      return { status: 'denied', code, message: code };
    }
  }
  reconcile(principal: Principal, prepared: PreparedTool): ToolResult {
    if (this.options.supportsOutcomeQuery === false) return { status: 'outcome-unknown', operationId: prepared.request.operationId, message: 'Adapter has no outcome query; manual review is required, never retry.' };
    const result = this.host.query(principal, prepared.request.operationId);
    if (result.status === 'succeeded') this.ledger.set(JSON.stringify([principal.tenantId, principal.applicationId, principal.subjectId, prepared.request.operationId]), { hash: digest(prepared.request), result });
    return result;
  }
}
