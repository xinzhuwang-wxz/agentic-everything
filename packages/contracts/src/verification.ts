import { z } from 'zod';
import { JsonValueSchema } from './runtime.js';
import { Sha256 } from './transformation.js';
const text = z.string().min(1);
export const ObservationSchema = z.strictObject({ output: JsonValueSchema, sideEffects: z.array(JsonValueSchema), receipt: JsonValueSchema });
export type Observation = z.infer<typeof ObservationSchema>;
export const ProvenanceSchema = z.strictObject({ sourceVersion: text, codeHash: Sha256, environment: text, environmentHash: Sha256, dataHash: Sha256, schemaVersion: text, adapterVersion: text });
export type Provenance = z.infer<typeof ProvenanceSchema>;
export const BehaviorCaseSchema = z.strictObject({ id: text, input: JsonValueSchema, seed: JsonValueSchema, covers: z.array(text).min(1) });
export type BehaviorCase = z.infer<typeof BehaviorCaseSchema>;
// Paths are exact segments, not globs. Only scalar leaves can be normalized.
export const NormalizationSchema = z.strictObject({ path: z.array(text).min(2), reason: text, evidence: text, kind: z.literal('nondeterministic') });
export const BaselineManifestSchema = z.strictObject({ schemaVersion: z.literal('1'), capturedAt: z.iso.datetime(), provenance: ProvenanceSchema, safety: z.enum(['isolated-seeded-fixture', 'recorded-replay']), normalization: z.array(NormalizationSchema), coverage: z.strictObject({ scope: text, unknowns: z.array(text).min(1) }), cases: z.array(z.strictObject({ test: BehaviorCaseSchema, observation: ObservationSchema, hash: Sha256 })).min(1) });
export const BaselineArchiveSchema = z.strictObject({ manifest: BaselineManifestSchema, hash: Sha256 });
export type BaselineArchive = z.infer<typeof BaselineArchiveSchema>;
export const ImprovementSchema = z.strictObject({ id: text, version: text, category: z.literal('business-behavior'), reason: text, evidence: z.array(text).min(1), impact: text, defaultEnabled: z.literal(false), reversibility: text, expectedAllowedDiff: z.array(z.strictObject({ caseId: text, path: z.array(text).min(1), before: JsonValueSchema, after: JsonValueSchema })).min(1) });
export type Improvement = z.infer<typeof ImprovementSchema>;
export const BehaviorConfigurationSchema = z.strictObject({ baselineHash: Sha256, candidateCodeHash: Sha256, registryHash: Sha256, enabled: z.array(z.strictObject({ id: text, version: text, approvalRef: text, reviewer: text })) });
export type BehaviorConfiguration = z.infer<typeof BehaviorConfigurationSchema>;
export interface BehaviorDifference { caseId: string; path: string[]; before: unknown; after: unknown; allowedBy?: string; }
export interface DifferentialReport { schemaVersion: '1'; baselineHash: string; configurationHash: string; candidate: Provenance; passed: boolean; cases: { id: string; observation: Observation; observationHash: string; passed: boolean; differences: BehaviorDifference[]; missingExpected: string[] }[]; coverage: BaselineArchive['manifest']['coverage']; unknowns: string[]; }
