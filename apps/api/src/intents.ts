import { z } from 'zod';
import { AgentReleaseSchema, PrincipalSchema, ConversationRunBindingSchema, ConversationContextSchema, type ConversationContext, type Principal } from '@ae/contracts';
import { verifyRelease } from '@ae/control-plane';
import { digest, PolicyError, samePrincipal } from '@ae/policy';
const StoredStartSchema=z.strictObject({runId:z.string(),principal:PrincipalSchema,releaseId:z.string(),release:AgentReleaseSchema,input:z.string().trim().min(1).max(16384),context:ConversationContextSchema.optional(),conversation:ConversationRunBindingSchema.optional()});
export type StoredIntentStart=Omit<z.infer<typeof StoredStartSchema>,'context'|'conversation'>&{context?:ConversationContext;conversation?:z.infer<typeof ConversationRunBindingSchema>};
export interface IntentRow {intent_key:unknown;intent_token:unknown;input_hash:unknown;run_id:unknown;start_hash:unknown;start:unknown}
/** Shared by startup and request replay. A content hash alone does not bind a ledger row. */
export function validateIntentRow(row:IntentRow, expected?:{principal:Principal;intent:string}):StoredIntentStart{
  const parsed=StoredStartSchema.safeParse(row.start);
  if(!parsed.success||typeof row.intent_token!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(row.intent_token))throw new PolicyError('INTENT_BINDING_DENIED');
  const {context,conversation,...base}=parsed.data;const start:StoredIntentStart={...base,...(context?{context}:{}),...(conversation?{conversation}:{})};
  const key=digest([start.principal.tenantId,start.principal.applicationId,start.principal.subjectId,...(start.conversation?[start.conversation.conversationId]:[]),row.intent_token]);
  if(row.intent_key!==key||start.runId!==`intent-${key}`||row.run_id!==start.runId||row.start_hash!==digest(start)||row.input_hash!==digest({input:start.input,...(start.context?{context:start.context}:{}),...(start.conversation?{conversationId:start.conversation.conversationId}:{})}))throw new PolicyError('INTENT_BINDING_DENIED');
  if(expected&&(!samePrincipal(start.principal,expected.principal)||row.intent_token!==expected.intent))throw new PolicyError('INTENT_BINDING_DENIED');
  verifyRelease(start.release);
  if(start.releaseId!==start.release.releaseId||start.release.tenantId!==start.principal.tenantId||start.release.applicationId!==start.principal.applicationId)throw new PolicyError('INTENT_BINDING_DENIED');
  return start;
}
export const STARTUP_RECOVERY_LIMIT=32;
export const STARTUP_RECOVERY_CONCURRENCY=2;
export interface RecoveryReport {attempted:number;accepted:number;blocked:{runId:string;code:string}[];deferred:boolean}
/** Finite startup reconciliation only. All execution remains with the supplied DBOS submission port. */
export function recoverIntentBatch(rows:IntentRow[],start:(input:StoredIntentStart)=>Promise<unknown>){
  let stopped=false,index=0;
  const selected=rows.slice(0,STARTUP_RECOVERY_LIMIT);
  const report:RecoveryReport={attempted:0,accepted:0,blocked:[],deferred:rows.length>STARTUP_RECOVERY_LIMIT};
  const lane=async()=>{while(!stopped&&index<selected.length){const row=selected[index++]!;report.attempted++;try{await start(validateIntentRow(row));report.accepted++;}catch(error){report.blocked.push({runId:typeof row.run_id==='string'?row.run_id:'invalid',code:error instanceof PolicyError?error.code:'ADAPTER_ERROR'});}}};
  const result=Promise.all(Array.from({length:STARTUP_RECOVERY_CONCURRENCY},lane)).then(()=>({...report,deferred:report.deferred||index<selected.length}));
  return {result,stop(){stopped=true;}};
}
