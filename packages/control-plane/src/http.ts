import { Hono } from 'hono';
import { z } from 'zod';
import { AgentConfigurationSchema, type Principal } from '@ae/contracts';
import { PolicyError } from '@ae/policy';
import { InMemoryControlPlane } from './index.js';
const SaveSchema = z.strictObject({ configuration: AgentConfigurationSchema, draftId: z.string().min(1).optional(), expectedRevision: z.number().int().positive().optional() });
const RevisionSchema = z.strictObject({ expectedRevision: z.number().int().positive() });
/** Mount under the API's existing exact-origin, JSON and host protections. */
export function createConfigurationRoutes(control: InMemoryControlPlane, resolvePrincipal: (request: Request) => Principal | undefined | Promise<Principal | undefined>): Hono {
  const app = new Hono();
  app.onError((error, c) => { const code = error instanceof PolicyError ? error.code : 'CONFIGURATION_ERROR'; return c.json({ error: { code, message: code } }, code === 'AUTHENTICATION_REQUIRED' ? 401 : /DENIED/.test(code) ? 403 : /NOT_FOUND/.test(code) ? 404 : /CONFLICT/.test(code) ? 409 : 400); });
  const principal = async (request: Request): Promise<Principal> => { const p = await resolvePrincipal(request); if (!p) throw new PolicyError('AUTHENTICATION_REQUIRED'); return p; };
  const body = async (request: Request): Promise<unknown> => {
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') ?? '')) throw new PolicyError('JSON_REQUIRED');
    const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    if (reader) for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 32768) { await reader.cancel(); throw new PolicyError('PAYLOAD_TOO_LARGE'); } chunks.push(part.value); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new PolicyError('INVALID_JSON'); }
  };
  app.get('/', async c => c.json(control.state(await principal(c.req.raw))));
  app.post('/drafts', async c => { const p = await principal(c.req.raw); const parsed = SaveSchema.safeParse(await body(c.req.raw)); if (!parsed.success) throw new PolicyError('INVALID_CONFIGURATION'); const { configuration, draftId, expectedRevision } = parsed.data; return c.json(control.save(p, configuration, draftId, expectedRevision), 201); });
  for (const action of ['validate', 'publish'] as const) app.post(`/drafts/:id/${action}`, async c => { const p = await principal(c.req.raw); const parsed = RevisionSchema.safeParse(await body(c.req.raw)); if (!parsed.success) throw new PolicyError('INVALID_REVISION'); return c.json(control[action](p, c.req.param('id'), parsed.data.expectedRevision)); });
  return app;
}
