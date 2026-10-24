// One real process per worker lifetime. Only PostgreSQL survives SIGKILL.
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgresControlPlane } from '../../dist/packages/control-plane/src/postgres.js';
import { ticketCapabilities } from '@ae/capabilities';
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
const control = new PostgresControlPlane(databaseUrl, ticketCapabilities);
await control.initialize();
host.currentCapabilities = async principal => { const result=await host.pool.query('SELECT capability_id FROM qualification_control.disabled WHERE subject_id=$1',[principal.subjectId]); return ticketCapabilities.filter(cap=>!result.rows.some(row=>row.capability_id===cap.capabilityId)); };
const baseModel=createModel(host);
const model={async complete(request,signal){
  await host.pool.query('INSERT INTO qualification_control.catalogs(run_id,tools) VALUES($1,$2)',[request.runId,JSON.stringify(request.tools.map(t=>t.name))]);
  const response=await baseModel.complete(request,signal);
  if(response.toolCalls.some(call=>!request.tools.some(tool=>tool.name===call.name)))return {...response,message:'Selected release does not permit this action.',toolCalls:[],finishReason:'stop'};
  return response;
}};
const runtime = new PersistentRuntime({ databaseUrl, model, host,
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
    if (method === 'start-active') {
      const input=args[0]; if ('release' in input || 'releaseId' in input) throw new Error('EXTERNAL_RELEASE_DENIED');
      const release=await control.activeRelease(input.principal); if (!release) throw new Error('RELEASE_REQUIRED');
      const result=await runtime.start({...input,releaseId:release.releaseId,release});emit({event:'response',id,result});return;
    }
    if (!['start', 'get', 'list', 'decide', 'cancel', 'reconcile', 'shutdown'].includes(method)) throw new Error('Unsupported worker method');
    const result = await runtime[method](...args);
    if (method === 'shutdown') {
      await control.close(); await host.close();
      emit({ event: 'response', id, result: null });
      input.close();
      process.exitCode = 0;
    } else emit({ event: 'response', id, result });
  } catch (error) { emit({ event: 'response', id: command?.id, error: { code: error?.code, message: String(error?.message ?? error) } }); }
});
