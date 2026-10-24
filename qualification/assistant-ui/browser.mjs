// Runs the frozen shipped floating journey with only @ae/ui entry overridden.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve('../..'),qualified=process.env.AE_QUALIFIED_ROOT;
if(!qualified)throw Error('AE_QUALIFIED_ROOT must point to the existing exact compiled AE runtime');
let script=readFileSync(root+'/tests/browser/floating.mjs','utf8');
script=script.replace("const root=resolve('.'),runtimeRoot=resolve(process.env.AE_BROWSER_RUNTIME_ROOT??root);",`const root=${JSON.stringify(qualified)},runtimeRoot=root;`);
if(process.env.AE_UI_VARIANT!=='baseline')script=script.replace("{find:'@ae/ui',replacement:join(root,'packages/ui/src/index.ts')}",`{find:'@ae/ui',replacement:${JSON.stringify(resolve('generated/index.ts'))}}`);
script=script.replace('const apiPort=4336,uiPort=5196;','const apiPort=4339,uiPort=5199;');
script=script.replaceAll('await browser.newContext(', 'await guardedContext(');
script=script.replace(' const context=await guardedContext(', ` const externalRequests=[];const guardedContext=async options=>{const ctx=await browser.newContext({...options,serviceWorkers:'block'});await ctx.routeWebSocket('**/*',socket=>{externalRequests.push(socket.url());socket.close()});await ctx.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==\`http://127.0.0.1:\${uiPort}\`){externalRequests.push(url.href);return route.abort()}return route.continue()});return ctx}; const context=await guardedContext(`);
script=script.replace("evidence.checks.push('same approval survives close and host management; explicit confirmation changes original host once via onRunChange');",`evidence.checks.push('same approval survives close and host management; explicit confirmation changes original host once via onRunChange');assert.deepEqual(externalRequests,[]);evidence.checks.push('no external runtime, model, image or telemetry request observed');`);
script=script.replace(' assert.deepEqual(evidence.errors,[]);', ' assert.deepEqual(externalRequests,[]);evidence.externalRequests=externalRequests;assert.deepEqual(evidence.errors,[]);');
writeFileSync('generated/index.ts',`export * from './panel.js';\nexport * from '../../../packages/ui/src/configuration.js';\nexport * from '../../../packages/ui/src/floating.js';\n`);
writeFileSync('generated/browser.mjs',script);
const result=spawnSync(process.execPath,['generated/browser.mjs'],{env:process.env,stdio:'inherit'});
process.exitCode=result.status??1;
