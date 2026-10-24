import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelRequest } from '@ae/contracts';
import { FileModelProvider } from '@ae/runtime-adapters';
const request: ModelRequest = { schemaVersion: '1', requestId: 'request-1', runId: 'r1', messages: [{ role: 'user', content: 'Read ticket.' }], tools: [] };
test('file API rejects uncorrelated actor response rather than using a stale result', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ae-model-'));
  try {
    await mkdir(join(dir, 'responses'));
    await writeFile(join(dir, 'responses', 'request-1.json'), JSON.stringify({ requestId: 'wrong', requestHash: '0'.repeat(64), provider: 'subagent_simulation', usage: 'unmeasured' }));
    await assert.rejects(new FileModelProvider(dir, 1000).complete(request), /correlation mismatch/);
    const written = JSON.parse(await readFile(join(dir, 'requests', 'request-1.json'), 'utf8'));
    assert.equal(written.request.messages[0].content, 'Read ticket.');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('file API observes deadline and rejects path injection before writing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ae-model-'));
  try {
    await assert.rejects(new FileModelProvider(dir, 5).complete(request), /deadline exceeded/);
    await assert.rejects(new FileModelProvider(dir).complete({ ...request, requestId: '../escape' }), /Unsafe request/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
