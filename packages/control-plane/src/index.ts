import { randomUUID } from 'node:crypto';
import { AgentConfigurationSchema, AgentReleaseSchema, type AgentDraft, type AgentRelease, type CapabilityVersion, type Principal } from '@ae/contracts';
import { digest, PolicyError } from '@ae/policy';
export interface ConfigurationState { durability: 'memory_fixture'; canConfigure: boolean; capabilities: CapabilityVersion[]; drafts: AgentDraft[]; releases: AgentRelease[]; activeReleaseId?: string }
/** Bounded control store only. No runtime, queue, credentials or permission grants. */
export class InMemoryControlPlane {
  private drafts = new Map<string, AgentDraft>();
  private releases = new Map<string, AgentRelease>();
  private active = new Map<string, string>();
  private registry: CapabilityVersion[];
  constructor(capabilities: CapabilityVersion[], private currentPrincipal: (p: Principal) => Principal = p => p) { this.registry = structuredClone(capabilities); }
  private key(p: Principal): string { return JSON.stringify([p.tenantId, p.applicationId]); }
  private current(p: Principal): Principal { const current = this.currentPrincipal(p); if (current.tenantId !== p.tenantId || current.applicationId !== p.applicationId || current.subjectId !== p.subjectId) throw new PolicyError('CONFIGURATION_IDENTITY_DENIED'); return current; }
  private admin(p: Principal): void { if (!this.current(p).roles.includes('agentic:admin')) throw new PolicyError('CONFIGURATION_ADMIN_DENIED'); }
  private owns(p: Principal, value: {tenantId: string; applicationId: string}): boolean { return this.key(p) === this.key(value as Principal); }
  private draft(p: Principal, id: string): AgentDraft { this.admin(p); const draft = this.drafts.get(id); if (!draft || !this.owns(p, draft)) throw new PolicyError('CONFIGURATION_NOT_FOUND'); return draft; }
  state(p: Principal): ConfigurationState {
    const canConfigure = this.current(p).roles.includes('agentic:admin');
    return structuredClone({ durability: 'memory_fixture', canConfigure, capabilities: canConfigure ? this.registry : [], drafts: canConfigure ? [...this.drafts.values()].filter(d => this.owns(p, d)) : [], releases: canConfigure ? [...this.releases.values()].filter(r => this.owns(p, r)) : [], ...(this.active.has(this.key(p)) ? { activeReleaseId: this.active.get(this.key(p))! } : {}) });
  }
  save(p: Principal, input: unknown, draftId?: string, expectedRevision?: number): AgentDraft {
    this.admin(p);
    const parsed = AgentConfigurationSchema.safeParse(input); if (!parsed.success) throw new PolicyError('INVALID_CONFIGURATION');
    this.validateCapabilities(parsed.data.capabilityIds);
    const previous = draftId ? this.draft(p, draftId) : undefined;
    if (previous && previous.revision !== expectedRevision) throw new PolicyError('DRAFT_REVISION_CONFLICT');
    if (!previous && this.drafts.size >= 1000) throw new PolicyError('CONFIGURATION_CAPACITY_REACHED');
    const draft: AgentDraft = { draftId: previous?.draftId ?? randomUUID(), tenantId: p.tenantId, applicationId: p.applicationId, revision: (previous?.revision ?? 0) + 1, configuration: parsed.data, updatedAt: new Date().toISOString() };
    this.drafts.set(draft.draftId, structuredClone(draft)); return structuredClone(draft);
  }
  validate(p: Principal, draftId: string, expectedRevision: number): { valid: true; changes: string[] } {
    const draft = this.draft(p, draftId); if (draft.revision !== expectedRevision) throw new PolicyError('DRAFT_REVISION_CONFLICT');
    this.validateCapabilities(draft.configuration.capabilityIds);
    const active = this.activeRelease(p); const changes: string[] = [];
    if (!active) changes.push('Initial release');
    else {
      for (const field of ['name', 'instructions', 'bounds'] as const) if (digest(active.configuration[field]) !== digest(draft.configuration[field])) changes.push(`${field} changed`);
      for (const id of draft.configuration.capabilityIds) if (!active.configuration.capabilityIds.includes(id)) changes.push(`Enable ${id}`);
      for (const id of active.configuration.capabilityIds) if (!draft.configuration.capabilityIds.includes(id)) changes.push(`Disable ${id}`);
    }
    return { valid: true, changes };
  }
  publish(p: Principal, draftId: string, expectedRevision: number): AgentRelease {
    this.validate(p, draftId, expectedRevision); const draft = this.draft(p, draftId);
    // Repeated publication of exactly the same revision is idempotent.
    const previous = [...this.releases.values()].find(r => r.draftId === draftId && r.draftRevision === expectedRevision);
    if (previous) return structuredClone(previous);
    if (this.releases.size >= 1000) throw new PolicyError('CONFIGURATION_CAPACITY_REACHED');
    const capabilities = this.registry.filter(c => draft.configuration.capabilityIds.includes(c.capabilityId)).map(({capabilityId, version, bindingHash}) => ({ capabilityId, version, bindingHash })).sort((a,b) => a.capabilityId.localeCompare(b.capabilityId));
    const content = { schemaVersion: '1' as const, tenantId: p.tenantId, applicationId: p.applicationId, draftId, draftRevision: expectedRevision, configuration: structuredClone(draft.configuration), capabilities, publishedAt: new Date().toISOString(), publishedBy: p.subjectId };
    const contentHash = digest(content); const release: AgentRelease = { ...content, contentHash, releaseId: `release-${contentHash}` };
    this.releases.set(release.releaseId, structuredClone(release)); this.active.set(this.key(p), release.releaseId); return structuredClone(release);
  }
  activeRelease(p: Principal): AgentRelease | undefined { this.current(p); const id = this.active.get(this.key(p)); return id ? structuredClone(this.releases.get(id)!) : undefined; }
  private validateCapabilities(ids: string[]): void { if (ids.some(id => !this.registry.some(c => c.capabilityId === id))) throw new PolicyError('UNREGISTERED_CAPABILITY'); }
}
/** Intersect a pinned snapshot with the host's current catalog; publishing never grants authority. */
export function releasedCatalog(release: AgentRelease, principal: Principal, currentCatalog: CapabilityVersion[]): CapabilityVersion[] {
  verifyRelease(release);
  if (release.tenantId !== principal.tenantId || release.applicationId !== principal.applicationId) throw new PolicyError('RELEASE_TENANT_DENIED');
  return currentCatalog.filter(c => release.capabilities.some(p => p.capabilityId === c.capabilityId && p.version === c.version && p.bindingHash === c.bindingHash) && release.configuration.capabilityIds.includes(c.capabilityId));
}
export function verifyRelease(release: AgentRelease): void {
  if (!AgentReleaseSchema.safeParse(release).success) throw new PolicyError('RELEASE_INTEGRITY_DENIED');
  const { releaseId, contentHash, ...content } = release;
  if (digest(content) !== contentHash || releaseId !== `release-${contentHash}`) throw new PolicyError('RELEASE_INTEGRITY_DENIED');
}
