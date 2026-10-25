import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { assessProject, proposePlan, approvePlan, applyApprovedPlan, applyApprovedPlanWithBaseline, verifyAdaptation, revertAdaptation, createDelivery, checkDelivery, installedRecipeDescriptors, sha256 } from '../src/index.js';
import { JAVA_ADAPTER } from '../src/recipes/java-spring-inventory.js';
import { assertJavaObservation, expectedJavaObservation, javaCaseIds, javaHashes } from '../src/java-baseline.js';
import { hash } from '../src/inventory-baseline.js';

function setup(profile = false) {
  const parent = mkdtempSync(join(tmpdir(), 'ae-java-static-')), sourceRoot = join(parent, 'source'), destination = join(parent, 'candidate'), baselinePath = join(parent, 'baseline.json');
  cpSync(resolve('fixtures/existing-java-spring-inventory'), sourceRoot, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8', stdio: 'pipe' });
  git('init'); git('add', '.'); git('-c', 'user.name=AE synthetic fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Original Java Spring CLI before AE');
  const assessment = assessProject(sourceRoot), plan = proposePlan(assessment, profile ? { verificationProfile: 'java-spring-inventory-synthetic-v1' } : undefined), approval = approvePlan(plan, { approverId: 'fixture-reviewer', authorizationRef: 'explicit-synthetic-Java-profile' });
  return { parent, sourceRoot, destination, baselinePath, git, assessment, plan, approval };
}
test('installed Java recipe is additive, preserves original language/CLI, and reuses the qualified adapter byte-for-byte', () => {
  const f = setup(); try {
    for (const [path, expected] of Object.entries(javaHashes)) assert.equal(hash(readFileSync(join(f.sourceRoot, path))), expected);
    assert.equal(JAVA_ADAPTER, readFileSync(resolve('fixtures/java-spring-host/AeHost.java'), 'utf8'));
    assert.ok(installedRecipeDescriptors().some(recipe => recipe.ref.id === 'java-spring-inventory'));
    assert.deepEqual(f.plan.allowedPaths, ['agentic/AeHost.java']); assert.match(f.plan.nonGoals.join(' '), /Spring Boot/); assert.equal(f.plan.verificationAuthorization, undefined);
    const applied = applyApprovedPlan(f); assert.equal(existsSync(join(f.sourceRoot, 'agentic')), false);
    for (const path of Object.keys(javaHashes)) assert.deepEqual(readFileSync(join(f.destination, path)), readFileSync(join(f.sourceRoot, path)));
    const checks = verifyAdaptation(applied).checks; assert.equal(checks.some(check => check.status === 'fail'), false); assert.equal(checks.find(check => check.name === 'host-compilation')?.status, 'not-run');
    assert.throws(() => applyApprovedPlan(f), /already exists/);
    const assessment = assessProject(f.destination), plan = proposePlan(assessment), approval = approvePlan(plan, { approverId: 'fixture', authorizationRef: 'reviewed' });
    assert.throws(() => applyApprovedPlan({ sourceRoot: f.destination, destination: join(f.parent, 'duplicate'), assessment, plan, approval }), /already exists or conflicts|Dirty recipe scope/);
    revertAdaptation(applied); assert.equal(existsSync(join(f.destination, 'agentic/AeHost.java')), false); assert.equal(f.git('status', '--porcelain'), '');
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});
test('Java drift, dirty scope, absent approval and rollback edits fail without clobbering', () => {
  const f = setup(); try {
    assert.throws(() => applyApprovedPlan({ ...f, approval: undefined as never }));
    writeFileSync(join(f.sourceRoot, 'Inventory.java'), readFileSync(join(f.sourceRoot, 'Inventory.java'), 'utf8') + '\n// user edit\n');
    assert.throws(() => applyApprovedPlan(f), /Source hash drift/); assert.equal(existsSync(f.destination), false);
    const assessment = assessProject(f.sourceRoot), plan = proposePlan(assessment), approval = approvePlan(plan, { approverId: 'fixture', authorizationRef: 'reviewed' });
    assert.throws(() => applyApprovedPlan({ ...f, assessment, plan, approval }), /Dirty recipe scope/);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
  const g = setup(); try { const applied = applyApprovedPlan(g); writeFileSync(join(g.destination, 'agentic/AeHost.java'), '// later edit'); assert.throws(() => revertAdaptation(applied), /Patch drift/); assert.equal(readFileSync(join(g.destination, 'agentic/AeHost.java'), 'utf8'), '// later edit'); }
  finally { rmSync(g.parent, { recursive: true, force: true }); }
});
test('Java profiles require exact evidence and fresh archived pre-apply authorization', async () => {
  const f = setup(true); try {
    assert.throws(() => applyApprovedPlan(f), /freshly captured/);
    assert.throws(() => proposePlan(f.assessment, { verificationProfile: 'python-inventory-synthetic-v1' }), /exact trusted/);
    writeFileSync(join(f.sourceRoot, 'unexpected.java'), 'unreviewed code must never execute');
    await assert.rejects(applyApprovedPlanWithBaseline(f), /Unapproved Java fixture path/); assert.equal(existsSync(f.baselinePath), false); assert.equal(existsSync(f.destination), false);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
  const g = setup(); try { writeFileSync(join(g.sourceRoot, 'README.md'), 'changed fixture'); assert.throws(() => proposePlan(assessProject(g.sourceRoot), { verificationProfile: 'java-spring-inventory-synthetic-v1' }), /exact trusted/); }
  finally { rmSync(g.parent, { recursive: true, force: true }); }
});
test('unknown Spring Boot/MVC layouts degrade to assessment only; symlinks and recipe conflicts reject', () => {
  const f = setup(); try {
    writeFileSync(join(f.sourceRoot, 'pom.xml'), '<project><artifactId>spring-boot-app</artifactId></project>');
    assert.equal(assessProject(f.sourceRoot).supportLevel, 'L0'); assert.throws(() => proposePlan(assessProject(f.sourceRoot)), /developer review/);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
  const g = setup(); try { cpSync(resolve('fixtures/existing-python-inventory'), g.sourceRoot, { recursive: true }); assert.equal(assessProject(g.sourceRoot).supportLevel, 'L0'); }
  finally { rmSync(g.parent, { recursive: true, force: true }); }
  const h = setup(); try { rmSync(join(h.sourceRoot, 'Inventory.java')); symlinkSync('/dev/null', join(h.sourceRoot, 'Inventory.java')); assert.throws(() => assessProject(h.sourceRoot), /Symlink/); }
  finally { rmSync(h.parent, { recursive: true, force: true }); }
});
test('Java static delivery stays partial and does not assert execution or general Spring compatibility', async () => {
  const f = setup(); try {
    const applied = applyApprovedPlan(f), outputDirectory = join(f.parent, 'delivery');
    const manifest = await createDelivery({ ...f, applied, outputDirectory }); assert.equal(manifest.status, 'partial'); assert.equal(manifest.verificationScope, 'static-only');
    const checked = await checkDelivery(outputDirectory); assert.equal(checked.valid, true, checked.errors.join('; '));
    writeFileSync(join(outputDirectory, 'source/agentic/AeHost.java'), '// forged'); assert.equal((await checkDelivery(outputDirectory)).valid, false);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});
test('Java receipt normalization cannot hide amounts, missing writes, identity mismatch or replay divergence', () => {
  const uuid = '01234567-0123-4123-8123-0123456789ab';
  for (const id of javaCaseIds) {
    const value = expectedJavaObservation(id); const receipt = value.receipt as Record<string, any>;
    for (const field of ['generatedId', 'observedId']) if (receipt[field] !== null) receipt[field] = uuid;
    assertJavaObservation(id, value);
    const changed = structuredClone(value); (changed.receipt as Record<string, any>).mutationCount = 99; assert.throws(() => assertJavaObservation(id, changed));
  }
  const value = expectedJavaObservation('reserve'), receipt = value.receipt as Record<string, any>; receipt.generatedId = uuid; receipt.observedId = '11234567-0123-4123-8123-0123456789ab'; assert.throws(() => assertJavaObservation('reserve', value));
});
test('CLI plan accepts the explicit Java profile without executing or downloading anything', () => {
  const f = setup(); try {
    const assessment = join(f.parent, 'assessment.json'), out = join(f.parent, 'plan.json'); writeFileSync(assessment, JSON.stringify(f.assessment));
    execFileSync(process.execPath, ['packages/cli/dist/index.js', 'plan', '--assessment', assessment, '--verification-profile', 'java-spring-inventory-synthetic-v1', '--out', out], { encoding: 'utf8', stdio: 'pipe' });
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).plan.verificationAuthorization.profile, 'java-spring-inventory-synthetic-v1'); assert.equal(existsSync(f.destination), false);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});
test('official MCP client actually plans/previews/verifies Java recipe and rejects mismatched host/version without granting execution', async () => {
  const f = setup(), client = new Client({ name: 'java-recipe-static-check', version: '1' });
  const readResult = (value: any) => { assert.notEqual(value.isError, true); return JSON.parse(value.content[0].text); };
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('dist/packages/mcp-server/src/stdio.js')], env: { PATH: '/usr/bin:/bin', AE_MCP_REPO_ROOT: f.sourceRoot }, stderr: 'pipe' }));
    const planned = readResult(await client.callTool({ name: 'ae_plan', arguments: { recipeId: 'java-spring-inventory' } }));
    assert.deepEqual(planned.plan, f.plan); assert.equal(planned.plan.verificationAuthorization, undefined);
    const preview = readResult(await client.callTool({ name: 'ae_preview', arguments: { recipeId: 'java-spring-inventory', planHash: planned.planHash } }));
    assert.deepEqual(preview.changes.map((change: any) => change.path), ['agentic/AeHost.java']); assert.equal(preview.changes[0].after, JAVA_ADAPTER);
    const patch = { schemaVersion: '1', planHash: planned.planHash, baseCommit: f.plan.baseCommit, recipe: f.plan.recipes[0], appliedAt: new Date().toISOString(), changes: [{ path: 'agentic/AeHost.java', beforeHash: null, afterHash: sha256(JAVA_ADAPTER) }] };
    const businessHash = sha256(readFileSync(join(f.sourceRoot, 'Inventory.java'), 'utf8'));
    const unapplied = readResult(await client.callTool({ name: 'ae_verify', arguments: { patch, businessHash } })); assert.ok(unapplied.checks.some((check: any) => check.status === 'fail'));
    for (const request of [
      { name: 'ae_plan', arguments: { recipeId: 'python-inventory' } },
      { name: 'ae_preview', arguments: { recipeId: 'java-spring-inventory', planHash: '0'.repeat(64) } },
      { name: 'ae_verify', arguments: { patch: { ...patch, recipe: { id: 'java-spring-inventory', version: 'stale' } }, businessHash } },
      { name: 'ae_plan', arguments: { recipeId: 'java-spring-inventory', verificationProfile: 'java-spring-inventory-synthetic-v1' } },
    ]) { let rejected = false; try { rejected = (await client.callTool(request)).isError === true; } catch { rejected = true; } assert.equal(rejected, true); }
    // Test-owned materialization only. MCP remains read-only and never applies the preview.
    mkdirSync(join(f.sourceRoot, 'agentic')); writeFileSync(join(f.sourceRoot, 'agentic/AeHost.java'), JAVA_ADAPTER);
    const verified = readResult(await client.callTool({ name: 'ae_verify', arguments: { patch, businessHash } }));
    assert.equal(verified.checks.some((check: any) => check.status === 'fail'), false);
    for (const name of ['host-compilation', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'cli-acceptance']) assert.equal(verified.checks.find((check: any) => check.name === name).status, 'not-run');
    writeFileSync(join(f.sourceRoot, 'agentic/AeHost.java'), '// output drift');
    const drifted = readResult(await client.callTool({ name: 'ae_verify', arguments: { patch, businessHash } })); assert.ok(drifted.checks.some((check: any) => check.status === 'fail'));
  } finally { await client.close(); rmSync(f.parent, { recursive: true, force: true }); }
});
