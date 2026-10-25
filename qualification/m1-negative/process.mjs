// Executes the unchanged production supervisor with actual bounded OS fault children.
// Only the test process intercepts the fixed child entrypoint; no production hook is added.
import assert from 'node:assert/strict';
import childProcess, { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, realpathSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assessProject, proposePlan, approvePlan, applyApprovedPlanWithBaseline } from '../../packages/transformation/dist/index.js';
import { runFixtureDelivery, fixtureAuthorization, fixtureBrowserPath } from '../../packages/transformation/dist/fixture-harness.js';
const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
// During isolated qualification the immutable compiled package may be linked to the assembled candidate.
let compiledRoot = dirname(realpathSync(join(root, 'packages/transformation/dist/fixture-harness.js')));
while (!existsSync(join(compiledRoot, 'tests/browser/delivery.mjs'))) { const parent = dirname(compiledRoot); assert.notEqual(parent, compiledRoot, 'Compiled AE root must exist'); compiledRoot = parent; }
const evidence = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'ae-m1-process-negative-')));
mkdirSync(evidence, { recursive: true });
const sourceRoot = join(evidence, 'original'); cpSync(join(root, 'fixtures/existing-react-helpdesk'), sourceRoot, { recursive: true });
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], { stdio: 'pipe' });
git('init'); git('add', '.'); git('-c', 'user.name=AE fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Original synthetic host');
const assessment = assessProject(sourceRoot), plan = proposePlan(assessment, { verificationProfile: 'react-helpdesk-synthetic-v1' });
const approval = approvePlan(plan, { approverId: 'qualification', authorizationRef: 'approved-bounded-negative-fixture' });
const applied = await applyApprovedPlanWithBaseline({ sourceRoot, destination: join(evidence, 'candidate'), baselinePath: join(evidence, 'pre-apply.json'), assessment, plan, approval });
const actualSpawn = childProcess.spawn, children = [], results = [];
let activeMode, faultDirectory;
childProcess.spawn = function(command, args, options) {
  assert.equal(command, process.execPath); assert.equal(args[1], join(compiledRoot, 'tests/browser/delivery.mjs'));
  assert.equal(options.detached, true); assert.equal(options.stdio[0], 'ignore');
  const input = JSON.parse(args[2]); faultDirectory = input.outputDirectory;
  const child = actualSpawn.call(this, command, ['--max-old-space-size=64', join(root, 'qualification/m1-negative/process-child.mjs'), activeMode, args[2]], options);
  children.push(child); return child;
};
syncBuiltinESMExports();
try {
  for (const mode of ['timeout', 'cleanup-hang', 'cleanup-failed']) {
    activeMode = mode; const before = children.length, startedAt = new Date().toISOString(), started = performance.now();
    const result = await runFixtureDelivery({ sourceRoot, candidateRoot: applied.patch.worktree, outputDirectory: join(evidence, mode), verificationAuthorization: fixtureAuthorization,
      authorizationExpiresAt: new Date(Date.now() + 10000).toISOString(), preApplyBaseline: applied.preApplyBaseline.record, browserExecutable: fixtureBrowserPath });
    const elapsedMs = performance.now() - started, report = JSON.parse(readFileSync(result.reportPath, 'utf8'));
    const fault = JSON.parse(readFileSync(join(faultDirectory, 'fault-observation.json'), 'utf8'));
    assert.equal(children.length, before + 1); assert.equal(report.process.started, true); assert.equal(result.status, 'fail'); assert.equal(report.status, 'fail');
    assert.equal(report.checks.at(-1).name, 'fixture-process-completion'); assert.equal(report.checks.at(-1).status, 'fail');
    assert.equal(report.process.groupClosed, true); assert.equal(report.process.forcedCleanup, false);
    assert.throws(() => process.kill(-fault.pid, 0), error => error.code === 'ESRCH');
    if (mode === 'cleanup-failed') {
      assert.equal(report.process.exitCode, 0); assert.equal(report.process.signal, null); assert.equal(report.process.timedOut, false);
      assert.equal(report.cleanup.status, 'failed'); assert.equal(fault.cleanupError, 'ERR_SERVER_NOT_RUNNING');
    } else {
      assert.equal(report.process.timedOut, true); assert.equal(report.process.signal, 'SIGKILL'); assert.equal(report.process.exitCode, null); assert.equal(fault.sigtermCount, 1);
      assert(elapsedMs >= 4000 && elapsedMs < 10000, 'Real deadline/escalation must remain within authorized budget');
      if (mode === 'cleanup-hang') { assert.equal(fault.openConnections, 1); assert.equal(fault.cleanupCallbackReturned, undefined); assert.equal(report.cleanup.status, 'pending'); }
      else assert.match(report.failure, /without a report/);
    }
    const observed = { mode, startedAt, completedAt: new Date().toISOString(), elapsedMs, outcome: report.process, fault, status: 'PASS' };
    results.push(observed); writeFileSync(join(evidence, mode, 'fault-observation.json'), JSON.stringify(fault, null, 2) + '\n');
    console.log('PASS ' + mode + ': actual owned child terminal failure overrides prior PASS/missing report');
  }
} finally {
  childProcess.spawn = actualSpawn; syncBuiltinESMExports();
  for (const child of children) if (child.exitCode === null && child.signalCode === null) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  writeFileSync(join(evidence, 'process-negative-summary.json'), JSON.stringify({ status: results.length === 3 ? 'PASS' : 'FAIL', candidate: execFileSync('git', ['-C', compiledRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    runtimeSourceHash: sha(join(compiledRoot, 'packages/transformation/src/fixture-harness.ts')), runtimeCompiledHash: sha(join(compiledRoot, 'packages/transformation/dist/fixture-harness.js')),
    testFiles: Object.fromEntries(['process.mjs', 'process-child.mjs'].map(name => [name, sha(join(root, 'qualification/m1-negative', name))])), results,
    scope: 'Actual production parent supervision and real OS deadline/signals/cleanup. Child entrypoint substituted only in this test process. No browser/business PASS claim is made from the sentinel child report.' }, null, 2) + '\n');
  console.log('Evidence: ' + evidence);
}
