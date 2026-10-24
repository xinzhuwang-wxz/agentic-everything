import { z } from 'zod';

export const ConfigurationModeSchema = z.enum(['self_hosted', 'hosted']);
export const ConfigurationStepSchema = z.enum(['read_only', 'model']);
export const ConfigurationRequestSchema = z.strictObject({
  taskId: z.uuid(), mode: ConfigurationModeSchema, step: ConfigurationStepSchema,
});
export const CredentialKindSchema = z.enum(['model_provider', 'ae_hosted_service']);
export const CredentialStateSchema = z.enum(['missing', 'invalid', 'configured', 'unverified']);
export const ConfigurationReportSchema = z.strictObject({
  schemaVersion: z.literal('1'), taskId: z.uuid(), mode: ConfigurationModeSchema, step: ConfigurationStepSchema,
  status: z.enum(['ready', 'needs_configuration']),
  checks: z.array(z.strictObject({
    kind: CredentialKindSchema, state: CredentialStateSchema,
    reason: z.enum(['verified', 'missing', 'invalid', 'verification_unavailable']),
  })),
  configuration: z.strictObject({ url: z.url().nullable(), instructions: z.string() }).nullable(),
  resume: z.strictObject({ taskId: z.uuid(), action: z.literal('recheck_same_task') }),
  providerQualification: z.literal('not-run'),
});
export type ConfigurationRequest = z.infer<typeof ConfigurationRequestSchema>;
export type ConfigurationReport = z.infer<typeof ConfigurationReportSchema>;
export type CredentialKind = z.infer<typeof CredentialKindSchema>;
export type CredentialState = z.infer<typeof CredentialStateSchema>;
