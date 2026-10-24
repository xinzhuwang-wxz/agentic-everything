import {Agent,Runner,MemorySession,tool,RunState,Usage} from '@openai/agents';
import assert from 'node:assert/strict';
const requests=[];let mode='first',writes=0;
const model={async getResponse(request){requests.push(structuredClone(request.input));return {usage:new Usage(),output:mode==='write'?[{type:'function_call',name:'write',callId:'stable-call',arguments:'{}'}]:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:mode==='first'?'remembered synthetic fact':'second saw history'}]}]};}};
const agent=new Agent({name:'synthetic',model,tools:[tool({name:'write',description:'synthetic write',parameters:{type:'object',properties:{},additionalProperties:false,required:[]},needsApproval:true,execute:()=>{writes++;mode='second';return 'written';}})]});
const runner=new Runner({tracingDisabled:true});const session=new MemorySession({sessionId:'c'});
await runner.run(agent,'first user',{session});
const saved=await session.getItems();assert.equal(saved.length,2);
const rehydrated=new MemorySession({sessionId:'c',initialItems:saved});mode='second';await runner.run(agent,'second user',{session:rehydrated});assert.equal(requests[1].length,3);assert.equal(writes,0);
mode='write';const pending=await runner.run(agent,'please write',{session:rehydrated});assert.equal(pending.interruptions.length,1);
const state=await RunState.fromString(agent,pending.state.toString());state.approve(state.getInterruptions()[0]);
// Session projection intentionally survives only through authoritative AE text, not pending tool history.
const resumed=new MemorySession({sessionId:'c',initialItems:saved});
try{const result=await runner.run(agent,state,{session:resumed});console.log('resumed with session',result.finalOutput,writes);}catch(e){console.log('resume failed',String(e));throw e;}
console.log(JSON.stringify({sdk:'0.21.0',twoTurnHistory:true,rehydration:true,approvedWrites:writes,requests:requests.length}));
