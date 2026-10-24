import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDelivery, checkDelivery, assessProject, proposePlan, approvePlan, applyApprovedPlan, digest, sha256 } from '../src/index.js';

function setup() {
  const parent = mkdtempSync(join(tmpdir(), 'ae-delivery-')); const sourceRoot = join(parent, 'source');
  cpSync(resolve('fixtures/existing-react-helpdesk'), sourceRoot, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', sourceRoot, ...args], { stdio: 'pipe' });
  git('init'); git('config', 'user.name', 'AE fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('add', '.'); git('commit', '-m', 'Synthetic delivery fixture');
  const assessment = assessProject(sourceRoot), plan = proposePlan(assessment), approval = approvePlan(plan, { approverId: 'fixture', authorizationRef: 'explicit-fixture-test' });
  const applied = applyApprovedPlan({ sourceRoot, destination: join(parent, 'candidate'), assessment, plan, approval });
  return { parent, sourceRoot, assessment, plan, approval, applied, outputDirectory: join(parent, 'delivery') };
}
test('delivery preserves exact chain, copies only owned files, and retains missing gates', () => {
  const f = setup(); writeFileSync(join(f.sourceRoot, 'unrelated.txt'), 'private user note');
  const manifest = createDelivery(f); assert.equal(manifest.status, 'partial'); assert.equal(manifest.toolVersion, '0.1.0');
  assert.equal(manifest.chain.planHash, digest(f.plan)); assert.equal(manifest.checks.find(c => c.name === 'black-box-business-differential')?.status, 'not-run');
  assert.deepEqual(readdirSync(join(f.outputDirectory, 'source/src')).sort(), ['App.tsx', 'ae']);
  assert.equal(checkDelivery(f.outputDirectory).valid, true);
  assert.throws(() => createDelivery(f), /EEXIST/);
  assert.equal(readFileSync(join(f.sourceRoot, 'unrelated.txt'), 'utf8'), 'private user note');
});
test('delivery rejects expiry, scope, source and candidate drift before output', () => {
  const f = setup();
  assert.throws(() => createDelivery({ ...f, approval: { ...f.approval, expiresAt: '2020-01-01T00:00:00.000Z' } }), /expired/);
  assert.throws(() => createDelivery({ ...f, approval: { ...f.approval, networkAllowlist: ['evil.invalid'] } }), /scope/);
  assert.throws(() => createDelivery({ ...f, outputDirectory: join(f.sourceRoot, 'export') }), /outside/);
  writeFileSync(join(f.applied.patch.worktree, 'src/api.ts'), '// drift');
  assert.throws(() => createDelivery(f), /Candidate source drift/);
  writeFileSync(join(f.sourceRoot, 'src/App.tsx'), '// drift');
  assert.throws(() => createDelivery(f), /Dirty source/);
});
test('package rejects bytes, unlisted files, symlink roots, forged PASS and complete status', () => {
  const f = setup(); createDelivery(f);
  const manifestPath = join(f.outputDirectory, 'manifest.json'); const original = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(original);
  manifest.status = 'complete'; writeFileSync(manifestPath, JSON.stringify(manifest)); assert.equal(checkDelivery(f.outputDirectory).valid, false);
  writeFileSync(manifestPath, original);
  const verificationPath = join(f.outputDirectory, 'verification.json');
  const verification = JSON.parse(readFileSync(verificationPath, 'utf8'));
  verification.checks.find((c: { name: string }) => c.name === 'browser-acceptance').status = 'pass';
  const forged = JSON.stringify(verification); writeFileSync(verificationPath, forged);
  manifest.status = 'partial'; manifest.checks = verification.checks; manifest.chain.verificationHash = digest(verification);
  const ref = manifest.artifacts.find((a: { path: string }) => a.path === 'verification.json'); ref.sha256 = sha256(forged); ref.bytes = Buffer.byteLength(forged);
  writeFileSync(manifestPath, JSON.stringify(manifest)); assert.match(checkDelivery(f.outputDirectory).errors.join(' '), /Unsupported verification claim/);
  const g = setup(); createDelivery(g); symlinkSync(g.outputDirectory, join(g.parent, 'alias')); assert.equal(checkDelivery(join(g.parent, 'alias')).valid, false);
  writeFileSync(join(g.outputDirectory, 'unexpected.txt'), 'not authorized'); assert.equal(checkDelivery(g.outputDirectory).valid, false);
  const h = setup(); createDelivery(h); writeFileSync(join(h.outputDirectory, 'source/src/App.tsx'), '// drift'); assert.equal(checkDelivery(h.outputDirectory).valid, false);
});
test('packaging rejects forged rollback, patch scope and candidate hashes', () => {
  const f = setup();
  assert.throws(() => createDelivery({ ...f, applied: { ...f.applied, originals: { ...f.applied.originals, 'src/App.tsx': '// forged' } } }), /Rollback baseline/);
  assert.throws(() => createDelivery({ ...f, applied: { ...f.applied, patch: { ...f.applied.patch, changes: [...f.applied.patch.changes, { path: '.env', beforeHash: null, afterHash: '0'.repeat(64) }] } } }), /Patch scope/);
  const app = f.applied.patch.changes[0]!; const value = readFileSync(join(f.applied.patch.worktree, app.path), 'utf8') + '\n// forged';
  writeFileSync(join(f.applied.patch.worktree, app.path), value);
  assert.throws(() => createDelivery({ ...f, applied: { ...f.applied, patch: { ...f.applied.patch, changes: [{ ...app, afterHash: sha256(value) }, f.applied.patch.changes[1]!] } } }), /does not match recipe/);
});
