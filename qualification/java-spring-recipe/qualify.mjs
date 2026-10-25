import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { checkJavaDeliveryEvidence } from '../../packages/transformation/dist/java-harness.js';
import { assertJavaObservation } from '../../packages/transformation/dist/java-baseline.js';

const started = Date.now(), parent = mkdtempSync(join(tmpdir(), 'ae-java-recipe-'));
const source = join(parent, 'source'), candidate = join(parent, 'candidate'), delivery = join(parent, 'delivery');
const artifact = name => join(parent, name + '.json');
const results = [];
const cli = (...args) => {
  const result = spawnSync(process.execPath, ['packages/cli/dist/index.js', ...args], { encoding: 'utf8', timeout: 240_000, maxBuffer: 4 * 1024 * 1024 });
  results.push({ command: args[0], exitCode: result.status });
  assert.equal(result.signal, null); assert.equal(result.status, args[0] === 'verify' ? 2 : 0, result.stderr + result.stdout);
  return result.stdout ? JSON.parse(result.stdout) : null;
};
try {
  cpSync(resolve('fixtures/existing-java-spring-inventory'), source, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: 'pipe' });
  git('init'); git('add', '.'); git('-c', 'user.name=AE fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Original Spring Core CLI before transformation');
  const original = Object.fromEntries(['Inventory.java', 'InventoryCli.java', 'pom.xml', 'README.md'].map(path => [path, readFileSync(join(source, path), 'utf8')]));
  assert.equal(existsSync(join(source, 'agentic')), false);
  cli('assess', '--repo', source, '--out', artifact('assessment'));
  cli('plan', '--assessment', artifact('assessment'), '--verification-profile', 'java-spring-inventory-synthetic-v1', '--out', artifact('plan'));
  const plan = JSON.parse(readFileSync(artifact('plan'), 'utf8'));
  cli('preview', '--repo', source, '--assessment', artifact('assessment'), '--plan', artifact('plan'), '--out', artifact('preview'));
  cli('approve', '--plan', artifact('plan'), '--plan-hash', plan.planHash, '--approver', 'synthetic-fixture-reviewer', '--authorization-ref', 'explicit-owned-java-spring-recipe-qualification', '--out', artifact('approval'));
  cli('apply', '--repo', source, '--worktree', candidate, '--assessment', artifact('assessment'), '--plan', artifact('plan'), '--approval', artifact('approval'), '--baseline-out', artifact('pre-apply-baseline'), '--out', artifact('patch'));
  const applied = JSON.parse(readFileSync(artifact('patch'), 'utf8')), baseline = JSON.parse(readFileSync(artifact('pre-apply-baseline'), 'utf8'));
  assert.ok(Date.parse(baseline.archive.manifest.capturedAt) <= Date.parse(applied.patch.appliedAt));
  for (const [path, content] of Object.entries(original)) assert.equal(readFileSync(join(candidate, path), 'utf8'), content);
  assert.equal(existsSync(join(source, 'agentic')), false); assert.equal(git('status', '--porcelain'), '');
  const verification = cli('verify', '--patch', artifact('patch')); assert.equal(verification.checks.some(check => check.name === 'host-compilation' && check.status === 'not-run'), true);
  const manifest = cli('deliver', '--repo', source, '--assessment', artifact('assessment'), '--plan', artifact('plan'), '--approval', artifact('approval'), '--patch', artifact('patch'), '--out-dir', delivery);
  assert.equal(manifest.status, 'complete'); assert.equal(manifest.verificationScope, 'java-spring-inventory-synthetic-v1');
  assert.equal(cli('delivery-check', '--bundle', delivery).valid, true);
  const evidence = Object.fromEntries(Object.entries({ report: 'report', baseline: 'baseline', differential: 'differential', originalBuild: 'original-build', candidateBuild: 'candidate-build', runtime: 'runtime', browser: 'cli' }).map(([key, name]) => [key, JSON.parse(readFileSync(join(delivery, 'evidence', name + '.json'), 'utf8'))]));
  assert.deepEqual(evidence.baseline, baseline.archive);
  const tamperCases = [
    value => { value.candidateBuild.files[0].sha256 = '0'.repeat(64); },
    value => { value.report.trust.candidateFiles['Inventory.java'] = '0'.repeat(64); },
    value => { value.differential.candidate.environment = 'invented'; },
    value => { value.differential.cases.pop(); },
    value => { value.differential.cases[1].observation.receipt.mutationCount = 0; },
    value => { value.runtime.assertions.pop(); },
    value => { value.report.process.noOutstandingChildren = false; },
    value => { value.browser.restarted.results[1].receiptId = '11234567-0123-4123-8123-0123456789ab'; },
  ];
  for (const tamper of tamperCases) { const forged = structuredClone(evidence); tamper(forged); await assert.rejects(checkJavaDeliveryEvidence(forged)); }
  for (const item of evidence.differential.cases) assertJavaObservation(item.id, item.observation);
  cli('revert', '--patch', artifact('patch')); assert.equal(existsSync(join(candidate, 'agentic/AeHost.java')), false);
  for (const [path, content] of Object.entries(original)) assert.equal(readFileSync(join(candidate, path), 'utf8'), content);
  const output = resolve('qualification/java-spring-recipe/.runtime'); mkdirSync(output, { recursive: true });
  const report = { schemaVersion: 1, status: 'pass', profile: manifest.verificationScope, lifecycleCommands: results, baselineBeforeApply: true, originalSourcesUnchanged: true, businessCases: evidence.differential.cases.length, differentialPassed: evidence.differential.passed, tamperCasesRejected: tamperCases.length, originalCliPreserved: true, recipeAdapterRemovedOnRevert: true, runtime: evidence.runtime, checks: manifest.checks.map(({ name, status }) => ({ name, status })), elapsedMs: Date.now() - started, excluded: ['arbitrary Java source transformation', 'Spring Boot/MVC', 'production IAM/TLS', 'Java PostgreSQL/DBOS execution', 'real provider inference', 'power-loss safety'] };
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
  cpSync(delivery, join(output, 'delivery-' + Date.now()), { recursive: true });
  console.log(JSON.stringify(report, null, 2));
} finally { rmSync(parent, { recursive: true, force: true }); }
