import { createHash } from 'node:crypto';
import { PrincipalSchema, type AgentRelease, type Principal, type RunStatus } from '@ae/contracts';
import { PolicyError, samePrincipal } from '@ae/policy';

/** Server-only adapter port. PersistentRuntime implements this without another agent loop or queue. */
export interface ExtensionRun {
  runId: string;
  status: RunStatus;
  message?: string;
  events: Array<{ timestamp: string }>;
}
export interface ExtensionRuntime {
  start(input: { runId: string; principal: Principal; releaseId: string; release?: AgentRelease; input: string }): Promise<ExtensionRun>;
  get(runId: string, principal: Principal): Promise<ExtensionRun>;
  cancel(runId: string, principal: Principal): Promise<ExtensionRun>;
}
export interface ExtensionAuthority {
  /** Must query current host authority; supplied roles/scopes are never a grant. */
  current(principal: Principal): Promise<Principal>;
  /** Trusted server release selection, never client-provided release JSON. */
  release(principal: Principal): Promise<{ releaseId: string; release?: AgentRelease }>;
}
export function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function identity(principal: Principal): string[] { return [principal.tenantId, principal.applicationId, principal.subjectId]; }
export function intentId(namespace: string, principal: Principal, key: unknown): string { return `intent-${digest([namespace, identity(principal), key])}`; }
export async function currentPrincipal(authority: ExtensionAuthority, principal: Principal): Promise<Principal> {
  const requested = PrincipalSchema.parse(principal);
  const current = PrincipalSchema.parse(await authority.current(requested));
  if (!samePrincipal(requested, current)) throw new PolicyError('EXTENSION_IDENTITY_MISMATCH');
  return structuredClone(current);
}
