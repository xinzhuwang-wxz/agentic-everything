import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { contentHash } from '@ae/contracts/hash';
import type { BaselineArchive, JsonValue } from '@ae/contracts';
import { assertFixtureBaseline, captureFixtureBaseline } from '../src/fixture-baseline.js';

function setup(t: { after(fn: () => void): void }) {
  const parent = mkdtempSync(join(tmpdir(), 'ae-preapply-baseline-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const sourceRoot = join(parent, 'source');
  cpSync(resolve('fixtures/existing-react-helpdesk'), sourceRoot, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', sourceRoot, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init'); git('config', 'user.name', 'AE fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('add', '.'); git('commit', '-m', 'Synthetic baseline fixture');
  return { parent, sourceRoot, git };
}
function rehash(archive: BaselineArchive): BaselineArchive {
  for (const c of archive.manifest.cases) c.hash = contentHash({ test: c.test, observation: c.observation } as JsonValue);
  archive.hash = contentHash(archive.manifest as JsonValue);
  return archive;
}
test('pre-apply baseline captures four reset observations and binds actual original commit', async t => {
  const f = setup(t);
  const before = readFileSync(join(f.sourceRoot, 'src/tickets.ts'), 'utf8');
  const archive = await captureFixtureBaseline({ sourceRoot: f.sourceRoot });
  assert.equal(archive.manifest.provenance.sourceVersion, f.git('rev-parse', 'HEAD'));
  assert.equal(archive.manifest.provenance.adapterVersion, 'trusted-helpdesk-delivery-v1');
  assert.deepEqual(archive.manifest.cases.map(c => c.test.id), ['read', 'cross-tenant', 'write', 'stale-write']);
  assert.deepEqual(archive.manifest.cases.map(c => c.observation.receipt), [{ beforeVersion: 1, afterVersion: 1 }, { beforeVersion: 1, afterVersion: 1 }, { beforeVersion: 1, afterVersion: 2 }, { beforeVersion: 1, afterVersion: 1 }]);
  assert.equal(readFileSync(join(f.sourceRoot, 'src/tickets.ts'), 'utf8'), before);
  assert.equal(f.git('status', '--porcelain'), '');
  await assertFixtureBaseline(archive, { sourceRoot: f.sourceRoot, sourceVersion: f.git('rev-parse', 'HEAD') });
  const repeat = await captureFixtureBaseline({ sourceRoot: f.sourceRoot });
  assert.deepEqual(repeat.manifest.cases, archive.manifest.cases);
  await assert.rejects(assertFixtureBaseline(archive, { sourceVersion: 'a'.repeat(40) }), /provenance/);
});
test('pre-apply capture rejects any source drift before executing source code', async t => {
  const f = setup(t), marker = join(f.parent, 'executed');
  writeFileSync(join(f.sourceRoot, 'src/tickets.ts'), `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'bad');`);
  await assert.rejects(captureFixtureBaseline({ sourceRoot: f.sourceRoot }), /Full source/);
  assert.equal(existsSync(marker), false);
});
test('pre-apply capture rejects extra ignored paths, symlinks, dirty index and non-root trees', async t => {
  const extra = setup(t); writeFileSync(join(extra.sourceRoot, '.git/info/exclude'), 'extra.txt\n'); writeFileSync(join(extra.sourceRoot, 'extra.txt'), 'extra');
  await assert.rejects(captureFixtureBaseline(extra), /Unapproved/);
  const linked = setup(t); const path = join(linked.sourceRoot, 'src/tickets.ts'); const saved = join(linked.parent, 'tickets.ts'); cpSync(path, saved); rmSync(path); symlinkSync(saved, path);
  await assert.rejects(captureFixtureBaseline(linked), /symlink/);
  const dirty = setup(t); dirty.git('rm', '--cached', 'README.md');
  await assert.rejects(captureFixtureBaseline(dirty), /clean/);
  const nested = setup(t); rmSync(join(nested.sourceRoot, '.git'), { recursive: true });
  execFileSync('git', ['init', nested.parent], { stdio: 'pipe' });
  await assert.rejects(captureFixtureBaseline(nested), /exact Git root/);
});
test('pre-apply capture rejects trusted working bytes hiding a different committed tree', async t => {
  const f = setup(t), path = join(f.sourceRoot, 'README.md'), original = readFileSync(path);
  writeFileSync(path, 'untrusted committed version'); f.git('add', '.'); f.git('commit', '-m', 'Different original');
  f.git('update-index', '--assume-unchanged', 'README.md'); writeFileSync(path, original);
  assert.equal(f.git('status', '--porcelain'), '');
  await assert.rejects(captureFixtureBaseline(f), /Committed fixture content differs/);
});
test('baseline validation rejects rehashed semantic and provenance forgeries', async t => {
  const f = setup(t), archive = await captureFixtureBaseline(f);
  const variants: Array<(a: BaselineArchive) => void> = [
    a => { a.manifest.cases[0]!.observation.output = { error: 'forged' }; },
    a => { a.manifest.cases.reverse(); },
    a => { a.manifest.cases[0]!.test.seed = { fixture: 'different' }; },
    a => { a.manifest.provenance.environmentHash = '0'.repeat(64); },
    a => { a.manifest.provenance.codeHash = '0'.repeat(64); },
    a => { a.manifest.provenance.adapterVersion = 'arbitrary-adapter'; },
    a => { a.manifest.coverage.unknowns = []; },
    a => { a.manifest.safety = 'recorded-replay'; },
  ];
  for (const mutate of variants) {
    const forged = structuredClone(archive); mutate(forged);
    await assert.rejects(assertFixtureBaseline(rehash(forged)), /Baseline|baseline/);
  }
});
