// This is the ordinary host read endpoint, not an AE capability or browser-owned database.
export interface TicketView { id: string; title: string; priority: 'low' | 'high'; version: number }
export async function fetchTicket(ticketId: string): Promise<TicketView> {
  const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Ticket request failed (${response.status})`);
  const payload = await response.json() as { ticket: TicketView };
  return payload.ticket;
}
