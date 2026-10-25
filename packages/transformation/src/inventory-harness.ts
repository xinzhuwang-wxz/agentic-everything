import { spawnSync } from 'node:child_process';
import { qualifiedPython } from '@ae/capabilities';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { compareBaseline, improvementRegistryHash } from '@ae/verification';
import { VerificationAuthorizationSchema, VerificationReportSchema, type Observation, type Provenance, type VerificationReport } from '@ae/contracts';
import type { FixtureDeliveryInput, FixtureDeliveryResult, FixtureDeliveryEvidence } from './fixture-harness.js';
import { inventoryRecipe } from './recipes/python-inventory.js';
import { aeRoot, assertInventoryBaseline, assertTrustedInventoryDelivery, executeInventoryCase, hash, inventoryHashes, inventoryProvenance, inventoryProfile, python, treeHash } from './inventory-baseline.js';

const files = { report: 'report.json', baseline: 'baseline.json', differential: 'differential.json', originalBuild: 'original-build.json', candidateBuild: 'candidate-build.json', runtime: 'runtime.json', browser: 'cli.json' };
export const inventoryGates = ['host-compilation', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'cli-acceptance', 'fixture-process-completion'];
const canonical = (value: unknown): string => value && typeof value === 'object' ? Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}' : JSON.stringify(value);
function exact(left: unknown, right: unknown, message: string) { if (canonical(left) !== canonical(right)) throw Error(message); }
const toolFiles = ['packages/transformation/dist/inventory-baseline.js', 'packages/transformation/dist/inventory-harness.js', 'packages/transformation/dist/recipes/python-inventory.js', 'packages/runtime-core/dist/inventory-qualification.js', 'packages/runtime-core/dist/index.js', 'packages/capabilities/dist/index.js', 'packages/capabilities/dist/host-boundary.js', 'packages/capabilities/dist/python-inventory.js', 'packages/capabilities/dist/python-runtime.js', 'packages/policy/dist/index.js', 'packages/runtime-adapters/dist/agents-tools.js', 'packages/runtime-adapters/dist/agents-model.js', 'packages/control-plane/dist/index.js', 'packages/contracts/dist/runtime.js', 'packages/contracts/dist/control.js', 'packages/contracts/dist/transformation.js', 'packages/contracts/dist/verification.js', 'packages/contracts/dist/hash.js', 'packages/verification/dist/index.js'];
function toolchain() { return { lockfileHash: hash(readFileSync(join(aeRoot(), 'package-lock.json'))), toolFiles: Object.fromEntries(toolFiles.map(path => [path, hash(readFileSync(join(aeRoot(), path)))])) }; }
function build(root: string, sourceTreeHash: string, deadlineAt: number) {
  const paths = [...inventoryRecipe.inputs.filter(path => path.endsWith('.py')), ...(existsSync(join(root, inventoryRecipe.outputs[0]!)) ? inventoryRecipe.outputs : [])];
  python('import ast, pathlib, sys; [ast.parse(pathlib.Path(sys.argv[1],p).read_text(),filename=p) for p in sys.argv[2:]]', [root, ...paths], undefined, deadlineAt);
  const tests = JSON.parse(python('import json,sys,unittest;sys.path.insert(0,sys.argv[1]);suite=unittest.defaultTestLoader.discover(sys.argv[1],pattern="test_inventory.py");result=unittest.TextTestRunner(verbosity=0).run(suite);print(json.dumps({"testsRun":result.testsRun,"failures":len(result.failures),"errors":len(result.errors)}));sys.exit(0 if result.wasSuccessful() else 1)', [root], undefined, deadlineAt));
  return { exitCode: 0, compilationExitCode: 0, language: 'python', check: 'stdlib AST parse and original host unittest suite (not static typing)', sourceTreeHash, files: paths.sort().map(path => ({ path, sha256: hash(readFileSync(join(root, path))) })), tests };
}
const alice = { tenantId: 'tenant-a', applicationId: 'inventory-fixture', subjectId: 'alice', roles: ['operator'], scopes: ['inventory:read', 'inventory:reserve'] };
function cli(adapter: string, database: string, deadlineAt: number) {
  const interpreter = qualifiedPython(undefined, deadlineAt);
  const invoke = (request: unknown) => {
    const remaining = deadlineAt - Date.now(); if (remaining <= 0) throw Error('Inventory CLI total budget exhausted');
    const child = spawnSync(interpreter, ['-I', '-B', adapter, '--database', database], { input: JSON.stringify(request), encoding: 'utf8', timeout: Math.min(5000, remaining), killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
    if (child.error || child.status !== 0 || child.signal || Date.now() > deadlineAt) throw Error('Inventory CLI process failure');
    return JSON.parse(child.stdout) as Record<string, unknown>;
  };
  const request = { id: 'cli', operation: 'read_stock', principal: alice, arguments: { sku: 'desk-01' } };
  const before = invoke(request);
  const mutation = { ...request, operation: 'reserve_stock', arguments: { sku: 'desk-01', orderId: 'cli-order', quantity: 2, expectedVersion: 1 }, operationId: 'cli-op' };
  const approved = invoke(mutation), replay = invoke(mutation), after = invoke(request);
  const injection = invoke({ ...mutation, arguments: { ...mutation.arguments, operationId: 'model-operation' } });
  const crossTenant = invoke({ ...request, arguments: { sku: 'desk-02' } });
  const unauthorized = invoke({ ...mutation, operationId: 'viewer-op', principal: { ...alice, subjectId: 'bob', roles: ['viewer'], scopes: ['inventory:read'] } });
  return { surface: 'dependency-free-json-cli', before, approved, replay, after, injection, crossTenant, unauthorized, subprocesses: 7, exitCodes: [0, 0, 0, 0, 0, 0, 0], externalNetwork: false };
}
function assertCli(value: unknown) {
  const data = value as ReturnType<typeof cli>;
  const stock = { sku: 'desk-01', tenantId: 'tenant-a', available: 12, version: 1 }, changed = { ...stock, available: 10, version: 2 };
  exact(data.before, { id: 'cli', ok: true, result: stock }, 'CLI original read mismatch');
  exact(data.after, { id: 'cli', ok: true, result: changed }, 'CLI reservation count mismatch');
  exact(data.approved, { id: 'cli', ok: true, result: { status: 'succeeded', operationId: 'cli-op', receiptId: 'receipt-cli-op', data: { stock: changed, orderId: 'cli-order', quantity: 2 } } }, 'CLI receipt mismatch');
  exact(data.replay, data.approved, 'CLI duplicate reservation mismatch');
  if (data.surface !== 'dependency-free-json-cli' || data.subprocesses !== 7 || data.externalNetwork !== false || canonical(data.exitCodes) !== canonical([0, 0, 0, 0, 0, 0, 0])) throw Error('CLI process evidence incomplete');
  for (const [key, code] of [['injection', 'invalid_request'], ['crossTenant', 'access_denied'], ['unauthorized', 'access_denied']] as const) {
    const response = data[key] as { id?: string; ok?: boolean; error?: { code?: string } };
    if (response.id !== 'cli' || response.ok !== false || response.error?.code !== code) throw Error('CLI authority failure: ' + key);
  }
}
export async function runInventoryDelivery(input: FixtureDeliveryInput): Promise<FixtureDeliveryResult> {
  const authorization = VerificationAuthorizationSchema.parse(input.verificationAuthorization);
  if (authorization.profile !== inventoryProfile) throw Error('Explicit inventory verification authorization required');
  if (!input.preApplyBaseline || input.preApplyBaseline.profile !== inventoryProfile) throw Error('Inventory execution requires its archived pre-apply baseline');
  if (input.aeRoot && realpathSync(input.aeRoot) !== realpathSync(aeRoot())) throw Error('AE tool root override denied');
  const deadline = Math.min(Date.parse(input.preApplyBaseline.verificationStartedAt) + authorization.maximumElapsedMs, Date.parse(input.authorizationExpiresAt));
  const trust = assertTrustedInventoryDelivery(input), out = resolve(input.outputDirectory);
  if (existsSync(out) && readdirSync(out).length) throw Error('Inventory evidence directory must be empty');
  if ([input.sourceRoot, input.candidateRoot].some(root => out === resolve(root) || out.startsWith(resolve(root) + '/'))) throw Error('Inventory evidence must not modify host trees');
  mkdirSync(out, { recursive: true, mode: 0o700 });
  if (realpathSync(out) !== out) throw Error('Inventory evidence directory symlink denied');
  const work = mkdtempSync(join(tmpdir(), 'ae-inventory-delivery-'));
  const artifacts: Record<string, string> = {}, evidence: Record<string, unknown> = {};
  const checks: VerificationReport['checks'] = inventoryGates.map(name => ({ name, status: 'not-run', expected: 'Observed fixed Python inventory acceptance', actual: 'Execution has not completed', evidence: [] }));
  const complete = (name: string, paths: string[], actual: string) => { const check = checks.find(item => item.name === name)!; check.status = 'pass'; check.actual = actual; check.evidence = paths.map(key => ({ path: 'evidence/' + files[key as keyof typeof files], sha256: hash(readFileSync(artifacts[key]!)), note: 'Observed reviewed synthetic Python inventory evidence' })); };
  const save = (key: keyof typeof files, value: unknown) => { evidence[key] = value; const path = join(out, files[key]); writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); artifacts[key] = path; };
  const budget = () => { if (!Number.isFinite(deadline) || Date.now() + 5000 >= deadline) throw Error('Inventory verification authorization or total budget exhausted'); };
  let failure: string | undefined;
  try {
    budget(); await assertInventoryBaseline(input.preApplyBaseline.archive, { sourceRoot: input.sourceRoot, sourceVersion: input.preApplyBaseline.baseCommit });
    save('baseline', input.preApplyBaseline.archive);
    budget(); save('originalBuild', build(input.sourceRoot, trust.sourceTreeHash, deadline));
    budget(); save('candidateBuild', build(input.candidateRoot, trust.candidateTreeHash, deadline));
    complete('host-compilation', ['originalBuild', 'candidateBuild'], 'Original and generated Python AST compilation and 25 host unittest cases passed (no static typechecker claimed)');
    complete('host-business-tests', ['baseline'], '13 original business observations archived before apply; original and candidate unittest suites passed');
    const provenance = inventoryProvenance(input.preApplyBaseline.baseCommit, trust.candidateTreeHash);
    const differential = await compareBaseline({ baseline: input.preApplyBaseline.archive, adapter: { safety: 'isolated-seeded-fixture', async execute(test) { budget(); return executeInventoryCase(input.candidateRoot, test.id, true, deadline); } }, provenance, configuration: { baselineHash: input.preApplyBaseline.archive.hash, candidateCodeHash: trust.candidateTreeHash, registryHash: improvementRegistryHash([]), enabled: [] }, improvements: [] });
    save('differential', differential); if (!differential.passed) throw Error('Inventory business differential failed');
    complete('black-box-business-differential', ['differential'], '13/13 original-versus-generated-adapter business observations match with all improvements OFF');
    budget(); const { runInventoryRuntimeQualification } = await import('@ae/runtime-core');
    save('runtime', await runInventoryRuntimeQualification({ adapterPath: join(input.candidateRoot, inventoryRecipe.outputs[0]!), databasePath: join(work, 'runtime.sqlite'), deadlineAt: deadline }));
    complete('authenticated-runtime', ['runtime'], 'Shared official Agents SDK runtime, approval boundary and Python host receipt reconciliation passed with simulated model');
    budget(); const observed = cli(join(input.candidateRoot, inventoryRecipe.outputs[0]!), join(work, 'cli.sqlite'), deadline); assertCli(observed); save('browser', observed);
    budget(); complete('cli-acceptance', ['browser'], 'Real one-shot JSON CLI read, reservation, exact replay and forbidden requests observed');
  } catch (error) { failure = error instanceof Error ? error.message : String(error); const first = checks.find(check => check.status === 'not-run'); if (first) { first.status = 'fail'; first.actual = failure; } }
  let cleanup = 'complete'; try { rmSync(work, { recursive: true, force: true }); } catch { cleanup = 'failed'; }
  const terminal = checks.find(check => check.name === 'fixture-process-completion')!;
  terminal.status = !failure && cleanup === 'complete' ? 'pass' : 'fail'; terminal.actual = terminal.status === 'pass' ? 'Every bounded synchronous child exited zero without signal or timeout; owned fixture state removed' : failure ?? 'Owned fixture state cleanup failed';
  for (const key of Object.keys(files) as (keyof typeof files)[]) if (key !== 'report' && !Object.hasOwn(evidence, key)) save(key, null);
  const report = { profile: inventoryProfile, status: checks.every(check => check.status === 'pass') ? 'pass' : 'fail', trust, provenance: { sourceVersion: input.preApplyBaseline.baseCommit, ...toolchain() }, checks, cleanup: { status: cleanup }, process: { mode: 'bounded-synchronous-children', completed: !failure, noOutstandingChildren: !failure }, ...(failure ? { failure } : {}) };
  save('report', report);
  return { status: report.status === 'pass' ? 'pass' : 'fail', reportPath: artifacts.report!, artifacts, checks };
}
/** Offline byte/provenance and semantic validation; not a signature or proof of execution authenticity. */
export async function checkInventoryDeliveryEvidence(input: FixtureDeliveryEvidence): Promise<void> {
  const report = input.report as Record<string, any>;
  if (!report || report.profile !== inventoryProfile || !['pass', 'fail'].includes(report.status)) throw Error('Invalid inventory evidence profile');
  const checks = VerificationReportSchema.shape.checks.parse(report.checks);
  exact(checks.map(check => check.name).sort(), [...inventoryGates].sort(), 'Inventory gate set mismatch');
  const passed = (name: string) => checks.find(check => check.name === name)?.status === 'pass';
  if ((report.status === 'pass') !== checks.every(check => check.status === 'pass')) throw Error('Inventory report status mismatch');
  exact(report.trust.sourceFiles, inventoryHashes, 'Inventory source trust mismatch');
  const candidate = { ...inventoryHashes };
  for (const change of inventoryRecipe.preview(() => null)) candidate[change.path] = hash(change.after);
  exact(report.trust.candidateFiles, candidate, 'Inventory candidate trust mismatch');
  if (report.trust.sourceTreeHash !== treeHash(inventoryHashes) || report.trust.candidateTreeHash !== treeHash(candidate)) throw Error('Inventory tree hash mismatch');
  exact({ lockfileHash: report.provenance.lockfileHash, toolFiles: report.provenance.toolFiles }, toolchain(), 'Inventory toolchain drift');
  if (passed('host-compilation')) for (const [value, tree] of [[input.originalBuild, report.trust.sourceTreeHash], [input.candidateBuild, report.trust.candidateTreeHash]]) {
    const observed = value as ReturnType<typeof build>;
    if (!observed || observed.exitCode !== 0 || observed.compilationExitCode !== 0 || observed.language !== 'python' || observed.sourceTreeHash !== tree || observed.tests.testsRun !== 25 || observed.tests.failures || observed.tests.errors || !observed.files.length) throw Error('Inventory host compilation/test evidence mismatch');
    const expectedFiles = tree === report.trust.sourceTreeHash ? inventoryHashes : candidate;
    exact(observed.files, Object.keys(expectedFiles).filter(path => path.endsWith('.py')).sort().map(path => ({ path, sha256: expectedFiles[path] })), 'Inventory compiled files mismatch');
    exact(observed.tests, { testsRun: 25, failures: 0, errors: 0 }, 'Inventory test count mismatch');
  }
  if (passed('host-business-tests') || passed('black-box-business-differential')) {
    const baseline = await assertInventoryBaseline(input.baseline, { sourceVersion: report.provenance.sourceVersion });
    if (passed('black-box-business-differential')) {
      const differential = input.differential as Record<string, any>;
      exact(differential.candidate, inventoryProvenance(report.provenance.sourceVersion, report.trust.candidateTreeHash), 'Inventory candidate provenance mismatch');
      const recomputed = await compareBaseline({ baseline, adapter: { safety: 'isolated-seeded-fixture', async execute(test) { const found = differential.cases.find((item: { id: string }) => item.id === test.id); if (!found) throw Error('Missing inventory observation'); return found.observation as Observation; } }, provenance: differential.candidate as Provenance, configuration: { baselineHash: baseline.hash, candidateCodeHash: report.trust.candidateTreeHash, registryHash: improvementRegistryHash([]), enabled: [] }, improvements: [] });
      if (!recomputed.passed || recomputed.candidate.sourceVersion !== report.provenance.sourceVersion) throw Error('Inventory differential did not pass bound source'); exact(differential, recomputed, 'Inventory differential claim mismatch');
    }
  }
  if (passed('authenticated-runtime')) {
    const { inventoryRuntimeAssertions } = await import('@ae/runtime-core');
    const runtime = input.runtime as Record<string, any>;
    if (!runtime || runtime.status !== 'pass' || runtime.modelMode !== 'simulated' || runtime.runtime !== 'official-agents-sdk-memory' || canonical(runtime.assertions) !== canonical(inventoryRuntimeAssertions) || runtime.mutationCount !== 2 || canonical(runtime.finalStock) !== canonical({ sku: 'desk-01', tenantId: 'tenant-a', available: 7, version: 3 })) throw Error('Inventory runtime proof incomplete');
  }
  if (passed('cli-acceptance')) assertCli(input.browser);
  if (passed('fixture-process-completion') && (report.cleanup?.status !== 'complete' || report.process?.mode !== 'bounded-synchronous-children' || report.process?.completed !== true || report.process?.noOutstandingChildren !== true)) throw Error('Inventory process completion not established');
}
