import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { AdaptationPlanSchema, ApprovedChangeSetSchema, DeliveryManifestSchema, PatchArtifactSchema, ProjectAssessmentSchema, Sha256, VerificationReportSchema, type AdaptationPlan, type ApprovedChangeSet, type DeliveryManifest, type DeliveryValidation, type ProjectAssessment, type VerificationReport } from '@ae/contracts';
import { adaptationCodeHash, canonical, digest, expectedBaselineCodeHash, previewPatch, proposePlan, sha256, verifyAdaptation, type AppliedTransformation } from './index.js';
import { helpdeskRecipe } from './recipes/react-helpdesk.js';
import { parse } from './ast.js';
import { runFixtureDelivery, checkFixtureDeliveryEvidence, assertTrustedFixtureDelivery } from './fixture-harness.js';

const LIMIT = 1024 * 1024;
const AppliedSchema = z.strictObject({ patch: PatchArtifactSchema, originals: z.record(z.string(), z.string().max(256 * 1024).nullable()), businessHash: Sha256 });
const LIMITATIONS = ['Integrity hashes are not signatures and do not establish approval authenticity.', 'Source and candidate hashes describe bounded recipe evidence observed at creation, not the entire repository.', 'No customer code, behavior harness, typecheck, runtime, or browser acceptance was executed. Missing gates remain not-run; delivery is partial.', 'Only patch-owned source and rollback bytes are included. No deployment or dependency installation is authorized.'];
const FIXTURE_LIMITATIONS = ['General commands and network allowlists remain empty; only the explicit fixed verification profile permits its reviewed local commands and loopback networking.', 'Integrity hashes are not signatures and do not establish approval or execution authenticity.', 'Complete applies only to the exact react-helpdesk-synthetic-v1 fixture and its fixed gates, not arbitrary customers or production readiness.', 'Only patch-owned source and rollback bytes are included. No deployment, dependency installation, external network, or paid calls are authorized.'];
const EVIDENCE_FILES = { report: 'report.json', baseline: 'baseline.json', differential: 'differential.json', originalBuild: 'original-build.json', candidateBuild: 'candidate-build.json', runtime: 'runtime.json', browser: 'browser.json' } as const;
const GATES = ['host-typecheck', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'browser-acceptance', 'fixture-process-completion'];
function bindFixtureCommit(report: unknown, plan: AdaptationPlan): void {
  const observed = report as { checks?: {status?:string}[]; provenance?: {sourceVersion?:string} };
  if (observed.checks?.some(check => check.status === 'pass') && observed.provenance?.sourceVersion !== plan.baseCommit) throw new Error('Fixture evidence source commit mismatch');
}
function fixtureChecks(report: unknown): VerificationReport['checks'] {
  const checks = VerificationReportSchema.shape.checks.parse((report as { checks?: unknown }).checks);
  exact(checks.map(c => c.name).sort(), [...GATES].sort(), 'Unexpected fixture verification gates');
  return checks;
}
function bindEvidenceRefs(checks: VerificationReport['checks'], files: Map<string, Buffer>): void {
  const required: Record<string, string[]> = { 'host-typecheck': ['evidence/original-build.json', 'evidence/candidate-build.json'], 'host-business-tests': ['evidence/baseline.json'], 'black-box-business-differential': ['evidence/differential.json'], 'authenticated-runtime': ['evidence/runtime.json'], 'browser-acceptance': ['evidence/browser.json'] };
  for (const check of checks) {
    if (check.status === 'pass' && required[check.name]) exact(check.evidence.map(ref => ref.path).sort(), [...required[check.name]!].sort(), 'Missing or unexpected fixture evidence references');
    for (const ref of check.evidence) {
      const bytes = files.get(ref.path);
      if (!bytes || bytesHash(bytes) !== ref.sha256) throw new Error('Verification evidence reference mismatch: ' + ref.path);
    }
  }
}
function authorizationCheck(approval: ApprovedChangeSet, completedAt: string): VerificationReport['checks'][number] {
  const valid = Date.parse(completedAt) < Date.parse(approval.expiresAt);
  return { name: 'delivery-authorization-valid', status: valid ? 'pass' : 'fail', expected: 'Delivery completed before ' + approval.expiresAt, actual: valid ? 'Approval remained current through delivery' : 'Approval expired during delivery; fresh approval is required before further execution', evidence: [] };
}
function status(checks: VerificationReport['checks']): DeliveryManifest['status'] { return checks.some(c => c.status === 'fail') ? 'failed' : checks.every(c => c.status === 'pass') ? 'complete' : 'partial'; }
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const bytesHash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
function safeAbsolute(path: string): string {
  const absolute = resolve(path); let current: string = sep;
  for (const part of absolute.split(sep).filter(Boolean)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('Symlink path is forbidden'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return absolute;
}
function file(root: string, relative: string): string {
  if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..') || /(^|\/)(\.env|secrets?|credentials?)(\.|\/|$)/i.test(relative)) throw new Error('Unsafe artifact path');
  return safeAbsolute(join(root, relative));
}
function read(root: string, relative: string): Buffer {
  const path = file(root, relative); const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > LIMIT) throw new Error('Expected bounded regular artifact');
  const bytes = readFileSync(path); if (bytes.length > LIMIT) throw new Error('Artifact too large'); return bytes;
}
function git(root: string, args: string[]): string { return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: LIMIT }).trim(); }
function exact(a: unknown, b: unknown, message: string): void { if (canonical(a) !== canonical(b)) throw new Error(message); }
function scope(assessment: ProjectAssessment, plan: AdaptationPlan, approval: ApprovedChangeSet, applied: AppliedTransformation, now: number): void {
  exact(proposePlan(assessment, plan.verificationAuthorization ? { verificationProfile: plan.verificationAuthorization.profile } : undefined), plan, 'Plan does not match assessed recipe');
  if (approval.planHash !== digest(plan) || approval.baseCommit !== plan.baseCommit || Date.parse(approval.expiresAt) <= now || Date.parse(approval.approvedAt) > now || Date.parse(approval.approvedAt) > Date.parse(applied.patch.appliedAt) || Date.parse(applied.patch.appliedAt) > now) throw new Error('Approval expired or chain timestamps/base do not bind');
  exact(approval.verificationAuthorization ?? null, plan.verificationAuthorization ?? null, 'Verification authorization scope mismatch');
  exact(approval.excludedActions, ['deployment', 'publishing', 'dependency installation', ...(plan.verificationAuthorization ? ['customer source execution outside the exact synthetic fixture profile'] : ['source execution']), 'paid model calls'], 'Approval exclusions mismatch');
  exact(approval.allowedPaths, plan.allowedPaths, 'Approval path scope mismatch');
  if (approval.allowedCommands.length || approval.networkAllowlist.length || approval.maximumCostUsd !== 0) throw new Error('Approval scope mismatch');
  const patch = applied.patch;
  if (patch.planHash !== digest(plan) || patch.baseCommit !== plan.baseCommit) throw new Error('Patch chain mismatch');
  exact(patch.recipe, helpdeskRecipe.ref, 'Recipe mismatch');
  exact(patch.changes.map(c => c.path), helpdeskRecipe.outputs, 'Patch scope mismatch');
  exact(Object.keys(applied.originals).sort(), [...helpdeskRecipe.outputs].sort(), 'Rollback scope mismatch');
  const allowedEvidence = new Set([...helpdeskRecipe.inputs, 'pom.xml', 'pyproject.toml', 'go.mod', 'Cargo.toml']);
  if (assessment.baseline !== 'not-run' || helpdeskRecipe.inputs.some(path => !assessment.evidence.some(e => e.path === path))) throw new Error('Missing recipe assessment or unsupported baseline PASS');
  if (assessment.evidence.some(e => !allowedEvidence.has(e.path)) || new Set(assessment.evidence.map(e => e.path)).size !== assessment.evidence.length) throw new Error('Unexpected or duplicate assessment evidence');
  if (assessment.evidence.find(e => e.path === helpdeskRecipe.businessPath)?.sha256 !== applied.businessHash) throw new Error('Business baseline mismatch');
  for (const change of patch.changes) {
    const before = applied.originals[change.path];
    if (before === undefined || (before === null ? null : sha256(before)) !== change.beforeHash || (assessment.evidence.find(e => e.path === change.path)?.sha256 ?? null) !== change.beforeHash) throw new Error('Rollback baseline mismatch');
  }
}
function candidateHash(assessment: ProjectAssessment, plan: AdaptationPlan, applied: AppliedTransformation): string {
  const hashes = new Map<string, string | null>(assessment.evidence.map(e => [e.path, e.sha256]));
  for (const path of plan.allowedPaths) hashes.set(path, applied.patch.changes.find(c => c.path === path)!.afterHash);
  return digest([...hashes].sort(([a], [b]) => a.localeCompare(b)));
}
function expectedChecks(applied: AppliedTransformation, sources: Map<string, Buffer>): VerificationReport['checks'] {
  const checks: VerificationReport['checks'] = [];
  for (const change of applied.patch.changes) {
    const bytes = sources.get(change.path); if (!bytes || bytesHash(bytes) !== change.afterHash) throw new Error('Candidate bytes mismatch');
    let syntax = true; try { parse(change.path, bytes.toString('utf8')); } catch { syntax = false; }
    checks.push({ name: 'patch:' + change.path, status: 'pass', expected: change.afterHash!, actual: change.afterHash!, evidence: [] }, { name: 'syntax:' + change.path, status: syntax ? 'pass' : 'fail', expected: 'Parseable TSX', actual: syntax ? 'TypeScript parser accepted' : 'Parse error', evidence: [] });
  }
  checks.push({ name: 'original-business-source', status: 'pass', expected: applied.businessHash, actual: applied.businessHash, evidence: [] });
  for (const name of ['host-typecheck', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'browser-acceptance']) checks.push({ name, status: 'not-run', expected: 'Separately authorized isolated execution and observed evidence', actual: 'Static verifier does not execute customer code', evidence: [] });
  return checks;
}
function permissions(approval: ApprovedChangeSet): DeliveryManifest['permissions'] { return { ...(approval.verificationAuthorization ? { verificationAuthorization: approval.verificationAuthorization } : {}), allowedPaths: approval.allowedPaths, allowedCommands: approval.allowedCommands, networkAllowlist: approval.networkAllowlist, maximumCostUsd: approval.maximumCostUsd, excludedActions: approval.excludedActions }; }

export async function createDelivery(input: { sourceRoot: string; assessment: ProjectAssessment; plan: AdaptationPlan; approval: ApprovedChangeSet; applied: AppliedTransformation; outputDirectory: string }): Promise<DeliveryManifest> {
  const assessment = ProjectAssessmentSchema.parse(input.assessment), plan = AdaptationPlanSchema.parse(input.plan), approval = ApprovedChangeSetSchema.parse(input.approval), applied = AppliedSchema.parse(input.applied);
  const source = safeAbsolute(input.sourceRoot), candidate = safeAbsolute(applied.patch.worktree), out = safeAbsolute(input.outputDirectory);
  for (const root of [source, candidate]) if (realpathSync(root) !== root || git(root, ['rev-parse', '--show-toplevel']) !== root || git(root, ['rev-parse', 'HEAD']) !== plan.baseCommit) throw new Error('Source/worktree base drift');
  if (source === candidate || out === source || out.startsWith(source + sep) || out === candidate || out.startsWith(candidate + sep) || source.startsWith(out + sep) || candidate.startsWith(out + sep)) throw new Error('Delivery output must be outside source and candidate');
  if (realpathSync(dirname(out)) !== dirname(out)) throw new Error('Unsafe output parent');
  const startedAt = new Date().toISOString();
  scope(assessment, plan, approval, applied, Date.parse(startedAt));
  if (assessment.projectId !== 'project-' + sha256(source).slice(0, 12)) throw new Error('Assessment source identity mismatch');
  if (git(source, ['status', '--porcelain', '--untracked-files=all', '--', ...helpdeskRecipe.inputs, ...helpdeskRecipe.outputs])) throw new Error('Dirty source recipe scope');
  if (adaptationCodeHash(source, assessment, plan) !== expectedBaselineCodeHash(assessment, plan)) throw new Error('Original source drift');
  if (adaptationCodeHash(candidate, assessment, plan) !== candidateHash(assessment, plan, applied)) throw new Error('Candidate source drift');
  const preview = previewPatch(source, plan, assessment);
  for (const change of preview) if (sha256(change.after) !== applied.patch.changes.find(c => c.path === change.path)?.afterHash) throw new Error('Candidate does not match recipe');
  const sources = new Map(applied.patch.changes.map(c => [c.path, read(candidate, c.path)]));
  const verification = verifyAdaptation(applied);
  exact(verification.checks, expectedChecks(applied, sources), 'Fresh verification failed');
  const evidenceFiles = new Map<string, Buffer>();
  if (plan.verificationAuthorization) {
    assertTrustedFixtureDelivery({ sourceRoot: source, candidateRoot: candidate });
    mkdirSync(out, { mode: 0o700 });
    const result = await runFixtureDelivery({ sourceRoot: source, candidateRoot: candidate, outputDirectory: join(out, 'evidence'), verificationAuthorization: plan.verificationAuthorization, authorizationExpiresAt: approval.expiresAt });
    const evidence: Record<string, unknown> = {};
    for (const [key, name] of Object.entries(EVIDENCE_FILES)) {
      if (safeAbsolute(result.artifacts[key]!) !== join(out, 'evidence', name)) throw new Error('Unexpected harness artifact location');
      const bytes = read(out, 'evidence/' + name); evidenceFiles.set('evidence/' + name, bytes); evidence[key] = JSON.parse(bytes.toString('utf8'));
    }
    bindFixtureCommit(evidence.report, plan);
    await checkFixtureDeliveryEvidence({report:evidence.report,baseline:evidence.baseline,differential:evidence.differential,originalBuild:evidence.originalBuild,candidateBuild:evidence.candidateBuild,runtime:evidence.runtime,browser:evidence.browser});
    const observedChecks = fixtureChecks(evidence.report);
    if ((result.status === 'pass') !== observedChecks.every(check => check.status === 'pass')) throw new Error('Harness process result contradicts verification evidence');
    verification.checks = [...verification.checks.filter(c => !GATES.includes(c.name)), ...observedChecks];
    verification.observedAt = new Date().toISOString();
    verification.environment = 'Fixed react-helpdesk-synthetic-v1 isolated fixture harness; no customer code execution';
    scope(assessment, plan, approval, applied, Date.parse(startedAt));
    if (adaptationCodeHash(source, assessment, plan) !== expectedBaselineCodeHash(assessment, plan) || adaptationCodeHash(candidate, assessment, plan) !== candidateHash(assessment, plan, applied)) throw new Error('Source drift during verification');
  }
  const createdAt = new Date().toISOString();
  verification.checks.push(authorizationCheck(approval, createdAt));
  const files = new Map<string, Buffer>(Object.entries({ 'assessment.json': assessment, 'plan.json': plan, 'approval.json': approval, 'applied.json': applied, 'verification.json': verification }).map(([path, value]) => [path, Buffer.from(json(value))]));
  for (const [path, bytes] of evidenceFiles) files.set(path, bytes);
  bindEvidenceRefs(verification.checks, files);
  for (const change of applied.patch.changes) { files.set('source/' + change.path, sources.get(change.path)!); const original = applied.originals[change.path]; if (original !== null) files.set('rollback/' + change.path, Buffer.from(original!)); }
  const manifest = DeliveryManifestSchema.parse({ schemaVersion: '1', kind: 'ae-delivery', toolVersion: '0.1.0', status: status(verification.checks), verificationScope: plan.verificationAuthorization ? 'react-helpdesk-synthetic-v1' : 'static-only', startedAt, createdAt, projectId: assessment.projectId, baseCommit: plan.baseCommit, recipe: applied.patch.recipe, chain: { assessmentHash: digest(assessment), planHash: digest(plan), approvalHash: digest(approval), appliedHash: digest(applied), verificationHash: digest(verification) }, baselineCodeHash: expectedBaselineCodeHash(assessment, plan), candidateCodeHash: candidateHash(assessment, plan, applied), permissions: permissions(approval), artifacts: [...files].map(([path, bytes]) => ({ path, sha256: bytesHash(bytes), bytes: bytes.length })), checks: verification.checks, limitations: plan.verificationAuthorization ? FIXTURE_LIMITATIONS : LIMITATIONS });
  if (!plan.verificationAuthorization) mkdirSync(out, { mode: 0o700 });
  for (const [path, bytes] of files) { if (evidenceFiles.has(path)) continue; const target = file(out, path); mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 }); }
  writeFileSync(join(out, 'manifest.json'), json(manifest), { flag: 'wx', mode: 0o600 });
  return manifest;
}

/** Offline bounded package integrity validation. Never executes copied source or trusts imported PASS. */
export async function checkDelivery(directory: string): Promise<DeliveryValidation> {
  try {
    const root = safeAbsolute(directory); if (!lstatSync(root).isDirectory()) throw new Error('Expected delivery directory');
    const manifest = DeliveryManifestSchema.parse(JSON.parse(read(root, 'manifest.json').toString('utf8')));
    const refs = new Map(manifest.artifacts.map(a => [a.path, a])); if (refs.size !== manifest.artifacts.length) throw new Error('Duplicate artifact reference');
    const actual: string[] = [];
    function walk(relative: string): void {
      for (const name of readdirSync(relative ? file(root, relative) : root)) {
        const path = relative ? relative + '/' + name : name; const absolute = file(root, path); const stat = lstatSync(absolute);
        if (actual.length > 32 || path.split('/').length > 8) throw new Error('Unbounded package');
        if (stat.isDirectory()) { if (![...refs.keys()].some(p => p.startsWith(path + '/'))) throw new Error('Unexpected artifact directory'); walk(path); } else { if (!stat.isFile()) throw new Error('Non-regular artifact'); actual.push(path); }
      }
    }
    walk(''); exact(actual.sort(), ['manifest.json', ...refs.keys()].sort(), 'Unexpected or missing package files');
  const files = new Map<string, Buffer>();
    for (const [path, ref] of refs) { const bytes = read(root, path); if (bytes.length !== ref.bytes || bytesHash(bytes) !== ref.sha256) throw new Error('Artifact byte/hash mismatch: ' + path); files.set(path, bytes); }
    const object = (path: string): unknown => { const bytes = files.get(path); if (!bytes) throw new Error('Missing artifact: ' + path); return JSON.parse(bytes.toString('utf8')); };
    const assessment = ProjectAssessmentSchema.parse(object('assessment.json')), plan = AdaptationPlanSchema.parse(object('plan.json')), approval = ApprovedChangeSetSchema.parse(object('approval.json')), applied = AppliedSchema.parse(object('applied.json')), verification = VerificationReportSchema.parse(object('verification.json'));
    scope(assessment, plan, approval, applied, Date.parse(manifest.startedAt));
    if (Date.parse(manifest.startedAt) > Date.parse(manifest.createdAt) || Date.parse(manifest.startedAt) < Date.parse(applied.patch.appliedAt) || Date.parse(manifest.createdAt) > Date.now() || Date.parse(verification.observedAt) > Date.parse(manifest.createdAt) || Date.parse(verification.observedAt) < Date.parse(applied.patch.appliedAt)) throw new Error('Invalid observation timestamps');
    exact(manifest.chain, { assessmentHash: digest(assessment), planHash: digest(plan), approvalHash: digest(approval), appliedHash: digest(applied), verificationHash: digest(verification) }, 'Artifact chain mismatch');
    exact(manifest.permissions, permissions(approval), 'Permission mismatch'); exact(manifest.recipe, applied.patch.recipe, 'Recipe mismatch'); exact(manifest.limitations, plan.verificationAuthorization ? FIXTURE_LIMITATIONS : LIMITATIONS, 'Limitations mismatch');
    if (manifest.verificationScope !== (plan.verificationAuthorization ? 'react-helpdesk-synthetic-v1' : 'static-only')) throw new Error('Verification scope mismatch');
    if (manifest.projectId !== assessment.projectId || manifest.baseCommit !== plan.baseCommit || manifest.baselineCodeHash !== expectedBaselineCodeHash(assessment, plan) || manifest.candidateCodeHash !== candidateHash(assessment, plan, applied) || verification.planHash !== digest(plan) || verification.environment !== (plan.verificationAuthorization ? 'Fixed react-helpdesk-synthetic-v1 isolated fixture harness; no customer code execution' : 'Node static verifier; no customer code execution')) throw new Error('Manifest binding mismatch');
    const sources = new Map(applied.patch.changes.map(c => [c.path, files.get('source/' + c.path)!]));
    const expectedPaths = ['assessment.json', 'plan.json', 'approval.json', 'applied.json', 'verification.json'];
    for (const change of applied.patch.changes) { expectedPaths.push('source/' + change.path); const original = applied.originals[change.path]; if (original !== null) { const path = 'rollback/' + change.path; expectedPaths.push(path); if (!files.get(path)?.equals(Buffer.from(original!))) throw new Error('Rollback bytes mismatch'); } }
    let checks = expectedChecks(applied, sources);
    if (plan.verificationAuthorization) {
      const evidence: Record<string, unknown> = {};
      for (const [key, name] of Object.entries(EVIDENCE_FILES)) { const path = 'evidence/' + name; expectedPaths.push(path); evidence[key] = object(path); }
      bindFixtureCommit(evidence.report, plan);
    await checkFixtureDeliveryEvidence({report:evidence.report,baseline:evidence.baseline,differential:evidence.differential,originalBuild:evidence.originalBuild,candidateBuild:evidence.candidateBuild,runtime:evidence.runtime,browser:evidence.browser});
      checks = [...checks.filter(c => !GATES.includes(c.name)), ...fixtureChecks(evidence.report)];
    }
    checks.push(authorizationCheck(approval, manifest.createdAt));
    exact([...refs.keys()].sort(), expectedPaths.sort(), 'Unexpected artifact scope');
    for (const change of helpdeskRecipe.preview(path => applied.originals[path] ?? null)) if (bytesHash(sources.get(change.path)!) !== sha256(change.after)) throw new Error('Packaged candidate does not match recipe');
    bindEvidenceRefs(verification.checks, files);
    exact(verification.checks, checks, 'Unsupported verification claim'); exact(manifest.checks, verification.checks, 'Manifest check mismatch');
    if (manifest.status !== status(verification.checks)) throw new Error('Unsupported delivery status');
    return { valid: true, errors: [], manifest };
  } catch (error) { return { valid: false, errors: [error instanceof Error ? error.message : String(error)] }; }
}
