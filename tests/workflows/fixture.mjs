import { ticketCapabilities } from '@ae/capabilities';
const pin = id => { const capability = ticketCapabilities.find(value => value.capabilityId === id); return { capabilityId: id, version: capability.version, bindingHash: capability.bindingHash }; };
export const definition = (version = 1) => ({ schemaVersion: '1', workflowId: 'ticket-triage', version, name: `Controlled priority triage v${version}`, entry: 'read', maxElapsedMs: 60000, nodes: [
  { id: 'read', kind: 'read', capability: pin('read_ticket'), arguments: { ticketId: { kind: 'input', path: ['ticketId'] } }, next: 'branch', retry: { maxAttempts: 3, delayMs: 5 } },
  { id: 'branch', kind: 'branch', value: { kind: 'result', node: 'read', path: ['priority'] }, equals: version === 1 ? 'low' : 'high', then: 'write', else: 'skip' },
  { id: 'write', kind: 'write', capability: pin('change_ticket_priority'), arguments: { ticketId: { kind: 'input', path: ['ticketId'] }, expectedVersion: { kind: 'result', node: 'read', path: ['version'] }, priority: { kind: 'literal', value: 'high' } }, next: 'done' },
  { id: 'done', kind: 'end', message: 'The approved host operation completed.' },
  { id: 'skip', kind: 'end', message: 'No change is needed.' },
] });
