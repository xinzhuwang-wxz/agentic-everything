import { createHash } from 'node:crypto';
import type { Principal } from '@ae/contracts';
import { PolicyError, samePrincipal } from '@ae/policy';
import type { SqlConnection, SqlPool } from './migrations.js';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface RetentionRequest {cutoff: string; limit?: number; apply?: boolean; expectedSelectionHash?: string}
export interface RetentionResult {scope:'expired-conversation-projections-only'; dryRun:boolean; selectionHash:string; eligible:string[]; blocked:{conversationId:string;reason:'unfinished-or-unknown-run'}[]; deleted:number; retained:string[]}
/** This is a server/operator port, never exposed to model tools or browser principal fields. */
export class ConversationRetention {
  constructor(private pool:SqlPool,private currentPrincipal:(p:Principal)=>Principal|Promise<Principal>){}
  private async authorize(principal:Principal):Promise<void>{
    const p=await this.currentPrincipal(structuredClone(principal));
    if(!samePrincipal(p,principal)||!p.roles.includes('agentic:retention'))throw new PolicyError('RETENTION_AUTHORITY_DENIED');
  }
  async run(input:Principal,request:RetentionRequest):Promise<RetentionResult>{
    const principal=structuredClone(input),cutoff=new Date(request.cutoff),limit=request.limit??100;
    if(!Number.isFinite(cutoff.getTime())||cutoff.getTime()>Date.now()||!Number.isInteger(limit)||limit<1||limit>100)throw new PolicyError('INVALID_RETENTION_BOUND');
    await this.authorize(principal);
    const c=await this.pool.connect();
    try{
      await c.query(request.apply?'BEGIN':'BEGIN READ ONLY');
      await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'");
      await this.authorize(principal);
      const rows=(await c.query(`SELECT id,expires_at,context FROM public.ae_conversations_v1 WHERE principal->>'tenantId'=$1 AND principal->>'applicationId'=$2 AND principal->>'subjectId'=$3 AND expires_at<=$4 AND payload_deleted_at IS NULL ORDER BY expires_at,id LIMIT $5${request.apply?' FOR UPDATE':''}`,[principal.tenantId,principal.applicationId,principal.subjectId,cutoff.toISOString(),limit])).rows;
      const eligible:string[]=[],blocked:RetentionResult['blocked']=[],fingerprints:unknown[]=[];
      for(const row of rows){
        const turns=(await c.query("SELECT t.*,r.body->'view'->>'status' AS status FROM public.ae_conversation_turns_v1 t LEFT JOIN public.ae_runs_v1 r ON r.id=t.run_id WHERE t.conversation_id=$1 ORDER BY t.turn",[row.id])).rows;
        if(turns.some(t=>!['succeeded','failed','rejected','cancelled'].includes(t.status)))blocked.push({conversationId:row.id,reason:'unfinished-or-unknown-run'});
        else{eligible.push(row.id);fingerprints.push({id:row.id,expires:row.expires_at,context:row.context,turns});}
      }
      const selectionHash=hash({scope:[principal.tenantId,principal.applicationId,principal.subjectId],cutoff:cutoff.toISOString(),limit,fingerprints});
      if(request.apply){
        if(!request.expectedSelectionHash||request.expectedSelectionHash!==selectionHash)throw new PolicyError('RETENTION_SELECTION_CHANGED');
        await this.authorize(principal);
        // Expired rows remain as replay-prevention tombstones. No run, operation, intent, approval or DBOS row is removed.
        await c.query('DELETE FROM public.ae_conversation_turns_v1 WHERE conversation_id=ANY($1::text[])',[eligible]);
        await c.query("UPDATE public.ae_conversations_v1 SET context='{}'::jsonb,payload_deleted_at=now() WHERE id=ANY($1::text[])",[eligible]);
      }
      await this.authorize(principal);await c.query('COMMIT');
      return {scope:'expired-conversation-projections-only',dryRun:!request.apply,selectionHash,eligible,blocked,deleted:request.apply?eligible.length:0,retained:['scope/expiry/id tombstones','run/approval/operation audit ledgers','API idempotency intents','DBOS checkpoints','backups and host data']};
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
}
