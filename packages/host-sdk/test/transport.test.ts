import test from 'node:test';
import assert from 'node:assert/strict';
import { createAeClient } from '../src/index.js';
test('transport strips untrusted identity fields and retains operation key across uncertain retry',async()=>{const requests:RequestInit[]=[];let failures=1;const client=createAeClient({apiBase:'/api',fetch:async(_url,init)=>{requests.push(init!);if(failures-->0)throw new Error('connection lost');return new Response(JSON.stringify({runId:'r',status:'queued',events:[],receipts:[]}))}});const context={ticketId:'ticket-1',tenantId:'evil',roles:['admin']};await assert.rejects(()=>client.start('读取',context));await client.start('读取',context);assert.deepEqual(JSON.parse(requests[0]!.body as string),{input:'读取',context:{ticketId:'ticket-1'}});assert.equal((requests[0]!.headers as Record<string,string>)['Idempotency-Key'],(requests[1]!.headers as Record<string,string>)['Idempotency-Key']);await client.start('读取',context);assert.notEqual((requests[1]!.headers as Record<string,string>)['Idempotency-Key'],(requests[2]!.headers as Record<string,string>)['Idempotency-Key'])});
test('HTTP errors preserve server explanation',async()=>{const client=createAeClient({apiBase:'/api',fetch:async()=>new Response(JSON.stringify({error:{code:'DENIED',message:'权限不足'}}),{status:403})});await assert.rejects(()=>client.meta(),/权限不足/)});
test('conversation transport uses explicit caller nonces, validates history, and carries no browser principal',async()=>{const requests:Array<{url:string;init:RequestInit}>=[];const history={conversationId:`conversation-${'a'.repeat(64)}`,context:{documentRef:'d'},createdAt:'2026-10-25T00:00:00.000Z',expiresAt:'2026-10-26T00:00:00.000Z',messages:[],runs:[{runId:'r',releaseId:'release',status:'queued',clientIntentId:'turn-key',materialized:false}],activeRunId:'r'};const client=createAeClient({apiBase:'/api',fetch:async(url,init)=>{requests.push({url:String(url),init:init!});return new Response(JSON.stringify(String(url).endsWith('/runs')?{runId:'r',status:'queued',events:[],receipts:[]}:history))}});await client.conversations!.create({documentRef:'d'},'create-key');const fetched=await client.conversations!.get(history.conversationId);await client.conversations!.start(history.conversationId,'text','turn-key');assert.equal(fetched.runs[0]!.clientIntentId,'turn-key');assert.equal(fetched.runs[0]!.materialized,false);assert.deepEqual(JSON.parse(requests[0]!.init.body as string),{context:{documentRef:'d'}});assert.deepEqual(JSON.parse(requests[2]!.init.body as string),{input:'text'});assert.equal((requests[0]!.init.headers as Record<string,string>)['Idempotency-Key'],'create-key');assert.equal((requests[2]!.init.headers as Record<string,string>)['Idempotency-Key'],'turn-key');assert.equal(requests[1]!.init.method,'GET');assert(requests.every(request=>request.init.credentials==='same-origin'))});
test('conversation transport rejects extra approval or principal fields instead of hydrating untrusted authority',async()=>{const client=createAeClient({apiBase:'/api',fetch:async()=>new Response(JSON.stringify({conversationId:'c',context:{},createdAt:'2026-10-25T00:00:00.000Z',expiresAt:'2026-10-26T00:00:00.000Z',messages:[],runs:[],approval:{expectedHash:'forged'}}))});await assert.rejects(()=>client.conversations!.get('c'))});

test('generic reference transport preserves inventory domain and stable uncertain retry across key order',async()=>{
 const requests:RequestInit[]=[];let failed=false;
 const client=createAeClient({apiBase:'/api',fetch:async(_url,init)=>{requests.push(init!);if(!failed){failed=true;throw Error('lost response')}return new Response(JSON.stringify({runId:'inventory-run',status:'queued',events:[],receipts:[]}))}});
 await assert.rejects(()=>client.start('Inspect stock',{sku:'desk-01',warehouseRef:'warehouse-a'}));
 await client.start('Inspect stock',{warehouseRef:'warehouse-a',sku:'desk-01'});
 assert.deepEqual(JSON.parse(requests[0]!.body as string),{input:'Inspect stock',context:{sku:'desk-01',warehouseRef:'warehouse-a'}});
 assert.equal((requests[0]!.headers as Record<string,string>)['Idempotency-Key'],(requests[1]!.headers as Record<string,string>)['Idempotency-Key']);
 assert.doesNotMatch(String(requests[0]!.body),/ticket/);
});
test('generic reference context rejects content, secrets and oversized objects before transport',async()=>{
 let calls=0;const client=createAeClient({apiBase:'/api',fetch:async()=>{calls++;throw Error('must not transport')}});
 for(const context of [{sku:'a',description:'Business contents are not references'}, {sku:'a',apiKey:'secret'}, {sku:'a',record:{quantity:3}}, {sku:'a'.repeat(201)},Object.fromEntries(Array.from({length:17},(_,i)=>[`ref${i}`,'a']))]){
  await assert.rejects(()=>client.start('read',context as never),/reference|context/);
  await assert.rejects(()=>client.conversations!.create(context as never,'create'),/reference|context/);
 }
 assert.equal(calls,0);
});
test('generic context never propagates browser identity claims',async()=>{
 const bodies:unknown[]=[];const client=createAeClient({apiBase:'/api',fetch:async(_url,init)=>{bodies.push(JSON.parse(init!.body as string));return new Response(JSON.stringify({runId:'r',status:'queued',events:[],receipts:[]}))}});
 await client.start('read',{sku:'desk-01',tenantId:'evil',subjectId:'evil',applicationId:'evil',roles:['admin'],scopes:['inventory:reserve']} as never);
 assert.deepEqual(bodies,[{input:'read',context:{sku:'desk-01'}}]);
});
