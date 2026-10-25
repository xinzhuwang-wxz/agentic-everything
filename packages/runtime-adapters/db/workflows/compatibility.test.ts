import test from 'node:test';
import assert from 'node:assert/strict';
import { PersistentStore, type StoredRun } from '../store.js';
const row = (workflow: StoredRun['pins']['workflow']): StoredRun => ({
  view: { runId: 'run', status: 'queued', events: [], receipts: [], persistence: 'postgres-dbos', modelMode: workflow === 'ae-v1' ? 'configured-model-port' : 'deterministic-workflow' },
  principal: { tenantId: 'tenant', applicationId: 'app', subjectId: 'subject', roles: [], scopes: [] },
  releaseId: 'static', input: 'value', pins: { sdk: '0.21.0', capability: '1', policy: 'tickets-policy-v1', workflow }, cancelled: false, phase: 'initial',
});
test('default legacy store and deterministic store reject each other before interpreting checkpoints', async () => {
  const legacy = new PersistentStore('postgres://unused.invalid/test');
  const deterministic = new PersistentStore('postgres://unused.invalid/test', 'tickets-policy-v1', 'ae-deterministic-v1');
  let saved = row('ae-v1');
  legacy.pool.query = deterministic.pool.query = async () => ({ rows: [{ body: saved }], rowCount: 1 });
  assert.equal((await legacy.load('run')).pins.workflow, 'ae-v1');
  await assert.rejects(deterministic.load('run'), /RUN_VERSION_UNSUPPORTED/);
  saved = row('ae-deterministic-v1');
  assert.equal((await deterministic.load('run')).pins.workflow, 'ae-deterministic-v1');
  await assert.rejects(legacy.load('run'), /RUN_VERSION_UNSUPPORTED/);
  await legacy.close(); await deterministic.close();
});
