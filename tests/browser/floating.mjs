// Local synthetic fixture only. No paid models, credentials, external hosts or production data.
// Requires existing compiled packages, Playwright Core and an explicitly qualified sandboxed Chromium.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { serve } from '@hono/node-server';
const root=resolve('.'),runtimeRoot=resolve(process.env.AE_BROWSER_RUNTIME_ROOT??root);
const load=p=>import(pathToFileURL(join(runtimeRoot,p)).href);
const {GovernedRuntime}=await load('packages/runtime-core/dist/index.js');
const {AuthorizedTicketHost,ToolBroker,ticketCapabilities}=await load('packages/capabilities/dist/index.js');
const {InMemoryControlPlane}=await load('packages/control-plane/dist/index.js');
const {createApi}=await load('dist/apps/api/src/app.js');
const {readTicket,changePriority}=await load('dist/fixtures/existing-react-helpdesk/src/tickets.js');
const work=mkdtempSync(join(tmpdir(),'ae-floating-browser-')),source=join(work,'original'),destination=join(work,'adapted');
cpSync(join(root,'fixtures/existing-react-helpdesk'),source,{recursive:true});
const git=(...args)=>execFileSync('git',['-C',source,...args],{stdio:'pipe'});
git('init');git('config','user.name','AE fixture');git('config','user.email','fixture@example.invalid');git('add','.');git('commit','-m','Synthetic original host');
execFileSync(process.execPath,['--input-type=module','-e',`import { assessProject, proposePlan, approvePlan, applyApprovedPlan } from './packages/transformation/dist/index.js';
const sourceRoot=${JSON.stringify(source)},destination=${JSON.stringify(destination)};
const assessment=assessProject(sourceRoot),plan=proposePlan(assessment),approval=approvePlan(plan,{approverId:'fixture-test',authorizationRef:'user-approved-local-synthetic-tests'});
applyApprovedPlan({sourceRoot,destination,assessment,plan,approval});`],{cwd:root,stdio:'inherit'});
const evidence={work,runtimeRoot,model:'deterministic synthetic test model, not model quality or external-project acceptance',checks:[],errors:[]};
const turns=new Map();const model={async complete(request){const turn=(turns.get(request.runId)??0)+1;turns.set(request.runId,turn);const toolCalls=turn===1?[{callId:'read',name:'read_ticket',arguments:{ticketId:'ticket-1'}}]:turn===2?[{callId:'write',name:'change_ticket_priority',arguments:{ticketId:'ticket-1',priority:'high',expectedVersion:1}}]:[];return {schemaVersion:'1',requestId:request.requestId,mode:'simulated',message:toolCalls.length?'':'已核对服务端回执。',toolCalls,finishReason:toolCalls.length?'tool-calls':'stop'}}};
const broker=new ToolBroker(new AuthorizedTicketHost({readTicket,changePriority}));const runtime=new GovernedRuntime({broker,model,maxTurns:8});
const apiPort=4336,uiPort=5196;
const app=createApi({runtime,broker,controlPlane:new InMemoryControlPlane(ticketCapabilities),resolvePrincipal:()=>({tenantId:'tenant-a',applicationId:'helpdesk',subjectId:'fixture-editor',roles:['editor','agentic:admin'],scopes:['tickets:read','tickets:write']}),releaseId:'fixture-v1',applicationName:'Helpdesk',apiOrigin:`http://127.0.0.1:${apiPort}`,allowedOrigin:`http://127.0.0.1:${uiPort}`});
let server,vite,browser;
try{
 server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:apiPort});
 const alias=[{find:/^react\/jsx-dev-runtime$/,replacement:join(root,'node_modules/react/jsx-dev-runtime.js')},{find:/^react\/jsx-runtime$/,replacement:join(root,'node_modules/react/jsx-runtime.js')},{find:/^react$/,replacement:join(root,'node_modules/react/index.js')},{find:/^react-dom\/client$/,replacement:join(root,'node_modules/react-dom/client.js')},{find:/^react-dom$/,replacement:join(root,'node_modules/react-dom/index.js')},{find:'@ae/host-sdk',replacement:join(root,'packages/host-sdk/src/index.ts')},{find:'@ae/ui/styles.css',replacement:join(root,'packages/ui/src/styles.css')},{find:'@ae/ui',replacement:join(root,'packages/ui/src/index.ts')}];
 // Build in a short-lived process before starting Chromium to bound memory use.
 const aliasSource=alias.map(a=>`{find:${a.find instanceof RegExp?a.find.toString():JSON.stringify(a.find)},replacement:${JSON.stringify(a.replacement)}}`).join(',');
 execFileSync(process.execPath,['--input-type=module','-e',`import {build} from 'vite';await build({configFile:false,root:${JSON.stringify(destination)},logLevel:'error',resolve:{alias:[${aliasSource}]},build:{outDir:${JSON.stringify(join(work,'site'))}}});`],{cwd:root,stdio:'inherit'});
 vite=await preview({configFile:false,root:destination,build:{outDir:join(work,'site')},preview:{host:'127.0.0.1',port:uiPort,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${apiPort}`,changeOrigin:true}}}});
 if(!process.env.AE_BROWSER_EXECUTABLE)throw Error('AE_BROWSER_EXECUTABLE must identify qualified Chromium');
 browser=await chromium.launch({executablePath:process.env.AE_BROWSER_EXECUTABLE,headless:true,chromiumSandbox:true});
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${uiPort}`);await page.getByTestId('host-priority').filter({hasText:'low'}).waitFor();
 const ball=page.locator('.ae-floating-launcher'),dialog=page.getByRole('dialog',{name:'业务助手对话'});
 assert.equal(await dialog.count(),0);await page.getByRole('button',{name:'Refresh ticket',exact:true}).click();assert.equal(await page.getByTestId('host-version').innerText(),'1');evidence.checks.push('original page and Refresh ticket work with collapsed overlay');
 await page.screenshot({path:join(work,'host-collapsed.png'),fullPage:true});
 const original=await ball.boundingBox();await page.mouse.move(original.x+28,original.y+28);await page.mouse.down();await page.mouse.move(900,650,{steps:8});await page.mouse.up();assert.equal(await dialog.count(),0);const moved=await ball.boundingBox();assert.ok(moved.x<original.x-100);await page.reload();await ball.waitFor();assert.equal(Math.round((await ball.boundingBox()).x),Math.round(moved.x));evidence.checks.push('real pointer drag does not open; app-scoped position restores on reload');
 await ball.focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');await dialog.waitFor();assert.equal(await page.getByRole('button',{name:'收起业务助手'}).evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await ball.evaluate(e=>e===document.activeElement),true);evidence.checks.push('keyboard move/open/Escape/launcher focus recovery');
 await ball.click();await dialog.getByRole('button',{name:'预览优先级调整'}).click();await dialog.getByRole('button',{name:'发送',exact:true}).click();await dialog.getByRole('button',{name:'确认并执行',exact:true}).waitFor();assert.equal(readTicket('tenant-a','ticket-1').version,1);await page.screenshot({path:join(work,'approval.png'),fullPage:true});
 await page.getByRole('button',{name:'收起业务助手'}).click();await page.getByRole('button',{name:'Agentic settings & activity'}).click();await page.getByRole('tab',{name:'执行记录'}).click();await page.getByRole('tab',{name:'配置与发布'}).click();await page.getByText('保存草稿',{exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'助手',exact:true}).count(),0);await page.screenshot({path:join(work,'host-management.png'),fullPage:true});await page.getByRole('button',{name:'Agentic settings & activity'}).click();
 await ball.click();await dialog.getByRole('button',{name:'确认并执行',exact:true}).click();await page.getByTestId('host-priority').filter({hasText:'high'}).waitFor();assert.equal(await page.getByTestId('host-version').innerText(),'2');assert.equal(readTicket('tenant-a','ticket-1').version,2);assert.equal(await dialog.getByRole('button',{name:'确认并执行',exact:true}).count(),0);evidence.checks.push('same approval survives close and host management; explicit confirmation changes original host once via onRunChange');
 await page.setViewportSize({width:360,height:640});await page.waitForTimeout(100);const box=await ball.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=360&&box.y>=0&&box.y+box.height<=640);const panel=await dialog.boundingBox();assert.ok(box.x+box.width<=panel.x||box.x>=panel.x+panel.width||box.y+box.height<=panel.y||box.y>=panel.y+panel.height,'launcher never covers conversation controls');assert.ok(panel.x>=0&&panel.x+panel.width<=360&&panel.y+panel.height<=640);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(work,'narrow-open.png'),fullPage:true});evidence.checks.push('360px resize clamps launcher and conversation without horizontal page overflow');
 await page.getByRole('button',{name:'收起业务助手'}).click();const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const touch=await touchContext.newPage();await touch.goto(`http://127.0.0.1:${uiPort}`);await touch.evaluate(()=>{window.touchEvents=[];for(const name of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','click'])document.addEventListener(name,e=>window.touchEvents.push({type:e.type,pointerType:e.pointerType,button:e.button,x:e.clientX,y:e.clientY,target:e.target.className}),true)});const touchBall=touch.locator('.ae-floating-launcher');await touchBall.waitFor();const touchBox=await touchBall.boundingBox();const cdp=await touchContext.newCDPSession(touch);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchBox.x+28,y:touchBox.y+28}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchBox.x-50,y:touchBox.y-50}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await touch.getByRole('dialog').count(),0);assert.ok((await touchBall.boundingBox()).x<touchBox.x);await touchBall.tap();evidence.touchEvents=await touch.evaluate(()=>window.touchEvents);await touch.getByRole('dialog',{name:'业务助手对话'}).waitFor();await touch.getByRole('button',{name:'收起业务助手'}).tap();assert.equal(await touch.getByRole('dialog').count(),0);await touchContext.close();evidence.checks.push('touchscreen drag does not open; subsequent tap opens and closes');
 assert.deepEqual(evidence.errors,[]);evidence.completed=new Date().toISOString();
}catch(error){evidence.failure=String(error);process.exitCode=1;console.error(error)}finally{writeFileSync(join(work,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));await browser?.close();if(vite)await new Promise(r=>vite.httpServer.close(r));if(server)await new Promise(r=>server.close(r));}
