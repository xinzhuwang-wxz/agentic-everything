import test from 'node:test';
import assert from 'node:assert/strict';
import { VerificationAuthorizationSchema, maximumDeliveryArtifacts, type ProjectAssessment } from '@ae/contracts';
import { verificationAuthorization, verificationExcludedActions, assertVerificationExclusions, matchesProfileAssessment, reviewedProfile } from '../src/profiles.js';

const pins = {
  'reveal-upstream-v1': '75dff6f515d2d08df0c32cf2b7328b89425c6f25',
  'linkding-upstream-v1': '24b5ad6cc9bde497b5d1b1e86aed5a2fb7d25c2f',
  'kanboard-upstream-v1': 'e197e71af4ff9f371b931ab0338b2b41827e6394',
} as const;
test('original three synthetic verification authorizations and exclusions retain their exact bindings', () => {
  for (const profile of ['react-helpdesk-synthetic-v1', 'python-inventory-synthetic-v1', 'java-spring-inventory-synthetic-v1'] as const) {
    const expected = { version: '1', profile, isolation: 'exact-fixture-temporary-worktree', network: 'loopback-only-no-external', maximumCostUsd: 0, maximumElapsedMs: 300000, maximumHeapMiB: 640, actions: profile === 'react-helpdesk-synthetic-v1' ? ['baseline-differential', 'host-build', 'runtime-http', 'browser'] : ['baseline-differential', 'host-build', 'runtime-rpc', 'cli'] };
    assert.deepEqual(verificationAuthorization(profile), expected);
    assert.deepEqual(VerificationAuthorizationSchema.parse(expected), expected);
    assert.deepEqual(verificationExcludedActions(profile), ['deployment', 'publishing', 'dependency installation', 'customer source execution outside the exact synthetic fixture profile', 'paid model calls']);
  }
  assert.deepEqual(verificationExcludedActions(), ['deployment', 'publishing', 'dependency installation', 'source execution', 'paid model calls']);
});
test('upstream verification authorizations bind an exact reviewed commit and retain bounded execution', () => {
  for (const profile of Object.keys(pins) as (keyof typeof pins)[]) {
    const value = verificationAuthorization(profile);
    assert.deepEqual(VerificationAuthorizationSchema.parse(value), value);
    assert.equal(value.isolation, 'exact-pinned-upstream-temporary-worktree');
    assert.equal('sourceCommit' in value ? value.sourceCommit : null, pins[profile]);
    assert.equal(value.network, 'loopback-only-no-external');
    assert.equal(value.maximumCostUsd, 0);
    for (const bad of [{ ...value, sourceCommit: '0'.repeat(40) }, { ...value, isolation: 'exact-fixture-temporary-worktree' }, { ...value, maximumElapsedMs: 300001 }, { ...value, maximumHeapMiB: 641 }, { ...value, network: 'external-allowed' }, { ...value, arbitraryCommand: 'echo unapproved' }]) assert.equal(VerificationAuthorizationSchema.safeParse(bad).success, false);
    assert.match(verificationExcludedActions(profile)[3]!, /exact pinned upstream/);
  }
});
test('unknown and cross-source profiles cannot fall back to a synthetic collector', () => {
  const assessment: ProjectAssessment = { schemaVersion: '1', projectId: 'test', baseCommit: '0'.repeat(40), detectedStack: [], businessFlows: [], identity: [], evidence: [], supportLevel: 'L0', unknowns: [], baseline: 'not-run' };
  for (const profile of Object.keys(pins) as (keyof typeof pins)[]) assert.equal(matchesProfileAssessment(profile, assessment), false);
  assert.equal(matchesProfileAssessment('unknown-profile' as never, assessment), false);
  assert.throws(() => verificationAuthorization('unknown-profile' as never), /Unknown/);
  assert.throws(() => verificationExcludedActions('unknown-profile' as never), /Unknown/);
  assert.throws(() => reviewedProfile('unknown-profile' as never), /Unknown/);
});

test('external delivery remains bounded without widening original bundle limits', () => {
  for (const scope of ['static-only', 'react-helpdesk-synthetic-v1', 'python-inventory-synthetic-v1', 'java-spring-inventory-synthetic-v1', 'unknown']) assert.equal(maximumDeliveryArtifacts(scope), 32);
  for (const scope of Object.keys(pins)) assert.equal(maximumDeliveryArtifacts(scope), 64);
});

test('delivery exclusions accept exact pinned approvals and reject legacy or widened scopes', () => {
  for (const profile of Object.keys(pins) as (keyof typeof pins)[]) {
    assert.doesNotThrow(() => assertVerificationExclusions(verificationExcludedActions(profile), profile));
    for (const wrong of [verificationExcludedActions(), verificationExcludedActions('react-helpdesk-synthetic-v1'), [], [...verificationExcludedActions(profile), 'extra']]) assert.throws(() => assertVerificationExclusions(wrong, profile), /Approval exclusions mismatch/);
  }
  assert.doesNotThrow(() => assertVerificationExclusions(verificationExcludedActions()));
  assert.doesNotThrow(() => assertVerificationExclusions(verificationExcludedActions('react-helpdesk-synthetic-v1'), 'react-helpdesk-synthetic-v1'));
});

test('delivery and assessor share only bounded installed manifest input paths', async () => {
  const { assessmentEvidencePaths } = await import('../src/recipes/index.js');
  const paths = assessmentEvidencePaths(['package.json']);
  assert.equal(paths.has('vite.config.ts'), true);
  assert.equal(paths.has('js/reveal.js'), true);
  for (const secret of ['.env', 'arbitrary.js', 'app/Helper/ProjectRoleHelper.php']) assert.equal(paths.has(secret), false);
  assert.equal(assessmentEvidencePaths([]).has('vite.config.ts'), false);
});
