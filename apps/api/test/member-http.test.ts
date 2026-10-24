import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import type { JsonObject, ModelProvider, Principal } from '@ae/contracts';
import { AuthorizedTicketHost, ToolBroker } from '@ae/capabilities';
import { GovernedRuntime } from '@ae/runtime-core';
import { createApi } from '../src/app.js';

const principal: Principal = {tenantId:'tenant-a',applicationId:'helpdesk',subjectId:'member-fixture',roles:['editor'],scopes:['tickets:read','tickets:write']};
test('real HTTP member lookup and assignee confirmation reuse host authority and receipts',async t=>{
  let app:Hono;const server=serve({hostname:'127.0.0.1',port:0,fetch:request=>app.fetch(request)});
  if(!server.listening)await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
  const post=async(path:string,body:unknown)=>{const response=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','Idempotency-Key':'member-flow'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  const setup=async(loseWriteResponse=false)=>{
    const domain:typeof import('../../../fixtures/existing-react-helpdesk/src/tickets.js')=await import(new URL('../../../fixtures/existing-react-helpdesk/src/tickets.js?case='+crypto.randomUUID(),import.meta.url).href);
    let current=structuredClone(principal);const turns=new Map<string,number>();
    const model:ModelProvider={async complete(request){const turn=turns.get(request.runId)??0;turns.set(request.runId,turn+1);const steps:Array<{callId:string;name:string;arguments:JsonObject}>=[{callId:'members',name:'read_ticket_members',arguments:{ticketId:'ticket-1'}},{callId:'read',name:'read_ticket',arguments:{ticketId:'ticket-1'}},{callId:'assign',name:'change_ticket_assignee',arguments:{ticketId:'ticket-1',assigneeId:'member-a',expectedVersion:1}}];const call=steps[turn];return {schemaVersion:'1',requestId:request.requestId,mode:'simulated',message:call?'':'Confirmed host receipt.',toolCalls:call?[call]:[],finishReason:call?'tool-calls':'stop'};}};
    const host=new AuthorizedTicketHost(domain,()=>current),broker=new ToolBroker(host,{loseWriteResponse}),runtime=new GovernedRuntime({broker,model,maxTurns:8});
    app=createApi({runtime,broker,resolvePrincipal:()=>principal,releaseId:'member-fixture-v1',applicationName:'Member fixture',apiOrigin:base,allowedOrigin:base});
    return {domain,host,runtime,revoke:()=>{current={...current,roles:['viewer'],scopes:['tickets:read']};}};
  };
  await t.test('ticket-scoped active members lead to one explicitly confirmed assignment',async()=>{
    const f=await setup();const started=await post('/api/runs',{input:'Find an eligible member and assign the ticket',context:{ticketId:'ticket-1'}});assert.equal(started.status,201);assert.equal(started.body.status,'awaiting-approval');assert.equal(f.host.mutationCount,0);
    const memberReceipt=started.body.receipts.find((r:{data?:{members?:unknown[]}})=>r.data?.members);assert.deepEqual(memberReceipt.data.members.map((m:{id:string})=>m.id),['member-a']);
    const a=started.body.approval;const approved=await post(`/api/runs/${started.body.runId}/approval`,{approvalId:a.binding.approvalId,expectedHash:a.expectedHash,decision:'approve'});assert.equal(approved.body.status,'succeeded');assert.equal(f.host.mutationCount,1);assert.equal(f.domain.readTicket('tenant-a','ticket-1').assigneeId,'member-a');
    await post(`/api/runs/${started.body.runId}/approval`,{approvalId:a.binding.approvalId,expectedHash:a.expectedHash,decision:'approve'});assert.equal(f.host.mutationCount,1);
  });
  await t.test('authority revoked after preview blocks confirmed assignment',async()=>{
    const f=await setup();const started=await post('/api/runs',{input:'Assign ticket',context:{ticketId:'ticket-1'}});f.revoke();const a=started.body.approval;await post(`/api/runs/${started.body.runId}/approval`,{approvalId:a.binding.approvalId,expectedHash:a.expectedHash,decision:'approve'});assert.equal(f.host.mutationCount,0);assert.equal(f.domain.readTicket('tenant-a','ticket-1').version,1);
  });
  await t.test('lost response stays unknown until receipt reconciliation without redispatch',async()=>{
    const f=await setup(true);const started=await post('/api/runs',{input:'Assign ticket',context:{ticketId:'ticket-1'}}),a=started.body.approval;const approved=await post(`/api/runs/${started.body.runId}/approval`,{approvalId:a.binding.approvalId,expectedHash:a.expectedHash,decision:'approve'});assert.equal(approved.body.status,'outcome-unknown');assert.equal(f.host.mutationCount,1);const recovered=f.runtime.reconcile(started.body.runId,principal);assert.equal(recovered.status,'succeeded');assert.equal(f.host.mutationCount,1);const observed=await(await fetch(base+`/api/runs/${started.body.runId}`)).json();assert.equal(observed.status,'succeeded');
  });
});
