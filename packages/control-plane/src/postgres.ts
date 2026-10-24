import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { AgentConfigurationSchema, AgentDraftSchema, CapabilityVersionSchema, type AgentDraft, type AgentRelease, type CapabilityVersion, type Principal } from '@ae/contracts';
import { digest, PolicyError } from '@ae/policy';
import { verifyRelease, type ConfigurationState, type ControlPlanePort } from './index.js';
interface QueryResult { rows: Record<string, unknown>[]; rowCount: number | null }
interface Connection { query(sql: string, values?: unknown[]): Promise<QueryResult>; release(): void }
interface Pool { query(sql: string, values?: unknown[]): Promise<QueryResult>; connect(): Promise<Connection>; end(): Promise<void> }
const { Pool: PgPool } = createRequire(import.meta.url)('pg') as { Pool: new (options: {connectionString: string; max: number}) => Pool };
/** Opt-in PostgreSQL control store. Only trusted server configuration supplies the connection. */
export class PostgresControlPlane implements ControlPlanePort {
  private readonly pool: Pool;
  private readonly registry: CapabilityVersion[];
  constructor(connectionString: string, capabilities: CapabilityVersion[], private currentPrincipal: (p: Principal) => Principal = p => p) {
    this.pool = new PgPool({connectionString, max: 4});
    this.registry = capabilities.map(c => CapabilityVersionSchema.parse(c));
    if (new Set(this.registry.map(c => c.capabilityId)).size !== this.registry.length) throw new PolicyError('DUPLICATE_CAPABILITY');
  }
  async initialize(): Promise<void> {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ae_control;
      CREATE TABLE IF NOT EXISTS ae_control.drafts (tenant_id text NOT NULL, application_id text NOT NULL, draft_id text NOT NULL, revision integer NOT NULL CHECK(revision>0), document jsonb NOT NULL, PRIMARY KEY(tenant_id,application_id,draft_id));
      CREATE TABLE IF NOT EXISTS ae_control.releases (tenant_id text NOT NULL, application_id text NOT NULL, release_id text NOT NULL, draft_id text NOT NULL, draft_revision integer NOT NULL CHECK(draft_revision>0), document jsonb NOT NULL, PRIMARY KEY(tenant_id,application_id,release_id), UNIQUE(tenant_id,application_id,draft_id,draft_revision));
      CREATE TABLE IF NOT EXISTS ae_control.active (tenant_id text NOT NULL, application_id text NOT NULL, release_id text NOT NULL, PRIMARY KEY(tenant_id,application_id), FOREIGN KEY(tenant_id,application_id,release_id) REFERENCES ae_control.releases(tenant_id,application_id,release_id));`);
  }
  async close(): Promise<void> { await this.pool.end(); }
  private current(input: Principal): Principal {
    const expected = structuredClone(input), result = this.currentPrincipal(structuredClone(input));
    if (result.tenantId !== expected.tenantId || result.applicationId !== expected.applicationId || result.subjectId !== expected.subjectId) throw new PolicyError('CONFIGURATION_IDENTITY_DENIED');
    return structuredClone(result);
  }
  private admin(p: Principal): void { if (!this.current(p).roles.includes('agentic:admin')) throw new PolicyError('CONFIGURATION_ADMIN_DENIED'); }
  private scope(p: Principal): string[] { return [p.tenantId,p.applicationId]; }
  private configuration(input: unknown) {
    const parsed=AgentConfigurationSchema.safeParse(input); if(!parsed.success)throw new PolicyError('INVALID_CONFIGURATION');
    if(parsed.data.capabilityIds.some(id=>!this.registry.some(c=>c.capabilityId===id)))throw new PolicyError('UNREGISTERED_CAPABILITY');
    return parsed.data;
  }
  private release(value: unknown, p: Principal): AgentRelease {
    const release=value as AgentRelease;verifyRelease(release);
    if(release.tenantId!==p.tenantId||release.applicationId!==p.applicationId)throw new PolicyError('RELEASE_TENANT_DENIED');return structuredClone(release);
  }
  private async transaction<T>(input: Principal, work: (connection: Connection, p: Principal) => Promise<T>): Promise<T> {
    const p=structuredClone(input);this.admin(p);const connection=await this.pool.connect();
    try { await connection.query('BEGIN');await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[JSON.stringify(this.scope(p))]);
      this.admin(p);const result=await work(connection,p);this.admin(p);await connection.query('COMMIT');return result;
    } catch(error) {await connection.query('ROLLBACK');throw error;} finally {connection.release();}
  }
  private async readDraft(connection: Connection, p: Principal, id: string): Promise<AgentDraft> {
    const result=await connection.query('SELECT document FROM ae_control.drafts WHERE tenant_id=$1 AND application_id=$2 AND draft_id=$3',[...this.scope(p),id]);
    if(!result.rows[0])throw new PolicyError('CONFIGURATION_NOT_FOUND');
    const draft=AgentDraftSchema.parse(result.rows[0].document);if(draft.tenantId!==p.tenantId||draft.applicationId!==p.applicationId)throw new PolicyError('CONFIGURATION_IDENTITY_DENIED');return draft;
  }
  private async active(connection: Pick<Connection,'query'>, p: Principal): Promise<AgentRelease|undefined> {
    const result=await connection.query('SELECT r.document FROM ae_control.active a JOIN ae_control.releases r USING(tenant_id,application_id,release_id) WHERE a.tenant_id=$1 AND a.application_id=$2',this.scope(p));
    return result.rows[0]?this.release(result.rows[0].document,p):undefined;
  }
  async state(input: Principal): Promise<ConfigurationState> {
    const p=structuredClone(input);const canConfigure=this.current(p).roles.includes('agentic:admin');
    // A non-admin does not query or receive historical configuration documents.
    if(!canConfigure){const active=await this.pool.query('SELECT release_id FROM ae_control.active WHERE tenant_id=$1 AND application_id=$2',this.scope(p));this.current(p);return {durability:'postgres_qualified',canConfigure:false,capabilities:[],drafts:[],releases:[],...(active.rows[0]?{activeReleaseId:String(active.rows[0].release_id)}:{})};}
    return this.transaction(p,async(connection,principal)=>{
      const drafts=await connection.query('SELECT document FROM ae_control.drafts WHERE tenant_id=$1 AND application_id=$2 ORDER BY draft_id',this.scope(principal));
      const releases=await connection.query('SELECT document FROM ae_control.releases WHERE tenant_id=$1 AND application_id=$2 ORDER BY document->>\'publishedAt\',release_id',this.scope(principal));
      const active=await this.active(connection,principal);
      return {durability:'postgres_qualified',canConfigure:true,capabilities:structuredClone(this.registry),drafts:drafts.rows.map(row=>AgentDraftSchema.parse(row.document)),releases:releases.rows.map(row=>this.release(row.document,principal)),...(active?{activeReleaseId:active.releaseId}:{})};
    });
  }
  async save(input: Principal, value: unknown, draftId?: string, expectedRevision?: number): Promise<AgentDraft> {
    const configuration=this.configuration(value);
    return this.transaction(input,async(connection,p)=>{
      const previous=draftId?await this.readDraft(connection,p,draftId):undefined;
      if(previous&&previous.revision!==expectedRevision)throw new PolicyError('DRAFT_REVISION_CONFLICT');
      if(!previous){const count=await connection.query('SELECT count(*)::integer AS count FROM ae_control.drafts WHERE tenant_id=$1 AND application_id=$2',this.scope(p));if(Number(count.rows[0]!.count)>=1000)throw new PolicyError('CONFIGURATION_CAPACITY_REACHED');}
      const draft:AgentDraft={draftId:previous?.draftId??randomUUID(),tenantId:p.tenantId,applicationId:p.applicationId,revision:(previous?.revision??0)+1,configuration,updatedAt:new Date().toISOString()};
      await connection.query('INSERT INTO ae_control.drafts(tenant_id,application_id,draft_id,revision,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,application_id,draft_id) DO UPDATE SET revision=EXCLUDED.revision,document=EXCLUDED.document',[...this.scope(p),draft.draftId,draft.revision,JSON.stringify(draft)]);return draft;
    });
  }
  async validate(input: Principal,id:string,revision:number):Promise<{valid:true;changes:string[]}>{
    return this.transaction(input,async(connection,p)=>{const draft=await this.readDraft(connection,p,id);if(draft.revision!==revision)throw new PolicyError('DRAFT_REVISION_CONFLICT');this.configuration(draft.configuration);const active=await this.active(connection,p);const changes:string[]=[];
      if(!active)changes.push('Initial release');else{for(const field of ['name','instructions','bounds'] as const)if(digest(active.configuration[field])!==digest(draft.configuration[field]))changes.push(`${field} changed`);for(const cap of draft.configuration.capabilityIds)if(!active.configuration.capabilityIds.includes(cap))changes.push(`Enable ${cap}`);for(const cap of active.configuration.capabilityIds)if(!draft.configuration.capabilityIds.includes(cap))changes.push(`Disable ${cap}`);}return {valid:true,changes};});
  }
  async publish(input:Principal,id:string,revision:number):Promise<AgentRelease>{
    return this.transaction(input,async(connection,p)=>{
      const draft=await this.readDraft(connection,p,id);
      // A repeat returns its original immutable snapshot without moving the current pointer backwards.
      const existing=await connection.query('SELECT document FROM ae_control.releases WHERE tenant_id=$1 AND application_id=$2 AND draft_id=$3 AND draft_revision=$4',[...this.scope(p),id,revision]);
      if(existing.rows[0])return this.release(existing.rows[0].document,p);
      if(draft.revision!==revision)throw new PolicyError('DRAFT_REVISION_CONFLICT');this.configuration(draft.configuration);
      const count=await connection.query('SELECT count(*)::integer AS count FROM ae_control.releases WHERE tenant_id=$1 AND application_id=$2',this.scope(p));if(Number(count.rows[0]!.count)>=1000)throw new PolicyError('CONFIGURATION_CAPACITY_REACHED');
      const capabilities=this.registry.filter(c=>draft.configuration.capabilityIds.includes(c.capabilityId)).map(({capabilityId,version,bindingHash})=>({capabilityId,version,bindingHash})).sort((a,b)=>a.capabilityId.localeCompare(b.capabilityId));
      const content={schemaVersion:'1' as const,tenantId:p.tenantId,applicationId:p.applicationId,draftId:id,draftRevision:revision,configuration:draft.configuration,capabilities,publishedAt:new Date().toISOString(),publishedBy:p.subjectId};const contentHash=digest(content);const release:AgentRelease={...content,contentHash,releaseId:`release-${contentHash}`};verifyRelease(release);
      await connection.query('INSERT INTO ae_control.releases(tenant_id,application_id,release_id,draft_id,draft_revision,document) VALUES($1,$2,$3,$4,$5,$6)',[...this.scope(p),release.releaseId,id,revision,JSON.stringify(release)]);
      await connection.query('INSERT INTO ae_control.active(tenant_id,application_id,release_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,application_id) DO UPDATE SET release_id=EXCLUDED.release_id',[...this.scope(p),release.releaseId]);return release;
    });
  }
  async activeRelease(input:Principal):Promise<AgentRelease|undefined>{const p=structuredClone(input);this.current(p);const release=await this.active(this.pool,p);this.current(p);return release;}
}
