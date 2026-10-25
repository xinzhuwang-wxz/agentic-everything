import { AdmissionLimitError } from '@ae/operations';
import { Hono } from 'hono';
import { z } from 'zod';
import { ApprovalDecisionSchema, type JsonObject, type ConversationContext, type ConversationView, type BehaviorSelection, type Principal, type AgentRelease, type ApprovalDecision, type CapabilityVersion } from '@ae/contracts';
import { type RunView } from '@ae/runtime-core';
import { InMemoryControlPlane, releasedCatalog, type ControlPlanePort } from '@ae/control-plane';
import { createConfigurationRoutes } from '@ae/control-plane/http';
import type { Ticket } from '@ae/capabilities';
import { digest, PolicyError } from '@ae/policy';

// Browser page context carries bounded references, never business payloads or authority.
const ReferenceContextSchema = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/).refine(key => !/^(?:principal|tenantId|applicationId|subjectId|roles|scopes|approval|approvalAuthority)$/i.test(key) && !/(?:password|secret|token|credential|authorization|cookie|apikey)/i.test(key)), z.string().regex(/^[^\s\u0000-\u001f\u007f]{1,200}$/u)).refine(value => Object.keys(value).length <= 16 && JSON.stringify(value).length <= 4096, 'Reference context is too large');
const StartSchema = z.strictObject({ input: z.string().trim().min(1).max(16384), context: ReferenceContextSchema.optional() });
class HttpError extends Error { constructor(readonly code: string, readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429) { super(code); } }
export type ApiRunView = Omit<RunView, 'persistence'> & { persistence: 'in-memory-fixture' | 'postgres-dbos' };
export interface RuntimePort {
  start(input: { principal: Principal; releaseId: string; release?: AgentRelease; input: string; context?: JsonObject }): ApiRunView | Promise<ApiRunView>;
  get(runId: string, principal: Principal): ApiRunView | Promise<ApiRunView>;
  decide(runId: string, principal: Principal, decision: ApprovalDecision): ApiRunView | Promise<ApiRunView>;
  cancel(runId: string, principal: Principal): ApiRunView | Promise<ApiRunView>;
}
export interface LegacyTicketReader { behaviorRegistryHash?: string; read(principal: Principal, ticketId: string, behavior?: BehaviorSelection): Ticket | Promise<Ticket> }
export interface ApiOptions {
  runtime: RuntimePort;
  controlPlane?: InMemoryControlPlane | ControlPlanePort;
  broker: { catalog(principal: Principal): CapabilityVersion[] | Promise<CapabilityVersion[]>; host?: unknown };
  /** Optional legacy business read route. false disables compatibility auto-detection. */
  ticketReader?: LegacyTicketReader | false;
  durability?: 'memory_fixture' | 'postgres_qualified';
  requirePublishedRelease?: boolean;
  /** Optional durable intent ledger supplied only by trusted server composition. */
  startIntent?: (input: {principal: Principal; intent: string; input: string; context?: JsonObject; conversationId?: string}) => Promise<ApiRunView>;
  /** Optional server-owned conversation projection; absent on the legacy in-memory fixture. */
  conversations?: { create(principal: Principal, context: ConversationContext, intent: string): Promise<ConversationView>; get(id: string, principal: Principal): Promise<ConversationView> };
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
    if(error instanceof AdmissionLimitError){c.header('Retry-After',String(error.retryAfterSeconds));return c.json({error:{code:error.code,message:error.code}},429);}
    if (error instanceof HttpError) return c.json({ error: { code: error.code, message: error.code } }, error.status);
    if (error instanceof PolicyError) {
      const status = ['RUN_NOT_FOUND', 'CONVERSATION_NOT_FOUND'].includes(error.code) ? 404 : /DENIED/.test(error.code) ? 403 : 409;
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
  app.get('/api/meta', async c => { const p = await principal(c.req.raw); return c.json({ mode: 'simulated', simulationKind: 'subagent_api', applicationName: options.applicationName, releaseId: (await options.controlPlane?.activeRelease(p))?.releaseId ?? options.releaseId, durability: options.durability ?? 'memory_fixture', ...(options.conversations && options.startIntent ? {conversationMode:'bounded-v1'} : {}) }); });
  app.get('/api/capabilities', async c => { const p = await principal(c.req.raw); const release = await options.controlPlane?.activeRelease(p); const catalog = await options.broker.catalog(p); return c.json({ capabilities: release ? releasedCatalog(release, p, catalog) : options.requirePublishedRelease ? [] : catalog }); });
  // Preserve the original helpdesk fixture without requiring any generic host to implement tickets.
  const legacyHost = 'host' in options.broker ? options.broker.host : undefined;
  const ticketReader = options.ticketReader === false ? undefined : options.ticketReader ?? (legacyHost && typeof legacyHost === 'object' && 'read' in legacyHost && typeof legacyHost.read === 'function' ? legacyHost as LegacyTicketReader : undefined);
  if (ticketReader) app.get('/api/tickets/:ticketId', async c => {
    const p = await principal(c.req.raw);
    const release = await options.controlPlane?.activeRelease(p);
    if (release?.configuration.behavior && ticketReader.behaviorRegistryHash !== release.configuration.behavior.registryHash) throw new PolicyError('HOST_BEHAVIOR_NOT_SUPPORTED');
    try { return c.json({ ticket: await ticketReader.read(p, c.req.param('ticketId'), release?.configuration.behavior), behaviorReleaseId: release?.releaseId ?? null }); }
    catch (error) { if (error instanceof PolicyError) throw error; throw new HttpError('TICKET_NOT_FOUND', 404); }
  });
  if (options.conversations && options.startIntent) {
    const conversations = options.conversations, startIntent = options.startIntent;
    const intent = (request: Request): string => {
      const value = request.headers.get('idempotency-key');
      if (!value || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) throw new HttpError('IDEMPOTENCY_KEY_REQUIRED', 400);
      return value;
    };
    app.post('/api/conversations', async c => {
      const p = await principal(c.req.raw), parsed = z.strictObject({ context: ReferenceContextSchema }).safeParse(await body(c.req.raw));
      if (!parsed.success) throw new HttpError('INVALID_INPUT', 400);
      return c.json(await conversations.create(p, parsed.data.context, intent(c.req.raw)), 201);
    });
    app.get('/api/conversations/:conversationId', async c => c.json(await conversations.get(c.req.param('conversationId'), await principal(c.req.raw))));
    app.post('/api/conversations/:conversationId/runs', async c => {
      const p = await principal(c.req.raw), parsed = z.strictObject({ input: z.string().trim().min(1).max(16384), context: ReferenceContextSchema.optional() }).safeParse(await body(c.req.raw));
      if (!parsed.success) throw new HttpError('INVALID_INPUT', 400);
      return c.json(await startIntent({ principal: p, intent: intent(c.req.raw), conversationId: c.req.param('conversationId'), input: parsed.data.input, ...(parsed.data.context ? { context: parsed.data.context } : {}) }), 201);
    });
  }
  app.post('/api/runs', async c => {
    const p = await principal(c.req.raw), parsed = StartSchema.safeParse(await body(c.req.raw));
    if (!parsed.success) throw new HttpError('INVALID_INPUT', 400);
    const intent = c.req.header('idempotency-key');
    if (!intent || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(intent)) throw new HttpError('IDEMPOTENCY_KEY_REQUIRED', 400);
    if (options.startIntent) return c.json(await options.startIntent({principal:p,intent,input:parsed.data.input,...(parsed.data.context?{context:parsed.data.context}:{})}),201);
    const key = JSON.stringify([p.tenantId, p.applicationId, p.subjectId, intent]);
    const hash = digest(parsed.data); // Server publication changes do not change this client intent.
    const existing = intents.get(key);
    if (existing) { if (hash !== existing.hash) throw new HttpError('IDEMPOTENCY_CONFLICT', 409); return c.json(await options.runtime.get(await existing.result, p)); }
    if (intents.size >= (options.maxIntents ?? 1000)) throw new HttpError('FIXTURE_CAPACITY_REACHED', 429);
    // Reserve before execution, including concurrent starts. Retain rejected/unknown outcomes; never blindly dispatch again.
    const result = Promise.resolve().then(async () => {
      const release = await options.controlPlane?.activeRelease(p);
      if (!release && options.requirePublishedRelease) throw new PolicyError('RELEASE_REQUIRED');
      return options.runtime.start({ principal: p, releaseId: release?.releaseId ?? options.releaseId, ...(release ? { release: structuredClone(release) } : {}), input: parsed.data.input, ...(parsed.data.context ? { context: parsed.data.context } : {}) });
    }).then(view => view.runId);
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
