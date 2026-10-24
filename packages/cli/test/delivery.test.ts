import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const cli = resolve('packages/cli/dist/index.js');
function invoke(...args: string[]) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); }
function initialize() {
  const directory = mkdtempSync(join(tmpdir(), 'ae-cli-delivery-'));
  const source = join(directory, 'source'); cpSync(resolve('fixtures/existing-react-helpdesk'), source, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', source, ...args], { stdio: 'pipe' });
  git('init'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Synthetic fixture');
  const file = (name: string) => join(directory, name + '.json');
  const run = (...args: string[]) => { const result = invoke(...args); assert.equal(result.status, 0, result.stderr); return result; };
  run('assess', '--repo', source, '--out', file('assessment'));
  run('plan', '--assessment', file('assessment'), '--out', file('plan'));
  const { planHash } = JSON.parse(readFileSync(file('plan'), 'utf8')) as { planHash: string };
  run('approve', '--plan', file('plan'), '--plan-hash', planHash, '--approver', 'fixture-reviewer', '--authorization-ref', 'test-only-explicit-approval', '--out', file('approval'));
  run('apply', '--repo', source, '--assessment', file('assessment'), '--plan', file('plan'), '--approval', file('approval'), '--worktree', join(directory, 'candidate'), '--out', file('patch'));
  return { directory, source, file };
}
test('CLI delivers a source-bound partial package and does not hide not-run behind exit zero', () => {
  const f = initialize();
  const verification = invoke('verify', '--patch', f.file('patch')); assert.equal(verification.status, 2, verification.stderr);
  assert.equal(JSON.parse(verification.stdout).checks.find((c: {name:string}) => c.name === 'browser-acceptance').status, 'not-run');
  const bundle = join(f.directory, 'delivery');
  const result = invoke('deliver', '--repo', f.source, '--assessment', f.file('assessment'), '--plan', f.file('plan'), '--approval', f.file('approval'), '--patch', f.file('patch'), '--out-dir', bundle);
  assert.equal(result.status, 2, result.stderr); assert.equal(JSON.parse(result.stdout).status, 'partial');
  const checked = invoke('delivery-check', '--bundle', bundle); assert.equal(checked.status, 2, checked.stderr); assert.equal(JSON.parse(checked.stdout).valid, true);
  writeFileSync(join(bundle, 'manifest.json'), '{}');
  assert.equal(invoke('delivery-check', '--bundle', bundle).status, 1);
});
test('CLI rejects self-reported evidence and duplicate options rather than silently accepting them', () => {
  assert.equal(invoke('deliver', '--passed', 'true').status, 1);
  const duplicate = invoke('assess', '--repo', '/unused', '--repo', '/other');
  assert.equal(duplicate.status, 1); assert.match(duplicate.stderr, /duplicate/);
});
test('CLI only accepts the explicit versioned verification profile at new plan creation', () => {
  const f = initialize();
  const result = invoke('plan', '--assessment', f.file('assessment'), '--verification-profile', 'react-helpdesk-synthetic-v1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).plan.verificationAuthorization.profile, 'react-helpdesk-synthetic-v1');
  assert.equal(invoke('plan', '--assessment', f.file('assessment'), '--verification-profile', 'arbitrary-shell').status, 1);
  const assessment = JSON.parse(readFileSync(f.file('assessment'), 'utf8'));
  assessment.evidence.push({path:'pom.xml',sha256:'0'.repeat(64),note:'Phantom evidence'});
  writeFileSync(f.file('assessment'), JSON.stringify(assessment));
  assert.equal(invoke('plan', '--assessment', f.file('assessment'), '--verification-profile', 'react-helpdesk-synthetic-v1').status, 1);
});
