export type Ticket = { id: string; tenantId: string; title: string; priority: 'low' | 'high'; version: number; assigneeId?: string };
const tickets: Ticket[] = [{ id: 'ticket-1', tenantId: 'tenant-a', title: 'Printer offline', priority: 'low', version: 1 }, { id: 'ticket-2', tenantId: 'tenant-b', title: 'Access request', priority: 'low', version: 1 }];
export function readTicket(tenantId: string, ticketId: string): Ticket {
  const ticket = tickets.find(item => item.id === ticketId && item.tenantId === tenantId);
  if (!ticket) throw new Error('Not found');
  return { ...ticket };
}
// This fixture is deliberately not a server or a production identity provider.
// The existing application owns business rules. AE must not turn this function into an unrestricted tool.
export function changePriority(tenantId: string, ticketId: string, priority: Ticket['priority'], expectedVersion: number): Ticket {
  const ticket = tickets.find(item => item.id === ticketId && item.tenantId === tenantId);
  if (!ticket || ticket.version !== expectedVersion) throw new Error('Conflict or not found');
  ticket.priority = priority;
  ticket.version += 1;
  return { ...ticket };
}

export type Member = { id: string; tenantId: string; displayName: string; active: boolean };
const members: Member[] = [
  { id: 'member-a', tenantId: 'tenant-a', displayName: 'Alex', active: true },
  { id: 'member-inactive', tenantId: 'tenant-a', displayName: 'Former member', active: false },
  { id: 'member-b', tenantId: 'tenant-b', displayName: 'Blair', active: true },
];
/** Member visibility is constrained by the ordinary host's accessible ticket. */
export function listMembers(tenantId: string, ticketId: string): Member[] {
  readTicket(tenantId, ticketId);
  return members.filter(member => member.tenantId === tenantId && member.active).map(member => ({ ...member }));
}
export function changeAssignee(tenantId: string, ticketId: string, assigneeId: string, expectedVersion: number): Ticket {
  const ticket = tickets.find(item => item.id === ticketId && item.tenantId === tenantId);
  if (!ticket || ticket.version !== expectedVersion) throw new Error('Conflict or not found');
  if (!members.some(member => member.id === assigneeId && member.tenantId === tenantId && member.active)) throw new Error('Member unavailable');
  ticket.assigneeId = assigneeId;
  ticket.version += 1;
  return { ...ticket };
}
