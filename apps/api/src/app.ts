import { Hono } from 'hono';
import { z } from 'zod';
import { ApprovalDecisionSchema, type Principal, type AgentRelease, type ApprovalDecision } from '@ae/contracts';
import { type RunView } from '@ae/runtime-core';
import { InMemoryControlPlane, releasedCatalog } from '@ae/control-plane';
import { createConfigurationRoutes } from '@ae/control-plane/http';
import { ToolBroker } from '@ae/capabilities';
import { digest, PolicyError } from '@ae/policy';

const StartSchema = z.strictObject({ input: z.string().trim().min(1).max(16384), context: z.strictObject({ ticketId: z.string().min(1).max(100) }).optional() });
class HttpError extends Error { constructor(readonly code: string, readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429) { super(code); } }
export type ApiRunView = Omit<RunView, 'persistence'> & { persistence: 'in-memory-fixture' | 'postgres-dbos' };
export interface RuntimePort {
  start(input: { principal: Principal; releaseId: string; release?: AgentRelease; input: string; context?: { ticketId: string } }): ApiRunView | Promise<ApiRunView>;
  get(runId: string, principal: Principal): ApiRunView | Promise<ApiRunView>;
  decide(runId: string, principal: Principal, decision: ApprovalDecision): ApiRunView | Promise<ApiRunView>;
  cancel(runId: string, principal: Principal): ApiRunView | Promise<ApiRunView>;
}
export interface ApiOptions {
  runtime: RuntimePort;
  controlPlane?: InMemoryControlPlane;
  broker: ToolBroker;
  /** Host session/auth middleware supplies this function. Headers/body are never a principal. */
  resolvePrincipal: (request: Request) => Principal | undefined | Promise<Principal | undefined>;
  releaseId: string;
  applicationName: string;
  apiOrigin: string;
  allowedOrigin: string;
  maxIntents?: number;
}
/** Bounded, process-local demonstration. No production authentication or durable delivery claim. */
export function createApi(options: ApiOptions): Hono {
  const app = new Hono();
  const intents = new Map<string, { hash: string; result: Promise<string> }>();
  const api = new URL(options.apiOrigin);
  const ui = new URL(options.allowedOrigin);
  for (const origin of [api, ui]) if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.origin !== origin.href.slice(0, -1)) throw new Error('Only exact loopback origins are supported by this fixture');
  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: { code: error.code, message: error.code } }, error.status);
    if (error instanceof PolicyError) {
      const status = error.code === 'RUN_NOT_FOUND' ? 404 : /DENIED/.test(error.code) ? 403 : 409;
      return c.json({ error: { code: error.code, message: error.code } }, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'The request stopped safely. Do not repeat an uncertain write.' } }, 500);
  });
  app.use('*', async (c, next) => {
    if (new URL(c.req.url).host !== api.host || (c.req.header('host') && c.req.header('host') !== api.host)) throw new HttpError('HOST_DENIED', 403);
    const origin = c.req.header('origin');
    if (origin && origin !== ui.origin && origin !== api.origin) throw new HttpError('ORIGIN_DENIED', 403);
    if (c.req.header('sec-fetch-site') === 'cross-site' && !origin) throw new HttpError('ORIGIN_REQUIRED', 403);
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    if (origin) { c.header('Access-Control-Allow-Origin', origin); c.header('Vary', 'Origin'); }
    if (c.req.method === 'OPTIONS') {
      if (!origin) throw new HttpError('ORIGIN_REQUIRED', 403);
      c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
      return c.body(null, 204);
    }
    if (c.req.method !== 'GET' && c.req.method !== 'POST') throw new HttpError('METHOD_DENIED', 400);
    if (c.req.method === 'POST') {
      if (!origin) throw new HttpError('ORIGIN_REQUIRED', 403);
      if (!/^application\/json(?:\s*;.*)?$/i.test(c.req.header('content-type') ?? '')) throw new HttpError('JSON_REQUIRED', 415);
    }
    await next();
  });
  const principal = async (request: Request): Promise<Principal> => {
    const result = await options.resolvePrincipal(request);
    if (!result) throw new HttpError('AUTHENTICATION_REQUIRED', 401);
    return structuredClone(result);
  };
  const body = async (request: Request): Promise<unknown> => {
    if (Number(request.headers.get('content-length') ?? 0) > 32768) throw new HttpError('PAYLOAD_TOO_LARGE', 413);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    if (reader) for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 32768) { await reader.cancel(); throw new HttpError('PAYLOAD_TOO_LARGE', 413); } chunks.push(part.value); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError('INVALID_JSON', 400); }
  };
  if (options.controlPlane) app.route('/api/configuration', createConfigurationRoutes(options.controlPlane, options.resolvePrincipal));
  app.get('/api/meta', async c => { const p = await principal(c.req.raw); return c.json({ mode: 'simulated', simulationKind: 'subagent_api', applicationName: options.applicationName, releaseId: options.controlPlane?.activeRelease(p)?.releaseId ?? options.releaseId, durability: 'memory_fixture' }); });
  app.get('/api/capabilities', async c => { const p = await principal(c.req.raw); const release = options.controlPlane?.activeRelease(p); const catalog = options.broker.catalog(p); return c.json({ capabilities: release ? releasedCatalog(release, p, catalog) : catalog }); });
  app.get('/api/tickets/:ticketId', async c => {
    const p = await principal(c.req.raw);
    try { return c.json({ ticket: options.broker.host.read(p, c.req.param('ticketId')) }); }
    catch (error) { if (error instanceof PolicyError) throw error; throw new HttpError('TICKET_NOT_FOUND', 404); }
  });
  app.post('/api/runs', async c => {
    const p = await principal(c.req.raw), parsed = StartSchema.safeParse(await body(c.req.raw));
    if (!parsed.success) throw new HttpError('INVALID_INPUT', 400);
    const intent = c.req.header('idempotency-key');
    if (!intent || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(intent)) throw new HttpError('IDEMPOTENCY_KEY_REQUIRED', 400);
    const key = JSON.stringify([p.tenantId, p.applicationId, p.subjectId, intent]);
    const hash = digest(parsed.data); // Server publication changes do not change this client intent.
    const existing = intents.get(key);
    if (existing) { if (hash !== existing.hash) throw new HttpError('IDEMPOTENCY_CONFLICT', 409); return c.json(await options.runtime.get(await existing.result, p)); }
    if (intents.size >= (options.maxIntents ?? 1000)) throw new HttpError('FIXTURE_CAPACITY_REACHED', 429);
    // Reserve before execution, including concurrent starts. Retain rejected/unknown outcomes; never blindly dispatch again.
    const release = options.controlPlane?.activeRelease(p);
    const result = Promise.resolve().then(() => options.runtime.start({ principal: p, releaseId: release?.releaseId ?? options.releaseId, ...(release ? { release: structuredClone(release) } : {}), input: parsed.data.input, ...(parsed.data.context ? { context: parsed.data.context } : {}) })).then(view => view.runId);
    intents.set(key, { hash, result });
    return c.json(await options.runtime.get(await result, p), 201);
  });
  app.get('/api/runs/:runId', async c => c.json(await options.runtime.get(c.req.param('runId'), await principal(c.req.raw))));
  app.post('/api/runs/:runId/approval', async c => {
    const p = await principal(c.req.raw), parsed = ApprovalDecisionSchema.safeParse(await body(c.req.raw));
    if (!parsed.success) throw new HttpError('INVALID_APPROVAL', 400);
    return c.json(await options.runtime.decide(c.req.param('runId'), p, parsed.data));
  });
  app.post('/api/runs/:runId/cancel', async c => {
    const p = await principal(c.req.raw);
    if (!z.strictObject({}).safeParse(await body(c.req.raw)).success) throw new HttpError('INVALID_CANCEL', 400);
    return c.json(await options.runtime.cancel(c.req.param('runId'), p));
  });
  app.notFound(c => c.json({ error: { code: 'NOT_FOUND', message: 'NOT_FOUND' } }, 404));
  return app;
}
