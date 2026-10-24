// Real HTTP/PG/DBOS/Agents SDK. All provider responses and host data are synthetic.
import { createInterface } from 'node:readline';
import { serve } from '@hono/node-server';
import { createPersistentApi } from '../../dist/apps/api/src/persistent.js';
import { z } from 'zod';
import { PolicyError } from '@ae/policy';
import { ticketCapabilities } from '@ae/capabilities';
import { SyntheticDurableHost, validateDatabaseUrl } from './host.mjs';
const [databaseUrl, portString, principalJson, faultPoint = ''] = process.argv.slice(2);
validateDatabaseUrl(databaseUrl);
const host = new SyntheticDurableHost(databaseUrl), origin = `http://127.0.0.1:${Number(portString)}`;
const emit = value => process.stdout.write(`AE_CONVERSATION ${JSON.stringify(value)}\n`);
let session = JSON.parse(principalJson), lastTicket, releaseTarget;
if(faultPoint==='unknown-after-write'||faultPoint==='revoke-reconcile-text'){const write=host.write.bind(host);host.write=async(...args)=>{await write(...args);throw new Error('Synthetic lost write acknowledgement');};}
host.conversationHistory = {
parseContext: reference => z.strictObject({ticketId:z.string().min(1).max(100)}).parse(reference),
authority: async (p, context) => {
  await host.read(p, context.ticketId);
  const row = (await host.pool.query('SELECT revision FROM qualification_conversations.authority WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3 AND ticket_id=$4', [p.tenantId, p.applicationId, p.subjectId, context.ticketId])).rows[0];
  if (!row) throw new Error('No synthetic history authority');
  return row.revision;
},
authorizeTarget: async (p, context, target) => { if(target.targetId!==context.ticketId)throw new PolicyError('CONVERSATION_CONTEXT_DENIED');await host.read(p,target.targetId); if(faultPoint==='cancel-during-target'){const pending=(await host.pool.query('SELECT id FROM ae_operations_v1 WHERE result IS NULL')).rows;if(pending.length){emit({event:'target-wait'});await new Promise(resolve=>{releaseTarget=resolve;});}} }
};
host.currentCapabilities = async p => { const rows=(await host.pool.query('SELECT capability_id FROM qualification_conversations.disabled WHERE subject_id=$1',[p.subjectId])).rows;return ticketCapabilities.filter(c=>!rows.some(r=>r.capability_id===c.capabilityId)); };
const model = { async complete(request) {
  const user = request.messages.filter(m => m.role === 'user').at(-1)?.content ?? '';
  const tools = request.messages.filter(m => m.role === 'tool');
  const ticketId = /qualification-ticket:([a-zA-Z0-9_-]+)/.exec(user)?.[1];
  if (ticketId) lastTicket=ticketId;
  const role = tools.length === 0 ? /WRITE/.test(user) || /READ/.test(user) ? 'read' : 'text' : /WRITE/.test(user) && tools.length === 1 ? 'write' : 'final';
  await host.pool.query('INSERT INTO qualification_host.model_calls(run_id,request_id,stage,messages,worker_pid) VALUES($1,$2,$3,$4,$5)', [request.runId,request.requestId,role,JSON.stringify(request.messages),process.pid]);
  const toolCalls = role === 'read' ? [{callId:'same-read-call',name:'read_ticket',arguments:{ticketId}}]
    : role === 'write' ? [{callId:'same-write-call',name:'change_ticket_priority',arguments:{ticketId,priority:'high',expectedVersion:1}}] : [];
  if (/MIDCALL_REVOKE/.test(user)) await host.pool.query('UPDATE qualification_conversations.authority SET revision=$1 WHERE subject_id=$2 AND ticket_id=$3',['field-grants-mid-call',session.subjectId,ticketId]);
  const message = /SECOND/.test(user) ? request.messages.some(m => m.role === 'assistant' && m.content.includes('SYNTHETIC_SECRET_A')) ? 'SECOND recalled SYNTHETIC_SECRET_A.' : 'SECOND missing history.' : 'FIRST SYNTHETIC_SECRET_A.';
  return {schemaVersion:'1',requestId:request.requestId,mode:'simulated',message:toolCalls.length?'':message,toolCalls,finishReason:toolCalls.length?'tool-calls':'stop'};
} };
const composed = await createPersistentApi({databaseUrl,host,capabilityCatalog:ticketCapabilities,model,resolvePrincipal:()=>host.currentPrincipal(session),currentConfigurationPrincipal:p=>p,applicationName:'Synthetic conversation qualification',apiOrigin:origin,allowedOrigin:origin,fault:async point=>{if(point==='after-reservation' && faultPoint==='revoke-after-reservation'){const pending=(await host.pool.query("SELECT prepared->'request'->>'targetId' AS target FROM ae_operations_v1 WHERE result IS NULL")).rows;if(pending.length!==1)throw new Error('Expected one isolated reservation');await host.pool.query('UPDATE qualification_conversations.authority SET revision=$1 WHERE subject_id=$2 AND ticket_id=$3',['field-grants-after-reservation',session.subjectId,pending[0].target]);return;}if(point===faultPoint){emit({event:'fault',point});await new Promise(()=>{});}}});
if(faultPoint==='exhaust-pool-at-completion'){
  const original=composed.runtime.conversations.complete.bind(composed.runtime.conversations);
  composed.runtime.conversations.complete=async(run,client)=>{
    const held=await Promise.all(Array.from({length:9},()=>composed.runtime.store.pool.connect()));let released=false,timedOut=false;
    const release=()=>{if(!released){released=true;for(const connection of held)connection.release();}};
    const timer=setTimeout(()=>{timedOut=true;release();},2000);
    try{await original(run,client);if(timedOut)throw new Error('Nested pool checkout deadlocked completion');emit({event:'pool-proof',held:held.length,timedOut});}
    finally{clearTimeout(timer);release();}
  };
}
void composed.startupRecovery.then(report=>emit({event:'recovery',report}));
const server=serve({fetch:composed.app.fetch,hostname:'127.0.0.1',port:Number(portString)},()=>emit({event:'ready',origin,pid:process.pid}));
const input=createInterface({input:process.stdin});
input.on('line',async line=>{const command=JSON.parse(line);try{if(command.method==='session'){session=command.principal;emit({event:'response',id:command.id});}else if(command.method==='release-target'){releaseTarget?.();emit({event:'response',id:command.id});}else if(command.method==='reconcile'){
  if(faultPoint==='revoke-reconcile-text'){
    const original=composed.runtime.conversations.assertRun.bind(composed.runtime.conversations);let transactionalChecks=0;
    composed.runtime.conversations.assertRun=async(run,client)=>{if(client && ++transactionalChecks===2){const row=(await host.pool.query('SELECT context FROM ae_conversations_v1 WHERE id=$1',[run.conversation.conversationId])).rows[0];await host.pool.query('UPDATE qualification_conversations.authority SET revision=$1 WHERE subject_id=$2 AND ticket_id=$3',['field-grants-during-text',session.subjectId,row.context.ticketId]);}return original(run,client);};
  }
  emit({event:'response',id:command.id,result:await composed.runtime.reconcile(command.runId,session)});
}else if(command.method==='shutdown'){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await composed.close();await host.close();emit({event:'response',id:command.id});input.close();}}catch(error){emit({event:'response',id:command.id,error:String(error)});}});
