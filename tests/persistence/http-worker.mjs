import { createInterface } from 'node:readline';
import { serve } from '@hono/node-server';
import { createPersistentApi } from '../../dist/apps/api/src/persistent.js';
import { ticketCapabilities } from '@ae/capabilities';
import { SyntheticDurableHost, createModel, validateDatabaseUrl } from './host.mjs';
const [databaseUrl,portString,principalJson,faultPoint='']=process.argv.slice(2);validateDatabaseUrl(databaseUrl);
const port=Number(portString),origin=`http://127.0.0.1:${port}`;
const emit=value=>process.stdout.write(`AE_HTTP ${JSON.stringify(value)}\n`);
const host=new SyntheticDurableHost(databaseUrl);
if(faultPoint==='unknown-write'){const write=host.write.bind(host);host.write=async(...args)=>{await write(...args);throw new Error('Synthetic lost acknowledgement after commit');};}
let session=JSON.parse(principalJson);let current=session;
host.currentCapabilities=async p=>{const rows=(await host.pool.query('SELECT capability_id FROM qualification_http.disabled WHERE subject_id=$1',[p.subjectId])).rows;return ticketCapabilities.filter(c=>!rows.some(r=>r.capability_id===c.capabilityId));};
const base=createModel(host);const model={async complete(request,signal){await host.pool.query('INSERT INTO qualification_http.catalogs(run_id,tools) VALUES($1,$2)',[request.runId,JSON.stringify(request.tools.map(t=>t.name))]);const response=await base.complete(request,signal);return response.toolCalls.some(call=>!request.tools.some(t=>t.name===call.name))?{...response,toolCalls:[],finishReason:'stop',message:'Selected release permits reads only.'}:response;}};
const composed=await createPersistentApi({databaseUrl,host,capabilityCatalog:ticketCapabilities,model,resolvePrincipal:async()=>{current=await host.currentPrincipal(session);return current;},currentConfigurationPrincipal:p=>({...p,roles:current.subjectId===p.subjectId&&current.tenantId===p.tenantId&&current.applicationId===p.applicationId?current.roles:[]}),applicationName:'Synthetic generic software',apiOrigin:origin,allowedOrigin:origin,fault:async point=>{if(point===faultPoint){emit({event:'fault',point});await new Promise(()=>{});}}});
void composed.startupRecovery.then(report=>emit({event:'startup-recovery',report}));
const server=serve({fetch:composed.app.fetch,hostname:'127.0.0.1',port},()=>emit({event:'ready',origin,pid:process.pid}));
const input=createInterface({input:process.stdin});input.on('line',async line=>{const command=JSON.parse(line);try{if(command.method==='session'){session=command.principal;emit({event:'response',id:command.id});}else if(command.method==='shutdown'){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await composed.close();await host.close();emit({event:'response',id:command.id});input.close();}else throw new Error('Unsupported fixture command');}catch(error){emit({event:'response',id:command.id,error:String(error)});}});
