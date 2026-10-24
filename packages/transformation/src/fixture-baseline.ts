import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BaselineArchive, JsonValue, Provenance } from '@ae/contracts';
import { captureBaseline, verifyArchive } from '@ae/verification';

const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const treeHash = (files: Readonly<Record<string, string>>): string => sha(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
const caseIds = ['read', 'cross-tenant', 'write', 'stale-write'];
const seed = 'committed-ticket-seed-v1';
const coverage = { scope: 'Exact committed ticket domain: read, cross-tenant denial, write, stale-version denial', unknowns: ['Finite synthetic cases do not prove all business inputs or production behavior.'] };
function aeRoot(): string {
  let root = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 7; i++, root = dirname(root)) if (existsSync(join(root, 'tests/browser/delivery.mjs')) && existsSync(join(root, 'package-lock.json'))) return root;
  throw Error('Trusted AE checkout unavailable');
}
function git(root: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', root, ...args], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
    env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', LANG: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
  });
}
/** Check every source byte and committed path before importing any source-owned code. */
function inspectOriginal(sourceRoot: string, trusted: Readonly<Record<string, string>>): string {
  const root = resolve(sourceRoot);
  if (realpathSync(root) !== root) throw Error('Fixture root must not traverse symlinks');
  const files: Record<string, string> = {};
  const bytes: Record<string, Buffer> = {};
  const allowed = Object.keys(trusted);
  let visited = 0;
  const walk = (relative: string): void => {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (!relative && name === '.git') continue;
      const path = relative ? relative + '/' + name : name;
      if (++visited > 32 || (!allowed.includes(path) && !allowed.some(p => p.startsWith(path + '/')))) throw Error('Unapproved fixture path: ' + path);
      const stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) throw Error('Fixture symlink denied: ' + path);
      if (stat.isDirectory() && !allowed.includes(path)) walk(path);
      else if (stat.isFile() && stat.size <= 256 * 1024) { bytes[path] = readFileSync(join(root, path)); files[path] = sha(bytes[path]!); }
      else throw Error('Fixture nonregular or oversized input: ' + path);
    }
  };
  walk('');
  if (treeHash(files) !== treeHash(trusted)) throw Error('Full source is not the committed synthetic fixture');
  if (git(root, ['rev-parse', '--show-toplevel']).trim() !== root) throw Error('Original fixture must be an exact Git root');
  const sourceVersion = git(root, ['rev-parse', 'HEAD']).trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sourceVersion)) throw Error('Invalid source commit');
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=all']).trim()) throw Error('Original fixture must be clean');
  // Do not trust status alone: assume-unchanged/skip-worktree flags can conceal drift.
  const entries = git(root, ['ls-tree', '-rz', '--full-tree', 'HEAD']).split('\0').filter(Boolean);
  if (entries.length !== allowed.length) throw Error('Committed fixture tree differs');
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match || !Object.hasOwn(bytes, match[3]!)) throw Error('Committed fixture path differs');
    const content = bytes[match[3]!]!;
    const blobHash = createHash(sourceVersion.length === 64 ? 'sha256' : 'sha1').update('blob ' + content.length + '\0').update(content).digest('hex');
    if (match[2] !== blobHash) throw Error('Committed fixture content differs: ' + match[3]);
  }
  return sourceVersion;
}
function provenance(sourceVersion: string, trusted: Readonly<Record<string, string>>): Provenance {
  return { sourceVersion, codeHash: treeHash(trusted), environment: 'Node ' + process.version + '; isolated exact synthetic helpdesk; no external model', environmentHash: sha(JSON.stringify({ node: process.version, lockfile: sha(readFileSync(join(aeRoot(), 'package-lock.json'))) })), dataHash: sha(seed), schemaVersion: '1', adapterVersion: 'trusted-helpdesk-delivery-v1' };
}
/** Integrity and fixed semantic/provenance checks, not a signature or proof of execution authenticity. */
export async function assertFixtureBaseline(value: unknown, binding: { sourceRoot?: string; sourceVersion?: string } = {}): Promise<BaselineArchive> {
  const { trustedFixtureHashes } = await import('./fixture-harness.js');
  const archive = verifyArchive(value);
  const sourceVersion = binding.sourceRoot === undefined ? binding.sourceVersion ?? archive.manifest.provenance.sourceVersion : inspectOriginal(binding.sourceRoot, trustedFixtureHashes);
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sourceVersion) || (binding.sourceVersion !== undefined && binding.sourceVersion !== sourceVersion)) throw Error('Baseline source commit binding mismatch');
  const expectedProvenance = provenance(sourceVersion, trustedFixtureHashes);
  if (Object.entries(expectedProvenance).some(([key, expected]) => archive.manifest.provenance[key as keyof Provenance] !== expected)) throw Error('Baseline provenance mismatch');
  if (archive.manifest.safety !== 'isolated-seeded-fixture' || archive.manifest.normalization.length || JSON.stringify(archive.manifest.coverage) !== JSON.stringify(coverage) || JSON.stringify(archive.manifest.cases.map(c => c.test.id)) !== JSON.stringify(caseIds)) throw Error('Fixed baseline suite changed');
  const ticket = { id: 'ticket-1', tenantId: 'tenant-a', title: 'Printer offline', priority: 'low', version: 1 };
  const changed = { ...ticket, priority: 'high', version: 2 };
  for (const c of archive.manifest.cases) {
    const expectedTest = { id: c.test.id, input: { operation: c.test.id }, seed: { fixture: seed }, covers: [c.test.id] };
    const expectedObservation = { output: c.test.id === 'read' ? ticket : c.test.id === 'write' ? changed : { error: c.test.id === 'cross-tenant' ? 'Not found' : 'Conflict or not found' }, sideEffects: c.test.id === 'write' ? [changed] : [], receipt: { beforeVersion: 1, afterVersion: c.test.id === 'write' ? 2 : 1 } };
    if (JSON.stringify(c.test) !== JSON.stringify(expectedTest) || JSON.stringify(c.observation) !== JSON.stringify(expectedObservation)) throw Error('Baseline does not match fixed fixture semantics');
  }
  return archive;
}
/** Executes only the exact committed synthetic domain. The caller must archive this BEFORE applying. */
export async function captureFixtureBaseline(input: { sourceRoot: string }): Promise<BaselineArchive> {
  const { trustedFixtureHashes } = await import('./fixture-harness.js');
  const sourceVersion = inspectOriginal(input.sourceRoot, trustedFixtureHashes);
  const archive = await captureBaseline({
    adapter: { safety: 'isolated-seeded-fixture', async execute(test) {
      if (inspectOriginal(input.sourceRoot, trustedFixtureHashes) !== sourceVersion) throw Error('Original changed during capture');
      // A unique URL resets the known module's in-memory seed for EVERY case.
      const domain = await import(pathToFileURL(join(resolve(input.sourceRoot), 'src/tickets.ts')).href + '?baseline=' + randomUUID());
      const before = domain.readTicket('tenant-a', 'ticket-1');
      let output: JsonValue;
      try {
        switch (test.id) {
          case 'read': output = domain.readTicket('tenant-a', 'ticket-1'); break;
          case 'cross-tenant': output = domain.readTicket('tenant-b', 'ticket-1'); break;
          case 'write': output = domain.changePriority('tenant-a', 'ticket-1', 'high', 1); break;
          case 'stale-write': output = domain.changePriority('tenant-a', 'ticket-1', 'high', 0); break;
          default: throw Error('Unknown fixed fixture case');
        }
      } catch (error) { output = { error: error instanceof Error ? error.message : String(error) }; }
      const after = domain.readTicket('tenant-a', 'ticket-1');
      return { output, sideEffects: JSON.stringify(before) === JSON.stringify(after) ? [] : [after], receipt: { beforeVersion: before.version, afterVersion: after.version } };
    } },
    cases: caseIds.map(id => ({ id, input: { operation: id }, seed: { fixture: seed }, covers: [id] })),
    provenance: provenance(sourceVersion, trustedFixtureHashes), normalization: [], coverage,
  });
  return assertFixtureBaseline(archive, { sourceRoot: input.sourceRoot, sourceVersion });
}
