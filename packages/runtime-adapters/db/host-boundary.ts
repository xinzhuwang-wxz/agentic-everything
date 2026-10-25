import type { BehaviorSelection, CapabilityVersion, ConversationContext, JsonObject, Principal, ToolRequest, ToolResult } from '@ae/contracts';
import { AuthorizedTicketHost, ticketCapabilities, ticketCapabilityDefinitions, parseCapabilityArguments, type CapabilityDefinitions, type CapabilityTarget, type Member, type PreparedTarget, type Ticket, type TrustedCapabilityHost } from '@ae/capabilities';
import { authorize, PolicyError } from '@ae/policy';

export interface DurableCapabilityAuthority {
  readonly policyVersion: string;
  readonly definitions: CapabilityDefinitions;
  readonly toolOrder?: readonly string[];
  authorize(principal: Principal, capabilityId?: string, write?: boolean): Promise<void>;
  catalog(principal: Principal): Promise<CapabilityVersion[]>;
  referenceTarget(capabilityId: string, args: JsonObject): string;
  prepareTarget(principal: Principal, capabilityId: string, args: JsonObject): Promise<PreparedTarget>;
  assertReadable(principal: Principal, target: CapabilityTarget): Promise<void>;
  readResult(principal: Principal, request: ToolRequest, behavior?: BehaviorSelection): Promise<JsonObject>;
}
/** A host owns its transaction/receipt store. AE never supplies its business database. */
export interface DurableHost {
  readonly behaviorRegistryHash?: string;
  readonly capabilityAuthority?: DurableCapabilityAuthority;
  currentPrincipal(principal: Principal): Promise<Principal>;
  conversationHistory?: {
    parseContext(reference: unknown): ConversationContext;
    authority(principal: Principal, context: ConversationContext): Promise<string>;
    authorizeTarget(principal: Principal, context: ConversationContext, target: CapabilityTarget): Promise<void>;
  };
  write(principal: Principal, request: ToolRequest, signal?: AbortSignal): Promise<ToolResult>;
  query(principal: Principal, operationId: string): Promise<ToolResult>;
}
/** Legacy ticket host port remains source-compatible; only this adapter knows ticket fields. */
export interface DurableTicketHost extends DurableHost {
  currentCapabilities?(principal: Principal): Promise<CapabilityVersion[]>;
  read(principal: Principal, ticketId: string, behavior?: BehaviorSelection): Promise<Ticket>;
  listMembers?(principal: Principal, ticketId: string): Promise<Member[]>;
}
const membersCapability = (name: string) => name === 'read_ticket_members' || name === 'change_ticket_assignee';
export function durableAuthority(host: DurableHost): DurableCapabilityAuthority {
  if (host.capabilityAuthority) return host.capabilityAuthority;
  const ticketHost = host as DurableTicketHost;
  if (typeof ticketHost.read !== 'function') throw new PolicyError('HOST_CAPABILITY_AUTHORITY_REQUIRED');
  const facade = async (principal: Principal, id: string, members = false, behavior?: BehaviorSelection) => {
    const ticket = await ticketHost.read(principal, id, behavior);
    const list = members ? await ticketHost.listMembers?.(principal, id) : undefined;
    if (members && !list) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    return new AuthorizedTicketHost({ readTicket: () => ticket, changePriority: () => { throw Error('Planning facade cannot write'); },
      ...(list ? { listMembers: () => list, changeAssignee: () => { throw Error('Planning facade cannot write'); } } : {}) });
  };
  return {
    policyVersion: 'tickets-policy-v1', definitions: ticketCapabilityDefinitions, toolOrder: ['read_ticket', 'read_ticket_members', 'change_ticket_assignee', 'change_ticket_priority'],
    async authorize(principal, name, write = false) { authorize(principal, name ? ticketCapabilityDefinitions[name]?.capability.risk !== 'read' : write); },
    async catalog(principal) {
      const live = ticketHost.currentCapabilities ? await ticketHost.currentCapabilities(principal) : ticketCapabilities.filter(c => ['read_ticket', 'change_ticket_priority'].includes(c.capabilityId));
      return ticketCapabilities.filter(c => !membersCapability(c.capabilityId) || typeof ticketHost.listMembers === 'function').filter(c => live.some(h => h.capabilityId === c.capabilityId && h.version === c.version && h.bindingHash === c.bindingHash));
    },
    referenceTarget(name, args) { return String(parseCapabilityArguments(ticketCapabilityDefinitions, name, args).ticketId); },
    async prepareTarget(principal, name, args) {
      if (typeof args.ticketId !== 'string') throw new PolicyError('INVALID_ARGUMENTS');
      return (await facade(principal, args.ticketId, membersCapability(name))).prepareTarget(principal, name, args);
    },
    async assertReadable(principal, target) { (await facade(principal, target.targetId, membersCapability(target.capabilityId))).assertReadable(principal, target); },
    async readResult(principal, request, behavior) { return (await facade(principal, request.targetId, membersCapability(request.capabilityId), behavior)).readResult(principal, request); },
  };
}
/** Adapter composition, not a second scheduler/runtime. Current host methods remain live calls. */
export function asDurableHost(host: TrustedCapabilityHost): DurableHost {
  return {
    ...(host.behaviorRegistryHash ? { behaviorRegistryHash: host.behaviorRegistryHash } : {}),
    currentPrincipal: async p => host.current(p),
    capabilityAuthority: {
      policyVersion: host.policyVersion, definitions: host.definitions,
      async authorize(p, name, write = false) { if (name) host.authorizeCapability(p, name); else host.current(p, write); },
      async catalog(p) { return Object.values(host.definitions).map(d => d.capability).filter(c => { try { if (!host.supports(c.capabilityId)) return false; host.authorizeCapability(p, c.capabilityId); return true; } catch { return false; } }); },
      referenceTarget(name, args) { return host.referenceTarget(name, args); },
      async prepareTarget(p, name, args) { return host.prepareTarget(p, name, args); },
      async assertReadable(p, target) { host.assertReadable(p, target); },
      async readResult(p, request, behavior) { return host.readResult(p, request, behavior); },
    },
    async write(p, request) { return host.write(p, request); },
    async query(p, operationId) { return host.query(p, operationId); },
  };
}
