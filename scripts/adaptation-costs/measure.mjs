// Bounded execution-cost receipt, not a human productivity benchmark.
// Run from the matching, already-built checkout. No installs or paid calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output') throw Error('Usage: node scripts/adaptation-costs/measure.mjs --output NEW_ABSOLUTE_DIRECTORY');
const out = resolve(args[1]);
assert.equal(out, args[1], 'Output must be absolute');
assert.ok(out !== root && !out.startsWith(root + '/'), 'Evidence stays outside the source checkout');
assert.ok(!existsSync(out), 'Never overwrite an earlier measurement');
mkdirSync(out, { recursive: true });
const started = performance.now();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); };
const report = {
  schemaVersion: '1', kind: 'bounded-direct-scripted-vs-ae-cost-receipt', status: 'running',
  startedAt: new Date().toISOString(), invocation: [process.execPath, ...process.argv.slice(1)],
  method: {
    trialsPerHost: 1, hostOrder: ['react-helpdesk', 'python-inventory'],
    stageOrder: 'shared source setup; AE assess/plan/approve/archive/apply/static verify; direct copy/patch; direct acceptance; AE deliver/check; repeat guards; rollback both',
    baseline: 'One original archive per host, captured by AE before either candidate is changed; both acceptance runs consume precisely that archive without recapture.',
    directRoute: 'Frozen reviewed git patch applied by a script. Patch bytes were copied from the already-developed recipe output during preparation, not independently designed by a timed human.',
    equivalence: 'Both routes reuse the same existing AE SDK/runtime and produce byte-identical intended host integration changes. Original business source is unchanged.',
    timing: 'Monotonic process/stage elapsed milliseconds on one shared cloud machine. Setup, patch execution, AE lifecycle, common verification, rollback and measurement overhead are separate. No normalized total, ratio or speedup is computed.',
    sharedBaselineAccounting: 'AE archive-and-apply includes baseline capture and isolation. The direct route reuses that archive as common test infrastructure; direct stage sum is not an independently complete compliance workflow.',
    approval: 'Recorded synthetic-fixture approval granted to this measurement, not timed human review or a production user decision.',
    acceptance: 'The same existing fixed host profile executes for each arm. Direct uses its reviewed profile harness; AE uses createDelivery and checkDelivery, which additionally package and validate lifecycle evidence.',
    model: 'Deterministic simulated model only; no paid-provider inference or provider-token accounting.',
    defectDefinition: 'Unexpected failed gate or assertion in this paired run; expected repeat guards and deliberate existing harness negative cases are not defects.',
    reworkDefinition: 'Corrective source edits or reruns after an unexpected failure in this paired run, not historic recipe development.',
    limitations: ['One fixed-order pair per tiny prequalified fixture; warm caches, process scheduling and harness overhead can affect timings.', 'Frozen direct patches give both arms prior implementation knowledge; this does not compare discovery, authoring, review or human skill.', 'No arbitrary customer project, production identity, live provider, deployment or new support qualification.', 'Equal lines changed prove equal modification scope, not time saved or defect probability.'],
  },
  costs: { paidCalls: 0, paidServiceSpendUsd: 0, developerHours: null, historicalEngineeringCost: null, modelTokens: null, cloudInfrastructureCostUsd: null, unknownReason: 'No credible effort/token/infra-price meter or historical ledger is available; process elapsed time is not developer effort.' },
  commands: [], hosts: [], failures: [],
};
function command(phase, cwd, program, argv, accepted = [0]) {
  const start = performance.now();
  const result = spawnSync(program, argv, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' } });
  report.commands.push({ phase, cwd, program, argv, elapsedMs: +(performance.now() - start).toFixed(3), exitCode: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, error: result.error?.message ?? null });
  if (result.error || result.signal || !accepted.includes(result.status)) throw Error(`${phase}: ${program} exited ${result.status}: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
const git = (phase, cwd, ...argv) => command(phase, cwd, 'git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.autocrlf=false', ...argv]);
function tree(dir) {
  const files = {};
  function walk(rel = '') {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      if (name === '.git') continue;
      const path = rel ? `${rel}/${name}` : name, stat = lstatSync(join(dir, path));
      assert.equal(stat.isSymbolicLink(), false, `Unexpected symlink: ${path}`);
      if (stat.isDirectory()) walk(path);
      else { assert.equal(stat.isFile(), true); files[path] = { sha256: hash(readFileSync(join(dir, path))), bytes: stat.size }; }
    }
  }
  walk(); return files;
}
const filesTotal = files => ({ files: Object.keys(files).length, bytes: Object.values(files).reduce((sum, item) => sum + item.bytes, 0) });
async function stage(host, arm, name, operation) {
  const start = performance.now(), entry = { arm, name, startedAt: new Date().toISOString(), status: 'running' };
  host.stages.push(entry);
  try { const value = await operation(); entry.status = 'pass'; return value; }
  catch (error) { entry.status = 'fail'; entry.error = String(error); throw error; }
  finally { entry.elapsedMs = +(performance.now() - start).toFixed(3); }
}
function changedLines(host, candidate, sourceFiles, arm) {
  // Intent-to-add makes new adapter files visible to the Git line counter only.
  git('measurement-only-line-counter', candidate, 'add', '-N', '.');
  const raw = git('measurement-only-line-counter', candidate, 'diff', '--numstat', '--no-ext-diff');
  const files = raw.trim().split('\n').filter(Boolean).map(line => { const [added, deleted, path] = line.split('\t'); assert.match(added, /^\d+$/); assert.match(deleted, /^\d+$/); return { path, added: Number(added), deleted: Number(deleted), beforeSha256: sourceFiles[path]?.sha256 ?? null, afterSha256: hash(readFileSync(join(candidate, path))) }; });
  const patch = git('measurement-only-line-counter', candidate, 'diff', '--binary', '--no-ext-diff');
  writeFileSync(join(out, host.id, `${arm}-observed.patch`), patch, { flag: 'wx' });
  return { files, filesChanged: files.length, linesAdded: files.reduce((n, f) => n + f.added, 0), linesDeleted: files.reduce((n, f) => n + f.deleted, 0) };
}
try {
  const { qualifiedPython } = await import(pathToFileURL(join(root, 'packages/capabilities/dist/python-runtime.js')).href);
  report.environment = {
    sourceCommit: git('provenance', root, 'rev-parse', 'HEAD').trim(),
    node: process.version, platform: process.platform, architecture: process.arch,
    git: command('provenance', root, 'git', ['--version']).trim(),
    python: command('provenance', root, qualifiedPython(), ['--version']).trim(),
    lockfileSha256: hash(readFileSync(join(root, 'package-lock.json'))),
    scriptSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    sharedMachine: true, processHeapMiB: 640, measurementOutput: out,
  };
  const load = path => import(pathToFileURL(join(root, path)).href);
  const ae = await load('packages/transformation/dist/index.js');
  const { reviewedProfile } = await load('packages/transformation/dist/profiles.js');
  for (const id of report.method.hostOrder) {
    const host = { id, profile: `${id}-synthetic-v1`, status: 'running', stages: [], unexpectedDefectsObserved: 0, correctiveSourceEdits: 0, retriesAfterUnexpectedFailure: 0 };
    report.hosts.push(host);
    const folder = join(out, id), sourceRoot = join(folder, 'original'), destination = join(folder, 'ae-candidate'), direct = join(folder, 'direct-candidate'), baselinePath = join(folder, 'original-before-apply.json');
    mkdirSync(folder);
    await stage(host, 'shared', 'create-pristine-source', () => {
      cpSync(join(root, 'fixtures', `existing-${id}`), sourceRoot, { recursive: true });
      git('source-setup', sourceRoot, 'init', '-q'); git('source-setup', sourceRoot, 'add', '.');
      git('source-setup', sourceRoot, '-c', 'user.name=AE cost fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Original fixture before either adaptation arm');
    });
    const original = tree(sourceRoot);
    host.original = { sourceCommit: git('provenance', sourceRoot, 'rev-parse', 'HEAD').trim(), files: original };
    const assessment = await stage(host, 'ae', 'assess', () => ae.assessProject(sourceRoot)); save(join(folder, 'assessment.json'), assessment);
    const plan = await stage(host, 'ae', 'plan', () => ae.proposePlan(assessment, { verificationProfile: host.profile })); save(join(folder, 'plan.json'), plan);
    const approval = await stage(host, 'ae', 'approve-synthetic-record', () => ae.approvePlan(plan, { approverId: 'synthetic-cost-measurement', authorizationRef: 'explicit-bounded-direct-vs-ae-fixture-measurement' })); save(join(folder, 'approval.json'), approval);
    const input = { sourceRoot, destination, baselinePath, assessment, plan, approval };
    const applied = await stage(host, 'ae', 'archive-original-and-apply-isolated', () => ae.applyApprovedPlanWithBaseline(input)); save(join(folder, 'applied.json'), applied);
    const baselineBytes = readFileSync(baselinePath), baselineSha256 = hash(baselineBytes);
    const verification = await stage(host, 'ae', 'verify-static', () => ae.verifyAdaptation(applied)); save(join(folder, 'static-verification.json'), verification);
    assert.ok(verification.checks.every(check => check.status !== 'fail'));
    host.originalBaseline = { path: relative(out, baselinePath), sha256: baselineSha256, archiveHash: applied.preApplyBaseline.record.archive.hash, capturedAt: applied.preApplyBaseline.record.archive.manifest.capturedAt, appliedAt: applied.patch.appliedAt, cases: applied.preApplyBaseline.record.archive.manifest.cases.length, mode: (lstatSync(baselinePath).mode & 0o777).toString(8), reusedWithoutRecapture: true };
    assert.ok(Date.parse(host.originalBaseline.capturedAt) <= Date.parse(applied.patch.appliedAt));
    const patchPath = join(root, 'scripts/adaptation-costs/direct-patches', `${id}.patch`);
    host.directPatch = { path: relative(root, patchPath), sha256: hash(readFileSync(patchPath)), provenance: 'Frozen reviewed existing recipe output, prepared outside the measured execution.' };
    await stage(host, 'direct-scripted', 'copy-pristine-host', () => cpSync(sourceRoot, direct, { recursive: true }));
    await stage(host, 'direct-scripted', 'patch-preflight-and-apply', () => {
      git('direct-patch', direct, 'apply', '--check', patchPath);
      git('direct-patch', direct, 'apply', patchPath);
    });
    const candidate = tree(destination);
    assert.deepEqual(tree(direct), candidate, 'Both arms must have exactly the same intended output bytes');
    host.candidate = { files: candidate, byteIdenticalAcrossArms: true };
    host.changes = { direct: changedLines(host, direct, original, 'direct'), ae: changedLines(host, destination, original, 'ae') };
    assert.deepEqual(host.changes.direct, host.changes.ae);
    const profile = reviewedProfile(host.profile), directEvidence = join(folder, 'direct-evidence');
    const directResult = await stage(host, 'direct-scripted', 'common-acceptance-harness', () => profile.run({ sourceRoot, candidateRoot: direct, outputDirectory: directEvidence, verificationAuthorization: plan.verificationAuthorization, authorizationExpiresAt: approval.expiresAt, preApplyBaseline: applied.preApplyBaseline.record }));
    assert.equal(directResult.status, 'pass', JSON.stringify(directResult.checks));
    const directArtifacts = Object.fromEntries(Object.entries(profile.evidenceFiles).map(([key, file]) => [key, JSON.parse(readFileSync(join(directEvidence, file), 'utf8'))]));
    await stage(host, 'direct-scripted', 'validate-common-evidence', () => profile.check(directArtifacts));
    const delivery = join(folder, 'ae-delivery');
    const manifest = await stage(host, 'ae', 'deliver-with-common-acceptance', () => ae.createDelivery({ ...input, applied, outputDirectory: delivery }));
    assert.equal(manifest.status, 'complete', JSON.stringify(manifest.checks));
    const checked = await stage(host, 'ae', 'check-delivery', () => ae.checkDelivery(delivery)); save(join(folder, 'delivery-check.json'), checked);
    assert.equal(checked.valid, true, checked.errors.join('; '));
    assert.deepEqual(directArtifacts.baseline, applied.preApplyBaseline.record.archive);
    assert.deepEqual(JSON.parse(readFileSync(join(delivery, 'evidence/baseline.json'), 'utf8')), applied.preApplyBaseline.record.archive);
    host.gates = { direct: directResult.checks.map(({ name, status }) => ({ name, status })), ae: manifest.checks.map(({ name, status }) => ({ name, status })) };
    host.outcomes = {
      differentialCases: { direct: directArtifacts.differential.cases.length, ae: JSON.parse(readFileSync(join(delivery, 'evidence/differential.json'), 'utf8')).cases.length },
      directRuntime: directArtifacts.runtime,
      directSurface: directArtifacts.browser,
      originalAndCandidateBuild: { original: directArtifacts.originalBuild, candidate: directArtifacts.candidateBuild },
      processCompletion: directArtifacts.report.process,
    };
    host.evidenceOverhead = { directHarnessOnly: filesTotal(tree(directEvidence)), aeDeliveryBundle: filesTotal(tree(delivery)), baselineArchiveBytes: baselineBytes.length, note: 'Actual bytes, not equivalent assurance scopes: AE bundle additionally contains chain, rollback and patch-owned source; direct uses shared baseline infrastructure.' };
    await stage(host, 'direct-scripted', 'repeat-patch-guard', () => {
      command('expected-repeat-rejection', direct, 'git', ['-c', 'core.hooksPath=/dev/null', 'apply', '--check', patchPath], [1]);
      assert.deepEqual(tree(direct), candidate);
    });
    await stage(host, 'ae', 'repeat-preview-guard', () => {
      assert.throws(() => ae.previewPatch(destination, plan, assessment), /already exists or conflicts/i);
      assert.deepEqual(tree(destination), candidate);
    });
    await stage(host, 'direct-scripted', 'rollback-owned-patch', () => { git('direct-rollback', direct, 'apply', '--reverse', patchPath); assert.deepEqual(tree(direct), original); });
    await stage(host, 'ae', 'rollback-owned-patch', () => { ae.revertAdaptation(applied); assert.deepEqual(tree(destination), original); });
    assert.deepEqual(tree(sourceRoot), original); assert.equal(git('preserved-source', sourceRoot, 'status', '--porcelain'), '');
    assert.equal(hash(readFileSync(baselinePath)), baselineSha256);
    host.preservation = { originalSourceUnchanged: true, baselineArchiveUnchanged: true, directRollbackExact: true, aeRollbackExact: true, repeatedOperationsChangedFiles: 0 };
    host.timingMs = Object.fromEntries(['shared', 'ae', 'direct-scripted'].map(arm => [arm, +host.stages.filter(s => s.arm === arm).reduce((n, s) => n + s.elapsedMs, 0).toFixed(3)]));
    host.status = 'pass';
    save(join(folder, 'host-result.json'), host);
  }
  report.status = 'pass';
} catch (error) {
  const host = report.hosts.at(-1);
  if (host && host.status !== 'pass') { host.status = 'fail'; host.unexpectedDefectsObserved++; }
  report.status = 'fail'; report.failures.push({ message: String(error), stack: error.stack }); process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString(); report.elapsedMs = +(performance.now() - started).toFixed(3);
  report.accountedStageMs = +report.hosts.flatMap(h => h.stages).reduce((n, s) => n + s.elapsedMs, 0).toFixed(3);
  report.measurementOrUnclassifiedOverheadMs = +(report.elapsedMs - report.accountedStageMs).toFixed(3);
  const evidenceFiles = tree(out);
  // Excludes this receipt itself and Git internals; all full baseline/delivery files are bound.
  report.evidenceFiles = evidenceFiles;
  save(join(out, 'measurement.json'), report);
  console.log(JSON.stringify({ status: report.status, output: out, elapsedMs: report.elapsedMs, hosts: report.hosts.map(h => ({ id: h.id, status: h.status, changes: h.changes, timingMs: h.timingMs })), failures: report.failures.map(f => f.message) }, null, 2));
}
