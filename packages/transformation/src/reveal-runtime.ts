import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ToolBroker} from '@ae/capabilities';
import {aeRoot} from './inventory-baseline.js';
export const revealRuntimeAssertions=['approval-required','exact-approval','single-durable-write','duplicate-confirmation-denied','repeat-receipt-stable','foreign-principal-denied','revoked-write-denied','stale-version-denied','extra-arguments-denied','cancelled-before-dispatch','lost-response-unknown','receipt-reconciliation-no-retry','fresh-host-durable-receipt','operation-conflict-denied'];
export async function runRevealRuntime(candidateRoot:string,work:string){
 const previous=process.env.AE_ROOT;process.env.AE_ROOT=aeRoot();
 let host:any;try{const {DeckHost,owner}=await import(pathToFileURL(join(candidateRoot,'agentic/host.mjs')).href);const database=join(work,'runtime.sqlite');host=new DeckHost({database,indexPath:join(candidateRoot,'index.html'),allowWrite:true});const broker=new ToolBroker(host);const args={deckId:'index',slide:0,text:'Approved title',expectedVersion:1};
 const prepare=(b:any=broker,run='run-1',a=args)=>b.prepare(owner,run,'edit','replace_slide_text',a);
 const approve=(b:any,p:any)=>{const a=b.requestApproval(owner,p,'reveal-local-v1');b.approvals.decide(owner,{approvalId:a.binding.approvalId,expectedHash:a.expectedHash,decision:'approve'});return a};
 const p=prepare();assert.equal((await broker.execute(owner,p,'reveal-local-v1')).status,'denied');assert.equal(host.snapshot(owner).version,1);
 const approval=approve(broker,p);const result=await broker.execute(owner,p,'reveal-local-v1',approval.binding.approvalId);assert.equal(result.status,'succeeded');assert.equal(host.snapshot(owner).version,2);assert.equal(host.snapshot(owner).slides[0],'Approved title');
 assert.throws(()=>broker.approvals.decide(owner,{approvalId:approval.binding.approvalId,expectedHash:approval.expectedHash,decision:'approve'}));assert.deepEqual(await broker.execute(owner,p,'reveal-local-v1',approval.binding.approvalId),result);assert.equal(host.snapshot(owner).version,2);
 assert.throws(()=>broker.prepare({...owner,subjectId:'foreign'},'bad','read','read_deck',{deckId:'index'}));
 assert.throws(()=>prepare(broker,'stale'));assert.throws(()=>prepare(broker,'extra',{...args,expectedVersion:2,html:'<script>'} as any));
 const pending=prepare(broker,'revoke',{...args,expectedVersion:2});const pa=approve(broker,pending);host.allowWrite=false;assert.equal((await broker.execute(owner,pending,'reveal-local-v1',pa.binding.approvalId)).status,'denied');host.allowWrite=true;
 const cancelled=prepare(broker,'cancel',{...args,expectedVersion:2});const ca=approve(broker,cancelled);const controller=new AbortController();controller.abort();assert.equal((await broker.execute(owner,cancelled,'reveal-local-v1',ca.binding.approvalId,controller.signal)).status,'denied');assert.equal(host.snapshot(owner).version,2);
 const lost=new ToolBroker(host,{loseWriteResponse:true});const lp=prepare(lost,'lost',{...args,text:'Recovered title',expectedVersion:2});const la=approve(lost,lp);assert.equal((await lost.execute(owner,lp,'reveal-local-v1',la.binding.approvalId)).status,'outcome-unknown');assert.equal(host.snapshot(owner).version,3);const reconciled=lost.reconcile(owner,lp);assert.equal(reconciled.status,'succeeded');assert.equal(host.snapshot(owner).version,3);
 assert.throws(()=>host.write(owner,{...lp.request,arguments:{...lp.request.arguments,text:'Conflicting replay'}}));host.close();host=new DeckHost({database,indexPath:join(candidateRoot,'index.html'),allowWrite:true});assert.equal(host.snapshot(owner).version,3);assert.deepEqual(host.query(owner,lp.request.operationId,lp.request),reconciled);assert.deepEqual(host.write(owner,lp.request),reconciled);assert.equal(host.snapshot(owner).version,3);host.close();host=undefined;return{status:'pass',modelMode:'no model: direct internal caller tests',runtime:'shared AE ToolBroker and approval ledger',assertions:revealRuntimeAssertions,finalVersion:3,durableWrites:2};
 }finally{try{host?.close()}catch{}if(previous===undefined)delete process.env.AE_ROOT;else process.env.AE_ROOT=previous}
}
