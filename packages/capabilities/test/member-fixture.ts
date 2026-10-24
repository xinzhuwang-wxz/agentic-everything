import type { Principal } from '@ae/contracts';
import { AuthorizedTicketHost, ToolBroker, type Member, type PreparedTool, type Ticket, type TicketBusinessPort } from '../src/index.js';
import { PolicyError } from '@ae/policy';

export const editor: Principal = { tenantId: 'tenant-a', applicationId: 'helpdesk', subjectId: 'alice', roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] };
export const viewer: Principal = { ...editor, roles: ['viewer'], scopes: ['tickets:read'] };
export function memberFixture(options: { loseWriteResponse?: boolean; supportsOutcomeQuery?: boolean } = {}) {
  const ticket: Ticket = { id: 'ticket-1', tenantId: 'tenant-a', title: '  Printer offline  ', priority: 'low', version: 1 };
  const members: Member[] = [
    { id: 'member-a', tenantId: 'tenant-a', displayName: 'Alex', active: true },
    { id: 'member-other', tenantId: 'tenant-a', displayName: 'Sam', active: true },
    { id: 'member-inactive', tenantId: 'tenant-a', displayName: 'Inactive', active: false },
    { id: 'member-b', tenantId: 'tenant-b', displayName: 'FOREIGN_PRIVATE_NAME', active: true },
  ];
  let rights: Principal | undefined, readable = true, membersReadable = true, leakForeign = false;
  const business: TicketBusinessPort = {
    readTicket(tenantId, ticketId) {
      if (!readable || tenantId !== ticket.tenantId || ticketId !== ticket.id) throw new PolicyError('RESOURCE_DENIED');
      return { ...ticket };
    },
    changePriority(tenantId, ticketId, priority, expectedVersion) {
      business.readTicket(tenantId, ticketId);
      if (ticket.version !== expectedVersion) throw new PolicyError('RESOURCE_VERSION_CONFLICT');
      ticket.priority = priority; ticket.version++; return { ...ticket };
    },
    listMembers(tenantId, ticketId) {
      business.readTicket(tenantId, ticketId);
      if (!membersReadable) throw new PolicyError('MEMBERS_DENIED');
      return members.filter(member => leakForeign || member.tenantId === tenantId).map(member => ({ ...member }));
    },
    changeAssignee(tenantId, ticketId, assigneeId, expectedVersion) {
      business.readTicket(tenantId, ticketId);
      if (ticket.version !== expectedVersion) throw new PolicyError('RESOURCE_VERSION_CONFLICT');
      if (!members.some(member => member.id === assigneeId && member.tenantId === tenantId && member.active)) throw new PolicyError('ASSIGNEE_DENIED');
      ticket.assigneeId = assigneeId; ticket.version++; return { ...ticket };
    },
  };
  const host = new AuthorizedTicketHost(business, principal => structuredClone(rights ?? principal));
  return { host, broker: new ToolBroker(host, options), business, ticket, members,
    rights: (next: Principal) => { rights = next; }, readable: (next: boolean) => { readable = next; },
    membersReadable: (next: boolean) => { membersReadable = next; }, leakForeign: () => { leakForeign = true; },
  };
}
export function prepareAssignee(broker: ToolBroker, callId = 'assign-1'): PreparedTool {
  return broker.prepare(editor, 'run-1', callId, 'change_ticket_assignee', { ticketId: 'ticket-1', assigneeId: 'member-a', expectedVersion: 1 });
}
export function approveAssignee(broker: ToolBroker, prepared = prepareAssignee(broker)) {
  const approval = broker.requestApproval(editor, prepared, 'release-1');
  broker.approvals.decide(editor, { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, decision: 'approve' });
  return { prepared, approvalId: approval.binding.approvalId, approval };
}
