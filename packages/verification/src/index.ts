import { readFileSync, writeFileSync } from 'node:fs';
import { BaselineArchiveSchema, BaselineManifestSchema, BehaviorConfigurationSchema, ImprovementSchema, ObservationSchema, ProvenanceSchema, type BaselineArchive, type BehaviorCase, type BehaviorConfiguration, type BehaviorDifference, type DifferentialReport, type Improvement, type JsonValue, type Observation, type Provenance, type VerificationReport } from '@ae/contracts';
import { canonicalJson, contentHash } from '@ae/contracts/hash';

const hash = (value: unknown): string => contentHash(value as JsonValue);
const equal = (a: unknown, b: unknown): boolean => a === undefined || b === undefined ? a === b : canonicalJson(a as JsonValue) === canonicalJson(b as JsonValue);
const copy = <T>(value: T): T => structuredClone(value);
export interface PublicBehaviorAdapter {
  safety: 'isolated-seeded-fixture' | 'recorded-replay';
  /** Known security/authorization/data-integrity failures block both legacy and candidate runs. */
  safetyFindings?: readonly { category: 'security' | 'authorization' | 'data-corruption'; evidence: string }[];
  /** Must reset to the supplied seed for EVERY case. No production connections or writes. */
  execute(test: BehaviorCase, enabled: Readonly<Record<string, boolean>>): Promise<Observation>;
}
function unique(ids: string[], label: string): void { if (new Set(ids).size !== ids.length) throw new Error('Duplicate ' + label); }
function safe(adapter: PublicBehaviorAdapter): void { if (adapter.safetyFindings?.length) throw new Error('Safety intervention required; compatibility flags cannot preserve known unsafe behavior'); if (!['isolated-seeded-fixture', 'recorded-replay'].includes(adapter.safety)) throw new Error('Unsafe adapter execution mode'); }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
export function verifyArchive(value: unknown): BaselineArchive {
  const archive = BaselineArchiveSchema.parse(value);
  if (hash(archive.manifest) !== archive.hash) throw new Error('Baseline manifest integrity mismatch');
  unique(archive.manifest.cases.map(c => c.test.id), 'case ID');
  for (const c of archive.manifest.cases) if (hash({ test: c.test, observation: c.observation }) !== c.hash) throw new Error('Case integrity mismatch');
  return freeze(archive);
}
export async function captureBaseline(input: { adapter: PublicBehaviorAdapter; cases: BehaviorCase[]; provenance: Provenance; normalization: BaselineArchive['manifest']['normalization']; coverage: BaselineArchive['manifest']['coverage'] }): Promise<BaselineArchive> {
  safe(input.adapter); unique(input.cases.map(c => c.id), 'case ID');
  const cases = [];
  for (const test of input.cases) {
    const observation = ObservationSchema.parse(await input.adapter.execute(copy(test), Object.freeze({})));
    cases.push({ test: copy(test), observation, hash: hash({ test, observation }) });
  }
  const manifest = BaselineManifestSchema.parse({ schemaVersion: '1', capturedAt: new Date().toISOString(), provenance: input.provenance, safety: input.adapter.safety, normalization: input.normalization, coverage: input.coverage, cases });
  // Reject invalid normalization before archiving; raw observations remain intact.
  for (const c of cases) normalize(c.observation, manifest.normalization);
  return verifyArchive({ manifest, hash: hash(manifest) });
}
/** Create only: never overwrite an existing baseline, including identical content. */
export function writeBaseline(path: string, archive: BaselineArchive): void { writeFileSync(path, JSON.stringify(verifyArchive(archive), null, 2) + '\n', { flag: 'wx', mode: 0o444 }); }
export function readBaseline(path: string): BaselineArchive { return verifyArchive(JSON.parse(readFileSync(path, 'utf8'))); }
function normalize(observation: Observation, rules: BaselineArchive['manifest']['normalization']): Observation {
  const result = copy(observation);
  unique(rules.map(r => JSON.stringify(r.path)), 'normalization path');
  for (const rule of rules) {
    if (!['output', 'sideEffects', 'receipt'].includes(rule.path[0]!)) throw new Error('Invalid normalization root');
    let parent: unknown = result;
    for (const part of rule.path.slice(0, -1)) {
      if (parent === null || typeof parent !== 'object' || !Object.hasOwn(parent, part)) throw new Error('Missing normalization path');
      parent = (parent as Record<string, unknown>)[part];
    }
    const key = rule.path.at(-1)!;
    if (parent === null || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw new Error('Missing normalization leaf');
    const object = parent as Record<string, unknown>;
    if (object[key] !== null && typeof object[key] === 'object') throw new Error('Normalization cannot hide a subtree');
    object[key] = '<declared-nondeterministic>';
  }
  return result;
}
function differences(caseId: string, before: unknown, after: unknown, path: string[] = []): BehaviorDifference[] {
  if (equal(before, after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap(k => differences(caseId, (before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k], [...path, k]));
  }
  return [{ caseId, path, before, after }];
}
export function improvementRegistryHash(improvements: Improvement[]): string { return hash(improvements.map(i => ImprovementSchema.parse(i))); }
export async function compareBaseline(input: { baseline: BaselineArchive; adapter: PublicBehaviorAdapter; provenance: Provenance; configuration: BehaviorConfiguration; improvements: Improvement[] }): Promise<DifferentialReport> {
  const baseline = verifyArchive(input.baseline); safe(input.adapter);
  const candidate = ProvenanceSchema.parse(input.provenance);
  const config = BehaviorConfigurationSchema.parse(input.configuration);
  const improvements = input.improvements.map(i => ImprovementSchema.parse(i));
  unique(improvements.map(i => i.id), 'improvement ID'); unique(config.enabled.map(i => i.id), 'enabled improvement');
  if (config.baselineHash !== baseline.hash || config.candidateCodeHash !== candidate.codeHash || config.registryHash !== improvementRegistryHash(improvements)) throw new Error('Configuration version binding mismatch');
  for (const field of ['environmentHash', 'dataHash', 'schemaVersion', 'adapterVersion'] as const) if (candidate[field] !== baseline.manifest.provenance[field]) throw new Error('Comparison context drift: ' + field);
  if (input.adapter.safety !== baseline.manifest.safety) throw new Error('Execution mode drift');
  const enabled = config.enabled.map(e => { const found = improvements.find(i => i.id === e.id && i.version === e.version); if (!found) throw new Error('Unknown enabled improvement'); return found; });
  const expected = enabled.flatMap(i => i.expectedAllowedDiff.map(d => ({ ...d, improvement: i.id })));
  unique(expected.map(d => JSON.stringify([d.caseId, d.path])), 'allowed difference');
  for (const d of expected) {
    if (!baseline.manifest.cases.some(c => c.test.id === d.caseId)) throw new Error('Unknown improvement case');
    if (baseline.manifest.normalization.some(r => equal(r.path, d.path))) throw new Error('Improvement overlaps normalization');
  }
  const flags = Object.freeze(Object.fromEntries(improvements.map(i => [i.id, enabled.some(e => e.id === i.id)])));
  const cases = [];
  for (const c of baseline.manifest.cases) {
    const actual = ObservationSchema.parse(await input.adapter.execute(copy(c.test), flags));
    const diffs = differences(c.test.id, normalize(c.observation, baseline.manifest.normalization), normalize(actual, baseline.manifest.normalization));
    const allowed = expected.filter(d => d.caseId === c.test.id);
    for (const diff of diffs) { const match = allowed.find(d => equal(d.path, diff.path) && equal(d.before, diff.before) && equal(d.after, diff.after)); if (match) diff.allowedBy = match.improvement; }
    const missingExpected = allowed.filter(d => !diffs.some(x => x.allowedBy === d.improvement && equal(x.path, d.path))).map(d => d.improvement + ':' + d.path.join('/'));
    cases.push({ id: c.test.id, observation: actual, observationHash: hash(actual), passed: diffs.every(d => !!d.allowedBy) && missingExpected.length === 0, differences: diffs, missingExpected });
  }
  return { schemaVersion: '1', baselineHash: baseline.hash, configurationHash: hash(config), candidate, passed: cases.every(c => c.passed), cases, coverage: baseline.manifest.coverage, unknowns: [...baseline.manifest.coverage.unknowns, 'Finite cases are not proof for all inputs. Adapter isolation and approval references require independent review; this library is not a sandbox or approval authority.'] };
}
export function toVerificationCheck(report: DifferentialReport): VerificationReport['checks'][number] {
  return { name: 'black-box-business-differential', status: report.passed ? 'pass' : 'fail', expected: 'Legacy parity with flags off; exact reviewed deltas only with flags on', actual: `${report.cases.filter(c => c.passed).length}/${report.cases.length} observed cases passed; baseline=${report.baselineHash}; configuration=${report.configurationHash}; unknowns=${report.unknowns.join('; ')}`, evidence: [] };
}
