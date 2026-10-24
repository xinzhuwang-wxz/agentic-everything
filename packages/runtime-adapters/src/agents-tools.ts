import { tool } from '@openai/agents';
import type { JsonObject } from '@ae/contracts';
import { ticketToolDefinitions, type TicketToolName } from '@ae/capabilities';
import { PolicyError } from '@ae/policy';

export type GovernedToolExecutor = (name: string, args: JsonObject, callId: string) => Promise<string>;

/** Adapt the reviewed registry to the official SDK, without owning authorization or execution. */
export function createAgentsTools(selectedIds: readonly string[], execute: GovernedToolExecutor) {
  if (new Set(selectedIds).size !== selectedIds.length) throw new PolicyError('DUPLICATE_CAPABILITY');
  for (const name of selectedIds) if (!Object.hasOwn(ticketToolDefinitions, name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
  return selectedIds.map(name => {
    const definition = ticketToolDefinitions[name as TicketToolName];
    return tool({ name, description: definition.description, parameters: definition.parameters,
      needsApproval: definition.approvalRequired, errorFunction: null,
      execute: (args, _context, details) => {
        const callId = details?.toolCall?.callId;
        if (!callId) throw new PolicyError('TOOL_CALL_ID_REQUIRED');
        return execute(name, args, callId);
      },
    });
  });
}
