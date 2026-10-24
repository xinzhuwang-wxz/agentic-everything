import type { AgentRelease, ModelProvider, Principal } from '@ae/contracts';
import { ticketCapabilities } from '@ae/capabilities';
import { PostgresControlPlane } from '@ae/control-plane/postgres';
import { PersistentRuntime, type DurableTicketHost } from '@ae/runtime-adapters/persistent';
import { digest, PolicyError, samePrincipal } from '@ae/policy';
import { createApi, type ApiOptions, type ApiRunView } from './app.js';
export interface PersistentApiOptions {
  databaseUrl: string;
  host: DurableTicketHost;
  model: ModelProvider;
  resolvePrincipal: ApiOptions['resolvePrincipal'];
  /** Current configuration administration is independent of host business permissions. */
  currentConfigurationPrincipal: (principal: Principal) => Principal;
  applicationName: string;
  apiOrigin: string;
  allowedOrigin: string;
  fault?: (point: string) => Promise<void>;
}
/** Explicit opt-in composition. Default fixture server remains memory-only; no connection is inferred. */
export async function createPersistentApi(options: PersistentApiOptions) {
  const controlPlane = new PostgresControlPlane(options.databaseUrl, ticketCapabilities, options.currentConfigurationPrincipal);
  const runtime = new PersistentRuntime({databaseUrl:options.databaseUrl,host:options.host,model:options.model});
  await controlPlane.initialize();
  await runtime.launch();
  await runtime.store.pool.query('CREATE SCHEMA IF NOT EXISTS ae_api; CREATE TABLE IF NOT EXISTS ae_api.intents (intent_key text PRIMARY KEY, input_hash text NOT NULL, run_id text UNIQUE NOT NULL, start_hash text NOT NULL, start jsonb NOT NULL)');
  // One bounded startup reconciliation closes the commit-before-workflow-submission crash window.
  // This only resubmits fixed IDs to DBOS, never dispatches tools or owns a scheduling loop.
  const recoveries = new Set<Promise<unknown>>();
  const missing = await runtime.store.pool.query('SELECT i.start,i.start_hash FROM ae_api.intents i LEFT JOIN ae_runs_v1 r ON r.id=i.run_id WHERE r.id IS NULL');
  for (const row of missing.rows) {
    if(digest(row.start)!==row.start_hash)throw new PolicyError('INTENT_BINDING_DENIED');
    const recovery=runtime.start(row.start).catch(error => { console.error('AE_INTENT_RECOVERY_BLOCKED', error instanceof PolicyError ? error.code : 'ADAPTER_ERROR'); }).finally(()=>recoveries.delete(recovery));
    recoveries.add(recovery);
  }
  const startIntent: NonNullable<ApiOptions['startIntent']> = async input => {
    const principal=structuredClone(input.principal);
    await runtime.broker.current(principal);
    const intentKey=digest([principal.tenantId,principal.applicationId,principal.subjectId,input.intent]);
    const content={input:input.input,...(input.context?{context:input.context}:{})};const inputHash=digest(content);
    // One persisted intent owns one server-generated run ID and first-selected release. DBOS alone dispatches.
    const start=await runtime.store.transaction(async connection=>{
      await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[intentKey]);
      const existing=(await connection.query('SELECT input_hash,run_id,start_hash,start FROM ae_api.intents WHERE intent_key=$1',[intentKey])).rows[0];
      if(existing){if(existing.input_hash!==inputHash)throw new PolicyError('IDEMPOTENCY_CONFLICT');
        const saved=existing.start;
        if(digest(saved)!==existing.start_hash||!samePrincipal(saved.principal,principal)||saved.runId!==`intent-${intentKey}`||existing.run_id!==saved.runId||digest({input:saved.input,...(saved.context?{context:saved.context}:{})})!==inputHash)throw new PolicyError('INTENT_BINDING_DENIED');
        return saved as {runId:string;principal:Principal;releaseId:string;release:AgentRelease;input:string;context?:{ticketId:string}};}
      const release=await controlPlane.activeRelease(principal);if(!release)throw new PolicyError('RELEASE_REQUIRED');
      const runId=`intent-${intentKey}`;const value={runId,principal,releaseId:release.releaseId,release,...content};
      await connection.query('INSERT INTO ae_api.intents(intent_key,input_hash,run_id,start_hash,start) VALUES($1,$2,$3,$4,$5)',[intentKey,inputHash,runId,digest(value),JSON.stringify(value)]);return value;
    });
    await options.fault?.('after-intent-persist');
    // Recheck caller before returning existing workflow data; old intent snapshots never grant current authority.
    await runtime.broker.current(principal);
    await runtime.start(start);
    return await runtime.get(start.runId,principal) as ApiRunView;
  };
  const app=createApi({runtime,broker:runtime.broker,controlPlane,startIntent,resolvePrincipal:options.resolvePrincipal,releaseId:'unpublished',applicationName:options.applicationName,apiOrigin:options.apiOrigin,allowedOrigin:options.allowedOrigin,durability:'postgres_qualified',requirePublishedRelease:true});
  return {app,runtime,controlPlane,async close(){await runtime.shutdown();await controlPlane.close();}};
}
