import { z } from 'zod';

export const SchemaVersion = z.literal('1');
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const RelativePath = z.string().min(1).refine(p => !p.startsWith('/') && !p.includes('\\') && !p.split('/').some(x => x === '..' || x === '.' || x === ''), 'Expected safe repository-relative path');
export const EvidenceRefSchema = z.strictObject({ path: RelativePath, sha256: Sha256, startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional(), note: z.string() });
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export const VerificationStatusSchema = z.enum(['pass', 'fail', 'not-run', 'blocked']);
export const ProjectAssessmentSchema = z.strictObject({
  schemaVersion: SchemaVersion, projectId: z.string().min(1), baseCommit: z.string().min(1),
  detectedStack: z.array(z.string()), businessFlows: z.array(z.string()), identity: z.array(z.string()),
  evidence: z.array(EvidenceRefSchema), supportLevel: z.enum(['L0', 'L1', 'L2', 'L3']),
  unknowns: z.array(z.string()), baseline: VerificationStatusSchema,
});
export type ProjectAssessment = z.infer<typeof ProjectAssessmentSchema>;
export const RecipeRefSchema = z.strictObject({ id: z.string().min(1), version: z.string().min(1) });
export const AdaptationPlanSchema = z.strictObject({
  schemaVersion: SchemaVersion, planId: z.string().min(1), projectId: z.string().min(1), baseCommit: z.string().min(1),
  assessmentHash: Sha256, goals: z.array(z.string()), nonGoals: z.array(z.string()), capabilities: z.array(z.string()),
  recipes: z.array(RecipeRefSchema), allowedPaths: z.array(RelativePath), dependencies: z.array(z.string()),
  commands: z.array(z.string()), networkAllowlist: z.array(z.string()), dataFlows: z.array(z.string()),
  migrations: z.array(z.string()), verification: z.array(z.string()), rollback: z.array(z.string()),
  cost: z.strictObject({ currency: z.literal('USD'), maximum: z.number().nonnegative(), paidCallsAllowed: z.boolean() }),
});
export type AdaptationPlan = z.infer<typeof AdaptationPlanSchema>;
// planHash is the canonical digest of the entire plan; never a self-referential plan field.
export const ApprovedChangeSetSchema = z.strictObject({
  schemaVersion: SchemaVersion, approvalId: z.string().min(1), approverId: z.string().min(1),
  planHash: Sha256, baseCommit: z.string().min(1), allowedPaths: z.array(RelativePath),
  allowedCommands: z.array(z.string()), networkAllowlist: z.array(z.string()), maximumCostUsd: z.number().nonnegative(),
  excludedActions: z.array(z.string()), approvedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  authorizationRef: z.string().min(1),
});
export type ApprovedChangeSet = z.infer<typeof ApprovedChangeSetSchema>;
export const PatchArtifactSchema = z.strictObject({
  schemaVersion: SchemaVersion, planHash: Sha256, baseCommit: z.string().min(1), recipe: RecipeRefSchema,
  changes: z.array(z.strictObject({ path: RelativePath, beforeHash: Sha256.nullable(), afterHash: Sha256.nullable() })),
  appliedAt: z.iso.datetime(), worktree: z.string().min(1),
});
export type PatchArtifact = z.infer<typeof PatchArtifactSchema>;
export const VerificationReportSchema = z.strictObject({
  schemaVersion: SchemaVersion, planHash: Sha256, observedAt: z.iso.datetime(), environment: z.string(),
  checks: z.array(z.strictObject({ name: z.string(), status: VerificationStatusSchema, command: z.string().optional(),
    expected: z.string(), actual: z.string(), evidence: z.array(EvidenceRefSchema) })),
});
export type VerificationReport = z.infer<typeof VerificationReportSchema>;
