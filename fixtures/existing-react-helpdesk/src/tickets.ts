export type Ticket = { id: string; tenantId: string; title: string; priority: 'low' | 'high'; version: number };
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
