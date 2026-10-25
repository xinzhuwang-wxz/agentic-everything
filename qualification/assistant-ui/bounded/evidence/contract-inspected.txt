import { z } from 'zod';
import { JsonObjectSchema, RunStatusSchema } from './runtime.js';

// Domain-neutral reference only. Trusted host policy supplies its own strict schema.
export const ConversationContextSchema = JsonObjectSchema.refine(value => JSON.stringify(value).length <= 4096, 'Context reference exceeds 4096 characters');
export type ConversationContext = z.infer<typeof ConversationContextSchema>;
/** Correlation only. The authenticated server's durable intent ledger owns replay. */
export const ConversationClientIntentIdSchema = z.string().regex(/^[a-zA-Z0-9_.:-]{1,128}$/);
export const ConversationRunBindingSchema = z.strictObject({
  conversationId: z.string().regex(/^conversation-[a-f0-9]{64}$/),
  authorityHash: z.string().regex(/^[a-f0-9]{64}$/),
  turn: z.number().int().min(1).max(20),
});
/** Server-created binding. Never accepted from browser/model request JSON. */
export type ConversationRunBinding = z.infer<typeof ConversationRunBindingSchema>;
export const ConversationMessageSchema = z.strictObject({
  messageId: z.string().min(1), sequence: z.number().int().nonnegative(), runId: z.string().min(1),
  role: z.enum(['user', 'assistant']), text: z.string().max(16384), createdAt: z.iso.datetime(),
});
export const ConversationViewSchema = z.strictObject({
  conversationId: z.string().min(1), context: ConversationContextSchema,
  createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  messages: z.array(ConversationMessageSchema).max(40),
  runs: z.array(z.strictObject({
    runId: z.string().min(1), releaseId: z.string().min(1), status: RunStatusSchema,
    clientIntentId: ConversationClientIntentIdSchema.optional(),
    /** False means the turn is reserved but its runtime row does not exist yet. */
    materialized: z.boolean().optional(),
  })).max(20),
  activeRunId: z.string().optional(),
});
/** Literal text projection only. Approval/receipt/checkpoint payloads remain run-local. */
export type ConversationView = z.infer<typeof ConversationViewSchema>;
