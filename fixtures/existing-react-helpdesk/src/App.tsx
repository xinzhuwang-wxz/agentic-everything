import React, { useCallback, useEffect, useState } from 'react';
import { fetchTicket, type TicketView } from './api.js';

export default function App() {
  const [ticket, setTicket] = useState<TicketView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshTicket = useCallback(async () => {
    try { setTicket(await fetchTicket('ticket-1')); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Ticket could not be loaded'); }
  }, []);
  useEffect(() => { void refreshTicket(); }, [refreshTicket]);
  return <main><h1>Helpdesk</h1>
    <button type="button" onClick={() => void refreshTicket()}>Refresh ticket</button>
    {error && <p role="alert">{error}</p>}
    {!ticket && !error && <p>Loading ticket…</p>}
    {ticket && <article aria-label="Original ticket details"><h2>{ticket.title}</h2><p>Priority: <strong data-testid="host-priority">{ticket.priority}</strong></p><p>Assignee: <span data-testid="host-assignee">{ticket.assigneeId ?? 'Unassigned'}</span></p><p>Version: <span data-testid="host-version">{ticket.version}</span></p></article>}
  </main>;
}
