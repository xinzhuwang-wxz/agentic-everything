import { z } from 'zod';
import { BehaviorSelectionSchema } from './behavior.js';
import { Sha256 } from './transformation.js';
export const AgentConfigurationSchema = z.strictObject({
  behavior: BehaviorSelectionSchema.optional(),
  name: z.string().trim().min(1).max(80), instructions: z.string().trim().min(1).max(8000),
  capabilityIds: z.array(z.string().min(1).max(120)).max(32).refine(ids => new Set(ids).size === ids.length, 'Duplicate capability'),
  bounds: z.strictObject({ maxTurns: z.number().int().min(1).max(16), maxElapsedMs: z.number().int().min(1000).max(240000) }),
});
export type AgentConfiguration = z.infer<typeof AgentConfigurationSchema>;
export const AgentDraftSchema = z.strictObject({ draftId: z.string(), tenantId: z.string(), applicationId: z.string(), revision: z.number().int().positive(), configuration: AgentConfigurationSchema, updatedAt: z.iso.datetime() });
export type AgentDraft = z.infer<typeof AgentDraftSchema>;
export const AgentReleaseSchema = z.strictObject({
  schemaVersion: z.literal('1'), releaseId: z.string(), tenantId: z.string(), applicationId: z.string(), draftId: z.string(), draftRevision: z.number().int().positive(),
  configuration: AgentConfigurationSchema,
  capabilities: z.array(z.strictObject({ capabilityId: z.string(), version: z.string(), bindingHash: Sha256 })),
  publishedAt: z.iso.datetime(), publishedBy: z.string(), contentHash: Sha256,
});
export type AgentRelease = z.infer<typeof AgentReleaseSchema>;
