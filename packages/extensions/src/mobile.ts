import { z } from 'zod';
import type { Principal } from '@ae/contracts';
import { PolicyError } from '@ae/policy';
import { currentPrincipal, intentId, type ExtensionAuthority, type ExtensionRuntime } from './runtime.js';

export const mobileQualification = Object.freeze({ status: 'contract-fixture-only', realPlatform: 'unverified', deployment: 'none', target: 'embedded mobile/miniprogram message bridge' });
const envelope = z.discriminatedUnion('operation', [
  z.strictObject({ version: z.literal('1'), requestId: z.string().min(1).max(128), operation: z.literal('start'), input: z.string().trim().min(1).max(16384) }),
  z.strictObject({ version: z.literal('1'), requestId: z.string().min(1).max(128), operation: z.enum(['status', 'cancel']), runId: z.string().regex(/^intent-[a-f0-9]{64}$/) }),
]);
/** Host-issued session and verified transport origin are passed separately, never read from postMessage payload. */
export class MobileFixtureBridge {
  constructor(private readonly runtime: ExtensionRuntime, private readonly authority: ExtensionAuthority, private readonly allowedOrigins: ReadonlySet<string>) {}
  async receive(raw: unknown, session: { principal: Principal; origin: string; expiresAt: number }, now = Date.now()) {
    if (!this.allowedOrigins.has(session.origin) || session.expiresAt <= now) throw new PolicyError('BRIDGE_SESSION_DENIED');
    const request = envelope.parse(raw);
    const principal = await currentPrincipal(this.authority, session.principal);
    const run = request.operation === 'start'
      ? await this.runtime.start({ runId: intentId('mobile-fixture-v1', principal, [request.requestId, request.input]), principal, ...await this.authority.release(principal), input: request.input })
      : request.operation === 'status' ? await this.runtime.get(request.runId, principal) : await this.runtime.cancel(request.runId, principal);
    return { version: '1' as const, requestId: request.requestId, qualification: mobileQualification.status, run: { runId: run.runId, status: run.status, ...(run.message === undefined ? {} : { message: run.message }) } };
  }
}
