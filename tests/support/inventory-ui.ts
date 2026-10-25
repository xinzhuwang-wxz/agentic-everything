// Owned synthetic integration fixture only; no external identity, account, model or deployment.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ModelProvider, ModelRequest, Principal } from '@ae/contracts';
import { PythonInventoryHost, ToolBroker, inventoryCapabilities } from '@ae/capabilities';
import { GovernedRuntime } from '@ae/runtime-core';
import { InMemoryControlPlane } from '@ae/control-plane';
import { inventoryRecipe } from '../../packages/transformation/src/recipes/python-inventory.js';
import { createApi } from '../../apps/api/src/app.js';

export function createInventoryUiFixture(options:{directory:string;apiOrigin:string;allowedOrigin:string;root?:string}) {
 const source=join(options.directory,'python-host');
 cpSync(join(options.root??resolve('.'),'fixtures/existing-python-inventory'),source,{recursive:true});
 mkdirSync(join(source,'agentic'));
 // Reuse the reviewed adapter bytes. This optional UI does not extend the headless recipe's claims.
 const adapter=inventoryRecipe.preview(()=>null)[0]!;writeFileSync(join(source,adapter.path),adapter.after);
 const owner:Principal={tenantId:'tenant-a',applicationId:'inventory-fixture',subjectId:'alice',roles:['operator','agentic:admin'],scopes:['inventory:read','inventory:reserve']};
 let principal:Principal|undefined=owner;
 const host=new PythonInventoryHost({adapterPath:join(source,adapter.path),databasePath:join(options.directory,'inventory.sqlite')});
 const broker=new ToolBroker(host),requests:ModelRequest[]=[];
 const stock=()=>host.readResult(owner,broker.prepare(owner,'host-page','read','read_stock',{sku:'desk-01'}).request);
 const turns=new Map<string,number>();
 const model:ModelProvider={async complete(request){
  requests.push(request);const turn=(turns.get(request.runId)??0)+1;turns.set(request.runId,turn);
  const reserve=request.messages.some(message=>message.role==='user'&&/reserve/i.test(message.content));
  const toolCalls=turn===1?[{callId:'read',name:'read_stock',arguments:{sku:'desk-01'}}]:turn===2&&reserve?[{callId:'reserve',name:'reserve_stock',arguments:{sku:'desk-01',orderId:'order-ui',quantity:3,expectedVersion:1}}]:[];
  return {schemaVersion:'1',requestId:request.requestId,mode:'simulated',message:toolCalls.length?'':reserve?'The Python host receipt confirms the reservation.':'The Python host returned the current stock.',toolCalls,finishReason:toolCalls.length?'tool-calls':'stop'};
 }};
 const runtime=new GovernedRuntime({broker,model});
 const app=createApi({runtime,broker,ticketReader:false,controlPlane:new InMemoryControlPlane(inventoryCapabilities),resolvePrincipal:()=>principal,releaseId:'inventory-ui-release',applicationName:'Inventory fixture',apiOrigin:options.apiOrigin,allowedOrigin:options.allowedOrigin});
 // Existing business page read, separate from the generic AE runtime endpoints.
 app.get('/stock',c=>{if(!principal)return c.json({error:'authentication required'},401);return c.body(JSON.stringify(host.readResult(principal,broker.prepare(principal,'host-page','read','read_stock',{sku:'desk-01'}).request)),200,{'Content-Type':'application/json'})});
 return {app,host,broker,runtime,requests,owner,stock,setPrincipal(value:Principal|undefined){principal=value}};
}
