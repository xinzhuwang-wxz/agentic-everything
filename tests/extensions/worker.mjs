// Disposable qualification worker. It accepts only the existing password-free local fixture database.
import { createInterface } from 'node:readline';
import { DBOS, DBOSClient } from '@dbos-inc/dbos-sdk';
import { PersistentRuntime } from '../../dist/packages/runtime-adapters/db/runtime.js';
import { BoundedAutomation, dbosSchedulePort, RuntimeA2AHandler, a2aHttpEndpoint, MobileFixtureBridge } from '../../dist/packages/extensions/src/index.js';
import { SyntheticDurableHost, createModel, validateDatabaseUrl } from '../persistence/host.mjs';
import { createServer } from 'node:http';

const [databaseUrl, fault = ''] = process.argv.slice(2);
validateDatabaseUrl(databaseUrl);
const emit = data => process.stdout.write(`AE_EXTENSION ${JSON.stringify(data)}\n`);
const host = new SyntheticDurableHost(databaseUrl);
const runtime = new PersistentRuntime({ databaseUrl, host, model: createModel(host), fault: async point => {
  if (point === fault) { emit({ event: 'fault', point }); await new Promise(() => {}); }
} });
const client = await DBOSClient.create({ systemDatabaseUrl: databaseUrl, applicationName: 'ae-persistent-runtime' });
const authority = { current: p => host.currentPrincipal(p), release: async () => ({ releaseId: 'extension-fixture-v1' }) };
const automation = new BoundedAutomation(runtime, authority, dbosSchedulePort(client));
const mobile = new MobileFixtureBridge(runtime, authority, new Set(['https://fixture.invalid']));
let fixturePrincipal;
const handler = new RuntimeA2AHandler(runtime, authority, 'http://127.0.0.1/a2a', async () => {});
const endpoint = a2aHttpEndpoint(handler, async request => request.headers.get('authorization') === 'Bearer local-fixture-only' ? fixturePrincipal : undefined);
const server = createServer(async (req, res) => {
  try {
    const body = []; for await (const chunk of req) body.push(chunk);
    const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
    const response = await endpoint(new Request('http://127.0.0.1/a2a', { method: req.method, headers, body: Buffer.concat(body) }));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end(); }
});
await runtime.launch();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
emit({ event: 'ready', port: server.address().port });
const input = createInterface({ input: process.stdin });
input.on('line', async line => {
  let command;
  try {
    command = JSON.parse(line); const { method, args = [] } = command; let result;
    switch (method) {
      case 'create': result = await automation.create(...args); break;
      case 'pause': result = await automation.setPaused(...args); break;
      case 'schedule': result = await client.getSchedule(...args); break;
      case 'backfill': {
        const handles = await DBOS.backfillSchedule(args[0], new Date(args[1]), new Date(args[2]));
        await Promise.all(handles.map(handle => handle.getResult())); result = handles.map(handle => handle.workflowID); break;
      }
      case 'dispatch': result = await automation.dispatch(new Date(args[0]), args[1]); break;
      case 'list': result = await runtime.list(...args); break;
      case 'get': result = await runtime.get(...args); break;
      case 'principal': fixturePrincipal = args[0]; result = null; break;
      case 'mobile': result = await mobile.receive(...args); break;
      case 'shutdown':
        await new Promise(resolve => server.close(resolve)); await runtime.shutdown(); await client.destroy(); await host.close();
        emit({ event: 'response', id: command.id, result: null }); input.close(); return;
      default: throw new Error('Unsupported fixture command');
    }
    emit({ event: 'response', id: command.id, result });
  } catch (error) { emit({ event: 'response', id: command?.id, error: { code: error?.code, message: String(error?.message ?? error) } }); }
});
