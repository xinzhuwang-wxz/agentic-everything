import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { serve } from '@hono/node-server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { JavaSpringInventoryHost, ToolBroker } from '../../packages/capabilities/dist/index.js';
import { GovernedRuntime } from '../../packages/runtime-core/dist/index.js';
import { asDurableHost, PersistentToolBroker } from '../../packages/runtime-adapters/dist/db/broker.js';
import { createAuthenticatedHostMcp, createOriginBoundMcpFetch } from '../../packages/mcp-server/dist/remote.js';

const deadlineAt = Date.now() + 180_000, folder = await mkdtemp(join(tmpdir(), 'ae-java-qualification-'));
const token = () => randomBytes(32).toString('base64url');
const alice = { tenantId: 'tenant-a', applicationId: 'java-inventory', subjectId: 'alice', roles: ['operator'], scopes: ['inventory:read', 'inventory:reserve', 'mcp:read'] };
const bob = { ...alice, subjectId: 'bob', roles: ['viewer'], scopes: ['inventory:read', 'mcp:read'] };
const mallory = { ...alice, tenantId: 'tenant-b', subjectId: 'mallory' };
const bearer = new Map([['alice', token()], ['bob', token()], ['mallory', token()]]), adminToken = token(), remoteToken = token();
const identities = Object.fromEntries([alice, bob, mallory].map(p => [bearer.get(p.subjectId), p]));
const javaRoot = resolve('qualification/java-spring'), source = resolve('fixtures/java-spring-host');
const lock = JSON.parse(await readFile(join(javaRoot, 'dependencies.lock.json'), 'utf8'));
const classpath = [join(javaRoot, 'classes'), ...lock.artifacts.map(a => join(javaRoot, '.cache', `${a.artifact}-${a.version}.jar`))].join(':');
const sourceHash = async () => createHash('sha256').update(await readFile(join(source, 'Inventory.java'))).digest('hex');
const originalHash = await sourceHash(), assertions = [];
let child, ready, mcp, http, client, currentPort = 0, exited = false;
async function launch(port = 0) {
  exited = false;
  child = spawn('java', ['-Xmx256m', '--add-modules', 'jdk.httpserver', '-cp', classpath, 'AeHost', join(folder, 'host.json')], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  child.once('exit', () => { exited = true; });
  const process = child; let stderr = '';
  process.stderr.on('data', data => { stderr = (stderr + String(data)).slice(-4000); });
  process.stdin.end(JSON.stringify({ identities, adminToken, port }));
  const lines = createInterface({ input: process.stdout });
  ready = await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => { process.kill('SIGKILL'); reject(Error('Java startup exceeded fixture budget')); }, Math.min(15_000, deadlineAt - Date.now()));
    lines.once('line', line => { clearTimeout(timer); try { resolveReady(JSON.parse(line)); } catch (error) { reject(error); } });
    process.once('exit', () => { clearTimeout(timer); reject(Error('Java fixture exited before ready: ' + stderr)); });
  });
  assert.equal(ready.springVersion, '6.2.19');
  assert.equal(ready.context, 'org.springframework.context.support.GenericApplicationContext'); assert.equal(ready.managedInventory, true);
  currentPort = ready.port; return new URL(`http://127.0.0.1:${ready.port}/ae`);
}
async function stop() {
  if (!child || exited) return;
  const process = child, closed = once(process, 'exit'); process.kill('SIGTERM');
  const timer = setTimeout(() => process.kill('SIGKILL'), 5000);
  try { const [code, signal] = await closed; assert.ok(signal === 'SIGTERM' || (signal === null && code === 143), `Unexpected Java shutdown: ${code}/${signal}`); } finally { clearTimeout(timer); }
  await assert.rejects(fetch(`http://127.0.0.1:${currentPort}/ae`, { signal: AbortSignal.timeout(500) }));
}
async function control(body = {}) {
  const response = await fetch(`http://127.0.0.1:${currentPort}/_fixture`, { method: 'POST', headers: { authorization: 'Bearer ' + adminToken, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200); return response.json();
}
function simulation(orderId, quantity, expectedVersion) {
  let calls = 0; const requests = [];
  return { requests, async complete(request) {
    requests.push(request); calls++;
    const response = { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: '', toolCalls: [], finishReason: 'tool-calls' };
    if (calls === 1) response.toolCalls = [{ callId: 'stock', name: 'read_stock', arguments: { sku: 'desk-01' } }];
    else if (calls === 2) { assert.match(JSON.stringify(request.messages), /available/); response.toolCalls = [{ callId: 'reserve', name: 'reserve_stock', arguments: { sku: 'desk-01', orderId, quantity, expectedVersion } }]; }
    else { response.finishReason = 'stop'; response.message = 'The Java host confirmed the reservation.'; }
    return response;
  } };
}
function decision(view) { return { approvalId: view.approval.binding.approvalId, expectedHash: view.approval.expectedHash, decision: 'approve' }; }
try {
  const endpoint = await launch();
  const host = new JavaSpringInventoryHost({ endpoint, credentialFor: p => bearer.get(p.subjectId), deadlineAt }), broker = new ToolBroker(host);
  const stock = () => host.readResult(alice, broker.prepare(alice, 'probe', 'read', 'read_stock', { sku: 'desk-01' }).request);
  assert.deepEqual(stock(), { sku: 'desk-01', tenantId: 'tenant-a', available: 12, version: 1 });
  assertions.push('real-spring-core-managed-host-bean', 'existing-java-business-read');
  const model = simulation('order-one', 3, 1), runtime = new GovernedRuntime({ broker, model });
  const pending = await runtime.start({ principal: alice, releaseId: 'java-release', input: 'Inspect then reserve three desks.' });
  assert.equal(pending.status, 'awaiting-approval'); assert.equal((await control()).mutationCount, 0);
  assert.deepEqual(model.requests[0].tools.map(t => t.name).sort(), ['read_stock', 'reserve_stock']);
  assert.equal(pending.approval.binding.policyVersion, 'java-spring-inventory-policy-v1');
  const prepared = broker.prepare(alice, pending.runId, pending.approval.binding.invocationId, 'reserve_stock', { sku: 'desk-01', orderId: 'order-one', quantity: 3, expectedVersion: 1 });
  assert.equal(prepared.request.operationId, pending.approval.binding.operationId);
  const completed = await runtime.decide(pending.runId, alice, decision(pending));
  assert.equal(completed.status, 'succeeded'); assert.equal(stock().available, 9); assert.equal((await control()).mutationCount, 1);
  await assert.rejects(runtime.decide(pending.runId, alice, decision(pending)), /RUN_NOT_AWAITING_THIS_APPROVAL/);
  const repeated = host.write(alice, prepared.request); assert.equal(repeated.status, 'succeeded'); assert.equal((await control()).mutationCount, 1);
  const conflict = host.write(alice, { ...prepared.request, arguments: { ...prepared.request.arguments, quantity: 4 } }); assert.equal(conflict.status, 'denied'); assert.equal(conflict.code, 'HOST_OPERATION_CONFLICT');
  assertions.push('official-agents-sdk-read-before-proposal', 'no-write-before-approval', 'one-approved-host-mutation', 'duplicate-approval-denied', 'host-idempotency-exact-receipt', 'operation-argument-conflict-denied');
  assert.deepEqual(broker.catalog(bob).map(c => c.capabilityId), ['read_stock']);
  assert.throws(() => broker.prepare(mallory, 'foreign', 'read', 'read_stock', { sku: 'desk-01' }), /HOST_RESOURCE_DENIED/);
  assert.throws(() => broker.prepare(alice, 'bad', 'write', 'reserve_stock', { sku: 'desk-01', orderId: 'bad', quantity: 1, expectedVersion: 2, tenantId: 'tenant-b' }), /INVALID_ARGUMENTS/);
  const wrongIdentityHost = new JavaSpringInventoryHost({ endpoint, credentialFor: () => bearer.get('bob'), deadlineAt });
  assert.throws(() => wrongIdentityHost.current(alice), /HOST_IDENTITY_DENIED/);
  assert.throws(() => new JavaSpringInventoryHost({ endpoint, credentialFor: token, deadlineAt }).current(alice), /HOST_TOKEN_DENIED/);
  assert.equal(host.query(alice, 'no-such-operation').status, 'outcome-unknown');
  const revoked = new GovernedRuntime({ broker, model: simulation('revoked', 1, 2) });
  const revocation = await revoked.start({ principal: alice, releaseId: 'java-release', input: 'Reserve one desk.' });
  assert.equal(revocation.status, 'awaiting-approval');
  await control({ identities: { ...identities, [bearer.get('alice')]: { ...alice, scopes: ['inventory:read', 'mcp:read'] } } });
  await assert.rejects(revoked.decide(revocation.runId, alice, decision(revocation)), /RELEASE_CAPABILITY_DENIED/);
  assert.throws(() => host.query(alice, prepared.request.operationId, prepared.request), /SCOPE_DENIED/);
  assert.equal((await control()).mutationCount, 1); await control({ identities });
  const cancelled = new GovernedRuntime({ broker, model: simulation('cancelled', 1, 2) });
  const cancellation = await cancelled.start({ principal: alice, releaseId: 'java-release', input: 'Reserve one desk.' });
  assert.equal(cancelled.cancel(cancellation.runId, alice).status, 'cancelled');
  await assert.rejects(cancelled.decide(cancellation.runId, alice, decision(cancellation)), /RUN_NOT_AWAITING_THIS_APPROVAL/);
  assert.equal((await control()).mutationCount, 1);
  assertions.push('read-only-catalog', 'cross-tenant-denied', 'argument-scope-escalation-denied', 'token-identity-mismatch-denied', 'wrong-host-token-denied', 'missing-host-receipt-remains-unknown', 'current-host-scope-revoked-before-execution-and-receipt-query', 'cancel-before-dispatch-zero-mutation');
  const durable = new PersistentToolBroker({}, asDurableHost(host));
  assert.deepEqual(await durable.catalog(alice), broker.catalog(alice));
  const args = { sku: 'desk-01', orderId: 'planned', quantity: 1, expectedVersion: 2 };
  assert.deepEqual(await durable.prepare(alice, 'planning', 'call', 'reserve_stock', args), broker.prepare(alice, 'planning', 'call', 'reserve_stock', args));
  assertions.push('shared-durable-host-planning-contract-no-postgres-claim');
  const lost = new GovernedRuntime({ broker: new ToolBroker(host), model: simulation('lost-reply', 2, 2) });
  const toLose = await lost.start({ principal: alice, releaseId: 'java-release', input: 'Reserve two desks.' });
  const dispatchedBeforeLoss = (await control()).writeRequests;
  await control({ loseNextWrite: true });
  const unknown = await lost.decide(toLose.runId, alice, decision(toLose));
  assert.equal(unknown.status, 'outcome-unknown'); assert.equal((await control()).mutationCount, 2);
  assert.equal((await control()).writeRequests, dispatchedBeforeLoss + 1);
  await stop(); await launch(currentPort);
  const recovered = lost.reconcile(toLose.runId, alice);
  assert.equal(recovered.status, 'succeeded'); assert.equal((await control()).mutationCount, 2);
  assert.equal((await control()).writeRequests, 0);
  assert.deepEqual(stock(), { sku: 'desk-01', tenantId: 'tenant-a', available: 7, version: 3 });
  assertions.push('actual-http-response-drop-after-host-commit-is-unknown', 'java-host-restart-receipt-reconciliation', 'no-redispatch-after-unknown');

  http = serve({ hostname: '127.0.0.1', port: 0, fetch: request => mcp.fetch(request) }); if (!http.listening) await once(http, 'listening');
  const remoteEndpoint = new URL(`http://127.0.0.1:${http.address().port}/mcp`);
  const remoteIdentities = new Map([[remoteToken, alice]]);
  mcp = createAuthenticatedHostMcp({ endpoint: remoteEndpoint, host, authenticate: token => remoteIdentities.get(token) });
  client = new Client({ name: 'java-host-remote-qualification', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(remoteEndpoint, { fetch: createOriginBoundMcpFetch(remoteEndpoint, () => remoteToken) }));
  assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['read_stock']);
  const result = await client.callTool({ name: 'read_stock', arguments: { sku: 'desk-01' } }); assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0].text), stock());
  await control({ identities: { ...identities, [bearer.get('alice')]: { ...alice, scopes: ['inventory:read', 'inventory:reserve'] } } });
  await assert.rejects(client.listTools()); await control({ identities });
  remoteIdentities.delete(remoteToken); await assert.rejects(client.listTools());
  assertions.push('actual-official-mcp-http-java-read', 'remote-current-host-scope-revocation', 'remote-bearer-revocation');
  assert.equal(originalHash, await sourceHash());
  assertions.push('java-business-source-unchanged');
  await client.close(); client = undefined; await mcp.close(); mcp = undefined;
  http.closeAllConnections(); await new Promise(resolveClose => http.close(resolveClose)); http = undefined;
  await stop(); assertions.push('owned-java-and-http-processes-closed');
  const evidence = { schemaVersion: 1, status: 'pass', runtime: 'official-agents-sdk-memory', modelMode: 'simulated', spring: '6.2.19', java: '21', transport: 'jdk.httpserver', scope: 'Spring Core host adapter and authenticated loopback MCP contract fixture', originalBusinessSha256: originalHash, assertions, finalStock: { available: 7, version: 3 }, mutations: 2, elapsedWithinBudget: Date.now() < deadlineAt, excluded: ['Spring Boot/MVC', 'automatic Java recipe', 'production IAM/OAuth/TLS', 'real provider inference', 'Java-specific DBOS/PostgreSQL execution', 'power-loss durability'] };
  assert.equal(evidence.elapsedWithinBudget, true);
  await writeFile(join(javaRoot, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n'); console.log(JSON.stringify(evidence, null, 2));
} finally {
  await client?.close().catch(() => {}); await mcp?.close().catch(() => {});
  if (http) { http.closeAllConnections(); await new Promise(resolveClose => http.close(resolveClose)); }
  await stop(); await rm(folder, { recursive: true, force: true });
}
