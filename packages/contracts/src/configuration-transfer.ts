import { z } from 'zod';
import { AgentConfigurationSchema } from './control.js';
import { Sha256 } from './transformation.js';
/** Configuration data only. Credentials, provider auth, identities and permissions are not imported. */
export const ConfigurationEnvelopeSchema=z.strictObject({
  format:z.literal('ae-configuration'),schemaVersion:z.literal('1'),tenantId:z.string().min(1),applicationId:z.string().min(1),
  source:z.strictObject({draftId:z.string().min(1),revision:z.number().int().positive()}),
  configuration:AgentConfigurationSchema,
  capabilities:z.array(z.strictObject({capabilityId:z.string().min(1),version:z.string().min(1),bindingHash:Sha256})).max(32)
    .refine(values=>new Set(values.map(v=>v.capabilityId)).size===values.length,'Duplicate capability'),
  contentHash:Sha256,
});
export type ConfigurationEnvelope=z.infer<typeof ConfigurationEnvelopeSchema>;
