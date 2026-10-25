import { projectTicketBehavior, syntheticTitleCatalog } from './behavior.js';
export { projectTicketBehavior, syntheticTitleCatalog, syntheticTitleBaseline, assertTicketBehavior } from './behavior.js';
import { z } from 'zod';
import { ticketToolDefinitions, type TicketToolName } from './definitions.js';
import { parseCapabilityArguments, prepareCapabilityRequest, validateCapabilityResult, validateDefinitions, type CapabilityDefinitions, type CapabilityTarget, type PreparedTarget, type TrustedCapabilityHost } from './host-boundary.js';
export * from './host-boundary.js';
export { ticketToolDefinitions, type TicketToolName } from './definitions.js';
import { randomUUID } from 'node:crypto';
import type { BehaviorSelection, CapabilityVersion, JsonObject, Principal, ToolRequest, ToolResult } from '@ae/contracts';
import { authorize, digest, InMemoryApprovalLedger, PolicyError, samePrincipal, type ApprovalView } from '@ae/policy';

export interface Ticket { id: string; tenantId: string; title: string; priority: 'low' | 'high'; version: number; assigneeId?: string }
export interface Member { id: string; tenantId: string; displayName: string; active: boolean }
export interface TicketBusinessPort {
  readTicket(tenantId: string, ticketId: string): Ticket;
  changePriority(tenantId: string, ticketId: string, priority: 'low' | 'high', expectedVersion: number): Ticket;
  listMembers?(tenantId: string, ticketId: string): Member[];
  changeAssignee?(tenantId: string, ticketId: string, assigneeId: string, expectedVersion: number): Ticket;
}
const writeArgs = ticketToolDefinitions.change_ticket_priority.parameters;
const assigneeArgs = ticketToolDefinitions.change_ticket_assignee.parameters;
export const ticketCapabilities: CapabilityVersion[] = Object.entries(ticketToolDefinitions).map(([name, definition]) => {
  return {
    schemaVersion: '1', capabilityId: name, version: '1', description: definition.description,
    inputSchema: z.toJSONSchema(definition.parameters) as JsonObject, outputSchema: {}, risk: definition.risk,
    requiredScopes: [definition.risk === 'read' ? 'tickets:read' : 'tickets:write'], sourceRevision: definition.source, bindingHash: digest({ name, version: '1', source: definition.source }),
    approvalRequired: definition.approvalRequired, idempotency: 'operation-key', supportsOutcomeQuery: true, timeoutMs: 10_000,
  };
});
export const ticketCapabilityDefinitions: CapabilityDefinitions = validateDefinitions(Object.fromEntries(ticketCapabilities.map(capability => [capability.capabilityId, { capability, parameters: ticketToolDefinitions[capability.capabilityId as TicketToolName].parameters }])));
const usesMembers = (name: string): boolean => name === 'read_ticket_members' || name === 'change_ticket_assignee';
function parseArguments(name: string, args: JsonObject) {
  if (!Object.hasOwn(ticketToolDefinitions, name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
  const parsed = ticketToolDefinitions[name as TicketToolName].parameters.safeParse(args);
  if (!parsed.success) throw new PolicyError('INVALID_ARGUMENTS');
  return parsed.data;
}

/** Host adapter: retains ordinary permissions independently of model/broker approval. */
export class AuthorizedTicketHost implements TrustedCapabilityHost {
  readonly policyVersion = 'tickets-policy-v1';
  readonly definitions = ticketCapabilityDefinitions;
  readonly behaviorRegistryHash = syntheticTitleCatalog.registryHash;
  private operations = new Map<string, { hash: string; targetId: string; result: ToolResult }>();
  private writes = 0;
  constructor(private business: TicketBusinessPort, private currentPrincipal: (principal: Principal) => Principal = p => p) {}
  private key(p: Principal, operationId: string): string { return JSON.stringify([p.tenantId, p.applicationId, p.subjectId, operationId]); }
  supports(capabilityId: string): boolean {
    if (capabilityId === 'read_ticket_members') return typeof this.business.listMembers === 'function';
    if (capabilityId === 'change_ticket_assignee') return typeof this.business.listMembers === 'function' && typeof this.business.changeAssignee === 'function';
    return capabilityId === 'read_ticket' || capabilityId === 'change_ticket_priority';
  }
  current(principal: Principal, write = false): Principal {
    // The resolver may refresh rights, never replace or mutate the authenticated identity.
    const identity = structuredClone(principal);
    const p = this.currentPrincipal(structuredClone(identity));
    if (!samePrincipal(identity, p)) throw new PolicyError('PRINCIPAL_CHANGED');
    authorize(p, write); return structuredClone(p);
  }
  read(principal: Principal, id: string, behavior?: BehaviorSelection): Ticket {
    const p = this.current(principal);
    const ticket = this.business.readTicket(p.tenantId, id);
    if (ticket.tenantId !== p.tenantId) throw new PolicyError('TENANT_DENIED');
    if (ticket.id !== id) throw new PolicyError('RESOURCE_DENIED');
    return projectTicketBehavior(ticket, behavior);
  }
  members(principal: Principal, ticketId: string): Member[] {
    const p = this.current(principal);
    this.read(p, ticketId);
    if (!this.business.listMembers) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    const members = this.business.listMembers(p.tenantId, ticketId);
    // Fail closed on an adapter scope violation rather than leaking even one foreign member.
    if (members.some(member => member.tenantId !== p.tenantId)) throw new PolicyError('TENANT_DENIED');
    return members.map(({ id, tenantId, displayName, active }) => ({ id, tenantId, displayName, active }));
  }
  assignee(principal: Principal, ticketId: string, assigneeId: string): Member {
    const member = this.members(principal, ticketId).find(candidate => candidate.id === assigneeId);
    if (!member || member.active !== true) throw new PolicyError('ASSIGNEE_DENIED');
    return member;
  }
  write(principal: Principal, request: ToolRequest): ToolResult {
    const p = this.current(principal);
    if (!this.supports(request.capabilityId) || (request.capabilityId !== 'change_ticket_priority' && request.capabilityId !== 'change_ticket_assignee')) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    const args = parseArguments(request.capabilityId, request.arguments) as z.infer<typeof writeArgs> | z.infer<typeof assigneeArgs>;
    if (request.capabilityVersion !== '1' || request.targetId !== args.ticketId || (request.expectedResourceVersion !== undefined && request.expectedResourceVersion !== String(args.expectedVersion))) throw new PolicyError('REQUEST_BINDING_MISMATCH');
    const key = this.key(p, request.operationId), hash = digest({ capabilityId: request.capabilityId, arguments: request.arguments }), existing = this.operations.get(key);
    if (existing) { if (existing.hash !== hash) throw new PolicyError('IDEMPOTENCY_CONFLICT'); this.read(p, existing.targetId); return structuredClone(existing.result); }
    const current = this.read(p, args.ticketId);
    this.current(p, true);
    if (current.version !== args.expectedVersion) throw new PolicyError('RESOURCE_VERSION_CONFLICT');
    if ('assigneeId' in args) {
      this.assignee(p, args.ticketId, args.assigneeId);
      this.current(p, true);
    }
    let ticket: Ticket;
    try {
      // The ordinary host mutation must enforce membership and version atomically too.
      ticket = 'assigneeId' in args
        ? this.business.changeAssignee!(p.tenantId, args.ticketId, args.assigneeId, args.expectedVersion)
        : this.business.changePriority(p.tenantId, args.ticketId, args.priority, args.expectedVersion);
    } catch (error) {
      // An exception after crossing this boundary cannot prove that no business effect committed.
      throw new Error('Host mutation returned no authoritative receipt', { cause: error });
    }
    this.writes++;
    const result: ToolResult = { status: 'succeeded', operationId: request.operationId, receiptId: randomUUID(), data: { ...ticket } };
    this.operations.set(key, { hash, targetId: args.ticketId, result });
    return structuredClone(result);
  }
  query(principal: Principal, operationId: string, request?: ToolRequest): ToolResult {
    const p = this.current(principal);
    const existing = this.operations.get(this.key(p, operationId));
    if (existing) {
      if (request && (request.operationId !== operationId || existing.hash !== digest({ capabilityId: request.capabilityId, arguments: request.arguments }))) throw new PolicyError('IDEMPOTENCY_CONFLICT');
      this.read(p, existing.targetId);
    }
    return structuredClone(existing?.result ?? { status: 'outcome-unknown', operationId, message: 'No authoritative host receipt; manual reconciliation required.' });
  }
  authorizeCapability(principal: Principal, name: string): void {
    if (!this.supports(name) || !Object.hasOwn(this.definitions, name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    this.current(principal, this.definitions[name]!.capability.risk !== 'read');
  }
  referenceTarget(name: string, args: JsonObject): string { return parseArguments(name, args).ticketId; }
  prepareTarget(principal: Principal, name: string, args: JsonObject): PreparedTarget {
    this.authorizeCapability(principal, name);
    const parsed = parseArguments(name, args);
    const write = this.definitions[name]!.capability.risk !== 'read';
    const ticket = this.read(principal, parsed.ticketId);
    if (write && (!('expectedVersion' in parsed) || ticket.version !== parsed.expectedVersion)) throw new PolicyError('RESOURCE_VERSION_CONFLICT');
    if (name === 'read_ticket_members') this.members(principal, ticket.id);
    let preview: JsonObject = { ticketId: ticket.id };
    if (name === 'change_ticket_priority') preview = { ticketId: ticket.id, title: ticket.title, before: ticket.priority, after: (parsed as z.infer<typeof writeArgs>).priority, version: ticket.version };
    if (name === 'change_ticket_assignee') {
      const member = this.assignee(principal, ticket.id, (parsed as z.infer<typeof assigneeArgs>).assigneeId);
      preview = { ticketId: ticket.id, title: ticket.title, before: ticket.assigneeId ?? null, after: member.id, assigneeName: member.displayName, version: ticket.version };
    }
    return { targetId: ticket.id, ...(write ? { expectedResourceVersion: String(ticket.version) } : {}), preview };
  }
  assertReadable(principal: Principal, target: CapabilityTarget): void {
    this.read(principal, target.targetId);
    if (usesMembers(target.capabilityId)) this.members(principal, target.targetId);
  }
  readResult(principal: Principal, request: ToolRequest, behavior?: BehaviorSelection): JsonObject {
    return request.capabilityId === 'read_ticket_members' ? { ticketId: request.targetId, members: this.members(principal, request.targetId).map(member => ({ ...member })) } : { ...this.read(principal, request.targetId, behavior) };
  }
  get mutationCount(): number { return this.writes; }
}
export interface PreparedTool { request: ToolRequest; preview: JsonObject; write: boolean }
export interface BrokerAudit { timestamp: string; type: string; runId: string; invocationId: string; code?: string; operationId: string }
/** Single-process business ledger, not a scheduler, queue, or durable workflow implementation. */
export class ToolBroker<Host extends TrustedCapabilityHost = AuthorizedTicketHost> {
  readonly definitions: CapabilityDefinitions;
  readonly approvals: InMemoryApprovalLedger;
  readonly audit: BrokerAudit[] = [];
  private ledger = new Map<string, { hash: string; result: ToolResult }>();
  constructor(readonly host: Host, options: { approvals?: InMemoryApprovalLedger; loseWriteResponse?: boolean; supportsOutcomeQuery?: boolean } = {}) { this.definitions = validateDefinitions(host.definitions); this.approvals = options.approvals ?? new InMemoryApprovalLedger(Date.now, host.policyVersion); if (this.approvals.policyVersion !== host.policyVersion) throw new PolicyError('HOST_POLICY_MISMATCH'); this.options = options; }
  private options: { loseWriteResponse?: boolean; supportsOutcomeQuery?: boolean };
  catalog(principal: Principal): CapabilityVersion[] { return Object.values(this.definitions).map(d => d.capability).filter(c => { try { if (!this.host.supports(c.capabilityId)) return false; this.host.authorizeCapability(principal, c.capabilityId); return true; } catch { return false; } }).map(c => structuredClone(c)); }
  prepare(principal: Principal, runId: string, callId: string, name: string, args: JsonObject): PreparedTool {
    if (!this.host.supports(name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    const parsed = parseCapabilityArguments(this.definitions, name, args);
    this.host.authorizeCapability(principal, name);
    const reference = this.host.referenceTarget(name, parsed);
    const target = this.host.prepareTarget(principal, name, parsed);
    if (target.targetId !== reference) throw new PolicyError('HOST_TARGET_BINDING_MISMATCH');
    return prepareCapabilityRequest(principal, runId, callId, this.definitions[name]!, parsed, target);
  }
  requestApproval(principal: Principal, prepared: PreparedTool, releaseId: string): ApprovalView { return this.approvals.create(principal, prepared.request, releaseId, prepared.preview); }
  async execute(principal: Principal, prepared: PreparedTool, releaseId: string, approvalId?: string, signal?: AbortSignal, behavior?: BehaviorSelection): Promise<ToolResult> {
    const request = prepared.request;
    const key = JSON.stringify([principal.tenantId, principal.applicationId, principal.subjectId, request.operationId]);
    const hash = digest(request);
    try {
      if (signal?.aborted) throw new PolicyError('CANCELLED');
      this.host.current(principal);
      this.host.assertReadable(principal, request); // Current host authority, including cached receipts.
      const existing = this.ledger.get(key);
      if (existing) { if (existing.hash !== hash) throw new PolicyError('IDEMPOTENCY_CONFLICT'); return structuredClone(existing.result); }
      // Re-resolve classification, current host authorization, assignee validity and version after approval.
      const current = this.prepare(principal, request.runId, request.invocationId, request.capabilityId, request.arguments);
      if (prepared.write !== current.write || digest(current.request) !== hash) throw new PolicyError('REQUEST_BINDING_MISMATCH');
      if (current.write) {
        if (!approvalId) throw new PolicyError('APPROVAL_REQUIRED');
        this.approvals.consume(approvalId, principal, request, releaseId);
      }
      let result: ToolResult;
      if (current.write) {
        // Mark dispatch before crossing the host boundary. An exception after this point is uncertain, not safely retryable.
        this.ledger.set(key, { hash, result: { status: 'outcome-unknown', operationId: request.operationId, message: 'Write dispatched; receipt not yet established.' } });
        try {
          result = validateCapabilityResult(request.operationId, this.host.write(principal, request));
          if (this.options.loseWriteResponse) throw new Error('Injected lost host response');
        } catch {
          result = { status: 'outcome-unknown', operationId: request.operationId, message: 'Host write outcome unknown. Do not retry; query the operation receipt.' };
        }
      } else result = { status: 'succeeded', operationId: request.operationId, receiptId: randomUUID(), data: this.host.readResult(principal, request, behavior) };
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
    const key = JSON.stringify([principal.tenantId, principal.applicationId, principal.subjectId, prepared.request.operationId]);
    const existing = this.ledger.get(key), hash = digest(prepared.request);
    if (existing && existing.hash !== hash) throw new PolicyError('IDEMPOTENCY_CONFLICT');
    this.host.current(principal);
    this.host.assertReadable(principal, prepared.request);
    if (this.options.supportsOutcomeQuery === false || this.definitions[prepared.request.capabilityId]?.capability.supportsOutcomeQuery !== true) return { status: 'outcome-unknown', operationId: prepared.request.operationId, message: 'Adapter has no outcome query; manual review is required, never retry.' };
    const result = validateCapabilityResult(prepared.request.operationId, this.host.query(principal, prepared.request.operationId, prepared.request));
    if (result.status === 'succeeded') this.ledger.set(key, { hash, result });
    return result;
  }
}

export * from "./python-inventory.js";
