// Offline receipt integrity check. Hashes are not signatures or proof of truthful execution.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

assert.equal(process.argv.length, 3, 'Usage: node scripts/adaptation-costs/check.mjs EVIDENCE_DIRECTORY');
const root = resolve(process.argv[2]);
const report = JSON.parse(readFileSync(join(root, 'measurement.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(report.kind, 'bounded-direct-scripted-vs-ae-cost-receipt');
assert.equal(report.status, 'pass');
assert.equal(report.method.trialsPerHost, 1);
assert.deepEqual(report.hosts.map(h => h.id), ['react-helpdesk', 'python-inventory']);
for (const [path, file] of Object.entries(report.evidenceFiles)) {
  assert.ok(!path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..'));
  let current = root;
  for (const part of path.split('/')) { current = join(current, part); assert.equal(lstatSync(current).isSymbolicLink(), false, path); }
  const bytes = readFileSync(current);
  assert.equal(bytes.length, file.bytes, path + ' byte count');
  assert.equal(hash(bytes), file.sha256, path + ' hash');
}
function patchCounts(path) {
  const files = []; let file;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('diff --git ')) { file = { path: line.split(' b/')[1], added: 0, deleted: 0 }; files.push(file); }
    else if (line.startsWith('+') && !line.startsWith('+++')) file.added++;
    else if (line.startsWith('-') && !line.startsWith('---')) file.deleted++;
  }
  return files;
}
for (const host of report.hosts) {
  assert.equal(host.status, 'pass');
  assert.equal(host.unexpectedDefectsObserved, 0);
  assert.equal(host.correctiveSourceEdits, 0);
  assert.equal(host.retriesAfterUnexpectedFailure, 0);
  assert.ok(host.stages.every(s => s.status === 'pass' && s.elapsedMs >= 0));
  assert.deepEqual(host.changes.direct, host.changes.ae);
  assert.equal(host.candidate.byteIdenticalAcrossArms, true);
  for (const arm of ['direct', 'ae']) {
    assert.deepEqual(patchCounts(join(root, host.id, `${arm}-observed.patch`)), host.changes[arm].files.map(({ path, added, deleted }) => ({ path, added, deleted })));
    assert.ok(host.gates[arm].every(g => g.status === 'pass'));
  }
  assert.equal(host.originalBaseline.reusedWithoutRecapture, true);
  assert.equal(host.originalBaseline.sha256, hash(readFileSync(join(root, host.originalBaseline.path))));
  const original = JSON.parse(readFileSync(join(root, host.originalBaseline.path), 'utf8'));
  assert.deepEqual(JSON.parse(readFileSync(join(root, host.id, 'direct-evidence/baseline.json'), 'utf8')), original.archive);
  assert.deepEqual(JSON.parse(readFileSync(join(root, host.id, 'ae-delivery/evidence/baseline.json'), 'utf8')), original.archive);
  assert.ok(Date.parse(host.originalBaseline.capturedAt) <= Date.parse(host.originalBaseline.appliedAt));
  assert.deepEqual(host.preservation, { originalSourceUnchanged: true, baselineArchiveUnchanged: true, directRollbackExact: true, aeRollbackExact: true, repeatedOperationsChangedFiles: 0 });
}
assert.deepEqual(report.failures, []);
console.log(JSON.stringify({ valid: true, artifactFilesChecked: Object.keys(report.evidenceFiles).length, hosts: report.hosts.map(h => h.id), note: 'Receipt consistency and archived bytes verified; not a signature or independent execution witness.' }, null, 2));
