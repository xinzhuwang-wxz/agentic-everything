import { z } from 'zod';
import { RelativePath, Sha256, RecipeRefSchema, ApprovedChangeSetSchema, VerificationReportSchema } from './transformation.js';

export function maximumDeliveryArtifacts(scope: string): number { return ['reveal-upstream-v1', 'linkding-upstream-v1', 'kanboard-upstream-v1'].includes(scope) ? 64 : 32; }

/** Integrity manifest, not a signature, authorization oracle, or production certification. */
export const DeliveryManifestSchema = z.strictObject({
  schemaVersion: z.literal('1'), kind: z.literal('ae-delivery'), toolVersion: z.literal('0.1.0'), status: z.enum(['partial', 'failed', 'complete']),
  startedAt: z.iso.datetime(), createdAt: z.iso.datetime(), projectId: z.string().min(1), baseCommit: z.string().min(1), recipe: RecipeRefSchema,
  chain: z.strictObject({ assessmentHash: Sha256, planHash: Sha256, approvalHash: Sha256, appliedHash: Sha256, verificationHash: Sha256, preApplyBaselineHash: Sha256.optional() }),
  baselineCodeHash: Sha256, candidateCodeHash: Sha256,
  permissions: ApprovedChangeSetSchema.pick({ allowedPaths: true, allowedCommands: true, networkAllowlist: true, maximumCostUsd: true, excludedActions: true, verificationAuthorization: true }),
  artifacts: z.array(z.strictObject({ path: RelativePath, sha256: Sha256, bytes: z.number().int().nonnegative().max(1048576) })).min(1).max(64),
  checks: VerificationReportSchema.shape.checks,
  verificationScope: z.enum(['static-only', 'react-helpdesk-synthetic-v1', 'python-inventory-synthetic-v1', 'java-spring-inventory-synthetic-v1', 'reveal-upstream-v1', 'linkding-upstream-v1', 'kanboard-upstream-v1']),
  limitations: z.array(z.string().min(1)).min(1),
}).superRefine((value, ctx) => {
  if (value.artifacts.length > maximumDeliveryArtifacts(value.verificationScope)) ctx.addIssue({ code: 'custom', path: ['artifacts'], message: 'Too many artifacts for the declared verification scope' });
});
export type DeliveryManifest = z.infer<typeof DeliveryManifestSchema>;
export interface DeliveryValidation { valid: boolean; errors: string[]; manifest?: DeliveryManifest; }
