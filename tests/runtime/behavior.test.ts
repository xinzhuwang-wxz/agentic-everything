import test from 'node:test';
import assert from 'node:assert/strict';
import { ImprovementSchema, type AgentConfiguration, type BehaviorSelection, type ModelProvider, type Principal } from '@ae/contracts';
import { AuthorizedTicketHost, ToolBroker, ticketCapabilities, syntheticTitleBaseline, syntheticTitleCatalog, projectTicketBehavior, type Ticket } from '@ae/capabilities';
import { InMemoryControlPlane, verifyRelease } from '@ae/control-plane';
import { compareBaseline, verifyArchive, type PublicBehaviorAdapter } from '@ae/verification';
import { GovernedRuntime } from '@ae/runtime-core';
import { createApi } from '../../apps/api/src/app.js';
const admin: Principal={tenantId:'tenant-a',applicationId:'app',subjectId:'admin',roles:['editor','agentic:admin'],scopes:['tickets:read','tickets:write']};
const base: AgentConfiguration={name:'Synthetic behavior example',instructions:'Read the ticket. This is a simulated fixture, not production.',capabilityIds:['read_ticket'],bounds:{maxTurns:4,maxElapsedMs:10000}};
const selection=(enabled=false):BehaviorSelection=>({baselineHash:syntheticTitleCatalog.baselineHash,candidateCodeHash:syntheticTitleCatalog.candidateCodeHash,registryHash:syntheticTitleCatalog.registryHash,enabled:enabled?[{id:'synthetic-ticket-title-trim',version:'1'}]:[]});
function setup(){
 const ticket:Ticket={id:'synthetic-title',tenantId:'tenant-a',title:'  Printer offline  ',priority:'low',version:1};
 let revoked=false;
 const host=new AuthorizedTicketHost({readTicket:()=>structuredClone(ticket),changePriority:()=>{throw Error('No writes in read fixture');}},p=>revoked?{...p,scopes:[]}:p);
 const broker=new ToolBroker(host),control=new InMemoryControlPlane(ticketCapabilities,p=>p,syntheticTitleCatalog);
 const publish=(enabled:boolean)=>{const d=control.save(admin,{...base,behavior:selection(enabled)});return control.publish(admin,d.draftId,d.revision);};
 return {host,broker,control,publish,ticket,revoke(){revoked=true;}};
}
test('registered business choices default OFF, bind exact artifacts, reject unknown/security/duplicates, retain immutable audit',()=>{
 const {control,publish}=setup();
 const draft=control.save(admin,base);assert.equal(draft.configuration.behavior,undefined);
 const off=publish(false),on=publish(true);verifyRelease(off);verifyRelease(on);
 assert.deepEqual(off.configuration.behavior?.enabled,[]);assert.equal(on.publishedBy,admin.subjectId);assert.equal(on.configuration.behavior?.enabled.length,1);
 assert.notEqual(on.contentHash,off.contentHash);assert.equal(control.state(admin).releases.length,2);
 for(const behavior of [{...selection(),registryHash:'a'.repeat(64)},{...selection(),baselineHash:'a'.repeat(64)},{...selection(),candidateCodeHash:'a'.repeat(64)},{...selection(),enabled:[{id:'unknown',version:'1'}]},{...selection(true),enabled:[{id:'synthetic-ticket-title-trim',version:'2'}]},{...selection(true),enabled:[...selection(true).enabled,...selection(true).enabled]}])assert.throws(()=>control.save(admin,{...base,behavior}));
 const corrupt=structuredClone(syntheticTitleCatalog);corrupt.improvements[0]!.expectedAllowedDiff[0]!.after='arbitrary';assert.throws(()=>new InMemoryControlPlane(ticketCapabilities,p=>p,corrupt),/HASH_DENIED/);
 const unsafe=structuredClone(syntheticTitleCatalog) as unknown as {improvements:{category:string}[]};unsafe.improvements[0]!.category='security';assert.throws(()=>new InMemoryControlPlane(ticketCapabilities,p=>p,unsafe as never),/INVALID_BEHAVIOR_CATALOG/);
 assert.throws(()=>control.save({...admin,roles:['editor']},{...base,behavior:selection(true)}),/ADMIN_DENIED/);
 assert.equal(control.state({...admin,roles:['viewer']}).behaviorCatalog,undefined);
 assert.throws(()=>projectTicketBehavior({id:'x',tenantId:'tenant-a',title:' x ',priority:'low',version:1},{...selection(true),registryHash:'0'.repeat(64)}));
});
test('OFF matches archived baseline; ON allows only exact declared title delta and all other observations remain equal',async()=>{
 const baseline=verifyArchive(syntheticTitleBaseline);
 const improvements=syntheticTitleCatalog.improvements.map(({risk:_risk,examples:_examples,...i})=>ImprovementSchema.parse(i));
 const run=async(enabled:boolean,unrelated=false)=>{
  const adapter:PublicBehaviorAdapter={safety:'isolated-seeded-fixture',async execute(c,flags){const ticket=projectTicketBehavior(c.seed as unknown as Ticket,selection(flags['synthetic-ticket-title-trim']));if(unrelated)ticket.priority='high';return {output:{...ticket},sideEffects:[],receipt:{kind:'read-only'}};}};
  return compareBaseline({baseline,adapter,provenance:{...baseline.manifest.provenance,sourceVersion:'synthetic-corrected-v1',codeHash:syntheticTitleCatalog.candidateCodeHash},improvements,configuration:{...selection(enabled),enabled:selection(enabled).enabled.map(i=>({...i,approvalRef:'synthetic-admin-release',reviewer:'admin'}))}});
 };
 assert.equal((await run(false)).passed,true);const on=await run(true);assert.equal(on.passed,true);assert.equal(on.cases.flatMap(c=>c.differences).length,1);assert.equal((await run(true,true)).passed,false);
});
test('ordinary page uses current release while a started simulated assistant keeps its pinned behavior and current host permissions',async()=>{
 const {host,broker,control,publish,ticket,revoke}=setup();const off=publish(false);
 let unblock!:()=>void;let entered!:()=>void;const gate=new Promise<void>(resolve=>{unblock=resolve;}),ready=new Promise<void>(resolve=>{entered=resolve;});let first=true;
 const turns=new Map<string,number>();
 const model:ModelProvider={async complete(request){const turn=(turns.get(request.runId)??0)+1;turns.set(request.runId,turn);if(first){first=false;entered();await gate;}const toolCalls=turn===1?[{callId:'read',name:'read_ticket',arguments:{ticketId:ticket.id}}]:[];return {schemaVersion:'1',requestId:request.requestId,mode:'simulated',toolCalls,message:toolCalls.length?'':'Synthetic read complete',finishReason:toolCalls.length?'tool-calls':'stop'};}};
 const runtime=new GovernedRuntime({broker,model});const pending=runtime.start({principal:admin,releaseId:off.releaseId,release:off,input:'Read the synthetic ticket'});await ready;
 const on=publish(true);const app=createApi({runtime,broker,controlPlane:control,resolvePrincipal:()=>admin,releaseId:'fixture',applicationName:'Synthetic fixture',apiOrigin:'http://127.0.0.1:4310',allowedOrigin:'http://127.0.0.1:5173'});
 const page=await app.request('http://127.0.0.1:4310/api/tickets/synthetic-title');assert.equal(page.status,200);const body=await page.json();assert.equal(body.ticket.title,'Printer offline');assert.equal(body.behaviorReleaseId,on.releaseId);
 unblock();const old=await pending;assert.equal(old.status,'succeeded');const receipt=old.receipts[0]!;assert.equal(receipt.status,'succeeded');if(receipt.status==='succeeded')assert.equal((receipt.data as {title:string}).title,'  Printer offline  ');
 const current=await runtime.start({principal:admin,releaseId:on.releaseId,release:on,input:'Read the synthetic ticket'});const next=current.receipts[0]!;if(next.status==='succeeded')assert.equal((next.data as {title:string}).title,'Printer offline');else assert.fail('Read did not succeed');
 publish(false);assert.equal(host.read(admin,ticket.id,control.activeRelease(admin)!.configuration.behavior).title,ticket.title);assert.equal(host.mutationCount,0);
 assert.equal(control.activeRelease(admin)!.configuration.behavior!.enabled.length,0);assert.equal(runtime.get(current.runId,admin).receipts[0]!.status,'succeeded');
 revoke();assert.throws(()=>host.read(admin,ticket.id,selection(true)),/SCOPE_DENIED/);assert.throws(()=>runtime.get(current.runId,admin),/SCOPE_DENIED/);
});
