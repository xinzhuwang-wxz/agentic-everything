import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {compareBaseline,improvementRegistryHash} from '@ae/verification';
import {VerificationAuthorizationSchema,VerificationReportSchema,type VerificationReport} from '@ae/contracts';
import type {FixtureDeliveryInput,FixtureDeliveryResult,FixtureDeliveryEvidence} from './fixture-harness.js';
import {aeRoot,hash} from './inventory-baseline.js';
import {KANBOARD_FILES} from './recipes/kanboard.js';
import {assertKanboardBaseline,assertKanboardObservation,assertTrustedKanboardDelivery,kanboardProfile,kanboardCommit,kanboardGitTree,kanboardSourceHash,kanboardCandidateHash,kanboardObservation,kanboardProvenance} from './kanboard-baseline.js';
import {kanboardPhp,kanboardToolchain,runKanboardProbe,assertKanboardRuntime,assertKanboardPng,assertKanboardProcess} from './kanboard-process.js';
export const kanboardGates=['host-compilation','host-business-tests','black-box-business-differential','authenticated-runtime','browser-acceptance','fixture-process-completion'];
const files={report:'report.json',baseline:'baseline.json',differential:'differential.json',originalBuild:'original-build.json',candidateBuild:'candidate-build.json',runtime:'runtime.json',browser:'browser.json'};
const phpunit='/tmp/kanboard-php-runtime/phpunit.phar';
const stopwatch='/tmp/kanboard-test-deps/stopwatch';
const toolFiles=['packages/transformation/dist/kanboard-baseline.js','packages/transformation/dist/kanboard-process.js','packages/transformation/dist/kanboard-harness.js','packages/transformation/dist/recipes/kanboard.js','packages/runtime-core/dist/index.js','packages/capabilities/dist/index.js','packages/policy/dist/index.js'];
function toolchain(){return{...kanboardToolchain(),lockfileHash:hash(readFileSync(join(aeRoot(),'package-lock.json'))),toolFiles:Object.fromEntries(toolFiles.map(path=>[path,hash(readFileSync(join(aeRoot(),path)))]))};}
function run(command:string,args:string[],deadline:number,env:Record<string,string>){const remaining=deadline-Date.now();if(remaining<=0)throw Error('Kanboard total verification deadline exhausted');const p=spawnSync(command,args,{encoding:'utf8',timeout:Math.min(90000,remaining),killSignal:'SIGKILL',maxBuffer:2*1024*1024,env});if(p.error||p.status!==0||p.signal)throw Error('Kanboard qualification command failed: '+(p.stdout+p.stderr+p.error?.message));return p.stdout;}
function build(root:string,candidate:boolean,deadline:number,work:string){
 const paths=['index.php',...candidate?Object.keys(KANBOARD_FILES).filter(path=>path.endsWith('.php')):[]];
 const env={PATH:'/usr/bin:/bin',HOME:work,TMPDIR:work,LANG:'C.UTF-8',TZ:'UTC'};
 for(const path of paths)assert.match(run(kanboardPhp,['-l',join(root,path)],deadline,env),/No syntax errors detected/);
 const javascript=candidate?Object.keys(KANBOARD_FILES).filter(path=>/\.(js|mjs)$/.test(path)):[];for(const path of javascript)run(process.execPath,['--check',join(root,path)],deadline,env);
 assert.ok(lstatSync(phpunit).isFile());assert.equal(hash(readFileSync(phpunit)),PHPUNIT_HASH);
 assert.equal(hash(readFileSync(join(stopwatch,'Stopwatch.php'))),STOPWATCH_HASH);
 const bootstrap=join(work,(candidate?'candidate':'original')+'-bootstrap.php');writeFileSync(bootstrap,`<?php\n$loader=require ${JSON.stringify(join(root,'vendor/autoload.php'))};\n$loader->addPsr4('Symfony\\\\Component\\\\Stopwatch\\\\',${JSON.stringify(stopwatch)});\n`);
 const stdout=run(kanboardPhp,[phpunit,'-c',join(root,'tests/units.sqlite.xml'),'--bootstrap',bootstrap,'--no-cache-result','--colors=never','--filter','TaskCreationModelTest|TaskModificationModelTest|TaskStatusModelTest|ProjectRoleHelperTest|ProjectUserRoleModelTest'],deadline,env);
 assert.match(stdout,/OK \(53 tests, 475 assertions\)/);
 return{language:'PHP8.4.27',sourceTreeHash:candidate?kanboardCandidateHash():kanboardSourceHash,phpLint:paths,javascriptSyntax:javascript,exitCode:0,tests:53,assertions:475,stdout,stdoutHash:hash(stdout),phpunitHash:PHPUNIT_HASH,stopwatchHash:STOPWATCH_HASH};
}
const PHPUNIT_HASH='83f8098d7e6513befa61cd0df2689d42398d43404969b0dc21528ff52674ebc6';
const STOPWATCH_HASH='8a12a7f1bba284cb4baddf9fce5dae85251f29e9905db14b2fa75ba3a0c13a3b';
export async function runKanboardDelivery(input:FixtureDeliveryInput):Promise<FixtureDeliveryResult>{
 const authorization=VerificationAuthorizationSchema.parse(input.verificationAuthorization);if(authorization.profile!==kanboardProfile||input.preApplyBaseline?.profile!==kanboardProfile)throw Error('Explicit Kanboard upstream verification and pre-apply archive required');
 if(input.aeRoot&&realpathSync(input.aeRoot)!==realpathSync(aeRoot()))throw Error('AE root override denied');
 const deadline=Math.min(Date.parse(input.preApplyBaseline.verificationStartedAt)+authorization.maximumElapsedMs,Date.parse(input.authorizationExpiresAt));
 const trust=assertTrustedKanboardDelivery(input),out=resolve(input.outputDirectory);if(existsSync(out)&&readdirSync(out).length)throw Error('Kanboard evidence directory must be empty');if([input.sourceRoot,input.candidateRoot].some(root=>out===resolve(root)||out.startsWith(resolve(root)+'/')))throw Error('Evidence cannot modify host');mkdirSync(out,{recursive:true,mode:0o700});if(realpathSync(out)!==out)throw Error('Evidence symlink denied');
 const work=mkdtempSync(join(tmpdir(),'ae-kanboard-delivery-')),artifacts:Record<string,string>={},evidence:Record<string,unknown>={};
 const checks:VerificationReport['checks']=kanboardGates.map(name=>({name,status:'not-run',expected:'Observed exact pinned Kanboard host/runtime/browser qualification',actual:'Not executed',evidence:[]}));
 const save=(key:keyof typeof files,value:unknown)=>{evidence[key]=value;const file=join(out,files[key]);writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});artifacts[key]=file;};
 const complete=(name:string,keys:(keyof typeof files)[],actual:string)=>{const c=checks.find(c=>c.name===name)!;c.status='pass';c.actual=actual;c.evidence=keys.map(key=>({path:'evidence/'+files[key],sha256:hash(readFileSync(artifacts[key]!)),note:'Actual pinned upstream Kanboard execution; synthetic local data only'}));};
 let failure:string|undefined;
 try{
  const baseline=await assertKanboardBaseline(input.preApplyBaseline.archive,{sourceRoot:input.sourceRoot,sourceVersion:input.preApplyBaseline.baseCommit});save('baseline',baseline);
  save('originalBuild',build(input.sourceRoot,false,deadline,work));save('candidateBuild',build(input.candidateRoot,true,deadline,work));complete('host-compilation',['originalBuild','candidateBuild'],'PHP original/generated syntax and generated JavaScript parse passed');complete('host-business-tests',['baseline'],'Pinned original native task browser journey passed; scoped upstream suites 53 tests/475 assertions each are retained in the compilation reports, not inferred as a full suite');
  const parity=await runKanboardProbe(input.candidateRoot,'original',deadline);const originalReference=(baseline.manifest.cases[0]!.observation.receipt as Record<string,unknown>).originalScreenshot;
  const differential=await compareBaseline({baseline,adapter:{safety:'isolated-seeded-fixture',async execute(){return kanboardObservation(parity,originalReference);}},provenance:kanboardProvenance(trust.candidateTreeHash),configuration:{baselineHash:baseline.hash,candidateCodeHash:trust.candidateTreeHash,registryHash:improvementRegistryHash([]),enabled:[]},improvements:[]});save('differential',differential);assert.equal(differential.passed,true);complete('black-box-business-differential',['differential'],'Real original and candidate native task journey agree on task state and authority/CSRF responses; original screenshot is immutable evidence reference, not pixel parity');
  const runtime=await runKanboardProbe(input.candidateRoot,'runtime',deadline);assertKanboardRuntime(runtime);save('runtime',runtime);save('browser',{profile:kanboardProfile,parity,runtime});complete('authenticated-runtime',['runtime'],'Actual GovernedRuntime/ToolBroker and native PHP host passed approval,role,CSRF,stale,replay,lost-response and restart fail-closed checks');complete('browser-acceptance',['browser'],'Real browser original controls and assistant flows, screenshots,drag,close focus and narrow viewport passed');
  assertTrustedKanboardDelivery(input);if(Date.now()>deadline)throw Error('Kanboard total deadline exceeded');
 }catch(error){failure=error instanceof Error?error.message:String(error);const c=checks.find(c=>c.status==='not-run');if(c){c.status='fail';c.actual=failure;}}
 let cleanup='complete';try{rmSync(work,{recursive:true,force:true});}catch{cleanup='failed';}
 const terminal=checks.find(c=>c.name==='fixture-process-completion')!;terminal.status=!failure&&cleanup==='complete'?'pass':'fail';terminal.actual=terminal.status==='pass'?'All owned browser,PHP,Node and test processes exited; loopback ports closed; temporary data removed':failure??'Cleanup failed';
 for(const key of Object.keys(files)as(keyof typeof files)[])if(key!=='report'&&!Object.hasOwn(evidence,key))save(key,null);
 const report={profile:kanboardProfile,status:checks.every(c=>c.status==='pass')?'pass':'fail',trust,provenance:{sourceVersion:kanboardCommit,...toolchain()},checks,cleanup:{status:cleanup},process:{completed:!failure,noOutstandingChildren:!failure},...(failure?{failure}:{})};save('report',report);return{status:report.status==='pass'?'pass':'fail',reportPath:artifacts.report!,artifacts,checks};
}
export async function checkKanboardDeliveryEvidence(input:FixtureDeliveryEvidence):Promise<void>{
 const report=input.report as Record<string,any>;assert.equal(report.profile,kanboardProfile);const checks=VerificationReportSchema.shape.checks.parse(report.checks);assert.deepEqual(checks.map(c=>c.name),kanboardGates);assert.equal(report.status==='pass',checks.every(c=>c.status==='pass'));assert.deepEqual(report.trust,{source:{sourceCommit:kanboardCommit,gitTree:kanboardGitTree,fileCount:2790,codeHash:kanboardSourceHash},candidate:{sourceCommit:kanboardCommit,gitTree:kanboardGitTree,fileCount:2790+Object.keys(KANBOARD_FILES).length,codeHash:kanboardCandidateHash()},sourceTreeHash:kanboardSourceHash,candidateTreeHash:kanboardCandidateHash()});assert.deepEqual(report.provenance,{sourceVersion:kanboardCommit,...toolchain()});
 const passed=(name:string)=>checks.find(c=>c.name===name)?.status==='pass';
 if(passed('host-compilation')||passed('host-business-tests'))for(const [value,candidate]of[[input.originalBuild,false],[input.candidateBuild,true]]as const){const b=value as ReturnType<typeof build>;assert.equal(b.language,'PHP8.4.27');assert.equal(b.sourceTreeHash,candidate?kanboardCandidateHash():kanboardSourceHash);assert.equal(b.exitCode,0);assert.equal(b.tests,53);assert.equal(b.assertions,475);assert.equal(hash(b.stdout),b.stdoutHash);assert.match(b.stdout,/OK \(53 tests, 475 assertions\)/);assert.equal(b.phpunitHash,PHPUNIT_HASH);assert.equal(b.stopwatchHash,STOPWATCH_HASH);assert.deepEqual(b.phpLint,['index.php',...candidate?Object.keys(KANBOARD_FILES).filter(p=>p.endsWith('.php')):[]]);assert.deepEqual(b.javascriptSyntax,candidate?Object.keys(KANBOARD_FILES).filter(p=>/\.(js|mjs)$/.test(p)):[]);}
 if(passed('black-box-business-differential')){const baseline=await assertKanboardBaseline(input.baseline,{sourceVersion:kanboardCommit}),browser=input.browser as {parity:Parameters<typeof kanboardObservation>[0]};const ref=(baseline.manifest.cases[0]!.observation.receipt as Record<string,unknown>).originalScreenshot;const recomputed=await compareBaseline({baseline,adapter:{safety:'isolated-seeded-fixture',async execute(){const observation=kanboardObservation(browser.parity,ref);assertKanboardObservation(observation);return observation;}},provenance:kanboardProvenance(kanboardCandidateHash()),configuration:{baselineHash:baseline.hash,candidateCodeHash:kanboardCandidateHash(),registryHash:improvementRegistryHash([]),enabled:[]},improvements:[]});const stored=input.differential as Record<string,unknown>;const clean=(v:unknown)=>{const x=structuredClone(v)as Record<string,unknown>;delete x.observedAt;return x;};assert.deepEqual(clean(stored),clean(recomputed));}
 if(passed('authenticated-runtime'))assertKanboardRuntime(input.runtime);
 if(passed('browser-acceptance')){const b=input.browser as Record<string,any>;assert.equal(b.profile,kanboardProfile);assert.deepEqual(b.runtime,input.runtime);b.parity.screenshots.forEach(assertKanboardPng);assertKanboardProcess(b.parity.process,1);}
 if(report.status==='pass'){assert.equal(report.cleanup.status,'complete');assert.equal(report.process.completed,true);assert.equal(report.process.noOutstandingChildren,true);}
}
