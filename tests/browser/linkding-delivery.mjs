// Reviewed fixed upstream Linkding collector. Never executes arbitrary script names.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
const flags=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2?a:[...a,[v,all[i+1]]],[]));
assert.deepEqual(Object.keys(flags).sort(),['--deadline','--output','--phase','--python','--source']);
const root=resolve(flags['--source']),python=resolve(flags['--python']),phase=flags['--phase'],out=resolve(flags['--output']),deadline=Number(flags['--deadline']);
assert.ok(['baseline','candidate'].includes(phase));assert.ok(deadline>Date.now());mkdirSync(out,{recursive:true});
const ae=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const work=mkdtempSync(join(tmpdir(),'ae-linkding-browser-'));
const assertions=[];let browser,server,serverExit,serverSignal,closed=false;
const seconds=()=>{assert.ok(Date.now()<deadline,'Collector deadline');return Math.min(30000,deadline-Date.now())};
// The test database is wholly synthetic; disabling URLs here is not a host permission change.
const settings=`from bookmarks.settings.dev import *\nDATABASES['default']['NAME']=${JSON.stringify(join(work,'db.sqlite3'))}\nPASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']\nSTATICFILES_DIRS=[${JSON.stringify(join(root,'bookmarks/styles'))}]\n`;
writeFileSync(join(work,'ae_qualification_settings.py'),settings);
const env={...process.env,PYTHONPATH:[work,root].join(':'),DJANGO_SETTINGS_MODULE:'ae_qualification_settings',AE_ROOT:ae,AE_PYTHON:python};
const py=(code)=>{const r=spawnSync(python,['-B','-c',code],{cwd:root,env,encoding:'utf8',timeout:seconds(),maxBuffer:1024*1024});assert.equal(r.status,0,r.stderr);assert.equal(r.signal,null);return r.stdout.trim()};
const model=()=>JSON.parse(py("import django,json;django.setup();from bookmarks.models import Bookmark;print(json.dumps([{'id':b.pk,'title':b.title,'tags':list(b.tags.values_list('name',flat=True))} for b in Bookmark.objects.order_by('pk')]))"));
const startServer=async()=>{const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));server=spawn(python,['-B','manage.py','runserver',`127.0.0.1:${port}`,'--noreload'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let log='';server.stdout.on('data',v=>log+=v);server.stderr.on('data',v=>log+=v);server.on('exit',(code,signal)=>{serverExit=code;serverSignal=signal;writeFileSync(join(out,'server.log'),log)});const origin=`http://127.0.0.1:${port}`;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(log);try{if((await fetch(origin+'/login')).ok)return origin}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server not ready')};
try{
 py("import django;django.setup();from django.core.management import call_command;call_command('migrate',interactive=False,verbosity=0)");
 py("import django;django.setup();from django.contrib.auth import get_user_model;from bookmarks.models import Bookmark;from django.utils import timezone;U=get_user_model();a=U.objects.create_user('ae_demo',password='qualification-only',is_staff=True,is_superuser=True);b=U.objects.create_user('ae_foreign',password='qualification-only');[(Bookmark.objects.create(owner=u,url=url,title=t,description=d,date_added=timezone.now(),date_modified=timezone.now())) for u,url,t,d in [(a,'https://example.invalid/django','Django documentation','Official framework reference'),(a,'https://example.invalid/python','Python language','Language resources'),(b,'https://example.invalid/private','Foreign private bookmark','Must not leak')]]");
 const origin=await startServer();
 browser=await chromium.launch({executablePath:'/tmp/ae-browser-qualification/root/usr/lib/chromium/chromium-headless-shell',chromiumSandbox:true,args:['--disable-dev-shm-usage','--disable-gpu']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(15000);
 // Deny any accidental external request, including upstream favicon fetches.
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.goto(origin+'/login');await page.locator('[name=username]').fill('ae_demo');await page.locator('[name=password]').fill('qualification-only');await page.locator('input[type=submit]').click();await page.waitForURL('**/bookmarks');
 const titles=(await page.locator('ul.bookmark-list .title > a').allTextContents()).map(t=>t.trim()).sort();assert.deepEqual(titles,['Django documentation','Python language']);
 const listText=await page.locator('ul.bookmark-list').innerText();assert.match(listText,/Django documentation/);assert.match(listText,/Python language/);assert.doesNotMatch(listText,/Foreign private/);
 await page.goto(origin+'/bookmarks?q=Django');const searchText=await page.locator('ul.bookmark-list').innerText();assert.match(searchText,/Django documentation/);assert.doesNotMatch(searchText,/Python language|Foreign private/);
 const searchTitles=(await page.locator('ul.bookmark-list .title > a').allTextContents()).map(t=>t.trim()).sort();assert.deepEqual(searchTitles,['Django documentation']);const business={authenticated:true,titles,searchTitles,foreignVisible:listText.includes('Foreign private')};assertions.push('original-session-login','own-bookmark-list','host-search-query','foreign-bookmark-invisible');
 await page.goto(origin+'/bookmarks');await page.screenshot({path:join(out,phase==='baseline'?'before.png':'after-collapsed.png'),fullPage:true});
 let runtime;
 if(phase==='candidate'){
  const api=async data=>page.evaluate(async data=>{const token=document.querySelector('#ae-assistant [name=csrfmiddlewaretoken]').value;const r=await fetch('/agentic/api',{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':token},body:JSON.stringify(data)});return {status:r.status,body:await r.json()}},data);
  await page.getByRole('button',{name:'Open Agentic assistant',exact:true}).click();await page.getByRole('dialog',{name:'Agentic bookmark assistant'}).waitFor();
  await page.locator('#ae-input').fill('search:Django');await page.locator('#ae-form button').click();await page.locator('#ae-output').getByText(/Status: succeeded/).waitFor();assert.match(await page.locator('#ae-output').innerText(),/Django documentation/);assert.doesNotMatch(await page.locator('#ae-output').innerText(),/Foreign private/);assertions.push('shared-runtime-search');
  await page.locator('#ae-input').fill('tag:1:reading');await page.locator('#ae-form button').click();await page.getByRole('button',{name:'Confirm tag update'}).waitFor();assert.deepEqual(model()[0].tags,[]);await page.screenshot({path:join(out,'after-approval.png'),fullPage:true});
  const pending=(await api({action:'list'})).body.result.find(r=>r.status==='awaiting-approval');assert.ok(pending.approval.expectedHash);const decision={approvalId:pending.approval.binding.approvalId,expectedHash:pending.approval.expectedHash,decision:'approve'};
  let dropped=false;await page.route('**/agentic/api',async route=>{const body=route.request().postDataJSON();if(!dropped&&body.action==='decide'){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.getByRole('button',{name:'Confirm tag update'}).click();await page.locator('#ae-output').getByText(/No automatic retry/).waitFor();await page.unroute('**/agentic/api');assert.equal(dropped,true);assert.deepEqual(model()[0].tags,['reading']);const confirmed=(await api({action:'get',runId:pending.runId})).body.result;assert.equal(confirmed.status,'succeeded');assertions.push('no-write-before-approval','shared-runtime-approved-host-write','lost-http-response-recovered-without-redispatch');
  const repeated=await api({action:'decide',runId:pending.runId,decision});assert.equal(repeated.status,409);assert.deepEqual(model()[0].tags,['reading']);assertions.push('repeated-confirm-no-extra-effect');
  const denied=await api({action:'start',input:'tag:3:forbidden'});assert.ok(denied.status===409||['failed','rejected'].includes(denied.body.result?.status));assert.deepEqual(model()[2].tags,[]);assertions.push('foreign-user-runtime-denied');
  const stale=(await api({action:'start',input:'tag:1:stale'})).body.result;assert.equal(stale.status,'awaiting-approval');py("import django;django.setup();from bookmarks.models import Bookmark;b=Bookmark.objects.get(pk=1);b.title='Django documentation changed';b.save()");const staleResult=await api({action:'decide',runId:stale.runId,decision:{approvalId:stale.approval.binding.approvalId,expectedHash:stale.approval.expectedHash,decision:'approve'}});assert.ok(staleResult.status===409||['failed','rejected'].includes(staleResult.body.result?.status));assert.deepEqual(model()[0].tags,['reading']);assertions.push('stale-version-denied');
  const cancel=(await api({action:'start',input:'tag:2:cancelled'})).body.result;assert.equal(cancel.status,'awaiting-approval');assert.equal((await api({action:'cancel',runId:cancel.runId})).body.result.status,'cancelled');assert.deepEqual(model()[1].tags,[]);assertions.push('cancel-no-effect');
  const revoked=(await api({action:'start',input:'tag:2:revoked'})).body.result;assert.equal(revoked.status,'awaiting-approval');py("import django;django.setup();from ae_linkding.models import AgenticConfig;AgenticConfig.objects.update_or_create(pk=1,defaults={'enabled':False})");try{const result=await api({action:'decide',runId:revoked.runId,decision:{approvalId:revoked.approval.binding.approvalId,expectedHash:revoked.approval.expectedHash,decision:'approve'}});assert.ok([403,409].includes(result.status));assert.deepEqual(model()[1].tags,[]);}finally{py("import django;django.setup();from ae_linkding.models import AgenticConfig;AgenticConfig.objects.filter(pk=1).update(enabled=True)");}assertions.push('current-host-revocation-denied');
  // Lose the caller's attention, not the host response: refresh then inspect same live run/receipt.
  await page.reload();const recovered=(await api({action:'get',runId:pending.runId})).body.result;assert.equal(recovered.status,'succeeded');assert.equal(recovered.receipts.filter(r=>r.status==='succeeded').length,2);assert.deepEqual(model()[0].tags,['reading']);assertions.push('refresh-receipt-recovery-no-redispatch');
  await page.getByRole('button',{name:'Open Agentic assistant',exact:true}).click();await page.screenshot({path:join(out,'after.png'),fullPage:true});
  const ball=page.locator('#ae-launcher'),before=await ball.boundingBox();await page.mouse.move(before.x+28,before.y+28);await page.mouse.down();await page.mouse.move(before.x-80,before.y-60,{steps:8});await page.mouse.up();const after=await ball.boundingBox();assert.ok(after.x<before.x-40);assertions.push('draggable-launcher');
  await page.getByRole('button',{name:'Close assistant'}).click();assert.equal(await ball.evaluate(el=>el===document.activeElement),true);assertions.push('close-focus-restored');
  await page.setViewportSize({width:360,height:760});await ball.click();const panel=await page.locator('#ae-panel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=360);assertions.push('narrow-viewport-contained');await page.screenshot({path:join(out,'after-narrow.png'),fullPage:true});
  await page.goto(origin+'/settings/agentic');await page.getByRole('heading',{name:'Agentic settings',exact:true}).waitFor();assertions.push('host-admin-entry');
  runtime={engine:'AE GovernedRuntime + ToolBroker',provider:'deterministic-demo',persistence:'in-memory-fixture',hostReceipts:JSON.parse(py("import django,json;django.setup();from ae_linkding.models import OperationReceipt;print(json.dumps({'count':OperationReceipt.objects.count()}))")),repeatStatus:repeated.status,staleDenied:true};assert.equal(runtime.hostReceipts.count,1);
 }
 await browser.close();closed=true;browser=undefined;
 server.kill('SIGINT');await new Promise(r=>server.once('exit',r));assert.equal(serverExit,0);assert.equal(serverSignal,null);
 const imageNames=phase==='baseline'?['before.png']:['after-collapsed.png','after-approval.png','after.png','after-narrow.png'];const screenshots=Object.fromEntries(imageNames.map(name=>{const bytes=readFileSync(join(out,name));return [name,{base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}]}));
 const result={phase,business,assertions,screenshots,cleanup:{serverStopped:true,browserClosed:true},...(runtime?{runtime}:{})};writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result)+'\n');
}finally{
 if(browser)await browser.close();if(server&&server.exitCode===null){server.kill('SIGINT');await new Promise(r=>server.once('exit',r));}rmSync(work,{recursive:true,force:true});
}
