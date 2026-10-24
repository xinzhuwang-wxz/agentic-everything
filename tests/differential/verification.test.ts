import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BehaviorConfigurationSchema, ImprovementSchema, type BaselineArchive, type BehaviorConfiguration, type Improvement } from '@ae/contracts';
import { captureBaseline, compareBaseline, improvementRegistryHash, readBaseline, toVerificationCheck, verifyArchive, writeBaseline, type PublicBehaviorAdapter } from '@ae/verification';
import { candidate, cases, fixture, improvement, provenance } from './synthetic.js';
const normalization = [{ path: ['receipt', 'timestamp'], kind: 'nondeterministic' as const, reason: 'Fixture-only clock label differs per run', evidence: 'Synthetic adapter timestamp field is not a business field' }];
const coverage = { scope: 'Three synthetic pagination inputs, output and all declared effects/receipt fields', unknowns: ['No real host, concurrency, transport, production authorization or uninstrumented effects exercised'] };
const capture = (adapter = fixture()) => captureBaseline({ adapter, cases, provenance, normalization, coverage });
function config(baseline: BaselineArchive, enabled = false, improvements: Improvement[] = [improvement]): BehaviorConfiguration { return { baselineHash: baseline.hash, candidateCodeHash: candidate.codeHash, registryHash: improvementRegistryHash(improvements), enabled: enabled ? [{ id: improvement.id, version: improvement.version, approvalRef: 'synthetic-fixture-review-not-production-approval', reviewer: 'fixture-test-author' }] : [] }; }
async function compare(baseline: BaselineArchive, adapter: PublicBehaviorAdapter, enabled = false) { return compareBaseline({ baseline, adapter, provenance: candidate, configuration: config(baseline, enabled), improvements: [improvement] }); }

test('capture archives raw I/O, immutable manifest and create-only files; hash tampering fails', async () => {
  const baseline = await capture(); assert.ok(Object.isFrozen(baseline.manifest));
  assert.equal((baseline.manifest.cases[0]!.observation.receipt as { timestamp: string }).timestamp, 'synthetic-clock-before');
  const dir = mkdtempSync(join(tmpdir(), 'ae-differential-'));
  try {
    const path = join(dir, baseline.hash + '.json'); writeBaseline(path, baseline);
    assert.deepEqual(readBaseline(path), baseline); assert.throws(() => writeBaseline(path, baseline), /EEXIST/);
    const changed = JSON.parse(readFileSync(path, 'utf8')); changed.manifest.cases[0].observation.output.hasMore = false;
    const tampered = join(dir, 'tampered.json'); writeFileSync(tampered, JSON.stringify(changed));
    assert.throws(() => readBaseline(tampered), /integrity mismatch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('default OFF preserves even synthetic legacy defect; declared timestamp only is normalized', async () => {
  const baseline = await capture(); const report = await compare(baseline, fixture({ clock: 'after' }));
  assert.equal(report.passed, true); assert.equal(report.cases.length, 3); assert.match(report.unknowns.join(), /not proof/);
  assert.equal(toVerificationCheck(report).status, 'pass');
});
test('ON permits exact reviewed final-page delta and tests unaffected cases', async () => {
  const report = await compare(await capture(), fixture(), true); assert.equal(report.passed, true);
  assert.equal(report.cases[1]!.differences[0]!.allowedBy, improvement.id);
  assert.equal(report.cases[0]!.differences.length, 0); assert.equal(report.cases[2]!.differences.length, 0);
});
test('unflagged fix fails; ON missing improvement fails; ON unrelated regression fails', async () => {
  const baseline = await capture();
  assert.equal((await compare(baseline, fixture({ forceFix: true }))).passed, false);
  const ignoresFlags: PublicBehaviorAdapter = { safety: 'isolated-seeded-fixture', execute: test => fixture().execute(test, {}) };
  const missing = await compare(baseline, ignoresFlags, true); assert.equal(missing.passed, false); assert.equal(missing.cases[1]!.missingExpected.length, 1);
  assert.equal((await compare(baseline, fixture({ regress: true }), true)).passed, false);
});
test('side effects and receipts cannot escape parity; mutations do not alter baseline', async () => {
  const baseline = await capture(); const original = JSON.stringify(baseline);
  const report = await compare(baseline, fixture({ extraEffect: true }), true); assert.equal(report.passed, false);
  assert.ok(report.cases[0]!.differences.some(d => d.path[0] === 'sideEffects'));
  const changedReceipt: PublicBehaviorAdapter = { safety: 'isolated-seeded-fixture', async execute(t, f) { const r = await fixture().execute(t, f); r.receipt = { operation: 'write', timestamp: 'after' }; return r; } };
  assert.equal((await compare(baseline, changedReceipt)).passed, false); assert.equal(JSON.stringify(baseline), original);
});
test('configuration drift, missing approvals, unknown switches and forged defaults fail closed', async () => {
  const baseline = await capture();
  assert.throws(() => ImprovementSchema.parse({ ...improvement, defaultEnabled: true }));
  assert.throws(() => ImprovementSchema.parse({ ...improvement, category: 'authorization' }));
  assert.throws(() => BehaviorConfigurationSchema.parse({ ...config(baseline), enabled: [{ id: improvement.id, version: '1' }] }));
  for (const configuration of [{ ...config(baseline), baselineHash: '0'.repeat(64) }, { ...config(baseline), registryHash: '0'.repeat(64) }, { ...config(baseline), candidateCodeHash: '0'.repeat(64) }, { ...config(baseline, true), enabled: [{ id: 'unrecognized', version: '1', approvalRef: 'fixture', reviewer: 'fixture' }] }]) {
    await assert.rejects(compareBaseline({ baseline, adapter: fixture(), provenance: candidate, configuration, improvements: [improvement] }));
  }
  await assert.rejects(compareBaseline({ baseline, adapter: fixture(), provenance: { ...candidate, dataHash: '0'.repeat(64) }, configuration: config(baseline), improvements: [improvement] }), /context drift/);
});
test('unsafe modes and known security, authorization, corruption findings are never compatibility switches', async () => {
  for (const category of ['security', 'authorization', 'data-corruption'] as const) await assert.rejects(capture({ ...fixture(), safetyFindings: [{ category, evidence: 'synthetic safety finding' }] }), /Safety intervention/);
  await assert.rejects(capture({ ...fixture(), safety: 'production' as 'recorded-replay' }), /Unsafe/);
  const baseline = await capture(); await assert.rejects(compare(baseline, { ...fixture(), safetyFindings: [{ category: 'authorization', evidence: 'synthetic' }] }), /Safety intervention/);
});
test('normalization cannot discard objects, missing paths, duplicates or silently change in candidate', async () => {
  for (const path of [['output', 'rows'], ['receipt', 'absent']]) await assert.rejects(captureBaseline({ adapter: fixture(), cases, provenance, normalization: [{ ...normalization[0]!, path }], coverage }));
  await assert.rejects(captureBaseline({ adapter: fixture(), cases, provenance, normalization: [...normalization, ...normalization], coverage }), /Duplicate/);
  const baseline = await capture(); const changed = structuredClone(baseline); changed.manifest.normalization = [];
  assert.throws(() => verifyArchive(changed), /integrity/);
});
test('duplicate cases, empty suites, overlapping approvals and stale improvement values fail', async () => {
  await assert.rejects(captureBaseline({ adapter: fixture(), cases: [], provenance, normalization, coverage }));
  await assert.rejects(captureBaseline({ adapter: fixture(), cases: [cases[0]!, cases[0]!], provenance, normalization, coverage }), /Duplicate/);
  const baseline = await capture(); const bad = { ...improvement, expectedAllowedDiff: [{ ...improvement.expectedAllowedDiff[0]!, before: false }] };
  const result = await compareBaseline({ baseline, adapter: fixture(), provenance: candidate, improvements: [bad], configuration: config(baseline, true, [bad]) }); assert.equal(result.passed, false);
  const duplicate = { ...improvement, expectedAllowedDiff: [...improvement.expectedAllowedDiff, ...improvement.expectedAllowedDiff] };
  await assert.rejects(compareBaseline({ baseline, adapter: fixture(), provenance: candidate, improvements: [duplicate], configuration: config(baseline, true, [duplicate]) }), /Duplicate/);
});
test('committed synthetic capture and positive/negative reports remain readable evidence', () => {
  const baseline = readBaseline('tests/differential/evidence/baseline.json');
  for (const [name, passed] of [['off-parity', true], ['on-approved', true], ['off-unexpected-fix', false], ['on-unexpected-side-effect', false]] as const) {
    const artifact = JSON.parse(readFileSync('tests/differential/evidence/' + name + '.json', 'utf8'));
    assert.equal(artifact.report.baselineHash, baseline.hash); assert.equal(artifact.report.passed, passed);
    assert.equal(artifact.configuration.registryHash, improvementRegistryHash(artifact.improvements));
  }
});
