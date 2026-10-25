import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, request as httpRequest, type Server as HttpServer } from 'node:http';
import { once } from 'node:events';
import { serve } from '@hono/node-server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AuthorizedTicketHost } from '@ae/capabilities';
import type { Principal } from '@ae/contracts';
import { createAuthenticatedHostMcp, createOriginBoundMcpFetch } from '../src/remote.js';

const alice: Principal = { tenantId: 'tenant-a', applicationId: 'remote-fixture', subjectId: 'alice', roles: ['editor'], scopes: ['tickets:read', 'tickets:write', 'mcp:read'] };
const credential = () => randomBytes(32).toString('base64url');
test('official MCP 2.4 HTTP authenticates each read and rejects current scope/token revocation, foreign resources and tool/schema escalation', async () => {
  let reads = 0, live = structuredClone(alice), handler: ReturnType<typeof createAuthenticatedHostMcp>;
  const observedProtocols = new Set<string>();
  const token = credential(), identities = new Map([[token, alice]]);
  const host = new AuthorizedTicketHost({ readTicket: (tenant, id) => { reads++; return { id, tenantId: id === 'foreign' ? 'tenant-b' : tenant, title: 'Fixture', priority: 'low', version: 1 }; }, changePriority: () => { throw Error('Remote must not write'); } }, p => ({ ...p, roles: [...live.roles], scopes: [...live.scopes] }));
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: request => { const version = request.headers.get('mcp-protocol-version'); if (version) observedProtocols.add(version); return handler.fetch(request); } });
  if (!server.listening) await once(server, 'listening');
  const endpoint = new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`);
  handler = createAuthenticatedHostMcp({ endpoint, host, authenticate: token => identities.get(token) });
  const client = new Client({ name: 'ae-remote-qualification', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(endpoint, { fetch: createOriginBoundMcpFetch(endpoint, () => token) }));
    assert.equal(client.getServerVersion()?.name, 'ae-authenticated-host');
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['read_ticket']);
    const result = await client.callTool({ name: 'read_ticket', arguments: { ticketId: 'one' } });
    assert.notEqual(result.isError, true); assert.match(JSON.stringify(result), /Fixture/);
    assert.ok(observedProtocols.has('2025-11-25'));
    const rejected = async (name: string, args: Record<string, unknown>) => {
      let denied = false;
      try { denied = (await client.callTool({ name, arguments: args })).isError === true; } catch { denied = true; }
      assert.equal(denied, true);
    };
    await rejected('change_ticket_priority', { ticketId: 'one', priority: 'high', expectedVersion: 1 });
    await rejected('read_ticket', { ticketId: 'one', tenantId: 'tenant-b' });
    await rejected('read_ticket', { ticketId: 'foreign' });
    live.scopes = ['tickets:read']; const before = reads;
    await assert.rejects(client.listTools()); assert.equal(reads, before);
    live = structuredClone(alice); live.scopes = ['mcp:read'];
    await assert.rejects(client.listTools()); assert.equal(reads, before);
    live = structuredClone(alice); identities.delete(token);
    await assert.rejects(client.listTools()); assert.equal(reads, before);
    identities.set(token, alice);
    for (const headers of [{ authorization: `Bearer ${credential()}` }, { authorization: `Bearer ${token}`, origin: 'https://untrusted.invalid' }]) {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
      assert.ok([401, 403].includes(response.status));
    }
    assert.equal((await fetch(new URL('/not-mcp', endpoint), { method: 'POST' })).status, 403);
    const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(endpoint, { method: 'POST', headers: { host: 'untrusted.invalid', authorization: `Bearer ${token}` } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.end();
    });
    assert.equal(invalidHostStatus, 403);
    assert.equal((await fetch(endpoint, { method: 'GET', headers: { authorization: `Bearer ${token}` } })).status, 405);
  } finally { await client.close(); await handler.close(); (server as HttpServer).closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('bounded MCP fetch never forwards bearer to redirect, another origin/path, or a cancelled request', async () => {
  let escaped = 0, received = 0;
  const sink = createServer((request, response) => { escaped++; response.end('Never reached'); }); sink.listen(0, '127.0.0.1'); await once(sink, 'listening');
  const other = `http://127.0.0.1:${(sink.address() as { port: number }).port}/mcp`;
  let destination = other;
  const redirect = createServer((request, response) => { received++; response.writeHead(307, { location: destination }); response.end(); }); redirect.listen(0, '127.0.0.1'); await once(redirect, 'listening');
  const endpoint = new URL(`http://127.0.0.1:${(redirect.address() as { port: number }).port}/mcp`);
  const bounded = createOriginBoundMcpFetch(endpoint, credential);
  try {
    await assert.rejects(bounded(endpoint, { method: 'POST', body: '{}' }), /REMOTE_REDIRECT_DENIED/);
    destination = new URL('/elsewhere', endpoint).href;
    await assert.rejects(bounded(endpoint, { method: 'POST', body: '{}' }), /REMOTE_REDIRECT_DENIED/);
    await assert.rejects(bounded(other), /REMOTE_DESTINATION_DENIED/);
    await assert.rejects(bounded(destination), /REMOTE_DESTINATION_DENIED/);
    const before = received, controller = new AbortController(); controller.abort();
    await assert.rejects(bounded(endpoint, { signal: controller.signal }));
    assert.equal(received, before); assert.equal(escaped, 0);
    for (const invalid of ['http://untrusted.invalid/mcp', endpoint.href + '?secret=x', new URL('/other', endpoint).href, 'https://user:password@example.invalid/mcp']) assert.throws(() => createOriginBoundMcpFetch(new URL(invalid), credential), /REMOTE_ENDPOINT_DENIED/);
  } finally {
    redirect.closeAllConnections(); sink.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => redirect.close(() => resolve())), new Promise<void>(resolve => sink.close(() => resolve()))]);
  }
});
