import { randomUUID } from 'node:crypto';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { JsonObjectSchema, PrincipalSchema, type Principal } from '@ae/contracts';
import type { TrustedCapabilityHost } from '../../capabilities/src/host-boundary.js';

/** Endpoint and identity resolver are trusted composition, never tool/model arguments.
 * This deliberately exposes only host read capabilities. Effects use AE's approval runtime. */
export function createAuthenticatedHostMcp(options: {
  endpoint: URL; host: TrustedCapabilityHost; authenticate: (bearer: string) => Principal | undefined;
}) {
  const endpoint = exactEndpoint(options.endpoint);
  const handler = createMcpHandler(context => {
    const authorization = context.requestInfo?.headers.get('authorization') ?? '';
    const resolve = () => {
      const identity = options.authenticate(authorization.slice(7));
      if (!identity) throw new Error('REMOTE_IDENTITY_REVOKED');
      const principal = PrincipalSchema.parse(identity);
      const current = options.host.current(principal);
      if (current.tenantId !== principal.tenantId || current.applicationId !== principal.applicationId || current.subjectId !== principal.subjectId) throw new Error('REMOTE_IDENTITY_CHANGED');
      if (!current.scopes.includes('mcp:read')) throw new Error('REMOTE_SCOPE_DENIED');
      return current;
    };
    const principal = resolve();
    const server = new McpServer({ name: 'ae-authenticated-host', version: '0.1.0' });
    for (const definition of Object.values(options.host.definitions)) {
      const capability = definition.capability;
      if (capability.risk !== 'read' || !options.host.supports(capability.capabilityId)) continue;
      try {
        if (capability.requiredScopes.some(scope => !principal.scopes.includes(scope))) continue;
        options.host.authorizeCapability(principal, capability.capabilityId);
      } catch { continue; }
      server.registerTool(capability.capabilityId, {
        description: capability.description, inputSchema: definition.parameters,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, input => {
        try {
          const args = JsonObjectSchema.parse(input);
          const p = resolve(); options.host.authorizeCapability(p, capability.capabilityId);
          if (capability.requiredScopes.some(scope => !p.scopes.includes(scope))) throw new Error('REMOTE_SCOPE_DENIED');
          const target = options.host.prepareTarget(p, capability.capabilityId, args);
          if (target.targetId !== options.host.referenceTarget(capability.capabilityId, args)) throw new Error('REMOTE_TARGET_BINDING');
          const request = { schemaVersion: '1' as const, runId: 'remote-read', invocationId: randomUUID(), capabilityId: capability.capabilityId,
            capabilityVersion: capability.version, arguments: args, targetId: target.targetId, operationId: randomUUID() };
          options.host.assertReadable(p, request);
          return { content: [{ type: 'text' as const, text: JSON.stringify(options.host.readResult(p, request)) }] };
        } catch { return { isError: true, content: [{ type: 'text' as const, text: 'AE_REMOTE_READ_DENIED' }] }; }
      });
    }
    return server;
  }, { legacy: 'stateless', maxRequestBodySize: 65_536 });
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.href !== endpoint.href || request.headers.get('host') !== endpoint.host) return new Response('Endpoint denied', { status: 403 });
      const origin = request.headers.get('origin');
      if (origin !== null && origin !== endpoint.origin) return new Response('Origin denied', { status: 403 });
      if (request.method !== 'POST') return new Response('Method denied', { status: 405 });
      const authorization = request.headers.get('authorization') ?? '';
      if (!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(authorization)) return new Response('Unauthorized', { status: 401 });
      try {
        const principal = options.authenticate(authorization.slice(7));
        if (!principal) return new Response('Unauthorized', { status: 401 });
        const current = options.host.current(PrincipalSchema.parse(principal));
        if (current.tenantId !== principal.tenantId || current.applicationId !== principal.applicationId || current.subjectId !== principal.subjectId || !current.scopes.includes('mcp:read')) return new Response('Forbidden', { status: 403 });
      } catch { return new Response('Forbidden', { status: 403 }); }
      try { return await handler.fetch(request); } catch { return new Response('Request rejected', { status: 403 }); }
    },
    close: () => handler.close(),
  };
}

function exactEndpoint(value: URL): URL {
  const url = new URL(value.href);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/mcp' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw new Error('REMOTE_ENDPOINT_DENIED');
  return url;
}

/** Supply as the official SDK transport's fetch. No OAuth discovery, redirects,
 * arbitrary destinations, browser cookies or ambient credentials in this declared subset. */
export function createOriginBoundMcpFetch(endpointInput: URL, token: () => string): typeof fetch {
  const endpoint = exactEndpoint(endpointInput);
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.href !== endpoint.href) throw new Error('REMOTE_DESTINATION_DENIED');
    const credential = token();
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(credential)) throw new Error('REMOTE_CREDENTIAL_INVALID');
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.delete('cookie'); headers.delete('proxy-authorization');
    headers.set('authorization', `Bearer ${credential}`);
    const response = await fetch(input, { ...init, headers, credentials: 'omit', redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error('REMOTE_REDIRECT_DENIED'); }
    if (response.url !== endpoint.href) { await response.body?.cancel(); throw new Error('REMOTE_RESPONSE_ORIGIN_DENIED'); }
    return response;
  };
}
