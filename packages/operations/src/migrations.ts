import { createHash } from 'node:crypto';

/** Only AE-owned relations. Never query, migrate, or assume ownership of DBOS/host tables. */
export interface SqlConnection { query(sql: string, values?: unknown[]): Promise<{rows: Record<string, any>[]; rowCount: number | null}> }
export interface SqlPool extends SqlConnection { connect(): Promise<SqlConnection & {release(): void}> }
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const aeMigrations = [
  {version: 1, name: 'adopt-ae-v1', sql: `
CREATE TABLE IF NOT EXISTS public.ae_runs_v1 (id text PRIMARY KEY, body jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS public.ae_approvals_v1 (id text PRIMARY KEY, run_id text NOT NULL REFERENCES public.ae_runs_v1(id), view jsonb NOT NULL, state text NOT NULL, decision jsonb);
CREATE TABLE IF NOT EXISTS public.ae_operations_v1 (id text PRIMARY KEY, run_id text NOT NULL REFERENCES public.ae_runs_v1(id), request_hash text NOT NULL, prepared jsonb NOT NULL, result jsonb);
CREATE TABLE IF NOT EXISTS public.ae_conversations_v1 (id text PRIMARY KEY, principal jsonb NOT NULL, context jsonb NOT NULL, authority_hash text NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.ae_conversation_turns_v1 (conversation_id text NOT NULL REFERENCES public.ae_conversations_v1(id), turn integer NOT NULL, run_id text UNIQUE NOT NULL, release_id text NOT NULL, input text NOT NULL, output text, created_at timestamptz NOT NULL, completed_at timestamptz, PRIMARY KEY(conversation_id,turn));
ALTER TABLE public.ae_conversation_turns_v1 ADD COLUMN IF NOT EXISTS client_intent_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ae_conversation_turns_client_intent_v1 ON public.ae_conversation_turns_v1(conversation_id,client_intent_id) WHERE client_intent_id IS NOT NULL;
CREATE SCHEMA IF NOT EXISTS ae_control;
CREATE TABLE IF NOT EXISTS ae_control.drafts (tenant_id text NOT NULL, application_id text NOT NULL, draft_id text NOT NULL, revision integer NOT NULL CHECK(revision>0), document jsonb NOT NULL, PRIMARY KEY(tenant_id,application_id,draft_id));
CREATE TABLE IF NOT EXISTS ae_control.releases (tenant_id text NOT NULL, application_id text NOT NULL, release_id text NOT NULL, draft_id text NOT NULL, draft_revision integer NOT NULL CHECK(draft_revision>0), document jsonb NOT NULL, PRIMARY KEY(tenant_id,application_id,release_id), UNIQUE(tenant_id,application_id,draft_id,draft_revision));
CREATE TABLE IF NOT EXISTS ae_control.active (tenant_id text NOT NULL, application_id text NOT NULL, release_id text NOT NULL, PRIMARY KEY(tenant_id,application_id), FOREIGN KEY(tenant_id,application_id,release_id) REFERENCES ae_control.releases(tenant_id,application_id,release_id));
CREATE SCHEMA IF NOT EXISTS ae_api;
CREATE TABLE IF NOT EXISTS ae_api.intents (intent_key text PRIMARY KEY, intent_token text, input_hash text NOT NULL, run_id text UNIQUE NOT NULL, start_hash text NOT NULL, start jsonb NOT NULL);
ALTER TABLE ae_api.intents ADD COLUMN IF NOT EXISTS intent_token text;
`},
  {version: 2, name: 'expired-conversation-projection', sql: `ALTER TABLE public.ae_conversations_v1 ADD COLUMN IF NOT EXISTS payload_deleted_at timestamptz;`},
  {version: 3, name: 'durable-admission-window', sql: `CREATE TABLE IF NOT EXISTS ae_api.admission_windows (scope_hash text PRIMARY KEY, window_started_at timestamptz NOT NULL, admissions integer NOT NULL CHECK(admissions>0));`},
] as const;
export const AE_SCHEMA_VERSION = 3;
export const AE_COMPATIBILITY = {schema: [1, 2, 3], runWorkflow: 'ae-v1', sdk: '0.21.0', configuration: '1', rollback: 'Keep the additive schema. Do not run down migrations; never downgrade DBOS.'} as const;

// This is a bounded adoption contract, not an ORM or arbitrary SQL migration framework.
const tables: Record<string, string> = {
  'public.ae_runs_v1':'id:text! body:jsonb!',
  'public.ae_approvals_v1':'id:text! run_id:text! view:jsonb! state:text! decision:jsonb',
  'public.ae_operations_v1':'id:text! run_id:text! request_hash:text! prepared:jsonb! result:jsonb',
  'public.ae_conversations_v1':'id:text! principal:jsonb! context:jsonb! authority_hash:text! created_at:timestamptz! expires_at:timestamptz! payload_deleted_at:timestamptz?',
  'public.ae_conversation_turns_v1':'conversation_id:text! turn:int4! run_id:text! release_id:text! input:text! output:text created_at:timestamptz! completed_at:timestamptz client_intent_id:text?',
  'ae_control.drafts':'tenant_id:text! application_id:text! draft_id:text! revision:int4! document:jsonb!',
  'ae_control.releases':'tenant_id:text! application_id:text! release_id:text! draft_id:text! draft_revision:int4! document:jsonb!',
  'ae_control.active':'tenant_id:text! application_id:text! release_id:text!',
  'ae_api.intents':'intent_key:text! intent_token:text? input_hash:text! run_id:text! start_hash:text! start:jsonb!',
  'ae_api.admission_windows':'scope_hash:text! window_started_at:timestamptz! admissions:int4!',
};
const keys: Record<string, string[]> = {
  'public.ae_runs_v1':['p:id'],
  'public.ae_approvals_v1':['p:id','f:run_id:public.ae_runs_v1:id'],
  'public.ae_operations_v1':['p:id','f:run_id:public.ae_runs_v1:id'],
  'public.ae_conversations_v1':['p:id'],
  'public.ae_conversation_turns_v1':['p:conversation_id,turn','u:run_id','f:conversation_id:public.ae_conversations_v1:id'],
  'ae_control.drafts':['p:tenant_id,application_id,draft_id','c:(revision > 0)'],
  'ae_control.releases':['p:tenant_id,application_id,release_id','u:tenant_id,application_id,draft_id,draft_revision','c:(draft_revision > 0)'],
  'ae_control.active':['p:tenant_id,application_id','f:tenant_id,application_id,release_id:ae_control.releases:tenant_id,application_id,release_id'],
  'ae_api.intents':['p:intent_key','u:run_id'],
  'ae_api.admission_windows':['p:scope_hash','c:(admissions > 0)'],
};
export interface SchemaInspection {currentVersion: number; targetVersion: number; pending: {version: number; name: string; checksum: string}[]; legacyTables: string[]; schemaHash: string; compatibleRollback: typeof AE_COMPATIBILITY; dryRun: true}
async function describe(c: SqlConnection) {
  const rows = (await c.query(`SELECT n.nspname||'.'||t.relname AS relation,a.attname AS name,ty.typname AS type,a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS default_value,t.relkind AS kind
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid JOIN pg_type ty ON ty.oid=a.atttypid LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
    WHERE n.nspname||'.'||t.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,a.attnum`, [Object.keys(tables)])).rows;
  const constraints = (await c.query(`SELECT n.nspname||'.'||t.relname AS relation,k.contype AS type,k.convalidated AS valid,
    ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY s(num,ord) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=s.num ORDER BY s.ord) AS columns,
    CASE WHEN k.contype='f' THEN rn.nspname||'.'||rt.relname ELSE NULL END AS referenced,
    ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY s(num,ord) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=s.num ORDER BY s.ord) AS referenced_columns,
    CASE WHEN k.contype='c' THEN pg_get_expr(k.conbin,k.conrelid) ELSE NULL END AS expression, k.confdeltype AS delete_action,k.confupdtype AS update_action,k.condeferrable AS deferrable
    FROM pg_constraint k JOIN pg_class t ON t.oid=k.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace LEFT JOIN pg_class rt ON rt.oid=k.confrelid LEFT JOIN pg_namespace rn ON rn.oid=rt.relnamespace
    WHERE n.nspname||'.'||t.relname=ANY($1::text[]) ORDER BY 1,k.contype,k.conname`, [Object.keys(tables)])).rows;
  const indexes = (await c.query(`SELECT schemaname||'.'||tablename AS relation,indexname,indexdef FROM pg_indexes WHERE schemaname||'.'||tablename=ANY($1::text[]) ORDER BY 1,indexname`, [Object.keys(tables)])).rows;
  return {rows, constraints, indexes};
}
function validateShape(state: Awaited<ReturnType<typeof describe>>, version: number): void {
  for (const [relation, definition] of Object.entries(tables)) {
    const actual = state.rows.filter(r=>r.relation===relation);
    if (!actual.length) {if (version && !(relation==='ae_api.admission_windows'&&version<3)) throw new Error(`AE_SCHEMA_DRIFT: missing ${relation}`);continue;}
    const expected = new Map(definition.split(' ').map(token=>{const [name,type]=token.split(':');return [name!,type!];}));
    for (const row of actual) {
      const expectedType=expected.get(row.name);
      if (!expectedType || row.kind!=='r' || row.type!==expectedType.replace(/[!?]/g,'') || (expectedType.endsWith('!') && !row.required) || (!expectedType.endsWith('!') && row.required && !(relation==='ae_api.intents'&&row.name==='intent_token')) || row.default_value!==null) throw new Error(`AE_SCHEMA_DRIFT: ${relation}.${row.name}`);
      expected.delete(row.name);
    }
    for (const [name,type] of expected) if (!type.endsWith('?') || (name==='payload_deleted_at'&&version>=2) || (name!=='payload_deleted_at'&&version>=1)) throw new Error(`AE_SCHEMA_DRIFT: missing ${relation}.${name}`);
    const actualKeys=state.constraints.filter(r=>r.relation===relation).map(r=>{
      if (!r.valid||r.deferrable||(r.type==='f'&&(r.delete_action!=='a'||r.update_action!=='a'))) throw new Error(`AE_SCHEMA_DRIFT: constraint ${relation}`);
      return r.type==='c'?`c:${r.expression}`:`${r.type}:${r.columns.join(',')}${r.type==='f'?`:${r.referenced}:${r.referenced_columns.join(',')}`:''}`;
    }).sort();
    if (JSON.stringify(actualKeys)!==JSON.stringify([...keys[relation]!].sort())) throw new Error(`AE_SCHEMA_DRIFT: keys ${relation}`);
  }
  const turnIndex=state.indexes.find(r=>r.indexname==='ae_conversation_turns_client_intent_v1');
  if ((version>=1&&!turnIndex) || (turnIndex && !/CREATE UNIQUE INDEX ae_conversation_turns_client_intent_v1 ON public.ae_conversation_turns_v1 USING btree \(conversation_id, client_intent_id\) WHERE \(client_intent_id IS NOT NULL\)/.test(turnIndex.indexdef))) throw new Error('AE_SCHEMA_DRIFT: conversation intent index');
}
async function inspect(c: SqlConnection): Promise<SchemaInspection> {
  const exists=(await c.query("SELECT to_regclass('ae_metadata.schema_migrations') AS relation")).rows[0]?.relation;
  const applied=exists?(await c.query('SELECT version,checksum,schema_hash FROM ae_metadata.schema_migrations ORDER BY version')).rows:[];
  for (let i=0;i<applied.length;i++) {
    const m=aeMigrations[i],row=applied[i]!;
    if (!m||row.version!==m.version||row.checksum!==hash(m)) throw new Error('AE_MIGRATION_HISTORY_UNSUPPORTED');
  }
  const currentVersion=applied.length, state=await describe(c);
  validateShape(state,currentVersion);
  const schemaHash=hash(state);
  if (currentVersion&&applied.at(-1)!.schema_hash!==schemaHash) throw new Error('AE_SCHEMA_DRIFT: stored fingerprint');
  return {currentVersion,targetVersion:AE_SCHEMA_VERSION,pending:aeMigrations.slice(currentVersion).map(m=>({version:m.version,name:m.name,checksum:hash(m)})),legacyTables:currentVersion?[]:[...new Set(state.rows.map(r=>String(r.relation)))],schemaHash,compatibleRollback:AE_COMPATIBILITY,dryRun:true};
}
/** Read-only transaction: no schema, ledger, or DBOS initialization occurs. */
export async function inspectAeSchema(pool: SqlPool): Promise<SchemaInspection> {
  const c=await pool.connect();try {await c.query('BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ');const result=await inspect(c);await c.query('COMMIT');return result;} catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
/** Fixed, additive SQL under PostgreSQL atomic DDL and one transaction-scoped advisory lock. */
export async function migrateAeSchema(pool: SqlPool): Promise<SchemaInspection> {
  const c=await pool.connect();try {
    await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='30s'; SET LOCAL search_path=public,pg_catalog");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ae-owned-schema-v1',0))");
    const before=await inspect(c);
    if(before.pending.length){
      await c.query('CREATE SCHEMA IF NOT EXISTS ae_metadata; CREATE TABLE IF NOT EXISTS ae_metadata.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,schema_hash text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
      for (const m of aeMigrations.slice(before.currentVersion)) {
        await c.query(m.sql);const state=await describe(c);validateShape(state,m.version);
        await c.query('INSERT INTO ae_metadata.schema_migrations(version,checksum,schema_hash) VALUES($1,$2,$3)',[m.version,hash(m),hash(state)]);
      }
    }
    const after=await inspect(c);await c.query('COMMIT');return after;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
