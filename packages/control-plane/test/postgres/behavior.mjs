// Disposable loopback database only. Subprocesses prove selection publication survives process restart.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PostgresControlPlane} from '../../../../dist/packages/control-plane/src/postgres.js';
import {ticketCapabilities,syntheticTitleCatalog,projectTicketBehavior} from '@ae/capabilities';
const url=process.argv[2],action=process.argv[3];
const target=new URL(url);if(target.hostname!=='127.0.0.1'||target.pathname!=='/ae_control_qualification'||target.password)throw Error('Disposable control qualification database required');
const p={tenantId:'behavior-fixture',applicationId:'app',subjectId:'admin',roles:['agentic:admin'],scopes:[]};
const selection=enabled=>({baselineHash:syntheticTitleCatalog.baselineHash,candidateCodeHash:syntheticTitleCatalog.candidateCodeHash,registryHash:syntheticTitleCatalog.registryHash,enabled:enabled?[{id:'synthetic-ticket-title-trim',version:'1'}]:[]});
const config=enabled=>({name:'Synthetic behavior',instructions:'Synthetic test only',capabilityIds:['read_ticket'],bounds:{maxTurns:4,maxElapsedMs:10000},behavior:selection(enabled)});
if(action){
 const control=new PostgresControlPlane(url,ticketCapabilities,p=>p,syntheticTitleCatalog);
 try{await control.initialize();if(action==='on'||action==='off'){const draft=await control.save(p,config(action==='on'));console.log(JSON.stringify(await control.publish(p,draft.draftId,draft.revision)));}else console.log(JSON.stringify(await control.state(p)));}finally{await control.close();}
}else{
 const run=promisify(execFile),child=async action=>JSON.parse((await run(process.execPath,[process.argv[1],url,action])).stdout);
 const off=await child('off'),on=await child('on'),state=await child('state');
 assert.equal(state.activeReleaseId,on.releaseId);assert.equal(state.releases.length,2);assert.deepEqual(state.releases.find(r=>r.releaseId===off.releaseId).configuration.behavior.enabled,[]);assert.equal(on.publishedBy,'admin');assert.deepEqual(state.behaviorCatalog,syntheticTitleCatalog);
 const ticket={id:'x',tenantId:'behavior-fixture',title:'  Title  ',priority:'low',version:1};assert.equal(projectTicketBehavior(ticket,off.configuration.behavior).title,'  Title  ');assert.equal(projectTicketBehavior(ticket,on.configuration.behavior).title,'Title');
 const control=new PostgresControlPlane(url,ticketCapabilities,p=>p,syntheticTitleCatalog);
 try{await assert.rejects(control.save(p,{...config(true),behavior:{...selection(true),registryHash:'0'.repeat(64)}}),/BEHAVIOR_VERSION_DENIED/);await assert.rejects(control.save({...p,roles:[]},config(true)),/ADMIN_DENIED/);const state=await control.state({...p,roles:[]});assert.equal(state.behaviorCatalog,undefined);assert.deepEqual(state.releases,[]);}finally{await control.close();}
 const disabled=await child('off');assert.equal(disabled.configuration.behavior.enabled.length,0);assert.equal((await child('state')).releases.length,3);assert.equal(projectTicketBehavior(ticket,on.configuration.behavior).title,'Title');
 console.log('PASS: behavior OFF/ON/OFF immutable PG releases, process restart, exact registry binding, admin boundary, history retained and pinned old selection unchanged.');
}
