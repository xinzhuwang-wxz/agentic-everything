// One real process per worker lifetime. Only PostgreSQL survives SIGKILL.
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { PersistentRuntime } from '../../dist/packages/runtime-adapters/db/runtime.js';
import { SyntheticDurableHost, createModel, validateDatabaseUrl } from './host.mjs';

const [databaseUrl, killPoint = ''] = process.argv.slice(2);
validateDatabaseUrl(databaseUrl);
const emit = value => process.stdout.write(`AE_PERSISTENCE ${JSON.stringify(value)}\n`);
const host = new SyntheticDurableHost(databaseUrl);
let releaseFirstQuery;
if (killPoint === 'timeout-host') {
  const write = host.write.bind(host);
  host.write = async (...args) => {
    const receipt = await write(...args);
    emit({ event: 'host-committed-before-timeout', operationId: receipt.operationId });
    await delay(5000); // Mutation committed, but runtime does not receive its acknowledgement before deadline.
    return receipt;
  };
}
if (['reconcile-race', 'unknown-checkpoint'].includes(killPoint)) {
  const write = host.write.bind(host);
  host.write = async (...args) => {
    await write(...args);
    throw new Error('Synthetic lost acknowledgement after durable host commit');
  };
}
if (killPoint === 'reconcile-race') {
  const query = host.query.bind(host);
  let firstQuery = true;
  host.query = async (principal, operationId) => {
    if (!firstQuery) return query(principal, operationId);
    firstQuery = false;
    // Inject an inconclusive observation from a lagging/unavailable query endpoint.
    // Its delayed delivery must not overwrite the later authoritative PG receipt.
    await host.record('query-stale-unknown', principal, operationId);
    const captured = { status: 'outcome-unknown', operationId, message: 'Synthetic stale inconclusive query observation.' };
    const released = new Promise(resolve => { releaseFirstQuery = resolve; });
    emit({ event: 'query-unknown-captured', operationId });
    await released;
    return captured;
  };
}
const runtime = new PersistentRuntime({ databaseUrl, model: createModel(host), host,
  ...(killPoint === 'timeout-host' ? { maxElapsedMs: 1000 } : {}),
  fault: async point => {
    if (point === killPoint || (killPoint === 'unknown-checkpoint' && point === 'after-tool-checkpoint')) {
      emit({ event: 'fault', point, pid: process.pid });
      await new Promise(() => {}); // Parent kills this process after observing the exact boundary.
    }
  },
});
await runtime.launch();
emit({ event: 'ready', pid: process.pid });
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', async line => {
  let command;
  try {
    command = JSON.parse(line);
    const { id, method, args = [] } = command;
    if (method === 'release-query') {
      if (!releaseFirstQuery) throw new Error('No captured query is awaiting release');
      releaseFirstQuery(); releaseFirstQuery = undefined;
      emit({ event: 'response', id, result: null });
      return;
    }
    if (!['start', 'get', 'list', 'decide', 'cancel', 'reconcile', 'shutdown'].includes(method)) throw new Error('Unsupported worker method');
    const result = await runtime[method](...args);
    if (method === 'shutdown') {
      await host.close();
      emit({ event: 'response', id, result: null });
      input.close();
      process.exitCode = 0;
    } else emit({ event: 'response', id, result });
  } catch (error) { emit({ event: 'response', id: command?.id, error: { code: error?.code, message: String(error?.message ?? error) } }); }
});
