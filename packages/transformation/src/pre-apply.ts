import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdaptationPlanSchema, ApprovedChangeSetSchema, ProjectAssessmentSchema, ArchivedBaselineSchema, PreApplyBaselineSchema, type AdaptationPlan, type ApprovedChangeSet, type ArchivedBaseline, type ProjectAssessment } from '@ae/contracts';
import { applyApprovedPlan, canonical, digest, adaptationCodeHash, expectedBaselineCodeHash, previewPatch, type AppliedTransformation } from './index.js';
import { reviewedProfile, verificationExcludedActions, type VerificationProfile } from './profiles.js';

const prepared = new WeakSet<object>();
const byteHash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
function safe(path: string): string {
  const result=resolve(path);let current:string=sep;
  for(const segment of result.split(sep).filter(Boolean)){current=join(current,segment);try{if(lstatSync(current).isSymbolicLink())throw Error('Baseline path must not traverse symlinks');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  return result;
}
function toolRoot(): string {let root=dirname(fileURLToPath(import.meta.url));for(let i=0;i<7;i++,root=dirname(root)){try{if(lstatSync(join(root,'package-lock.json')).isFile()&&lstatSync(join(root,'fixtures/existing-react-helpdesk')).isDirectory())return root;}catch{}}throw Error('AE collector checkout unavailable');}
export function baselineCollector(profile: VerificationProfile = 'react-helpdesk-synthetic-v1') {const reviewed=reviewedProfile(profile);return {id:reviewed.collectorId,version:'1' as const,codeHash:byteHash(readFileSync(new URL(reviewed.collectorFile,import.meta.url))),lockfileHash:byteHash(readFileSync(join(toolRoot(),'package-lock.json')))};}
function binding(baseline: ArchivedBaseline, assessment: ProjectAssessment, plan: AdaptationPlan, approval: ApprovedChangeSet): void {
  const {record}=baseline;
  if(!plan.verificationAuthorization||canonical(approval.verificationAuthorization)!==canonical(plan.verificationAuthorization))throw Error('Explicit baseline capture profile authorization required');
  if(record.profile!==plan.verificationAuthorization.profile||record.assessmentHash!==digest(assessment)||record.planHash!==digest(plan)||record.approvalHash!==digest(approval)||record.projectId!==assessment.projectId||record.baseCommit!==plan.baseCommit||record.archive.manifest.provenance.sourceVersion!==plan.baseCommit)throw Error('Pre-apply baseline source/plan/approval binding mismatch');
  if(canonical(record.collector)!==canonical(baselineCollector(plan.verificationAuthorization.profile)))throw Error('Baseline collector/toolchain drift');
  const started=Date.parse(record.verificationStartedAt),captured=Date.parse(record.archive.manifest.capturedAt);
  if(started<Date.parse(approval.approvedAt)||captured<started||captured>Date.now())throw Error('Invalid baseline capture order');
}
function readArchive(baseline: ArchivedBaseline): void {
  const path=safe(baseline.path),stat=lstatSync(path);if(!stat.isFile()||stat.size>1024*1024)throw Error('Expected bounded archived baseline file');
  const bytes=readFileSync(path);if(byteHash(bytes)!==baseline.sha256||canonical(JSON.parse(bytes.toString('utf8')))!==canonical(baseline.record))throw Error('Archived baseline bytes drift');
}
/** Core write authorization is a one-use in-process receipt, never caller-supplied JSON. */
export function requirePreparedBaseline(value: unknown, assessment: ProjectAssessment, plan: AdaptationPlan, approval: ApprovedChangeSet, consume=false): ArchivedBaseline {
  if(!value||typeof value!=='object'||!prepared.has(value))throw Error('Profile apply requires a freshly captured and archived pre-apply baseline receipt');
  const baseline=ArchivedBaselineSchema.parse(value);binding(baseline,assessment,plan,approval);readArchive(baseline);
  if(consume)prepared.delete(value);return baseline;
}
export async function validateArchivedBaseline(value: unknown, assessment: ProjectAssessment, plan: AdaptationPlan, approval: ApprovedChangeSet, appliedAt: string, readOriginal=false): Promise<ArchivedBaseline> {
  const baseline=ArchivedBaselineSchema.parse(value);binding(baseline,assessment,plan,approval);
  if(Date.parse(baseline.record.archive.manifest.capturedAt)>Date.parse(appliedAt))throw Error('Baseline was not archived before apply');
  if(readOriginal)readArchive(baseline);
  await reviewedProfile(baseline.record.profile).assertBaseline(baseline.record.archive,{sourceVersion:plan.baseCommit});return baseline;
}
export async function applyApprovedPlanWithBaseline(input: {sourceRoot:string;destination:string;assessment:ProjectAssessment;plan:AdaptationPlan;approval:ApprovedChangeSet;baselinePath:string}): Promise<AppliedTransformation> {
  const assessment=ProjectAssessmentSchema.parse(input.assessment),plan=AdaptationPlanSchema.parse(input.plan),approval=ApprovedChangeSetSchema.parse(input.approval);
  if(!plan.verificationAuthorization||approval.planHash!==digest(plan)||approval.baseCommit!==plan.baseCommit||Date.parse(approval.expiresAt)<=Date.now()||Date.parse(approval.approvedAt)>Date.now())throw Error('Baseline capture requires current explicit approved profile');
  if(canonical(approval.verificationAuthorization)!==canonical(plan.verificationAuthorization)||canonical(approval.allowedPaths)!==canonical(plan.allowedPaths)||approval.allowedCommands.length||approval.networkAllowlist.length||approval.maximumCostUsd!==0||canonical(approval.excludedActions)!==canonical(verificationExcludedActions(plan.verificationAuthorization.profile)))throw Error('Baseline capture approval scope mismatch');
  if(assessment.projectId!=='project-'+byteHash(Buffer.from(realpathSync(input.sourceRoot))).slice(0,12))throw Error('Assessment source root mismatch');
  previewPatch(input.sourceRoot,plan,assessment);
  if(adaptationCodeHash(input.sourceRoot,assessment,plan)!==expectedBaselineCodeHash(assessment,plan))throw Error('Source drift before baseline capture');
  const path=safe(input.baselinePath),source=safe(input.sourceRoot),candidate=safe(input.destination);
  if(path===source||path.startsWith(source+sep)||path===candidate||path.startsWith(candidate+sep)||source.startsWith(path+sep)||candidate.startsWith(path+sep))throw Error('Baseline archive must be outside source and candidate');
  if(realpathSync(dirname(path))!==dirname(path))throw Error('Unsafe baseline archive parent');
  try{lstatSync(path);throw Error('Baseline archive already exists; never overwrite');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const verificationStartedAt=new Date().toISOString();
  const captureInput={sourceRoot:source,deadlineAt:Math.min(Date.parse(verificationStartedAt)+293000,Date.parse(approval.expiresAt))};
  const archive=await reviewedProfile(plan.verificationAuthorization.profile).capture(captureInput);
  const record=PreApplyBaselineSchema.parse({schemaVersion:'1',kind:'ae-pre-apply-baseline',profile:plan.verificationAuthorization.profile,projectId:assessment.projectId,baseCommit:plan.baseCommit,assessmentHash:digest(assessment),planHash:digest(plan),approvalHash:digest(approval),verificationStartedAt,collector:baselineCollector(plan.verificationAuthorization.profile),archive});
  if(Date.parse(approval.expiresAt)<=Date.now()||Date.now()-Date.parse(verificationStartedAt)>=293000)throw Error('Authorization or execution budget expired before baseline archive');
  const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');const fd=openSync(path,'wx',0o444);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  const baseline=ArchivedBaselineSchema.parse({path,sha256:byteHash(bytes),record});prepared.add(baseline);
  // Any subsequent apply failure leaves the immutable archive intact for diagnosis.
  try { return applyApprovedPlan({sourceRoot:source,destination:candidate,assessment,plan,approval,preApplyBaseline:baseline}); }
  catch(error){prepared.delete(baseline);const failure={schemaVersion:'1',stage:'apply',status:'failed',observedAt:new Date().toISOString(),planHash:digest(plan),baselineHash:digest(record),message:error instanceof Error?error.message:String(error)};writeFileSync(path+'.apply-failure.json',JSON.stringify(failure,null,2)+'\n',{flag:'wx',mode:0o600});throw error;}
}
