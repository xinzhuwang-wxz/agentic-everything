import { Hono } from 'hono';
import { ConfigurationTransfer } from './transfer.js';
import { z } from 'zod';
import { AgentConfigurationSchema, type Principal } from '@ae/contracts';
import { PolicyError } from '@ae/policy';
import { InMemoryControlPlane, asAsyncControlPlane, type ControlPlanePort } from './index.js';
const SaveSchema = z.strictObject({ configuration: AgentConfigurationSchema, draftId: z.string().min(1).optional(), expectedRevision: z.number().int().positive().optional() });
// Envelopes repeat capability bindings and scope metadata beyond the accepted draft body.
const TRANSFER_BODY_MAX_BYTES = 128 * 1024;
const RevisionSchema = z.strictObject({ expectedRevision: z.number().int().positive() });
/** Mount under the API's existing exact-origin, JSON and host protections. */
export function createConfigurationRoutes(store: ControlPlanePort | InMemoryControlPlane, resolvePrincipal: (request: Request) => Principal | undefined | Promise<Principal | undefined>): Hono {
  const control = store instanceof InMemoryControlPlane ? asAsyncControlPlane(store) : store;
  const app = new Hono();
  const transfer = new ConfigurationTransfer(control);
  app.onError((error, c) => { const code = error instanceof PolicyError ? error.code : 'CONFIGURATION_ERROR'; return c.json({ error: { code, message: code } }, code === 'AUTHENTICATION_REQUIRED' ? 401 : /DENIED/.test(code) ? 403 : /NOT_FOUND/.test(code) ? 404 : /CONFLICT/.test(code) ? 409 : 400); });
  const principal = async (request: Request): Promise<Principal> => { const p = await resolvePrincipal(request); if (!p) throw new PolicyError('AUTHENTICATION_REQUIRED'); return p; };
  const body = async (request: Request, maximumBytes = 32768): Promise<unknown> => {
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') ?? '')) throw new PolicyError('JSON_REQUIRED');
    const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    if (reader) for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maximumBytes) { await reader.cancel(); throw new PolicyError('PAYLOAD_TOO_LARGE'); } chunks.push(part.value); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new PolicyError('INVALID_JSON'); }
  };
  app.get('/', async c => c.json(await control.state(await principal(c.req.raw))));
  app.post('/drafts', async c => { const p = await principal(c.req.raw); const parsed = SaveSchema.safeParse(await body(c.req.raw)); if (!parsed.success) throw new PolicyError('INVALID_CONFIGURATION'); const { configuration, draftId, expectedRevision } = parsed.data; return c.json(await control.save(p, configuration, draftId, expectedRevision), 201); });
  for (const action of ['validate', 'publish'] as const) app.post(`/drafts/:id/${action}`, async c => { const p = await principal(c.req.raw); const parsed = RevisionSchema.safeParse(await body(c.req.raw)); if (!parsed.success) throw new PolicyError('INVALID_REVISION'); return c.json(await control[action](p, c.req.param('id'), parsed.data.expectedRevision)); });
  app.post('/transfer/export',async c=>{const p=await principal(c.req.raw);const parsed=z.strictObject({draftId:z.string().min(1),expectedRevision:z.number().int().positive()}).parse(await body(c.req.raw));const envelope=await transfer.export(p,parsed.draftId,parsed.expectedRevision);if(Buffer.byteLength(JSON.stringify({envelope,expectedPreviewHash:'0'.repeat(64)}),'utf8')>TRANSFER_BODY_MAX_BYTES)throw new PolicyError('PAYLOAD_TOO_LARGE');return c.json(envelope);});
  app.post('/transfer/preview',async c=>{const p=await principal(c.req.raw);const parsed=z.strictObject({envelope:z.unknown()}).parse(await body(c.req.raw,TRANSFER_BODY_MAX_BYTES));return c.json(await transfer.preview(p,parsed.envelope));});
  app.post('/transfer/import',async c=>{const p=await principal(c.req.raw);const parsed=z.strictObject({envelope:z.unknown(),expectedPreviewHash:z.string().regex(/^[a-f0-9]{64}$/)}).parse(await body(c.req.raw,TRANSFER_BODY_MAX_BYTES));return c.json(await transfer.import(p,parsed.envelope,parsed.expectedPreviewHash),201);});
  return app;
}
