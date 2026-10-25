import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { assessProject, proposePlan, approvePlan, applyApprovedPlan, applyApprovedPlanWithBaseline, verifyAdaptation, revertAdaptation, createDelivery, checkDelivery, digest } from '../src/index.js';
import { runInventoryDelivery, checkInventoryDeliveryEvidence } from '../src/inventory-harness.js';
import { captureInventoryBaseline, inventoryCaseIds, assertInventoryBaseline, executeInventoryCase, expectedInventoryObservation } from '../src/inventory-baseline.js';

function setup(profile = false) {
  const parent = mkdtempSync(join(tmpdir(), 'ae-inventory-lifecycle-')), sourceRoot = join(parent, 'source'), destination = join(parent, 'candidate'), baselinePath = join(parent, 'baseline.json');
  cpSync(resolve('fixtures/existing-python-inventory'), sourceRoot, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8', stdio: 'pipe' });
  git('init'); git('add', '.'); git('-c', 'user.name=AE synthetic fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Original Python inventory before AE');
  const assessment = assessProject(sourceRoot), plan = proposePlan(assessment, profile ? { verificationProfile: 'python-inventory-synthetic-v1' } : undefined), approval = approvePlan(plan, { approverId: 'fixture-reviewer', authorizationRef: 'explicit-synthetic-inventory-profile' });
  return { parent, sourceRoot, destination, baselinePath, git, assessment, plan, approval };
}
test('Python adapter is produced by the same isolated lifecycle and removed without rewriting business logic', () => {
  const fixture = setup(), original = readFileSync(join(fixture.sourceRoot, 'inventory.py'));
  assert.equal(fixture.plan.recipes[0]?.id, 'python-inventory');
  assert.deepEqual(fixture.plan.allowedPaths, ['agentic/ae_adapter.py']);
  assert.equal(existsSync(join(fixture.sourceRoot, 'agentic')), false);
  const applied = applyApprovedPlan(fixture);
  assert.deepEqual(readFileSync(join(fixture.destination, 'inventory.py')), original);
  assert.equal(existsSync(join(fixture.sourceRoot, 'agentic')), false);
  assert.equal(verifyAdaptation(applied).checks.some(check => check.status === 'fail'), false);
  assert.equal(verifyAdaptation(applied).checks.find(check => check.name === 'cli-acceptance')?.status, 'not-run');
  assert.throws(() => applyApprovedPlan(fixture), /already exists/);
  const secondAssessment = assessProject(fixture.destination), secondPlan = proposePlan(secondAssessment), secondApproval = approvePlan(secondPlan, { approverId: 'fixture', authorizationRef: 'second-reviewed' });
  assert.throws(() => applyApprovedPlan({ sourceRoot: fixture.destination, destination: join(fixture.parent, 'duplicate'), assessment: secondAssessment, plan: secondPlan, approval: secondApproval }), /Dirty recipe scope|already exists or conflicts/);
  revertAdaptation(applied); assert.equal(existsSync(join(fixture.destination, 'agentic/ae_adapter.py')), false); assert.deepEqual(readFileSync(join(fixture.destination, 'inventory.py')), original);
  assert.equal(fixture.git('status', '--porcelain'), '');
});
test('Python source drift, dirty source, absent approval and rollback drift reject before clobbering', () => {
  const f = setup();
  assert.throws(() => applyApprovedPlan({ ...f, approval: undefined as never }));
  writeFileSync(join(f.sourceRoot, 'inventory.py'), readFileSync(join(f.sourceRoot, 'inventory.py'), 'utf8') + '\n# local edit\n');
  assert.throws(() => applyApprovedPlan(f), /Source hash drift/); assert.equal(existsSync(f.destination), false);
  const assessment = assessProject(f.sourceRoot), plan = proposePlan(assessment), approval = approvePlan(plan, { approverId: 'fixture', authorizationRef: 'reviewed-edits' });
  assert.throws(() => applyApprovedPlan({ ...f, assessment, plan, approval }), /Dirty recipe scope/);
  const clean = setup(), applied = applyApprovedPlan(clean); writeFileSync(join(clean.destination, 'agentic/ae_adapter.py'), '# later customer edit');
  assert.throws(() => revertAdaptation(applied), /Patch drift/); assert.equal(readFileSync(join(clean.destination, 'agentic/ae_adapter.py'), 'utf8'), '# later customer edit');
});
test('Python profile rejects changed fixture bytes and does not accept React authorization', () => {
  const f = setup(); assert.throws(() => proposePlan(f.assessment, { verificationProfile: 'react-helpdesk-synthetic-v1' }), /exact trusted/);
  writeFileSync(join(f.sourceRoot, 'README.md'), 'Different instructions are not authorization');
  assert.throws(() => proposePlan(assessProject(f.sourceRoot), { verificationProfile: 'python-inventory-synthetic-v1' }), /exact trusted/);
});
test('ambiguous recipes fail closed rather than composing conflicting adaptations', () => {
  const f = setup(); cpSync(resolve('fixtures/existing-react-helpdesk'), f.sourceRoot, { recursive: true });
  const assessment = assessProject(f.sourceRoot); assert.equal(assessment.supportLevel, 'L0'); assert.match(assessment.unknowns.join(' '), /Conflicting/); assert.throws(() => proposePlan(assessment), /conflicting recipes/);
});
test('unsupported Python host is assessed honestly without automatic patching', () => {
  const f = setup(); writeFileSync(join(f.sourceRoot, 'inventory.py'), 'def unrelated(): return 1\n');
  const assessment = assessProject(f.sourceRoot); assert.equal(assessment.supportLevel, 'L0'); assert.throws(() => proposePlan(assessment), /developer review/);
});
test('original inventory captures its non-ticket golden semantics without generated adapter', async () => {
  const f = setup(), archive = await captureInventoryBaseline(f);
  assert.equal(archive.manifest.cases.length, inventoryCaseIds.length);
  for (const item of archive.manifest.cases) assert.deepEqual(item.observation, expectedInventoryObservation(item.test.id));
  await assertInventoryBaseline(archive, { sourceRoot: f.sourceRoot });
  assert.equal(existsSync(join(f.sourceRoot, 'agentic')), false); assert.equal(f.git('status', '--porcelain'), '');
});
test('Python profile archives original before apply and reuses the exact immutable baseline in complete delivery', async () => {
  const f = setup(true);
  assert.throws(() => applyApprovedPlan(f), /freshly captured/);
  const applied = await applyApprovedPlanWithBaseline(f), baseline = applied.preApplyBaseline!;
  assert.ok(Date.parse(baseline.record.archive.manifest.capturedAt) <= Date.parse(applied.patch.appliedAt));
  assert.equal(baseline.record.profile, 'python-inventory-synthetic-v1'); assert.equal(applied.patch.preApplyBaselineHash, digest(baseline.record));
  for (const id of inventoryCaseIds) assert.deepEqual(executeInventoryCase(f.destination, id, true), expectedInventoryObservation(id));
  const outputDirectory = join(f.parent, 'delivery'); const manifest = await createDelivery({ ...f, applied, outputDirectory });
  assert.equal(manifest.status, 'complete', JSON.stringify(manifest.checks)); assert.equal(manifest.verificationScope, 'python-inventory-synthetic-v1');
  assert.equal(manifest.checks.some(check => check.name === 'browser-acceptance'), false);
  assert.deepEqual(JSON.parse(readFileSync(join(outputDirectory, 'evidence/baseline.json'), 'utf8')), baseline.record.archive);
  const checked = await checkDelivery(outputDirectory); assert.equal(checked.valid, true, checked.errors.join('; '));
  const runtime = JSON.parse(readFileSync(join(outputDirectory, 'evidence/runtime.json'), 'utf8')); assert.equal(runtime.modelMode, 'simulated'); assert.equal(runtime.mutationCount, 2);
  const evidence = Object.fromEntries(Object.entries({ report: 'report.json', baseline: 'baseline.json', differential: 'differential.json', originalBuild: 'original-build.json', candidateBuild: 'candidate-build.json', runtime: 'runtime.json', browser: 'cli.json' }).map(([key, name]) => [key, JSON.parse(readFileSync(join(outputDirectory, 'evidence', name), 'utf8'))])) as Parameters<typeof checkInventoryDeliveryEvidence>[0];
  for (const modify of [
    (value: any) => { value.candidateBuild.files[0].sha256 = '0'.repeat(64); },
    (value: any) => { value.differential.candidate.environment = 'invented environment'; },
    (value: any) => { value.runtime.assertions.pop(); },
    (value: any) => { value.report.process.completed = false; },
    (value: any) => { value.browser.replay.result.data.stock.available = 8; },
  ]) { const forged = structuredClone(evidence); modify(forged); await assert.rejects(checkInventoryDeliveryEvidence(forged)); }
  const expired = await runInventoryDelivery({ sourceRoot: f.sourceRoot, candidateRoot: f.destination, outputDirectory: join(f.parent, 'expired-evidence'), verificationAuthorization: f.plan.verificationAuthorization, authorizationExpiresAt: new Date(Date.now() - 1000).toISOString(), preApplyBaseline: baseline.record });
  assert.equal(expired.status, 'fail'); assert.equal(expired.checks.some(check => check.status === 'pass'), false);

  const source = readFileSync(join(f.sourceRoot, 'inventory.py')); revertAdaptation(applied); assert.deepEqual(readFileSync(join(f.destination, 'inventory.py')), source);
  writeFileSync(join(outputDirectory, 'source/agentic/ae_adapter.py'), '# tampered'); assert.equal((await checkDelivery(outputDirectory)).valid, false);
});
test('profile capture rejects unexpected source and preserves unarchived candidate absence', async () => {
  const f = setup(true); mkdirSync(join(f.sourceRoot, 'unexpected')); writeFileSync(join(f.sourceRoot, 'unexpected/execute.py'), 'raise RuntimeError("never run")');
  await assert.rejects(applyApprovedPlanWithBaseline(f), /Unapproved inventory fixture path/); assert.equal(existsSync(f.destination), false); assert.equal(existsSync(f.baselinePath), false);
});
