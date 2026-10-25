import assert from 'node:assert/strict';
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { doctorInstallation, inspectAeSchema, migrateAeSchema, ConversationRetention, admitNewIntent, AdmissionLimitError } from '../../dist/packages/operations/src/index.js';
import { SyntheticDurableHost, validateDatabaseUrl } from '../persistence/host.mjs';
import { Worker } from './worker-client.mjs';
const [url,directory,pgBin,legacyRoot]=process.argv.slice(2);validateDatabaseUrl(url);
assert.ok(legacyRoot,'Pass an isolated built pre-migration source checkout');
const root=resolve('.'),tests=[],workers=[];
// A real fixed-source installation need not retain Git metadata. Validate its
// complete managed receipt before using it as the previous binary.
const legacyInspection=(()=>{try{return {commit:execFileSync('git',['-C',legacyRoot,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),provenance:'git-checkout'};}catch{const inspected=doctorInstallation(legacyRoot);assert.equal(inspected.integrity,true,'Previous installed binary must retain verified integrity');return {commit:inspected.commit,provenance:'verified-installation-receipt'};}})();
let pool=new pg.Pool({connectionString:url}),host=new SyntheticDurableHost(url);
const record=name=>{tests.push({name,status:'pass'});console.log(`PASS ${name}`);};
const rows=async(sql,values)=> (await pool.query(sql,values)).rows;
const p={tenantId:'operations-a',applicationId:'synthetic-helpdesk',subjectId:'operations-user',roles:['editor','agentic:admin','agentic:retention'],scopes:['tickets:read','tickets:write']};
const start=async(path,label)=>{const worker=new Worker(path,url,directory,label);workers.push(worker);await worker.ready();return worker;};
try{
  assert.equal((await inspectAeSchema(pool)).currentVersion,0);assert.equal((await rows("SELECT to_regclass('ae_metadata.schema_migrations') AS value"))[0].value,null);record('clean-schema-dry-run-has-no-side-effects');
  const injected={async connect(){const c=await pool.connect();return {release:()=>c.release(),query:(sql,values)=>c.query(sql.startsWith('ALTER TABLE public.ae_conversations_v1 ADD COLUMN')?sql+' SELECT 1/0;':sql,values)};}};
  await assert.rejects(migrateAeSchema(injected),/division by zero/);
  assert.equal((await rows("SELECT to_regclass('public.ae_runs_v1') AS value"))[0].value,null);assert.equal((await rows("SELECT to_regclass('ae_metadata.schema_migrations') AS value"))[0].value,null);record('failed-ddl-rolls-back-schema-and-ledger-atomically');
  await host.setup();await host.seed(p,'operations-ticket');
  const {PostgresControlPlane}=await import(pathToFileURL(join(legacyRoot,'dist/packages/control-plane/src/postgres.js')).href);
  const {ticketCapabilities}=await import(pathToFileURL(join(legacyRoot,'dist/packages/capabilities/src/index.js')).href);
  const oldControl=new PostgresControlPlane(url,ticketCapabilities);await oldControl.initialize();
  const draft=await oldControl.save(p,{name:'Pinned original configuration',instructions:'Use governed fixture capabilities.',capabilityIds:['read_ticket','change_ticket_priority'],bounds:{maxTurns:8,maxElapsedMs:20000}});
  const release=await oldControl.publish(p,draft.draftId,1);await oldControl.close();
  // Actual old worker writes the private SDK checkpoint and DBOS history before adoption.
  let old=await start(legacyRoot,'legacy-before-upgrade');
  const paused=await old.request('start',{principal:p,releaseId:release.releaseId,release,input:'Raise qualification-ticket:operations-ticket to high priority.',context:{ticketId:'operations-ticket'}});
  assert.equal(paused.status,'awaiting-approval');await old.shutdown();
  // Legacy API token column is intentionally nullable; adoption never invents a token.
  await pool.query('CREATE SCHEMA ae_api;CREATE TABLE ae_api.intents(intent_key text PRIMARY KEY,input_hash text NOT NULL,run_id text UNIQUE NOT NULL,start_hash text NOT NULL,start jsonb NOT NULL);INSERT INTO ae_api.intents VALUES(\'legacy-unbound\',\'hash\',\'legacy-missing-run\',\'hash\',\'{}\')');
  const before=(await rows('SELECT body FROM ae_runs_v1 WHERE id=$1',[paused.runId]))[0].body;
  const dbosBefore=await rows('SELECT version FROM dbos.dbos_migrations ORDER BY version');
  const dry=await inspectAeSchema(pool);assert.equal(dry.currentVersion,0);assert.ok(dry.legacyTables.includes('ae_api.intents'));assert.equal(dry.pending.length,3);
  assert.deepEqual((await rows('SELECT body FROM ae_runs_v1 WHERE id=$1',[paused.runId]))[0].body,before);record('legacy-adoption-dry-run-preserves-old-pending-run');
  const migrated=await Promise.all(Array.from({length:4},()=>migrateAeSchema(pool)));assert.ok(migrated.every(r=>r.currentVersion===3&&r.pending.length===0));
  assert.equal((await rows('SELECT count(*)::int AS count FROM ae_metadata.schema_migrations'))[0].count,3);
  assert.equal((await rows("SELECT intent_token FROM ae_api.intents WHERE intent_key='legacy-unbound'"))[0].intent_token,null);
  assert.deepEqual((await rows('SELECT body FROM ae_runs_v1 WHERE id=$1',[paused.runId]))[0].body,before);assert.deepEqual(await rows('SELECT version FROM dbos.dbos_migrations ORDER BY version'),dbosBefore);record('concurrent-additive-upgrade-idempotent-preserves-rows-and-dbos-ownership');
  await pool.query("ALTER TABLE ae_runs_v1 ALTER COLUMN body SET DEFAULT '{}'::jsonb");await assert.rejects(inspectAeSchema(pool),/AE_SCHEMA_DRIFT/);await pool.query('ALTER TABLE ae_runs_v1 ALTER COLUMN body DROP DEFAULT');
  const checksum=(await rows('SELECT checksum FROM ae_metadata.schema_migrations WHERE version=1'))[0].checksum;
  await pool.query("UPDATE ae_metadata.schema_migrations SET checksum='tampered' WHERE version=1");await assert.rejects(migrateAeSchema(pool),/AE_MIGRATION_HISTORY_UNSUPPORTED/);await pool.query('UPDATE ae_metadata.schema_migrations SET checksum=$1 WHERE version=1',[checksum]);record('schema-drift-and-modified-migration-history-fail-closed');
  old=await start(legacyRoot,'legacy-compatible-rollback');const rollbackView=await old.request('get',paused.runId,p);assert.deepEqual(rollbackView.approval,paused.approval);await old.shutdown();record('previous-binary-reads-old-approval-on-additive-schema-without-down-migration');
  const backup=join(directory,'ae-full-synthetic.dump');
  await host.close();await pool.end();
  execFileSync(join(pgBin,'pg_dump'),['--format=custom','--no-owner','--no-privileges','--file',backup,url]);
  const backupHash=createHash('sha256').update(readFileSync(backup)).digest('hex');
  const target=new URL(url);const connection=['-h','127.0.0.1','-p',target.port,'-U',target.username];
  execFileSync(join(pgBin,'dropdb'),[...connection,'ae_persistence_qualification']);execFileSync(join(pgBin,'createdb'),[...connection,'ae_persistence_qualification']);
  assert.equal(createHash('sha256').update(readFileSync(backup)).digest('hex'),backupHash);
  execFileSync(join(pgBin,'pg_restore'),['--exit-on-error','--no-owner','--no-privileges','--dbname',url,backup]);
  pool=new pg.Pool({connectionString:url});host=new SyntheticDurableHost(url);
  assert.deepEqual((await rows('SELECT body FROM ae_runs_v1 WHERE id=$1',[paused.runId]))[0].body,before);assert.equal((await inspectAeSchema(pool)).currentVersion,3);record('real-pg-dump-restore-recovers-schema-config-approval-sdk-and-dbos-data');
  const upgraded=await start(root,'upgraded-restored');const restored=await upgraded.request('get',paused.runId,p);assert.deepEqual(restored.approval,paused.approval);
  await assert.rejects(upgraded.request('get',paused.runId,{...p,tenantId:'other'}),/RUN_NOT_FOUND/);
  const decision={approvalId:paused.approval.binding.approvalId,expectedHash:paused.approval.expectedHash,decision:'approve'};
  const completed=await upgraded.request('decide',paused.runId,p,decision);assert.equal(completed.status,'succeeded');assert.deepEqual(await upgraded.request('decide',paused.runId,p,decision),completed);
  const inspection=await host.inspect(p,'operations-ticket',paused.runId);assert.equal(inspection.mutationCount,1);assert.equal(inspection.calls.filter(c=>c.kind==='write').length,1);assert.deepEqual(inspection.model.map(c=>c.stage),['read','write','final']);await upgraded.shutdown();record('restored-old-run-resumes-pinned-release-exactly-once-with-current-scope-isolation');
  const cutoff=new Date(Date.now()-1000).toISOString(),expired=new Date(Date.now()-5000).toISOString(),created=new Date(Date.now()-10000).toISOString();
  async function projection(id,principal,status,expires=expired){
    const run=`retention-${id}`;await pool.query('INSERT INTO ae_runs_v1(id,body) VALUES($1,$2)',[run,JSON.stringify({view:{status},principal})]);
    await pool.query('INSERT INTO ae_conversations_v1(id,principal,context,authority_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[id,JSON.stringify(principal),' {"private":"SYNTHETIC_PROJECTION_SECRET"}','hash',created,expires]);
    await pool.query('INSERT INTO ae_conversation_turns_v1(conversation_id,turn,run_id,release_id,input,output,created_at) VALUES($1,1,$2,\'release\',\'SYNTHETIC_PROJECTION_SECRET\',\'SYNTHETIC_REPLY\',$3)',[id,run,created]);
  }
  await projection('expired-finished',p,'succeeded');await projection('expired-unknown',p,'outcome-unknown');await projection('expired-pending',p,'awaiting-approval');await projection('not-expired',p,'succeeded',new Date(Date.now()+60000).toISOString());await projection('other-tenant',{...p,tenantId:'other'},'succeeded');await projection('other-application',{...p,applicationId:'other'},'succeeded');await projection('other-user',{...p,subjectId:'other'},'succeeded');
  const retention=new ConversationRetention(pool,p=>p);const plan=await retention.run(p,{cutoff});assert.deepEqual(plan.eligible,['expired-finished']);assert.equal(plan.blocked.length,2);assert.equal((await rows("SELECT count(*)::int AS count FROM ae_conversation_turns_v1"))[0].count,7);
  await assert.rejects(retention.run(p,{cutoff,apply:true,expectedSelectionHash:'wrong'}),/RETENTION_SELECTION_CHANGED/);
  let rightsChecks=0;const revoked=new ConversationRetention(pool,current=>++rightsChecks>=4?{...current,roles:[]}:current);await assert.rejects(revoked.run(p,{cutoff,apply:true,expectedSelectionHash:plan.selectionHash}),/RETENTION_AUTHORITY_DENIED/);assert.equal((await rows("SELECT count(*)::int AS count FROM ae_conversation_turns_v1 WHERE conversation_id='expired-finished'"))[0].count,1);
  const purged=await retention.run(p,{cutoff,apply:true,expectedSelectionHash:plan.selectionHash});assert.equal(purged.deleted,1);assert.equal((await rows("SELECT count(*)::int AS count FROM ae_conversation_turns_v1"))[0].count,6);assert.deepEqual((await rows("SELECT context FROM ae_conversations_v1 WHERE id='expired-finished'"))[0].context,{});assert.equal((await rows("SELECT count(*)::int AS count FROM ae_runs_v1 WHERE id='retention-expired-finished'"))[0].count,1);
  const repeat=await retention.run(p,{cutoff});assert.equal(repeat.eligible.length,0);assert.equal((await rows('SELECT count(*)::int AS count FROM ae_operations_v1 WHERE run_id=$1',[paused.runId]))[0].count,2);record('physical-projection-retention-is-bounded-current-rights-scoped-atomic-and-preserves-audit');
  const quota={...p,subjectId:'rate-user'},policy={maxStarts:3,windowSeconds:3600};
  async function admission(principal=quota,configuration=policy){const c=await pool.connect();try{await c.query('BEGIN');await admitNewIntent(c,principal,configuration);await c.query('COMMIT');return 'admitted';}catch(e){await c.query('ROLLBACK');if(e instanceof AdmissionLimitError){assert.ok(e.retryAfterSeconds>=1&&e.retryAfterSeconds<=configuration.windowSeconds);return 'limited';}throw e;}finally{c.release();}}
  const bursts=await Promise.all(Array.from({length:12},()=>admission()));assert.equal(bursts.filter(v=>v==='admitted').length,3);assert.equal(bursts.filter(v=>v==='limited').length,9);
  await pool.end();pool=new pg.Pool({connectionString:url});assert.equal(await admission(),'limited');
  for(const principal of [{...quota,tenantId:'other'},{...quota,applicationId:'other'},{...quota,subjectId:'other'}])assert.equal(await admission(principal),'admitted');
  await pool.query("INSERT INTO ae_api.admission_windows(scope_hash,window_started_at,admissions) SELECT 'expired-'||n,clock_timestamp()-interval '3 hours',1 FROM generate_series(1,150) n");
  assert.equal(await admission({...quota,subjectId:'cleanup-user'}),'admitted');assert.equal((await rows("SELECT count(*)::int AS count FROM ae_api.admission_windows WHERE scope_hash LIKE 'expired-%'"))[0].count,50);
  const rateScope=createHash('sha256').update(JSON.stringify([quota.tenantId,quota.applicationId,quota.subjectId])).digest('hex');await pool.query("UPDATE ae_api.admission_windows SET window_started_at=clock_timestamp()-interval '2 hours' WHERE scope_hash=$1",[rateScope]);assert.equal(await admission(),'admitted');record('durable-admission-concurrency-restart-isolation-window-renewal-and-bounded-cleanup');
  const httpPrincipal={...p,subjectId:'http-rate',roles:['editor','agentic:admin']};await host.seed(httpPrincipal,'http-rate-ticket');
  async function httpWorker(label){const w=new Worker(root,url,directory,label,'tests/operations/admission-worker.mjs');workers.push(w);await w.ready();return w;}
  let http=await httpWorker('http-rate-first');
  const request=async(key,input='bounded input')=>{const origin=http.events.find(e=>e.event==='ready').origin;return fetch(origin+'/api/runs',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({input})});};
  const firstResponse=await request('http-rate-one');assert.equal(firstResponse.status,201);const firstRun=await firstResponse.json();
  const duplicate=await request('http-rate-one');assert.equal(duplicate.status,201);assert.equal((await duplicate.json()).runId,firstRun.runId);
  assert.equal((await request('http-rate-one','conflicting input')).status,409);assert.equal((await request('http-rate-two')).status,201);
  const modelBefore=(await rows("SELECT count(*)::int AS count FROM qualification_host.model_calls WHERE stage='rate'"))[0].count;assert.equal(modelBefore,2);
  const rejected=await request('http-rate-three');assert.equal(rejected.status,429);assert.match(rejected.headers.get('retry-after'),/^[1-9][0-9]*$/);assert.ok(Number(rejected.headers.get('retry-after'))<=3600);
  assert.equal((await rows("SELECT count(*)::int AS count FROM ae_api.intents WHERE start->'principal'->>'subjectId'='http-rate'"))[0].count,2);
  await http.shutdown();http=await httpWorker('http-rate-restart');assert.equal((await request('http-rate-three')).status,429);assert.equal((await request('http-rate-one')).status,201);
  await http.request('session',null);assert.equal((await request('no-auth')).status,401);assert.equal((await rows("SELECT count(*)::int AS count FROM qualification_host.model_calls WHERE stage='rate'"))[0].count,modelBefore);await http.shutdown();record('real-http-rate-429-retry-after-no-runspawn-idempotency-conflict-noauth-and-process-restart');
  writeFileSync(join(directory,'operations-report.json'),JSON.stringify({status:'pass',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),legacyCommit:legacyInspection.commit,legacyProvenance:legacyInspection.provenance,postgres:(await rows('SHOW server_version'))[0].server_version,backup:{sha256:backupHash,format:'pg_dump custom',restored:true},tests,limits:['Synthetic loopback data and deterministic model only','Projection retention is not full personal-data erasure','No production identity, deployment, credentials or live-provider qualification']},null,2)+'\n');
}finally{for(const w of workers)await w.kill();await host.close();await pool.end();}
