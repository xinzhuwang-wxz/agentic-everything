import { z } from 'zod';
import { SchemaVersion, Sha256 } from './transformation.js';

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]));
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
export type JsonObject = z.infer<typeof JsonObjectSchema>;
export const PrincipalSchema = z.strictObject({ tenantId: z.string().min(1), applicationId: z.string().min(1), subjectId: z.string().min(1), roles: z.array(z.string().min(1)), scopes: z.array(z.string().min(1)) });
export type Principal = z.infer<typeof PrincipalSchema>;
export const CapabilityVersionSchema = z.strictObject({
  schemaVersion: SchemaVersion, capabilityId: z.string().min(1), version: z.string().min(1),
  description: z.string(), inputSchema: JsonObjectSchema, outputSchema: JsonObjectSchema,
  risk: z.enum(['read', 'write', 'external-send']), requiredScopes: z.array(z.string()),
  sourceRevision: z.string().min(1), bindingHash: Sha256, approvalRequired: z.boolean(),
  idempotency: z.enum(['none', 'operation-key']), supportsOutcomeQuery: z.boolean(), timeoutMs: z.number().int().positive(),
});
export type CapabilityVersion = z.infer<typeof CapabilityVersionSchema>;
export const ToolRequestSchema = z.strictObject({
  schemaVersion: SchemaVersion, invocationId: z.string().min(1), runId: z.string().min(1),
  capabilityId: z.string().min(1), capabilityVersion: z.string().min(1), arguments: JsonObjectSchema,
  targetId: z.string().min(1), expectedResourceVersion: z.string().optional(), operationId: z.string().min(1),
});
export type ToolRequest = z.infer<typeof ToolRequestSchema>;
export const ApprovalBindingSchema = z.strictObject({
  schemaVersion: SchemaVersion, approvalId: z.string().min(1), runId: z.string().min(1), invocationId: z.string().min(1),
  principal: PrincipalSchema, capabilityId: z.string().min(1), capabilityVersion: z.string().min(1),
  argumentsHash: Sha256, targetId: z.string().min(1), resourceVersion: z.string().optional(),
  policyVersion: z.string().min(1), releaseId: z.string().min(1), operationId: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type ApprovalBinding = z.infer<typeof ApprovalBindingSchema>;
export const ApprovalDecisionSchema = z.strictObject({ approvalId: z.string().min(1), decision: z.enum(['approve', 'reject']), expectedHash: Sha256 });
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export const ToolResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('succeeded'), operationId: z.string(), receiptId: z.string(), data: JsonValueSchema }),
  z.strictObject({ status: z.literal('denied'), code: z.string(), message: z.string() }),
  z.strictObject({ status: z.literal('failed'), code: z.string(), message: z.string(), retryable: z.boolean() }),
  z.strictObject({ status: z.literal('outcome-unknown'), operationId: z.string(), message: z.string() }),
]);
export type ToolResult = z.infer<typeof ToolResultSchema>;
export const RunStatusSchema = z.enum(['queued', 'running', 'awaiting-approval', 'succeeded', 'failed', 'rejected', 'cancelled', 'outcome-unknown', 'reconciling', 'manual-review']);
export type RunStatus = z.infer<typeof RunStatusSchema>;
export const RunEventSchema = z.strictObject({
  schemaVersion: SchemaVersion, eventId: z.string().min(1), sequence: z.number().int().nonnegative(), runId: z.string().min(1),
  type: z.enum(['run-status', 'assistant-message', 'tool-request', 'approval-required', 'tool-result']),
  timestamp: z.iso.datetime(), payload: JsonObjectSchema,
});
export type RunEvent = z.infer<typeof RunEventSchema>;
// Trusted principal is supplied by the broker, never inside model-generated arguments.
export interface CapabilityAdapter {
  invoke(request: ToolRequest, principal: Principal, signal?: AbortSignal): Promise<ToolResult>;
  queryOutcome?(operationId: string, principal: Principal): Promise<ToolResult>;
}
export const ModelRequestSchema = z.strictObject({
  schemaVersion: SchemaVersion, requestId: z.string().min(1), runId: z.string().min(1),
  messages: z.array(z.strictObject({ role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string() })),
  tools: z.array(z.strictObject({ name: z.string().min(1), description: z.string(), inputSchema: JsonObjectSchema })),
});
export type ModelRequest = z.infer<typeof ModelRequestSchema>;
export const ModelResponseSchema = z.strictObject({
  schemaVersion: SchemaVersion, requestId: z.string().min(1), mode: z.enum(['simulated', 'provider']),
  message: z.string(), toolCalls: z.array(z.strictObject({ callId: z.string().min(1), name: z.string().min(1), arguments: JsonObjectSchema })),
  finishReason: z.enum(['stop', 'tool-calls', 'length', 'error']),
});
export type ModelResponse = z.infer<typeof ModelResponseSchema>;
export interface ModelProvider { complete(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse>; }
