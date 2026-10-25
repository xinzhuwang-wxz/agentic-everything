import { z } from 'zod';
import { BaselineArchiveSchema } from './verification.js';
import { Sha256 } from './transformation.js';

/** An unsigned, source/permission-bound archival record, not approval authority. */
export const PreApplyBaselineSchema = z.strictObject({
  schemaVersion: z.literal('1'), kind: z.literal('ae-pre-apply-baseline'),
  profile: z.enum(['react-helpdesk-synthetic-v1', 'python-inventory-synthetic-v1']),
  projectId: z.string().min(1), baseCommit: z.string().min(1),
  assessmentHash: Sha256, planHash: Sha256, approvalHash: Sha256,
  verificationStartedAt: z.iso.datetime(),
  collector: z.strictObject({ id: z.enum(['trusted-helpdesk-delivery-v1', 'trusted-inventory-delivery-v1']), version: z.literal('1'), codeHash: Sha256, lockfileHash: Sha256 }),
  archive: BaselineArchiveSchema,
});
export type PreApplyBaseline = z.infer<typeof PreApplyBaselineSchema>;
export const ArchivedBaselineSchema = z.strictObject({ path: z.string().min(1), sha256: Sha256, record: PreApplyBaselineSchema });
export type ArchivedBaseline = z.infer<typeof ArchivedBaselineSchema>;
