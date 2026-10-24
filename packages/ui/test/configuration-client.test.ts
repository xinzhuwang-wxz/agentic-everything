import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfigurationClient } from '../src/configuration.js';

test('configuration state uses the canonical mounted HTTP path without a trailing slash', async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  const state = { durability: 'memory_fixture', canConfigure: true, capabilities: [], drafts: [], releases: [] };
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    assert.deepEqual(await createConfigurationClient('/api').state(), state);
    assert.deepEqual(requests, ['/api/configuration']);
  } finally { globalThis.fetch = original; }
});
