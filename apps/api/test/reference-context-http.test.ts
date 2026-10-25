import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import type { ConversationView, JsonObject, Principal } from '@ae/contracts';
import { createInventoryUiFixture } from '../../../tests/support/inventory-ui.js';
import { createApi, type ApiOptions } from '../src/app.js';

test('actual generic HTTP starts the Python inventory through the existing governed runtime',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'ae-inventory-http-'));let app:Hono;
 const server=serve({hostname:'127.0.0.1',port:0,fetch:request=>app.fetch(request)});await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 t.after(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(directory,{recursive:true,force:true})});
 const fixture=createInventoryUiFixture({directory,apiOrigin:base,allowedOrigin:base});app=fixture.app;
 const post=(path:string,body:unknown,key='inventory-intent')=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
 await t.test('generic references reach the model without ticket adaptation; write waits for approval',async()=>{
  assert.equal((await fetch(base+'/api/tickets/desk-01')).status,404);
  assert.equal((await fetch(base+'/stock')).status,200);
  assert.deepEqual((await(await fetch(base+'/api/capabilities')).json()).capabilities.map((item:{capabilityId:string})=>item.capabilityId).sort(),['read_stock','reserve_stock']);
  const responses=await Promise.all([post('/api/runs',{input:'Reserve 3 desks for order-ui',context:{sku:'desk-01'}}),post('/api/runs',{input:'Reserve 3 desks for order-ui',context:{sku:'desk-01'}})]);
  const [first,second]=await Promise.all(responses.map(response=>response.json()));
  assert.equal(first.runId,second.runId);assert.equal(first.status,'awaiting-approval');assert.equal(first.approval.binding.targetId,'desk-01');assert.equal(first.approval.binding.capabilityId,'reserve_stock');assert.equal(fixture.stock().available,12);assert.equal(fixture.host.mutationDispatchCount,0);
  assert.match(JSON.stringify(fixture.requests[0]!.messages),/sku.*desk-01/);assert.doesNotMatch(JSON.stringify(fixture.requests[0]!.messages),/ticketId/);
  const path=`/api/runs/${first.runId}/approval`,decision={approvalId:first.approval.binding.approvalId,decision:'approve',expectedHash:first.approval.expectedHash};
  assert.equal((await post(path,{...decision,expectedHash:'0'.repeat(64)})).status,409);assert.equal(fixture.host.mutationDispatchCount,0);
  const completed=await(await post(path,decision)).json();assert.equal(completed.status,'succeeded');assert.equal(fixture.stock().available,9);assert.equal(fixture.host.mutationDispatchCount,1);
  assert.equal((await post(path,decision)).status,409);assert.equal(fixture.host.mutationDispatchCount,1);
  fixture.setPrincipal({...fixture.owner,subjectId:'bob',roles:['viewer'],scopes:['inventory:read']});assert.equal((await fetch(base+`/api/runs/${first.runId}`)).status,404);fixture.setPrincipal(fixture.owner);
 });
 await t.test('reference envelope rejects identity, secrets and nested business payload before model dispatch',async()=>{
  const count=fixture.requests.length;
  for(const context of [{sku:'desk-01',tenantId:'tenant-b'},{sku:'desk-01',subjectId:'bob'},{sku:'desk-01',roles:['operator']},{record:{sku:'desk-01'}},{message:'business payload text'},{apiKey:'secret'}, {sku:'x'.repeat(201)},Object.fromEntries(Array.from({length:17},(_,i)=>[`ref${i}`,'a']))])assert.equal((await post('/api/runs',{input:'read',context},crypto.randomUUID())).status,400);
  assert.equal(fixture.requests.length,count);assert.equal(fixture.host.mutationDispatchCount,1);
 });
 await t.test('explicit authentication remains required after a generic host is mounted',async()=>{
  fixture.setPrincipal(undefined);assert.equal((await post('/api/runs',{input:'read',context:{sku:'desk-01'}},'no-principal')).status,401);assert.equal((await fetch(base+'/api/capabilities')).status,401);
 });
});

test('conversation HTTP admission uses the same bounded references, independent of the business domain',async()=>{
 const principal:Principal={tenantId:'tenant-a',applicationId:'documents',subjectId:'alice',roles:[],scopes:[]};let seen:JsonObject|undefined;
 const conversation:ConversationView={conversationId:'conversation-1',context:{documentRef:'document-1'},createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),messages:[],runs:[]};
 const runtime:ApiOptions['runtime']={start:async()=>{throw Error('unused')},get:async()=>{throw Error('unused')},decide:async()=>{throw Error('unused')},cancel:async()=>{throw Error('unused')}};
 const app=createApi({runtime,broker:{catalog:()=>[],host:{read(){throw Error('non-ticket read must not be called')}}},ticketReader:false,resolvePrincipal:()=>principal,releaseId:'release',applicationName:'Documents',apiOrigin:'http://127.0.0.1',allowedOrigin:'http://127.0.0.1',conversations:{create:async(_p,context)=>{seen=context;return conversation},get:async()=>conversation},startIntent:async()=>({runId:'r',status:'queued',events:[],receipts:[],persistence:'in-memory-fixture',modelMode:'configured-model-port'})});
 const post=(path:string,context:unknown)=>app.request('http://127.0.0.1'+path,{method:'POST',headers:{Origin:'http://127.0.0.1','Content-Type':'application/json','Idempotency-Key':'create'},body:JSON.stringify(path.endsWith('/runs')?{input:'read',context}:{context})});
 assert.equal((await post('/api/conversations',{documentRef:'document-1'})).status,201);assert.deepEqual(seen,{documentRef:'document-1'});
 for(const path of ['/api/conversations','/api/conversations/conversation-1/runs']){assert.equal((await post(path,{documentRef:'document-1',scopes:['admin']})).status,400);assert.equal((await post(path,{documentRef:'document-1',record:{text:'payload'}})).status,400)}
 assert.equal((await app.request('http://127.0.0.1/api/tickets/document-1')).status,404);
});
