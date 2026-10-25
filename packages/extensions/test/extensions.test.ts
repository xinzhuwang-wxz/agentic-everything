import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskState, SendMessageRequest, GetTaskRequest, CancelTaskRequest } from '@a2a-js/sdk';
import { ClientFactory, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import type { Principal } from '@ae/contracts';
import { PolicyError, samePrincipal } from '@ae/policy';
import { BoundedAutomation, validateAutomation, type SchedulePort, type DailyAutomation } from '../src/automation.js';
import { RuntimeA2AHandler, a2aHttpEndpoint } from '../src/a2a.js';
import { MobileFixtureBridge, mobileQualification } from '../src/mobile.js';
import type { ExtensionRuntime, ExtensionAuthority, ExtensionRun } from '../src/runtime.js';

const principal: Principal = { tenantId: 'fixture-a', applicationId: 'fixture-app', subjectId: 'alice', roles: ['viewer'], scopes: ['read'] };
const other: Principal = { ...principal, subjectId: 'bob' };
class FixtureRuntime implements ExtensionRuntime {
  readonly runs = new Map<string, { principal: Principal; view: ExtensionRun }>();
  creates = 0;
  async start(input: Parameters<ExtensionRuntime['start']>[0]) {
    if (!this.runs.has(input.runId)) { this.creates++; this.runs.set(input.runId, { principal: structuredClone(input.principal), view: { runId: input.runId, status: input.input === 'finish' ? 'succeeded' : input.input === 'unknown' ? 'outcome-unknown' : 'awaiting-approval', events: [] } }); }
    return this.get(input.runId, input.principal);
  }
  async get(id: string, p: Principal) { const item = this.runs.get(id); if (!item || !samePrincipal(item.principal, p)) throw new PolicyError('RUN_NOT_FOUND'); return structuredClone(item.view); }
  async cancel(id: string, p: Principal) { const item = await this.get(id, p); if (item.status !== 'outcome-unknown') { item.status = 'cancelled'; this.runs.get(id)!.view = item; } return item; }
}
const runtime = new FixtureRuntime();
let revoked = false;
const authority: ExtensionAuthority = { current: async p => { if (revoked) throw new PolicyError('REVOKED'); return structuredClone(p); }, release: async () => ({ releaseId: 'fixture-release' }) };
const schedules = new Map<string, NonNullable<Awaited<ReturnType<SchedulePort['getSchedule']>>>>();
const schedulePort: SchedulePort = {
  getSchedule: async name => structuredClone(schedules.get(name) ?? null),
  createSchedule: async options => { schedules.set(options.scheduleName, { scheduleName: options.scheduleName, scheduleId: options.scheduleName, workflowName: 'ae-bounded-daily-v1', workflowClassName: '', applicationName: 'ae-persistent-runtime', schedule: options.schedule, status: 'ACTIVE', context: options.context, lastFiredAt: null, automaticBackfill: options.options?.automaticBackfill ?? false, cronTimezone: options.options?.cronTimezone ?? null, queueName: null }); },
  pauseSchedule: async name => { schedules.get(name)!.status = 'PAUSED'; }, resumeSchedule: async name => { schedules.get(name)!.status = 'ACTIVE'; },
};
let now = Date.parse('2026-10-25T08:05:00Z');
const automation = new BoundedAutomation(runtime, authority, schedulePort, () => now);
const daily: DailyAutomation = { automationId: 'daily', principal, input: 'finish', hour: 9, minute: 0, timezone: 'Europe/Berlin', startsAt: '2026-10-25T00:00:00Z', endsAt: '2026-10-27T00:00:00Z', maxLatenessMs: 3600000 };

test('automation rejects unbounded windows, bad timezone and caller-selected owners', async () => {
  assert.throws(() => validateAutomation({ ...daily, endsAt: '2027-01-01T00:00:00Z' }), /AUTOMATION_WINDOW_INVALID/);
  assert.throws(() => validateAutomation({ ...daily, timezone: 'invalid-zone' }), /AUTOMATION_TIMEZONE_INVALID/);
  assert.throws(() => validateAutomation({ ...daily, maxLatenessMs: 3600001 }));
  await assert.rejects(automation.create(daily, other), /AUTOMATION_OWNER_DENIED/);
});
test('automation uses explicit timezone, duplicate identity, pause, expiry and live revocation', async () => {
  const scheduleName = await automation.create(daily, principal);
  assert.equal(await automation.create(daily, principal), scheduleName);
  const before = runtime.creates;
  const a = await automation.dispatch(new Date('2026-10-25T08:00:00Z'), daily);
  const b = await automation.dispatch(new Date('2026-10-25T08:00:00Z'), daily);
  assert.equal(a.status, 'started'); assert.deepEqual(a, b); assert.equal(runtime.creates, before + 1);
  await automation.setPaused(daily, principal, true);
  assert.deepEqual(await automation.dispatch(new Date('2026-10-25T08:00:00Z'), daily), { status: 'skipped', reason: 'paused-or-deleted' });
  await assert.rejects(automation.setPaused(daily, other, false), /AUTOMATION_OWNER_DENIED/);
  await automation.setPaused(daily, principal, false);
  revoked = true; await assert.rejects(automation.dispatch(new Date('2026-10-25T08:00:00Z'), daily), /REVOKED/); revoked = false;
  assert.deepEqual(await automation.dispatch(new Date('2026-10-25T08:01:00Z'), daily), { status: 'skipped', reason: 'not-due' });
  now = Date.parse('2026-10-25T10:00:01Z'); assert.equal((await automation.dispatch(new Date('2026-10-25T08:00:00Z'), daily)).status, 'skipped');
  now = Date.parse(daily.endsAt); assert.deepEqual(await automation.dispatch(new Date('2026-10-25T08:00:00Z'), daily), { status: 'skipped', reason: 'outside-window' });
  await assert.rejects(automation.setPaused(daily, principal, false), /AUTOMATION_EXPIRED/);
  now = Date.parse('2026-10-25T08:05:00Z');
  await assert.rejects(automation.create({ ...daily, input: 'changed' }, principal), /AUTOMATION_DEFINITION_DRIFT/);
});
test('DST repeated local hour retains distinct UTC occurrence identity', async () => {
  const dst = { ...daily, automationId: 'dst', hour: 2, minute: 30, maxLatenessMs: 3600000 };
  await automation.create(dst, principal); now = Date.parse('2026-10-25T00:30:00Z');
  const first = await automation.dispatch(new Date(now), dst); now = Date.parse('2026-10-25T01:30:00Z');
  const second = await automation.dispatch(new Date(now), dst);
  assert.equal(first.status, 'started'); assert.equal(second.status, 'started'); assert.notDeepEqual(first, second);
});

const handler = new RuntimeA2AHandler(runtime, authority, 'http://127.0.0.1/a2a', async () => {});
const endpoint = a2aHttpEndpoint(handler, async request => request.headers.get('authorization') === 'Bearer fixture-alice' ? principal : request.headers.get('authorization') === 'Bearer fixture-bob' ? other : undefined);
const requests: Request[] = [];
const sdkFetch: typeof fetch = async (url, init) => { const request = new Request(url, init); requests.push(request.clone()); return endpoint(request); };
const factory = new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl: sdkFetch })] });
const auth = { serviceParameters: { Authorization: 'Bearer fixture-alice' } };
const send = (text: string, messageId = 'message-1') => SendMessageRequest.fromJSON({ message: { messageId, role: 'ROLE_USER', parts: [{ text, mediaType: 'text/plain' }] } });

test('official A2A SDK v1.0 client interoperates with send/status/cancel and exact replay', async () => {
  const client = await factory.createFromAgentCard(handler.card);
  const before = runtime.creates;
  const first = await client.sendMessage(send('wait', 'sdk-replay'), auth);
  assert.ok('id' in first); const task = first;
  assert.equal(task.status?.state, TaskState.TASK_STATE_INPUT_REQUIRED);
  assert.equal(task.metadata?.approvalChannel, 'host-only');
  assert.deepEqual(await client.sendMessage(send('wait', 'sdk-replay'), auth), first);
  assert.equal(runtime.creates, before + 1);
  assert.equal((await client.getTask(GetTaskRequest.fromJSON({ id: task.id }), auth)).id, task.id);
  assert.equal((await client.cancelTask(CancelTaskRequest.fromJSON({ id: task.id }), auth)).status?.state, TaskState.TASK_STATE_CANCELED);
  await assert.rejects(client.cancelTask(CancelTaskRequest.fromJSON({ id: task.id }), auth));
  assert.equal(requests[0]!.headers.get('a2a-version'), '1.0');
});
test('A2A rejects missing auth, cross-user task access, cross-tenant request and old protocol', async () => {
  const client = await factory.createFromAgentCard(handler.card);
  await assert.rejects(client.sendMessage(send('finish', 'no-auth')));
  const result = await client.sendMessage(send('finish', 'own'), auth); assert.ok('id' in result);
  await assert.rejects(client.getTask(GetTaskRequest.fromJSON({ id: result.id }), { serviceParameters: { Authorization: 'Bearer fixture-bob' } }));
  const raw = (body: unknown, version = '1.0') => endpoint(new Request('http://127.0.0.1/a2a', { method: 'POST', headers: { Authorization: 'Bearer fixture-alice', 'Content-Type': 'application/json', 'A2A-Version': version }, body: JSON.stringify(body) }));
  assert.equal((await raw({ jsonrpc: '2.0', id: 1, method: 'GetTask', params: { tenant: 'fixture-other', id: result.id } })).status, 403);
  assert.ok((await (await raw({ jsonrpc: '2.0', id: 1, method: 'GetTask', params: { id: result.id } }, '0.3')).json()).error);
  revoked = true; await assert.rejects(client.getTask(GetTaskRequest.fromJSON({ id: result.id }), auth)); revoked = false;
});
test('A2A rejects unsupported capabilities and preserves unknown outcome on cancel', async () => {
  const client = await factory.createFromAgentCard(handler.card);
  const unknown = await client.sendMessage(send('unknown', 'unknown'), auth); assert.ok('id' in unknown);
  assert.equal(unknown.metadata?.aeStatus, 'outcome-unknown');
  await assert.rejects(client.cancelTask(CancelTaskRequest.fromJSON({ id: unknown.id }), auth));
  const file = SendMessageRequest.fromJSON({ message: { messageId: 'file', role: 'ROLE_USER', parts: [{ url: 'https://example.invalid/private', mediaType: 'text/plain' }] } });
  const before = runtime.creates; await assert.rejects(client.sendMessage(file, auth));
  await assert.rejects(client.sendMessage(SendMessageRequest.fromJSON({ ...SendMessageRequest.toJSON(send('approve')) as object, metadata: { principal, approval: 'approve' } }), auth));
  assert.equal(runtime.creates, before);
  // The official SDK deliberately falls back to SendMessage for a non-streaming card.
  const stream = client.sendMessageStream(send('finish', 'stream'), auth); assert.equal((await stream.next()).done, false);
  assert.equal((await requests.at(-1)!.json()).method, 'SendMessage');
  const response = await endpoint(new Request('http://127.0.0.1/a2a', { method: 'POST', headers: { Authorization: 'Bearer fixture-alice', 'Content-Type': 'application/json', 'A2A-Version': '1.0' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'SendStreamingMessage', params: SendMessageRequest.toJSON(send('finish', 'unsupported-stream')) }) }));
  assert.ok((await response.json()).error);
});
test('mobile fixture strictly binds session/origin and refuses forged identity or approval', async () => {
  const bridge = new MobileFixtureBridge(runtime, authority, new Set(['https://fixture.invalid']));
  const session = { principal, origin: 'https://fixture.invalid', expiresAt: Date.now() + 60000 };
  const request = { version: '1', requestId: 'mobile-1', operation: 'start', input: 'wait' };
  const first = await bridge.receive(request, session);
  assert.equal(mobileQualification.realPlatform, 'unverified'); assert.equal(first.qualification, 'contract-fixture-only');
  assert.deepEqual(await bridge.receive(request, session), first);
  const status = { version: '1', requestId: 'status', operation: 'status', runId: first.run.runId };
  await assert.rejects(bridge.receive(status, { ...session, principal: other }), /RUN_NOT_FOUND/);
  await assert.rejects(bridge.receive(request, { ...session, origin: 'https://evil.invalid' }), /BRIDGE_SESSION_DENIED/);
  await assert.rejects(bridge.receive(request, { ...session, expiresAt: 0 }), /BRIDGE_SESSION_DENIED/);
  await assert.rejects(bridge.receive({ ...request, principal: other }, session));
  await assert.rejects(bridge.receive({ ...request, operation: 'approve' }, session));
  assert.equal((await bridge.receive({ ...status, operation: 'cancel' }, session)).run.status, 'cancelled');
});
test('A2A polls submitted/working/completed states without creating another task store', async () => {
  const client = await factory.createFromAgentCard(handler.card);
  const result = await client.sendMessage(send('finish', 'lifecycle'), auth); assert.ok('id' in result);
  assert.equal(result.status?.state, TaskState.TASK_STATE_COMPLETED);
  for (const [status, expected] of [['queued', TaskState.TASK_STATE_SUBMITTED], ['running', TaskState.TASK_STATE_WORKING], ['failed', TaskState.TASK_STATE_FAILED], ['rejected', TaskState.TASK_STATE_REJECTED]] as const) {
    runtime.runs.get(result.id)!.view.status = status;
    assert.equal((await client.getTask(GetTaskRequest.fromJSON({ id: result.id, historyLength: 0 }), auth)).status?.state, expected);
  }
  await assert.rejects(client.getTask(GetTaskRequest.fromJSON({ id: result.id, historyLength: -1 }), auth));
});
test('HTTP body size and trusted admission are bounded before runtime creation', async () => {
  const huge = await endpoint(new Request('http://127.0.0.1/a2a', { method: 'POST', headers: { Authorization: 'Bearer fixture-alice', 'Content-Type': 'application/json' }, body: 'x'.repeat(65537) }));
  assert.equal(huge.status, 413);
  const denied = new RuntimeA2AHandler(runtime, authority, 'http://127.0.0.1/a2a', async () => { throw new PolicyError('ADMISSION_DENIED'); });
  const denyEndpoint = a2aHttpEndpoint(denied, async () => principal);
  const denyClient = await new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl: async (url, init) => denyEndpoint(new Request(url, init)) })] }).createFromAgentCard(denied.card);
  const before = runtime.creates; await assert.rejects(denyClient.sendMessage(send('finish', 'denied'), auth)); assert.equal(runtime.creates, before);
});
