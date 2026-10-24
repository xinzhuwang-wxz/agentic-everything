import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import type { AgentRelease, ModelProvider, Principal } from '@ae/contracts';
import { GovernedRuntime, type RunView } from '@ae/runtime-core';
import { AuthorizedTicketHost, ToolBroker, ticketCapabilities } from '@ae/capabilities';
import { InMemoryControlPlane } from '@ae/control-plane';
import { readTicket, changePriority } from '../../../fixtures/existing-react-helpdesk/src/tickets.js';
import { createApi, type RuntimePort } from '../src/app.js';

test('HTTP configuration publication pins runs without granting business authority', async t => {
  const admin: Principal = { tenantId: 'tenant-a', applicationId: 'helpdesk', subjectId: 'admin', roles: ['editor', 'agentic:admin'], scopes: ['tickets:read', 'tickets:write'] };
  let session = admin;
  const calls = new Map<string, number>();
  const catalogs = new Map<string, string[]>();
  const model: ModelProvider = { async complete(request) {
    const turn = calls.get(request.runId) ?? 0; calls.set(request.runId, turn + 1);
    catalogs.set(request.runId, request.tools.map(tool => tool.name));
    const call = turn === 0 && request.tools.some(tool => tool.name === 'read_ticket')
      ? { callId: `${request.runId}-read`, name: 'read_ticket', arguments: { ticketId: 'ticket-1' } }
      : turn === 1 && request.tools.some(tool => tool.name === 'change_ticket_priority')
        ? { callId: `${request.runId}-write`, name: 'change_ticket_priority', arguments: { ticketId: 'ticket-1', priority: 'high', expectedVersion: readTicket('tenant-a', 'ticket-1').version } }
        : undefined;
    return { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: call ? '' : 'Available work completed.', toolCalls: call ? [call] : [], finishReason: call ? 'tool-calls' : 'stop' };
  } };
  const host = new AuthorizedTicketHost({ readTicket, changePriority });
  const broker = new ToolBroker(host);
  const governed = new GovernedRuntime({ model, broker });
  const starts: Parameters<RuntimePort['start']>[0][] = [];
  // An async structural wrapper proves no private class or synchronous get/cancel dependency.
  const runtime: RuntimePort = {
    async start(input) { starts.push(structuredClone(input)); return governed.start(input); },
    async get(id, p) { return governed.get(id, p); },
    async decide(id, p, decision) { return governed.decide(id, p, decision); },
    async cancel(id, p) { return governed.cancel(id, p); },
  };
  const controlPlane = new InMemoryControlPlane(ticketCapabilities);
  let app: Hono;
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => app.fetch(request) });
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  app = createApi({ runtime, broker, controlPlane, resolvePrincipal: () => session, releaseId: 'fixture-default', applicationName: 'Fixture', apiOrigin: base, allowedOrigin: 'http://127.0.0.1:5173' });
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const post = (path: string, body: unknown, intent = 'new-intent', origin = 'http://127.0.0.1:5173') => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': intent }, body: JSON.stringify(body) });
  const configuration = (capabilityIds: string[]) => ({ name: 'Bounded helpdesk', instructions: 'Help using only permitted tools.', capabilityIds, bounds: { maxTurns: 8, maxElapsedMs: 30000 } });
  const publish = async (capabilities: string[]): Promise<AgentRelease> => {
    const saved = await post('/api/configuration/drafts', { configuration: configuration(capabilities) }); assert.equal(saved.status, 201);
    const draft = await saved.json();
    const valid = await post(`/api/configuration/drafts/${draft.draftId}/validate`, { expectedRevision: draft.revision }); assert.equal(valid.status, 200);
    const release = await post(`/api/configuration/drafts/${draft.draftId}/publish`, { expectedRevision: draft.revision }); assert.equal(release.status, 200); return release.json();
  };
  const full = await publish(['read_ticket', 'change_ticket_priority']);
  const oldResponse = await post('/api/runs', { input: 'raise ticket priority' }, 'old-intent'); assert.equal(oldResponse.status, 201);
  const old = await oldResponse.json() as RunView; assert.equal(old.status, 'awaiting-approval'); assert.ok(old.approval);
  assert.equal(old.approval.binding.releaseId, full.releaseId); assert.equal(starts[0]?.release?.contentHash, full.contentHash);
  const readOnly = await publish(['read_ticket']);
  const meta = await (await fetch(base + '/api/meta')).json(); assert.equal(meta.releaseId, readOnly.releaseId);
  const catalog = await (await fetch(base + '/api/capabilities')).json(); assert.deepEqual(catalog.capabilities.map((c: {capabilityId: string}) => c.capabilityId), ['read_ticket']);
  const repeated = await post('/api/runs', { input: 'raise ticket priority' }, 'old-intent'); assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).runId, old.runId); assert.equal(starts.length, 1);
  assert.equal((await post('/api/runs', { input: 'different' }, 'old-intent')).status, 409);
  const newer = await (await post('/api/runs', { input: 'raise ticket priority' }, 'new-intent')).json() as RunView;
  assert.equal(newer.status, 'succeeded'); assert.deepEqual(catalogs.get(newer.runId), ['read_ticket']); assert.equal(host.mutationCount, 0);
  assert.equal(starts[1]?.release?.releaseId, readOnly.releaseId);
  const cancelledTerminal = await (await post(`/api/runs/${newer.runId}/cancel`, {})).json(); assert.equal(cancelledTerminal.status, 'succeeded');
  const approved = await post(`/api/runs/${old.runId}/approval`, { approvalId: old.approval.binding.approvalId, expectedHash: old.approval.expectedHash, decision: 'approve' });
  assert.equal((await approved.json()).status, 'succeeded'); assert.equal(host.mutationCount, 1);
  assert.equal((await (await fetch(base + '/api/runs/' + old.runId)).json()).status, 'succeeded');
  assert.equal((await post('/api/runs', { input: 'read', releaseId: full.releaseId }, 'spoof-release')).status, 400);
  assert.equal((await post('/api/configuration/drafts', { configuration: configuration([]) }, 'csrf', 'https://evil.example')).status, 403);
  assert.equal((await post('/api/configuration/drafts', { configuration: configuration([]), tenantId: 'tenant-b' })).status, 400);
  session = { ...admin, roles: ['viewer'], scopes: ['tickets:read'] };
  assert.equal((await post('/api/configuration/drafts', { configuration: configuration([]) })).status, 403);
  const viewerState = await (await fetch(base + '/api/configuration')).json(); assert.equal(viewerState.canConfigure, false);
  session = { ...admin, tenantId: 'tenant-b' };
  assert.equal((await post(`/api/configuration/drafts/${readOnly.draftId}/publish`, { expectedRevision: readOnly.draftRevision })).status, 404);
  session = { ...admin, applicationId: 'other-app' };
  assert.equal((await post(`/api/configuration/drafts/${readOnly.draftId}/validate`, { expectedRevision: readOnly.draftRevision })).status, 404);
  session = { ...admin, roles: ['agentic:admin'], scopes: [] };
  await publish(['read_ticket', 'change_ticket_priority']);
  const modelRuns = catalogs.size;
  const unprivileged = await post('/api/runs', { input: 'raise priority' }, 'admin-not-editor');
  assert.equal(unprivileged.status, 403); assert.equal((await unprivileged.json()).error.code, 'ROLE_DENIED');
  assert.equal(catalogs.size, modelRuns, 'Configuration authority cannot disclose run/model data without business read authority');
  assert.equal(host.mutationCount, 1);
});
