import React from 'react';
import { readTicket } from './tickets.js';

export default function App() {
  const ticket = readTicket('tenant-a', 'ticket-1');
  return <main><h1>Helpdesk</h1><article><h2>{ticket.title}</h2><p>{ticket.priority}</p></article></main>;
}
