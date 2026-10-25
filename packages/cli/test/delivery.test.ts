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

test('public CLI produces the Python inventory through approved baseline, isolated patch and complete scoped delivery', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ae-cli-inventory-')), source = join(directory, 'source'), candidate = join(directory, 'candidate'), bundle = join(directory, 'delivery');
  cpSync(resolve('fixtures/existing-python-inventory'), source, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', source, ...args], { stdio: 'pipe' });
  git('init'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Original Python inventory');
  const file = (name: string) => join(directory, name + '.json');
  const run = (...args: string[]) => { const result = invoke(...args); assert.equal(result.status, 0, result.stderr || result.stdout); return result; };
  run('assess', '--repo', source, '--out', file('assessment'));
  run('plan', '--assessment', file('assessment'), '--verification-profile', 'python-inventory-synthetic-v1', '--out', file('plan'));
  const { planHash } = JSON.parse(readFileSync(file('plan'), 'utf8')) as { planHash: string };
  run('approve', '--plan', file('plan'), '--plan-hash', planHash, '--approver', 'fixture-reviewer', '--authorization-ref', 'explicit-python-inventory-profile', '--out', file('approval'));
  const apply = ['apply', '--repo', source, '--assessment', file('assessment'), '--plan', file('plan'), '--approval', file('approval'), '--worktree', candidate, '--out', file('patch')];
  assert.equal(invoke(...apply).status, 1, 'Profile apply must require original baseline destination');
  run(...apply, '--baseline-out', file('original-baseline'));
  const verified = invoke('verify', '--patch', file('patch')); assert.equal(verified.status, 2, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).checks.find((c: { name: string }) => c.name === 'cli-acceptance').status, 'not-run');
  const delivered = run('deliver', '--repo', source, '--assessment', file('assessment'), '--plan', file('plan'), '--approval', file('approval'), '--patch', file('patch'), '--out-dir', bundle);
  assert.equal(JSON.parse(delivered.stdout).status, 'complete'); assert.equal(JSON.parse(delivered.stdout).verificationScope, 'python-inventory-synthetic-v1');
  const checked = run('delivery-check', '--bundle', bundle); assert.equal(JSON.parse(checked.stdout).valid, true);
  const baseline = JSON.parse(readFileSync(file('original-baseline'), 'utf8')); assert.deepEqual(JSON.parse(readFileSync(join(bundle, 'evidence/baseline.json'), 'utf8')), baseline.archive);
  assert.equal(invoke(...apply, '--baseline-out', file('second-baseline')).status, 1);
  run('revert', '--patch', file('patch')); assert.equal(execFileSync('git', ['-C', candidate, 'status', '--porcelain'], { encoding: 'utf8' }), '');
});

test('CLI operations avoid loading transformation tooling while transformation commands still use it', () => {
  const hook = 'data:text/javascript,' + encodeURIComponent("import { registerHooks } from 'node:module'; registerHooks({ resolve(specifier, context, nextResolve) { if (specifier === '@ae/transformation') throw new Error('TRANSFORMATION_LOAD_SENTINEL'); return nextResolve(specifier, context); } });");
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', hook, cli, ...args], { encoding: 'utf8', env: {PATH:process.env.PATH ?? '/usr/bin:/bin'} });
  for (const command of ['install', 'upgrade', 'doctor', 'uninstall', 'schema-check', 'schema-apply']) {
    const result = run(command);
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stderr, /TRANSFORMATION_LOAD_SENTINEL/);
    assert.match(result.stderr, /Required --|Set AE_DATABASE_URL/);
  }
  const transformation = run('assess', '--repo', '/unused');
  assert.equal(transformation.status, 1);
  assert.match(transformation.stderr, /TRANSFORMATION_LOAD_SENTINEL/);
});
