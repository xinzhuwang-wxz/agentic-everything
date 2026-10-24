import { z } from 'zod';

const readArgs = z.strictObject({ ticketId: z.string().min(1).max(100) });
const writeArgs = z.strictObject({ ticketId: z.string().min(1).max(100), priority: z.enum(['low', 'high']), expectedVersion: z.number().int().positive() });
const assigneeArgs = z.strictObject({ ticketId: z.string().min(1).max(100), assigneeId: z.string().min(1).max(100), expectedVersion: z.number().int().positive() });

/** Reviewed fixture definitions shared by the catalog, broker and official SDK adapter. */
export const ticketToolDefinitions = Object.freeze({
  read_ticket: Object.freeze({ parameters: readArgs, risk: 'read' as const, approvalRequired: false, source: 'fixture-host-v1', description: 'Read one accessible ticket using the authenticated host identity.' }),
  change_ticket_priority: Object.freeze({ parameters: writeArgs, risk: 'write' as const, approvalRequired: true, source: 'fixture-host-v1', description: 'Propose a ticket priority change at its exact current version; a trusted user approval is required before execution.' }),
  read_ticket_members: Object.freeze({ parameters: readArgs, risk: 'read' as const, approvalRequired: false, source: 'fixture-ticket-members-v1', description: 'Read host members in the authenticated tenant, scoped to one accessible ticket.' }),
  change_ticket_assignee: Object.freeze({ parameters: assigneeArgs, risk: 'write' as const, approvalRequired: true, source: 'fixture-ticket-members-v1', description: 'Assign an accessible ticket to an active member of its tenant at its exact current version; trusted user approval is required.' }),
});
export type TicketToolName = keyof typeof ticketToolDefinitions;
