import { PostgresControlPlane } from '../../../../dist/packages/control-plane/src/postgres.js';
import { ticketCapabilities } from '@ae/capabilities';
const [url,action,data]=process.argv.slice(2);
const admin={tenantId:'tenant-a',applicationId:'app',subjectId:'admin',roles:['agentic:admin'],scopes:[]};
const store=new PostgresControlPlane(url,ticketCapabilities);
try {
  if(action==='save'){await store.initialize();const draft=await store.save(admin,{name:'Persistent assistant',instructions:'Use selected host capabilities only.',capabilityIds:['read_ticket'],bounds:{maxTurns:4,maxElapsedMs:10000}});console.log(JSON.stringify(draft));}
  else if(action==='publish'){const draft=JSON.parse(data);console.log(JSON.stringify(await store.publish(admin,draft.draftId,draft.revision)));}
  else if(action==='state')console.log(JSON.stringify(await store.state(admin)));
}finally{await store.close();}
