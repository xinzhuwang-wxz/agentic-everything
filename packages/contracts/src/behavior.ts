import { z } from 'zod';
import { Sha256 } from './transformation.js';
import { ImprovementSchema } from './verification.js';
/** A bounded choice of reviewed business changes, never arbitrary flags or permissions. */
export const BehaviorSelectionSchema = z.strictObject({
  baselineHash: Sha256, candidateCodeHash: Sha256, registryHash: Sha256,
  enabled: z.array(z.strictObject({ id: z.string().min(1), version: z.string().min(1) })).max(64)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Duplicate improvement'),
});
export type BehaviorSelection = z.infer<typeof BehaviorSelectionSchema>;
export const RegisteredImprovementSchema = ImprovementSchema.extend({
  risk: z.string().min(1), examples: z.strictObject({ before: z.string().min(1), after: z.string().min(1) }),
});
export const BehaviorCatalogSchema = z.strictObject({
  baselineHash: Sha256, candidateCodeHash: Sha256, registryHash: Sha256,
  improvements: z.array(RegisteredImprovementSchema).max(64)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Duplicate improvement'),
});
export type BehaviorCatalog = z.infer<typeof BehaviorCatalogSchema>;
