import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openSync, readSync, closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBaseline, improvementRegistryHash, verifyArchive } from '@ae/verification';
import type { ProjectAssessment, PreApplyBaseline, Observation, Provenance, VerificationReport } from '@ae/contracts';
import { helpdeskRecipe } from './recipes/react-helpdesk.js';
import { assertFixtureBaseline } from './fixture-baseline.js';

export const fixtureProfile = 'react-helpdesk-synthetic-v1';
export const trustedFixtureHashes: Readonly<Record<string, string>> = Object.freeze({
  'README.md':'d659ceb220f70413840db1176bba751a2ab2d065a9d45aab156f9a947cc6e19d',
  'index.html':'ff2e85ae4437145924971f70a7cd2716280df4434f79f27bb4de519b7cd6d5e6',
  'package.json':'58f3284f06f481a5e65acbe394222ff80a9b4cffd5d1d0359550c1183c841948',
  'vite.config.ts':'063b280b03e58e4e1d8445ef2c7f7a79939f86a0a7c5fa008021fc163d8df18d',
  'src/App.tsx':'c139c713ac1ba6562e53230d202816c4478160425e6e3cc8859e1a3bf6a218e7',
  'src/api.ts':'e99d2f76f300bffedae382dc27ba9655dbbc13609ea4b2c5e611765e2b932fa7',
  'src/main.tsx':'d4ed766ef457a435f4d2727fe6b62dd63896eb46473280d70c051a0eae4098af',
  'src/tickets.ts':'3ba60408f7d00a120290cdaa70fccadb5bf8027309e8ce13c7f9e8616cd1c946',
});
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const treeHash = (files: Record<string,string>): string => hash(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))));
export function matchesTrustedFixtureAssessment(assessment: ProjectAssessment): boolean {
  return assessment.evidence.length === helpdeskRecipe.inputs.length && helpdeskRecipe.inputs.every(path => assessment.evidence.find(e=>e.path===path)?.sha256===trustedFixtureHashes[path]);
}
function inspect(root: string): Record<string,string> {
  if (realpathSync(root)!==resolve(root)) throw Error('Fixture root must not traverse symlinks');
  const files: Record<string,string> = {};const allowed=new Set([...Object.keys(trustedFixtureHashes),...helpdeskRecipe.outputs]);let visited=0;
  const walk=(relative:string):void=>{ for(const name of readdirSync(join(root,relative)).sort()) {
    if(!relative && name==='.git') continue;
    const path=relative?relative+'/'+name:name;if(++visited>32||(!allowed.has(path)&&![...allowed].some(p=>p.startsWith(path+'/'))))throw Error('Full source/candidate contains an unapproved path: '+path);const stat=lstatSync(join(root,path));
    if(stat.isSymbolicLink()) throw Error('Fixture symlink denied: '+path);
    if(stat.isDirectory()){if(allowed.has(path))throw Error('Expected fixture file: '+path);walk(path);}
    else if(stat.isFile() && stat.size<=256*1024) files[path]=hash(readFileSync(join(root,path)));
    else throw Error('Fixture nonregular or oversized input: '+path);
  }}; walk(''); return files;
}
export function assertTrustedFixtureDelivery(input: {sourceRoot:string;candidateRoot:string}) {
  const sourceFiles=inspect(input.sourceRoot);
  if(treeHash(sourceFiles)!==treeHash({...trustedFixtureHashes})) throw Error('Full source is not the committed synthetic fixture');
  const expected={...sourceFiles};
  for(const change of helpdeskRecipe.preview(path=>existsSync(join(input.sourceRoot,path))?readFileSync(join(input.sourceRoot,path),'utf8'):null)) expected[change.path]=hash(change.after);
  const candidateFiles=inspect(input.candidateRoot);
  if(treeHash(candidateFiles)!==treeHash(expected)) throw Error('Candidate is not the exact trusted recipe output');
  return {sourceFiles,candidateFiles,sourceTreeHash:treeHash(sourceFiles),candidateTreeHash:treeHash(candidateFiles)};
}
export const fixtureAuthorization = Object.freeze({version:'1',profile:fixtureProfile,actions:['baseline-differential','host-build','runtime-http','browser'],isolation:'exact-fixture-temporary-worktree',network:'loopback-only-no-external',maximumCostUsd:0,maximumElapsedMs:300000,maximumHeapMiB:640});
export function assertFixtureAuthorization(value:unknown):void {const object=value as Record<string,unknown>;if(!object||Object.keys(object).length!==Object.keys(fixtureAuthorization).length||Object.entries(fixtureAuthorization).some(([k,v])=>JSON.stringify(object[k])!==JSON.stringify(v)))throw Error('Explicit fixed fixture verification authorization required');}
export interface FixtureDeliveryInput {sourceRoot:string;candidateRoot:string;outputDirectory:string;verificationAuthorization:unknown;authorizationExpiresAt:string;preApplyBaseline?:PreApplyBaseline;aeRoot?:string;browserExecutable?:string;}
export interface FixtureDeliveryEvidence {report:unknown;baseline:unknown;differential:unknown;originalBuild:unknown;candidateBuild:unknown;runtime:unknown;browser:unknown;}
export const fixtureBrowserPath='/tmp/ae-browser-qualification/root/usr/lib/chromium/chromium-headless-shell';
export const fixtureBrowserHash='a41388e75895fdca589b1ad9c3e5edae482dc382c0ee90553c44b1a61cded80f';
export function hashFixtureBrowser(path:string):string {const fd=openSync(path,'r');const sum=createHash('sha256'),buffer=Buffer.alloc(64*1024);try{let count:number;while((count=readSync(fd,buffer,0,buffer.length,null))>0)sum.update(buffer.subarray(0,count));return sum.digest('hex');}finally{closeSync(fd);}}
export function assertFixtureBrowser(path:string):void {if(realpathSync(path)!==fixtureBrowserPath||hashFixtureBrowser(path)!==fixtureBrowserHash)throw Error('Only the explicitly qualified pinned Chromium binary is permitted');}
export interface FixtureDeliveryResult {status:'pass'|'fail';reportPath:string;artifacts:Record<string,string>;checks:VerificationReport['checks'];}
export interface FixtureProcessOutcome { started: boolean; exitCode: number | null; signal: string | null; timedOut: boolean; groupClosed: boolean; forcedCleanup: boolean; }
export function finalizeFixtureProcessReport(report: {checks: VerificationReport['checks']; cleanup?: {status?: string}; [key: string]: unknown}, outcome: FixtureProcessOutcome) {
  const successful = outcome.started && outcome.exitCode === 0 && outcome.signal === null && !outcome.timedOut && outcome.groupClosed && !outcome.forcedCleanup && report.cleanup?.status === 'complete';
  const terminal: VerificationReport['checks'][number] = {name:'fixture-process-completion',status:!outcome.started?'not-run':successful?'pass':'fail',expected:'Zero exit without timeout or signal after all owned services and browser close',actual:!outcome.started?'Harness was not started':successful?'Harness exited zero after confirmed cleanup':`Harness did not finish cleanly: exit=${outcome.exitCode}; signal=${outcome.signal}; timeout=${outcome.timedOut}; groupClosed=${outcome.groupClosed}; forcedCleanup=${outcome.forcedCleanup}; cleanup=${report.cleanup?.status ?? 'unconfirmed'}`,evidence:[]};
  const checks = [...report.checks.filter(check=>check.name!=='fixture-process-completion'), terminal];
  return {...report, process:outcome, checks, status:checks.every(check=>check.status==='pass')?'pass':'fail'};
}
const names = {report:'report.json',baseline:'baseline.json',differential:'differential.json',originalBuild:'original-build.json',candidateBuild:'candidate-build.json',runtime:'runtime.json',browser:'browser.json'};
function currentRoot():string {let root=dirname(fileURLToPath(import.meta.url));for(let i=0;i<7;i++,root=dirname(root))if(existsSync(join(root,'tests/browser/delivery.mjs'))&&existsSync(join(root,'package.json')))return root;throw Error('Trusted AE checkout unavailable');}
/** Fixed synthetic harness only; never accepts commands, scripts, observations or a caller-provided PASS. */
export async function runFixtureDelivery(input:FixtureDeliveryInput):Promise<FixtureDeliveryResult> {
  assertFixtureAuthorization(input.verificationAuthorization);
  const deadlineAt=Math.min(input.preApplyBaseline ? Date.parse(input.preApplyBaseline.verificationStartedAt)+300000 : Date.now()+300000,Date.parse(input.authorizationExpiresAt));
  const remaining=deadlineAt-Date.now();if(!Number.isFinite(remaining)||Date.parse(input.authorizationExpiresAt)<=Date.now())throw Error('Fixture verification authorization expired');
  const trust=assertTrustedFixtureDelivery(input);
  const aeRoot=realpathSync(input.aeRoot??currentRoot()), outputDirectory=resolve(input.outputDirectory);
  if(aeRoot!==realpathSync(currentRoot()))throw Error('AE tool root override denied');
  if(existsSync(outputDirectory) && readdirSync(outputDirectory).length) throw Error('Evidence directory must be empty');
  if(outputDirectory===resolve(input.sourceRoot)||outputDirectory.startsWith(resolve(input.sourceRoot)+'/')||outputDirectory===resolve(input.candidateRoot)||outputDirectory.startsWith(resolve(input.candidateRoot)+'/'))throw Error('Evidence must not modify fixture trees');
  mkdirSync(outputDirectory,{recursive:true,mode:0o700});
  if(realpathSync(outputDirectory)!==outputDirectory)throw Error('Evidence directory symlink denied');
  const work=mkdtempSync(join(tmpdir(),'ae-delivery-'));
  const browserExecutable=input.browserExecutable??process.env.AE_BROWSER_EXECUTABLE??fixtureBrowserPath;
  const blocked=(reason:string,attempted=false,observed?:FixtureProcessOutcome):FixtureDeliveryResult=>{const checks:VerificationReport['checks']=['host-typecheck','host-business-tests','black-box-business-differential','authenticated-runtime','browser-acceptance'].map(name=>({name,status:attempted&&name==='host-business-tests'?'fail':'not-run',expected:'Observed fixed synthetic fixture acceptance',actual:reason,evidence:[]}));const report=finalizeFixtureProcessReport({profile:fixtureProfile,status:'fail',trust,checks,failure:reason},observed??{started:attempted,exitCode:null,signal:null,timedOut:false,groupClosed:!attempted,forcedCleanup:false});const artifacts=Object.fromEntries(Object.entries(names).map(([name,file])=>{const path=join(outputDirectory,file);writeFileSync(path,JSON.stringify(name==='report'?report:null)+'\n');return [name,path];}));return {status:'fail',reportPath:artifacts.report!,artifacts,checks:report.checks};};
  if(remaining<=0)return blocked('The approved 300-second verification budget was exhausted after pre-apply capture; no execution started');
  try{assertFixtureBrowser(browserExecutable);}catch(error){return blocked(String(error));}
  if(!input.preApplyBaseline)throw Error('Execution requires the archived pre-apply baseline');
  await assertFixtureBaseline(input.preApplyBaseline.archive,{sourceRoot:input.sourceRoot,sourceVersion:input.preApplyBaseline.baseCommit});
  const executionMs=Math.min(293000,deadlineAt-Date.now()-7000);
  if(executionMs<=0)return blocked('Insufficient authorized time for execution and owned-process cleanup');
  const args={...input,aeRoot,outputDirectory:work,browserExecutable:realpathSync(browserExecutable)};
  const environment={PATH:'/usr/bin:/bin',HOME:work,TMPDIR:work,LANG:'C.UTF-8',NODE_OPTIONS:'--max-old-space-size=640'};
  const log:string[]=[];
  let spawnFailure:string|undefined;
  const outcome: FixtureProcessOutcome = {started:false,exitCode:null,signal:null,timedOut:false,groupClosed:false,forcedCleanup:false};
  let pid: number | undefined;
  let escalation: Promise<void> | undefined;
  await new Promise<void>(done=>{
    const child=spawn(process.execPath,['--max-old-space-size=640',join(aeRoot,'tests/browser/delivery.mjs'),JSON.stringify(args)],{cwd:aeRoot,env:environment,detached:true,stdio:['ignore','pipe','pipe']});
    pid=child.pid;
    child.once('spawn',()=>{outcome.started=true;});
    const timer=setTimeout(()=>{outcome.timedOut=true;try{process.kill(-child.pid!,'SIGTERM');}catch{};escalation=new Promise(resolve=>setTimeout(()=>{try{process.kill(-child.pid!,'SIGKILL');}catch{}resolve();},1500));},executionMs);
    const capture=(chunk:Buffer)=>{if(log.join('').length<1024*1024)log.push(chunk.toString());};child.stdout.on('data',capture);child.stderr.on('data',capture);
    child.once('error',error=>{clearTimeout(timer);spawnFailure=String(error);done();});child.once('close',(code,signal)=>{clearTimeout(timer);outcome.exitCode=code;outcome.signal=signal;done();});
  });
  if(escalation)await escalation;
  const groupAlive=()=>{if(!pid)return false;try{process.kill(-pid,0);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;throw error;}};
  if(groupAlive()){outcome.forcedCleanup=true;try{process.kill(-pid!,'SIGKILL');}catch{}for(let i=0;i<100&&Date.now()<deadlineAt&&groupAlive();i++)await new Promise(resolve=>setTimeout(resolve,50));}
  outcome.groupClosed=!groupAlive();
  writeFileSync(join(work,'execution.log'),log.join(''));
  if(spawnFailure)return blocked('Harness could not start: '+spawnFailure,false,outcome);
  if(!existsSync(join(work,'report.json')))return blocked('Fixture harness stopped without a report; diagnostic work directory: '+work,true,outcome);
  const artifacts=Object.fromEntries(Object.entries(names).map(([name,file])=>{const src=join(work,file),path=join(outputDirectory,file);if(existsSync(src)){if(lstatSync(src).size>1024*1024)throw Error('Oversized fixture artifact');writeFileSync(path,readFileSync(src));}else writeFileSync(path,'null\n');return [name,path];}));
  const report=finalizeFixtureProcessReport(JSON.parse(readFileSync(artifacts.report!,'utf8')),outcome);
  writeFileSync(artifacts.report!,JSON.stringify(report,null,2)+'\n');
  return {status:report.status==='pass'?'pass':'fail',reportPath:artifacts.report!,artifacts,checks:report.checks};
}
/** Offline integrity/semantic validation, NOT a signature or proof of execution authenticity. */
export async function checkFixtureDeliveryEvidence(input:FixtureDeliveryEvidence):Promise<void> {
  const record=(v:unknown):Record<string,any>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid fixture evidence');return v as Record<string,any>;};
  const report=record(input.report);
  if(report.profile!==fixtureProfile||!['pass','fail'].includes(report.status))throw Error('Invalid fixture profile result');
  const required=['host-typecheck','host-business-tests','black-box-business-differential','authenticated-runtime','browser-acceptance','fixture-process-completion'];
  if(!Array.isArray(report.checks)||report.checks.length!==required.length||new Set(report.checks.map((c:{name:string})=>c.name)).size!==required.length||required.some(name=>!report.checks.some((c:{name:string;status:string})=>c.name===name&&['pass','fail','not-run'].includes(c.status))))throw Error('Invalid gate set');
  const process=record(report.process);
  if(typeof process.started!=='boolean'||typeof process.timedOut!=='boolean'||typeof process.groupClosed!=='boolean'||typeof process.forcedCleanup!=='boolean'||!(process.exitCode===null||Number.isInteger(process.exitCode))||!(process.signal===null||typeof process.signal==='string'))throw Error('Invalid process terminal evidence');
  const terminal=finalizeFixtureProcessReport(report as {checks:VerificationReport['checks']},process as unknown as FixtureProcessOutcome).checks.at(-1);
  if(JSON.stringify(report.checks.find((check:{name:string})=>check.name==='fixture-process-completion'))!==JSON.stringify(terminal))throw Error('Process completion claim mismatch');
  const passed=(name:string)=>report.checks.find((c:{name:string})=>c.name===name).status==='pass';
  if((report.status==='pass')!==required.every(passed))throw Error('Overall status does not follow gates');
  if(treeHash(report.trust.sourceFiles)!==treeHash({...trustedFixtureHashes})||treeHash(report.trust.sourceFiles)!==report.trust.sourceTreeHash||treeHash(report.trust.candidateFiles)!==report.trust.candidateTreeHash)throw Error('Fixture trust hash mismatch');
  const expectedCandidate={...trustedFixtureHashes};const knownRoot=join(currentRoot(),'fixtures/existing-react-helpdesk');
  if(treeHash(inspect(knownRoot))!==treeHash({...trustedFixtureHashes}))throw Error('Installed fixture drift');
  for(const change of helpdeskRecipe.preview(path=>existsSync(join(knownRoot,path))?readFileSync(join(knownRoot,path),'utf8'):null))expectedCandidate[change.path]=hash(change.after);
  if(treeHash(report.trust.candidateFiles)!==treeHash(expectedCandidate))throw Error('Candidate recipe hash mismatch');
  if(required.some(passed)){
    const provenance=record(report.provenance),root=currentRoot();
    if(provenance.runnerHash!==hash(readFileSync(join(root,'tests/browser/delivery.mjs')))||provenance.lockfileHash!==hash(readFileSync(join(root,'package-lock.json')))||provenance.browserHash!==fixtureBrowserHash)throw Error('Toolchain provenance drift');
    for(const path of fixtureToolFiles)if(provenance.toolFiles?.[path]!==hash(readFileSync(join(root,path))))throw Error('AE module provenance drift: '+path);
  }
  if(passed('host-business-tests')||passed('black-box-business-differential')){
  const baseline=verifyArchive(input.baseline), differential=record(input.differential);
  if(baseline.manifest.provenance.sourceVersion!==report.provenance.sourceVersion||differential.candidate.sourceVersion!==report.provenance.sourceVersion)throw Error('Source commit binding mismatch');
  if(baseline.manifest.provenance.codeHash!==report.trust.sourceTreeHash||differential.candidate.codeHash!==report.trust.candidateTreeHash)throw Error('Behavior source binding mismatch');
  const ticket={id:'ticket-1',tenantId:'tenant-a',title:'Printer offline',priority:'low',version:1};
  const changed={...ticket,priority:'high',version:2};
  const cases=['read','cross-tenant','write','stale-write'];
  if(JSON.stringify(baseline.manifest.cases.map(c=>c.test.id))!==JSON.stringify(cases)||baseline.manifest.normalization.length)throw Error('Fixed case set changed');
  for(const c of baseline.manifest.cases){const expectedTest={id:c.test.id,input:{operation:c.test.id},seed:{fixture:'committed-ticket-seed-v1'},covers:[c.test.id]};const expectedObservation={output:c.test.id==='read'?ticket:c.test.id==='write'?changed:{error:c.test.id==='cross-tenant'?'Not found':'Conflict or not found'},sideEffects:c.test.id==='write'?[changed]:[],receipt:{beforeVersion:1,afterVersion:c.test.id==='write'?2:1}};if(JSON.stringify(c.test)!==JSON.stringify(expectedTest)||JSON.stringify(c.observation)!==JSON.stringify(expectedObservation))throw Error('Baseline does not match fixed fixture semantics');}
  const recomputed=await compareBaseline({baseline,adapter:{safety:'isolated-seeded-fixture',async execute(c){const found=differential.cases.find((x:{id:string})=>x.id===c.id);if(!found)throw Error('Missing observation');return found.observation as Observation;}},provenance:differential.candidate as Provenance,configuration:{baselineHash:baseline.hash,candidateCodeHash:report.trust.candidateTreeHash,registryHash:improvementRegistryHash([]),enabled:[]},improvements:[]});
  if(JSON.stringify(recomputed)!==JSON.stringify(differential)||!recomputed.passed)throw Error('Differential claims do not match observations');
  }
  if(passed('host-typecheck')){const builds=[record(input.originalBuild),record(input.candidateBuild)];if(builds[0]!.sourceTreeHash!==report.trust.sourceTreeHash||builds[1]!.sourceTreeHash!==report.trust.candidateTreeHash)throw Error('Build source mismatch');
  for(const build of builds)if(build.exitCode!==0||build.typecheckExitCode!==0||!build.files?.length||build.files.some((f:{sha256:string})=>! /^[a-f0-9]{64}$/.test(f.sha256)))throw Error('Host build/typecheck did not pass');}
  if(passed('authenticated-runtime')){const runtime=record(input.runtime);
  if(runtime.unauthenticated.status!==401||runtime.crossTenant.status!==404||runtime.denied.status!==403||runtime.before.version!==1||runtime.before.priority!=='low'||runtime.awaitingMutationCount!==0||runtime.approved.status!=='succeeded'||runtime.after.version!==2||runtime.after.priority!=='high'||runtime.mutationCount!==1||!runtime.approved.receipts.some((r:{status:string;data?:{version:number}})=>r.status==='succeeded'&&r.data?.version===2))throw Error('Runtime observations do not prove the fixed journey');}
  if(passed('browser-acceptance')){const browser=record(input.browser);
  if(browser.errors.length||browser.externalRequests.length||browser.sandbox!==true||browser.original.version!=='1'||browser.original.priority!=='low'||browser.candidateBefore.version!=='1'||browser.candidateAfter.version!=='2'||browser.candidateAfter.priority!=='high'||JSON.stringify(browser.checks)!==JSON.stringify(fixtureBrowserChecks))throw Error('Browser observations incomplete');
  }
}

export const fixtureBrowserChecks = ["original page and Refresh ticket work with collapsed overlay", "real pointer drag does not open; app-scoped position restores on reload", "keyboard move/open/Escape/launcher focus recovery", "same approval survives close and host management; explicit confirmation changes original host once via onRunChange", "360px resize clamps launcher and conversation without horizontal page overflow", "touchscreen drag does not open; subsequent tap opens and closes"];

export const fixtureToolFiles=['packages/transformation/dist/fixture-baseline.js','packages/transformation/dist/pre-apply.js','packages/transformation/dist/fixture-harness.js','packages/transformation/dist/recipes/react-helpdesk.js','packages/verification/dist/index.js','packages/runtime-core/dist/index.js','packages/capabilities/dist/index.js','dist/apps/api/src/app.js','packages/ui/src/index.ts','packages/host-sdk/src/index.ts'];
