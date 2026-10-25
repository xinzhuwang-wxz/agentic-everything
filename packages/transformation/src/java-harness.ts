import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { compareBaseline, improvementRegistryHash } from '@ae/verification';
import { VerificationAuthorizationSchema, VerificationReportSchema, type Observation, type Provenance, type VerificationReport } from '@ae/contracts';
import type { FixtureDeliveryInput, FixtureDeliveryResult, FixtureDeliveryEvidence } from './fixture-harness.js';
import { aeRoot, hash, treeHash } from './inventory-baseline.js';
import { javaSpringRecipe } from './recipes/java-spring-inventory.js';
import { assertJavaBaseline, assertJavaObservation, assertTrustedJavaDelivery, executeJavaCase, javaCaseIds, javaHashes, javaProfile, javaProvenance } from './java-baseline.js';
import { compileJava, originalJavaBatch, javaBudget, type JavaCommand } from './java-process.js';
import { runJavaRuntime, javaRuntimeAssertions } from './java-runtime.js';

const files = { report: 'report.json', baseline: 'baseline.json', differential: 'differential.json', originalBuild: 'original-build.json', candidateBuild: 'candidate-build.json', runtime: 'runtime.json', browser: 'cli.json' };
export const javaGates = ['host-compilation', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'cli-acceptance', 'fixture-process-completion'];
const toolFiles = ['packages/transformation/dist/java-baseline.js', 'packages/transformation/dist/java-process.js', 'packages/transformation/dist/java-harness.js', 'packages/transformation/dist/java-runtime.js', 'packages/transformation/dist/recipes/java-spring-inventory.js', 'packages/runtime-core/dist/index.js', 'packages/capabilities/dist/index.js', 'packages/capabilities/dist/host-boundary.js', 'packages/capabilities/dist/java-spring-inventory.js', 'packages/policy/dist/index.js', 'packages/runtime-adapters/dist/agents-tools.js', 'packages/runtime-adapters/dist/agents-model.js', 'packages/contracts/dist/runtime.js', 'packages/contracts/dist/transformation.js', 'packages/contracts/dist/verification.js', 'packages/contracts/dist/hash.js', 'packages/verification/dist/index.js'];
function toolchain() { return { lockfileHash: hash(readFileSync(join(aeRoot(), 'package-lock.json'))), toolFiles: Object.fromEntries(toolFiles.map(path => [path, hash(readFileSync(join(aeRoot(), path)))])) }; }
function build(root: string, classes: string, sourceTreeHash: string, deadlineAt: number, candidate: boolean) {
  return { ...compileJava(root, classes, [...javaSpringRecipe.inputs.filter(path => path.endsWith('.java')), ...(candidate ? javaSpringRecipe.outputs : [])], deadlineAt), sourceTreeHash };
}
function cli(classes: string, database: string, deadlineAt: number) {
  const read: JavaCommand = { subject: 'alice', operation: 'read_stock', arguments: { sku: 'desk-01' } };
  const reserve: JavaCommand = { subject: 'alice', operation: 'reserve_stock', arguments: { sku: 'desk-01', orderId: 'cli-order', quantity: 2, expectedVersion: 1 }, operationId: 'cli-op' };
  const first = originalJavaBatch(classes, database, [read, reserve, reserve, read], deadlineAt);
  const restarted = originalJavaBatch(classes, database, [read, reserve, { ...reserve, subject: 'bob' }, { ...read, subject: 'mallory' }], deadlineAt);
  const result = { surface: 'unchanged-original-spring-core-json-cli', first, restarted, processes: 2, externalNetwork: false };
  assertCli(result); return result;
}
function assertCli(value: unknown) {
  const data = value as ReturnType<typeof cli>, stock = { sku: 'desk-01', tenantId: 'tenant-a', available: 12, version: 1 }, changed = { ...stock, available: 10, version: 2 };
  assert.equal(data.surface, 'unchanged-original-spring-core-json-cli'); assert.equal(data.processes, 2); assert.equal(data.externalNetwork, false);
  for (const run of [data.first, data.restarted]) { assert.equal(run.springVersion, '6.2.19'); assert.equal(run.managedInventory, true); assert.equal(run.mutationCount, 1); }
  assert.deepEqual(data.first.results[0], stock); assert.deepEqual(data.first.results[3], changed); assert.deepEqual(data.restarted.results[0], changed);
  const receipt = data.first.results[1]!; assert.match(receipt.receiptId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.deepEqual(receipt, { status: 'succeeded', operationId: 'cli-op', receiptId: receipt.receiptId, data: { stock: changed, orderId: 'cli-order', quantity: 2 } });
  assert.deepEqual(data.first.results[2], receipt); assert.deepEqual(data.restarted.results[1], receipt);
  assert.deepEqual(data.restarted.results[2], { error: 'AUTHORITY_DENIED' }); assert.deepEqual(data.restarted.results[3], { error: 'RESOURCE_DENIED' });
}
export async function runJavaDelivery(input: FixtureDeliveryInput): Promise<FixtureDeliveryResult> {
  const authorization = VerificationAuthorizationSchema.parse(input.verificationAuthorization);
  if (authorization.profile !== javaProfile || input.preApplyBaseline?.profile !== javaProfile) throw Error('Explicit Java profile and archived pre-apply baseline required');
  if (input.aeRoot && realpathSync(input.aeRoot) !== realpathSync(aeRoot())) throw Error('AE tool root override denied');
  const deadline = Math.min(Date.parse(input.preApplyBaseline.verificationStartedAt) + authorization.maximumElapsedMs, Date.parse(input.authorizationExpiresAt));
  const trust = assertTrustedJavaDelivery(input), out = resolve(input.outputDirectory);
  if (existsSync(out) && readdirSync(out).length) throw Error('Java evidence directory must be empty');
  if ([input.sourceRoot, input.candidateRoot].some(root => out === resolve(root) || out.startsWith(resolve(root) + '/'))) throw Error('Java evidence cannot modify host trees');
  mkdirSync(out, { recursive: true, mode: 0o700 }); if (realpathSync(out) !== out) throw Error('Java evidence symlink denied');
  const work = mkdtempSync(join(tmpdir(), 'ae-java-delivery-')), originalClasses = join(work, 'original'), candidateClasses = join(work, 'candidate');
  const artifacts: Record<string, string> = {}, evidence: Record<string, unknown> = {};
  const checks: VerificationReport['checks'] = javaGates.map(name => ({ name, status: 'not-run', expected: 'Observed bounded Java/Spring Core fixture acceptance', actual: 'Execution has not completed', evidence: [] }));
  const save = (key: keyof typeof files, value: unknown) => { evidence[key] = value; const path = join(out, files[key]); writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); artifacts[key] = path; };
  const complete = (name: string, keys: (keyof typeof files)[], actual: string) => { const check = checks.find(item => item.name === name)!; check.status = 'pass'; check.actual = actual; check.evidence = keys.map(key => ({ path: 'evidence/' + files[key], sha256: hash(readFileSync(artifacts[key]!)), note: 'Observed reviewed synthetic Java/Spring Core evidence' })); };
  let failure: string | undefined;
  try {
    javaBudget(deadline); await assertJavaBaseline(input.preApplyBaseline.archive, { sourceRoot: input.sourceRoot, sourceVersion: input.preApplyBaseline.baseCommit }); save('baseline', input.preApplyBaseline.archive);
    save('originalBuild', build(input.sourceRoot, originalClasses, trust.sourceTreeHash, deadline, false));
    save('candidateBuild', build(input.candidateRoot, candidateClasses, trust.candidateTreeHash, deadline, true));
    complete('host-compilation', ['originalBuild', 'candidateBuild'], 'Real Java 21 compiler accepted original CLI, unchanged business class and generated adapter against verified Spring 6.2.19 jars');
    complete('host-business-tests', ['baseline'], '14 original black-box Java CLI observations archived before apply; receipt quantities, versions, conflicts and isolation checked against fixed expectations');
    const differential = await compareBaseline({ baseline: input.preApplyBaseline.archive, adapter: { safety: 'isolated-seeded-fixture', async execute(test) { const observed = await executeJavaCase(candidateClasses, test.id, true, deadline); assertJavaObservation(test.id, observed); return observed; } }, provenance: javaProvenance(input.preApplyBaseline.baseCommit, trust.candidateTreeHash), configuration: { baselineHash: input.preApplyBaseline.archive.hash, candidateCodeHash: trust.candidateTreeHash, registryHash: improvementRegistryHash([]), enabled: [] }, improvements: [] });
    save('differential', differential); if (!differential.passed) throw Error('Java business differential failed');
    complete('black-box-business-differential', ['differential'], '14/14 original CLI versus generated authenticated HTTP adapter observations match with all improvements OFF');
    save('runtime', await runJavaRuntime(candidateClasses, join(work, 'runtime.json'), deadline));
    complete('authenticated-runtime', ['runtime'], 'Existing Java host adapter and single official Agents SDK runtime passed approval, current-rights, actual lost-response and receipt reconciliation checks with simulated model');
    save('browser', cli(candidateClasses, join(work, 'cli.json'), deadline));
    complete('cli-acceptance', ['browser'], 'Original CLI remains runnable unchanged; reservation/replay, fresh-process persistence, viewer and tenant denials passed');
    assertTrustedJavaDelivery(input); javaBudget(deadline);
  } catch (error) { failure = error instanceof Error ? error.message : String(error); const first = checks.find(check => check.status === 'not-run'); if (first) { first.status = 'fail'; first.actual = failure; } }
  let cleanup = 'complete'; try { rmSync(work, { recursive: true, force: true }); } catch { cleanup = 'failed'; }
  const terminal = checks.find(check => check.name === 'fixture-process-completion')!; terminal.status = !failure && cleanup === 'complete' ? 'pass' : 'fail'; terminal.actual = terminal.status === 'pass' ? 'All owned CLI/compiler children exited; loopback hosts stopped and ports closed; temporary fixture state removed' : failure ?? 'Owned state cleanup failed';
  for (const key of Object.keys(files) as (keyof typeof files)[]) if (key !== 'report' && !Object.hasOwn(evidence, key)) save(key, null);
  const report = { profile: javaProfile, status: checks.every(check => check.status === 'pass') ? 'pass' : 'fail', trust, provenance: { sourceVersion: input.preApplyBaseline.baseCommit, ...toolchain() }, checks, cleanup: { status: cleanup }, process: { completed: !failure, noOutstandingChildren: !failure }, ...(failure ? { failure } : {}) };
  save('report', report); return { status: report.status === 'pass' ? 'pass' : 'fail', reportPath: artifacts.report!, artifacts, checks };
}
/** Semantic and byte/provenance validation, never a signature or execution attestation. */
export async function checkJavaDeliveryEvidence(input: FixtureDeliveryEvidence): Promise<void> {
  const report = input.report as Record<string, any>; assert.equal(report.profile, javaProfile);
  const checks = VerificationReportSchema.shape.checks.parse(report.checks); assert.deepEqual(checks.map(c => c.name).sort(), [...javaGates].sort());
  assert.ok(['pass', 'fail'].includes(report.status)); assert.equal(report.status === 'pass', checks.every(c => c.status === 'pass'));
  const passed = (name: string) => checks.find(check => check.name === name)?.status === 'pass';
  const candidate = { ...javaHashes }; for (const change of javaSpringRecipe.preview(() => null)) candidate[change.path] = hash(change.after);
  assert.deepEqual(report.trust.sourceFiles, javaHashes); assert.deepEqual(report.trust.candidateFiles, candidate);
  assert.equal(report.trust.sourceTreeHash, treeHash(javaHashes)); assert.equal(report.trust.candidateTreeHash, treeHash(candidate));
  assert.deepEqual({ lockfileHash: report.provenance.lockfileHash, toolFiles: report.provenance.toolFiles }, toolchain());
  if (passed('host-compilation')) for (const [value, expectedFiles] of [[input.originalBuild, javaHashes], [input.candidateBuild, candidate]] as const) {
    const observed = value as ReturnType<typeof build>;
    assert.equal(observed.exitCode, 0); assert.equal(observed.compilationExitCode, 0); assert.equal(observed.language, 'java'); assert.equal(observed.compiler, 'jdk.compiler-21-no-annotation-processors');
    assert.equal(observed.dependencyLockHash, hash(readFileSync(join(aeRoot(), 'qualification/java-spring/dependencies.lock.json')))); assert.equal(observed.sourceTreeHash, treeHash(expectedFiles));
    assert.deepEqual(observed.files, Object.keys(expectedFiles).filter(path => path.endsWith('.java')).sort().map(path => ({ path, sha256: expectedFiles[path] })));
  }
  if (passed('host-business-tests') || passed('black-box-business-differential')) {
    const baseline = await assertJavaBaseline(input.baseline, { sourceVersion: report.provenance.sourceVersion });
    if (passed('black-box-business-differential')) {
      const differential = input.differential as Record<string, any>; assert.deepEqual(differential.candidate, javaProvenance(report.provenance.sourceVersion, report.trust.candidateTreeHash));
      assert.deepEqual(differential.cases.map((item: { id: string }) => item.id), javaCaseIds);
      const recomputed = await compareBaseline({ baseline, adapter: { safety: 'isolated-seeded-fixture', async execute(test) { const found = differential.cases.find((item: { id: string }) => item.id === test.id); const observation = found.observation as Observation; assertJavaObservation(test.id, observation); return observation; } }, provenance: differential.candidate as Provenance, configuration: { baselineHash: baseline.hash, candidateCodeHash: report.trust.candidateTreeHash, registryHash: improvementRegistryHash([]), enabled: [] }, improvements: [] });
      assert.equal(recomputed.passed, true); assert.deepEqual(differential, recomputed);
    }
  }
  if (passed('authenticated-runtime')) assert.deepEqual(input.runtime, { status: 'pass', runtime: 'official-agents-sdk-memory', modelMode: 'simulated', assertions: javaRuntimeAssertions, finalStock: { sku: 'desk-01', tenantId: 'tenant-a', available: 7, version: 3 }, mutationCount: 2, spring: '6.2.19', managedInventory: true });
  if (passed('cli-acceptance')) assertCli(input.browser);
  if (passed('fixture-process-completion')) { assert.equal(report.cleanup.status, 'complete'); assert.equal(report.process.completed, true); assert.equal(report.process.noOutstandingChildren, true); }
}
