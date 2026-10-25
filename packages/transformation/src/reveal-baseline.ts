import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {chromium,type Page} from 'playwright-core';
import {captureBaseline,verifyArchive} from '@ae/verification';
import type {BaselineArchive,Observation,ProjectAssessment,Provenance} from '@ae/contracts';
import {hash,treeHash} from './inventory-baseline.js';
import {fixtureBrowserPath,fixtureBrowserHash,assertFixtureBrowser} from './fixture-harness.js';
import {revealRecipe,revealHashes,revealPin} from './recipes/reveal.js';
import {revealUpstreamHashes} from './reveal-upstream.js';
export const revealProfile='reveal-upstream-v1' as const;
const git=(root:string,args:string[])=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',root,...args],{encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024}).trim();
export function matchesRevealAssessment(a:ProjectAssessment){return a.baseCommit===revealPin&&Object.entries(revealHashes).every(([p,h])=>a.evidence.find(e=>e.path===p)?.sha256===h)}
export function inspectReveal(root:string,candidate=false):Record<string,string>{
 if(realpathSync(root)!==resolve(root)||git(root,['rev-parse','HEAD'])!==revealPin)throw Error('Exact reveal.js upstream pin and non-symlink root required');
 if(git(root,['diff','--name-only','HEAD','--']))throw Error('Original tracked reveal.js source changed');
 if(git(root,['config','--list']).split('\n').some(l=>/^filter\./i.test(l)))throw Error('Git filters denied');
 const paths=git(root,['ls-tree','-r','--name-only','HEAD']).split('\n');const files:Record<string,string>={};
 for(const p of paths){const f=join(root,p),s=lstatSync(f);if(s.isSymbolicLink()||!s.isFile()||s.size>5*1024*1024||realpathSync(f)!==f)throw Error('Unsafe reveal source path');files[p]=hash(readFileSync(f))}
 assert.deepEqual(files,revealUpstreamHashes,'Full pinned upstream bytes differ');
 const untracked=git(root,['ls-files','--others','--exclude-standard']).split('\n').filter(Boolean);
 if(untracked.some(p=>!candidate||!revealRecipe.outputs.includes(p)))throw Error('Unapproved reveal untracked input');
 for(const c of revealRecipe.preview(()=>null)){const p=join(root,c.path);if(candidate){if(!existsSync(p)||realpathSync(p)!==p||readFileSync(p,'utf8')!==c.after)throw Error('Reveal candidate template drift');files[c.path]=hash(c.after)}else if(existsSync(p))throw Error('Original already adapted')}
 return files;
}
export function assertTrustedRevealDelivery(input:{sourceRoot:string;candidateRoot:string}){const sourceFiles=inspectReveal(input.sourceRoot),candidateFiles=inspectReveal(input.candidateRoot,true);return{sourceFiles,candidateFiles,sourceTreeHash:treeHash(sourceFiles),candidateTreeHash:treeHash(candidateFiles)}}
export function revealProvenance(sourceVersion:string,codeHash=treeHash(revealHashes)):Provenance{return{sourceVersion,codeHash,environment:'Pinned reveal.js 6.0.2 original browser distribution; loopback; sandboxed Chromium; no model',environmentHash:hash(JSON.stringify({browser:fixtureBrowserHash,node:process.versions.node})),dataHash:hash('original-index-two-slides'),schemaVersion:'1',adapterVersion:'trusted-reveal-delivery-v1'}}
export const revealCases=[{id:'keyboard-navigation',input:{actions:['initial','ArrowRight','ArrowLeft','Escape','Escape']},seed:{deck:'index'},covers:['original-render','keyboard-next','keyboard-previous','overview-open','overview-close']}];
export const revealCoverage={scope:'Pinned upstream two-slide index deck rendering, keyboard navigation and overview before adaptation. Durable edits are a new separately governed capability, not falsely compared with absent upstream writes.',unknowns:['Not the full upstream QUnit suite, arbitrary decks, multi-user authentication, production durability, real model inference, or durable AE runs. Full host tests are separately observed.']};
export async function revealObservation(page:Page):Promise<Observation>{
 await page.waitForFunction(()=>Boolean((window as any).Reveal?.isReady()));
 const states:unknown[]=[];for(const key of [null,'ArrowRight','ArrowLeft','Escape','Escape']){if(key){await page.keyboard.press(key);await page.waitForTimeout(350)}states.push(await page.evaluate(()=>{const r=(window as any).Reveal;return{horizontal:r.getIndices().h,vertical:r.getIndices().v,slides:r.getSlides().map((s:HTMLElement)=>s.textContent!.trim()),overview:r.isOverview()}}))}
 return{output:{states} as any,sideEffects:[],receipt:{durableWrites:0}};
}
export const expectedRevealObservation:Observation={output:{states:[{horizontal:0,vertical:0,slides:['Slide 1','Slide 2'],overview:false},{horizontal:1,vertical:0,slides:['Slide 1','Slide 2'],overview:false},{horizontal:0,vertical:0,slides:['Slide 1','Slide 2'],overview:false},{horizontal:0,vertical:0,slides:['Slide 1','Slide 2'],overview:true},{horizontal:0,vertical:0,slides:['Slide 1','Slide 2'],overview:false}]},sideEffects:[],receipt:{durableWrites:0}};
export async function openRevealBrowser(deadlineAt:number){assertFixtureBrowser(fixtureBrowserPath);if(deadlineAt<=Date.now())throw Error('Reveal deadline expired');return chromium.launch({executablePath:fixtureBrowserPath,chromiumSandbox:true,args:['--disable-dev-shm-usage','--disable-gpu','--renderer-process-limit=1'],timeout:Math.min(30000,deadlineAt-Date.now())})}
export async function originalRevealObservation(root:string,deadlineAt:number):Promise<Observation>{
 const files=inspectReveal(root);const server=createServer((req,res)=>{const p=new URL(req.url??'/','http://127.0.0.1').pathname;const rel=p==='/'?'index.html':p.slice(1);if(!(rel==='index.html'||rel.startsWith('dist/'))||!Object.hasOwn(files,rel)){res.writeHead(404);res.end();return}const f=join(root,rel);if(realpathSync(f)!==f||hash(readFileSync(f))!==files[rel]){res.writeHead(409);res.end();return}const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff':'font/woff','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':types[extname(f)]??'application/octet-stream'});res.end(readFileSync(f))});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('Missing loopback port');let browser;
 try{browser=await openRevealBrowser(deadlineAt);const page=await browser.newPage({viewport:{width:1365,height:900}});await page.route('**/*',r=>new URL(r.request().url()).origin===`http://127.0.0.1:${address.port}`?r.continue():r.abort());page.setDefaultTimeout(Math.max(1,Math.min(15000,deadlineAt-Date.now())));await page.goto(`http://127.0.0.1:${address.port}`);return await revealObservation(page)}finally{await browser?.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
}
export async function assertRevealBaseline(value:unknown,binding:{sourceRoot?:string;sourceVersion?:string}={}):Promise<BaselineArchive>{const a=verifyArchive(value);assert.equal(binding.sourceVersion??revealPin,revealPin);if(binding.sourceRoot)inspectReveal(binding.sourceRoot);assert.deepEqual(a.manifest.provenance,revealProvenance(revealPin));assert.deepEqual(a.manifest.coverage,revealCoverage);assert.deepEqual(a.manifest.normalization,[]);assert.equal(a.manifest.safety,'isolated-seeded-fixture');assert.equal(a.manifest.cases.length,1);assert.deepEqual(a.manifest.cases[0]!.test,revealCases[0]);assert.deepEqual(a.manifest.cases[0]!.observation,expectedRevealObservation);return a}
export async function captureRevealBaseline(input:{sourceRoot:string;deadlineAt?:number}):Promise<BaselineArchive>{inspectReveal(input.sourceRoot);const observation=await originalRevealObservation(input.sourceRoot,input.deadlineAt??Date.now()+60000);assert.deepEqual(observation,expectedRevealObservation);return assertRevealBaseline(await captureBaseline({adapter:{safety:'isolated-seeded-fixture',async execute(){return observation}},cases:revealCases,provenance:revealProvenance(revealPin),normalization:[],coverage:revealCoverage}),{sourceRoot:input.sourceRoot})}
