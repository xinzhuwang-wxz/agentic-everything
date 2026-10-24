import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ConfigurationPreflight } from '../src/configuration.js';
import type { ConfigurationRequest, CredentialState } from '@ae/contracts';
const request: ConfigurationRequest = { taskId: '00000000-0000-4000-8000-000000000001', mode: 'self_hosted', step: 'model' };

test('default reports unavailable verification, not missing keys, and read-only stays usable', async () => {
  const service = new ConfigurationPreflight();
  const report = await service.check(request);
  assert.equal(report.status, 'needs_configuration');
  assert.deepEqual(report.checks, [{ kind: 'model_provider', state: 'unverified', reason: 'verification_unavailable' }]);
  assert.equal(report.configuration?.url, null);
  assert.equal(report.providerQualification, 'not-run');
  assert.deepEqual((await service.check({ ...request, step: 'read_only' })).checks, []);
  assert.equal((await service.check({ ...request, step: 'read_only' })).status, 'ready');
});
test('missing, invalid, configured and restored states recheck and retain original task', async () => {
  let state: CredentialState = 'missing'; let calls = 0; const resumed: string[] = [];
  const service = new ConfigurationPreflight({ checkStatus: kind => { assert.equal(kind, 'model_provider'); calls++; return state; } });
  const resume = async (taskId: string) => { resumed.push(taskId); return 'continued-original-step'; };
  for (const blocked of ['missing', 'invalid'] as const) {
    state = blocked; const result = await service.continueTask(request, resume);
    assert.equal(result.preflight.checks[0]?.state, blocked); assert.equal(result.result, undefined);
    assert.equal(result.preflight.resume.taskId, request.taskId);
  }
  assert.deepEqual(resumed, []);
  state = 'configured';
  const ready = await service.continueTask(request, resume);
  assert.equal(ready.result, 'continued-original-step'); assert.equal(ready.preflight.configuration, null);
  assert.deepEqual(resumed, [request.taskId]);
  state = 'invalid';
  assert.equal((await service.continueTask(request, resume)).preflight.status, 'needs_configuration');
  assert.equal(calls, 4); assert.equal(resumed.length, 1);
});
test('hosted credential is separate; no AE account required in self-hosted mode', async () => {
  const service = new ConfigurationPreflight({ checkStatus: kind => kind === 'model_provider' ? 'configured' : 'missing' });
  assert.equal((await service.check(request)).status, 'ready');
  const hosted = await service.check({ ...request, mode: 'hosted' });
  assert.equal(hosted.status, 'needs_configuration');
  assert.equal(hosted.checks[1]?.kind, 'ae_hosted_service');
});
test('checker outputs/errors are never serialized; URL injection is trusted launch-only', async () => {
  const secret = 'SYNTHETIC_SECRET_NEVER_ECHO';
  for (const checkStatus of [() => { throw new Error(secret); }, () => ({ state: 'configured', secret }) as unknown as CredentialState, () => secret as CredentialState]) {
    const report = await new ConfigurationPreflight({ checkStatus }).check(request);
    assert.equal(report.checks[0]?.state, 'unverified'); assert.equal(JSON.stringify(report).includes(secret), false);
  }
  for (const url of ['http://example.invalid/configure', 'https://user:secret@example.invalid', 'https://example.invalid/?key=secret', 'https://example.invalid/#secret']) {
    assert.equal((await new ConfigurationPreflight({ verifiedConfigurationUrl: { url, verified: true } }).check(request)).configuration?.url, null);
  }
  const injected = await new ConfigurationPreflight({ verifiedConfigurationUrl: { url: 'https://example.invalid/configure', verified: true } }).check(request);
  assert.equal(injected.configuration?.url, 'https://example.invalid/configure');
  await assert.rejects(() => new ConfigurationPreflight().check({ ...request, taskId: secret }), error => !String(error).includes(secret));
});
test('CLI preflight emits structured needs_configuration with code 2, read-only exits 0', async () => {
  const args = [resolve('dist/packages/cli/src/index.js'), 'preflight', '--task-id', request.taskId, '--mode', request.mode, '--step'];
  const result = spawnSync(process.execPath, [...args, 'model'], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', OPENAI_API_KEY: 'SYNTHETIC_SECRET_NEVER_ECHO' } });
  assert.equal(result.status, 2); assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).checks[0].reason, 'verification_unavailable');
  assert.deepEqual(JSON.parse(result.stdout), await new ConfigurationPreflight().check(request));
  assert.equal((result.stdout + result.stderr).includes('SYNTHETIC_SECRET'), false);
  assert.equal(JSON.parse(execFileSync(process.execPath, [...args, 'read_only'], { encoding: 'utf8' })).status, 'ready');
});
