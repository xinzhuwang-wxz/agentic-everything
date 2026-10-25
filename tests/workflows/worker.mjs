// Fresh OS process; DBOS and the AE/host PostgreSQL ledgers are the only recovery state.
import { createInterface } from 'node:readline';
import { DeterministicWorkflowRuntime, WorkflowCatalog } from '../../dist/packages/runtime-adapters/db/workflows/index.js';
import { durableAuthority } from '../../dist/packages/runtime-adapters/db/host-boundary.js';
import { SyntheticDurableHost, validateDatabaseUrl } from '../persistence/host.mjs';
import { definition } from './fixture.mjs';
const [databaseUrl, fault = '', catalogVersion = '1'] = process.argv.slice(2);
validateDatabaseUrl(databaseUrl);
const emit = value => process.stdout.write(`AE_PERSISTENCE ${JSON.stringify(value)}\n`);
const host = new SyntheticDurableHost(databaseUrl);
if (fault === 'lost-ack') {
  const write = host.write.bind(host);
  host.write = async (...args) => { await write(...args); throw Error('Synthetic lost acknowledgment after durable commit'); };
}
if (fault.startsWith('retry')) {
  const authority = durableAuthority(host), read = authority.readResult.bind(authority);
  authority.readResult = async (principal, request, behavior) => {
    const count = Number((await host.pool.query("SELECT count(*) FROM qualification_host.calls WHERE kind='read-attempt' AND target_id=$1", [request.targetId])).rows[0].count);
    await host.record('read-attempt', principal, request.operationId, request.targetId);
    if (fault === 'retry-exhaust' || count === 0) throw Error('Synthetic transient read transport failure');
    return read(principal, request, behavior);
  };
  host.capabilityAuthority = authority;
}
const runtime = new DeterministicWorkflowRuntime({ databaseUrl, host, catalog: new WorkflowCatalog([definition(Number(catalogVersion))]), fault: async point => {
  if (point === fault || (fault === 'retry-crash' && point === 'before-read-retry')) { emit({ event: 'fault', point, pid: process.pid }); await new Promise(() => {}); }
} });
await runtime.launch(); emit({ event: 'ready', pid: process.pid });
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', async line => {
  let command;
  try {
    command = JSON.parse(line); const { id, method, args = [] } = command;
    if (!['start', 'get', 'decide', 'cancel', 'reconcile', 'shutdown'].includes(method)) throw Error('Unsupported worker method');
    const result = await runtime[method](...args);
    emit({ event: 'response', id, result: result ?? null });
    if (method === 'shutdown') { await host.close(); input.close(); process.exitCode = 0; }
  } catch (error) { emit({ event: 'response', id: command?.id, error: { code: error?.code, message: String(error?.message ?? error) } }); }
});
