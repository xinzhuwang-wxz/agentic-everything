import type { BehaviorCatalog, CapabilityVersion, ModelProvider, Principal } from '@ae/contracts';
import { configurationHostCatalog } from './host-catalog.js';
import { PostgresControlPlane } from '@ae/control-plane/postgres';
import { PersistentRuntime, type DurableTicketHost } from '@ae/runtime-adapters/persistent';
import { digest, PolicyError } from '@ae/policy';
import { recoverIntentBatch, validateIntentRow, STARTUP_RECOVERY_LIMIT, type IntentRow } from './intents.js';
import { createApi, type ApiOptions, type ApiRunView } from './app.js';
export interface PersistentApiOptions {
  databaseUrl: string;
  /** Register only a reviewed catalog actually implemented by this host adapter. */
  behaviorCatalog?: BehaviorCatalog;
  host: DurableTicketHost;
  /** Explicit supported fixed registry; omission preserves the legacy two-tool configuration catalog. */
  capabilityCatalog?: CapabilityVersion[];
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
  if (options.behaviorCatalog && options.host.behaviorRegistryHash !== options.behaviorCatalog.registryHash) throw new PolicyError('HOST_BEHAVIOR_NOT_SUPPORTED');
  const controlPlane = new PostgresControlPlane(options.databaseUrl, configurationHostCatalog(options.host, options.capabilityCatalog), options.currentConfigurationPrincipal, options.behaviorCatalog);
  const runtime = new PersistentRuntime({databaseUrl:options.databaseUrl,host:options.host,model:options.model,...(options.fault?{fault:options.fault}:{})});
  await controlPlane.initialize();
  await runtime.launch();
  await runtime.store.pool.query('CREATE SCHEMA IF NOT EXISTS ae_api; CREATE TABLE IF NOT EXISTS ae_api.intents (intent_key text PRIMARY KEY, intent_token text NOT NULL, input_hash text NOT NULL, run_id text UNIQUE NOT NULL, start_hash text NOT NULL, start jsonb NOT NULL); ALTER TABLE ae_api.intents ADD COLUMN IF NOT EXISTS intent_token text');
  // One bounded startup reconciliation closes the commit-before-workflow-submission crash window.
  // This only resubmits fixed IDs to DBOS, never dispatches tools or owns a scheduling loop.
  let closing=false;let closePromise:Promise<void>|undefined;
  const missing=await runtime.store.pool.query('SELECT i.intent_key,i.intent_token,i.input_hash,i.run_id,i.start_hash,i.start FROM ae_api.intents i LEFT JOIN ae_runs_v1 r ON r.id=i.run_id WHERE r.id IS NULL ORDER BY i.intent_key LIMIT $1',[STARTUP_RECOVERY_LIMIT+1]);
  const recovery=recoverIntentBatch(missing.rows as unknown as IntentRow[],input=>runtime.start(input));
  const startupRecovery=recovery.result.then(report=>{if(report.blocked.length||report.deferred)console.error('AE_INTENT_RECOVERY_INCOMPLETE',JSON.stringify(report));return report;});
  const startIntent: NonNullable<ApiOptions['startIntent']> = async input => {
    if(closing)throw new PolicyError('SERVER_CLOSING');
    const principal=structuredClone(input.principal);
    await runtime.broker.current(principal);
    const conversation = input.conversationId ? await runtime.conversations.get(input.conversationId, principal) : undefined;
    if (conversation && input.context && digest(conversation.context) !== digest(input.context)) throw new PolicyError('CONVERSATION_CONTEXT_DENIED');
    const context = conversation?.context ?? input.context;
    const intentKey=digest([principal.tenantId,principal.applicationId,principal.subjectId,...(input.conversationId?[input.conversationId]:[]),input.intent]);
    const content={input:input.input,...(context?{context}:{})};
    const inputHash=digest({...content,...(input.conversationId?{conversationId:input.conversationId}:{})});
    // One persisted intent owns one server-generated run ID and first-selected release. DBOS alone dispatches.
    const start=await runtime.store.transaction(async connection=>{
      await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[intentKey]);
      const existing=(await connection.query('SELECT intent_key,intent_token,input_hash,run_id,start_hash,start FROM ae_api.intents WHERE intent_key=$1',[intentKey])).rows[0];
      if(existing){if(existing.input_hash!==inputHash)throw new PolicyError('IDEMPOTENCY_CONFLICT');return validateIntentRow(existing as unknown as IntentRow,{principal,intent:input.intent});}
      const release=await controlPlane.activeRelease(principal);if(!release)throw new PolicyError('RELEASE_REQUIRED');
      const runId=`intent-${intentKey}`;
      const binding=input.conversationId?await runtime.conversations.reserve(connection,input.conversationId,principal,runId,release.releaseId,input.input,context):undefined;
      const value={runId,principal,releaseId:release.releaseId,release,...content,...(binding?{conversation:binding}:{})};
      await connection.query('INSERT INTO ae_api.intents(intent_key,intent_token,input_hash,run_id,start_hash,start) VALUES($1,$2,$3,$4,$5,$6)',[intentKey,input.intent,inputHash,runId,digest(value),JSON.stringify(value)]);return value;
    });
    await options.fault?.('after-intent-persist');
    // Recheck caller before returning existing workflow data; old intent snapshots never grant current authority.
    await runtime.broker.current(principal);
    await runtime.start(start);
    return await runtime.get(start.runId,principal) as ApiRunView;
  };
  const app=createApi({runtime,broker:runtime.broker,controlPlane,startIntent,...(options.host.conversationHistory?{conversations:runtime.conversations}:{}),resolvePrincipal:options.resolvePrincipal,releaseId:'unpublished',applicationName:options.applicationName,apiOrigin:options.apiOrigin,allowedOrigin:options.allowedOrigin,durability:'postgres_qualified',requirePublishedRelease:true});
  return {app,runtime,controlPlane,startupRecovery,close(){return closePromise??=(async()=>{closing=true;recovery.stop();await startupRecovery;try{await runtime.shutdown();}finally{await controlPlane.close();}})();}};
}
