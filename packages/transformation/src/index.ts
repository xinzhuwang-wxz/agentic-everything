import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from './ast.js';
import { helpdeskRecipe } from './recipes/react-helpdesk.js';
import { ProjectAssessmentSchema, AdaptationPlanSchema, ApprovedChangeSetSchema, PatchArtifactSchema, type ProjectAssessment, type AdaptationPlan, type ApprovedChangeSet, type PatchArtifact, type VerificationReport } from '@ae/contracts';

const GENERIC_MANIFESTS = ['package.json', 'pom.xml', 'pyproject.toml', 'go.mod', 'Cargo.toml'];
const MAX_FILE_BYTES = 256 * 1024;
export function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = (value: unknown): string => sha256(canonical(value));
function git(root: string, args: string[]): string { return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 }).trim(); }
function repo(root: string): string {
  const actual = realpathSync(root);
  if (git(actual, ['rev-parse', '--show-toplevel']) !== actual) throw new Error('Expected exact Git repository root');
  return actual;
}
function safePath(root: string, path: string): string {
  if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(part => part === '..' || part === '.' || part === '') || /(^|\/)(\.env|secrets?|credentials?)(\.|\/|$)/i.test(path)) throw new Error('Unsafe or secret path');
  let current = root;
  for (const part of path.split('/')) { current = join(current, part); try { if (lstatSync(current).isSymbolicLink()) throw new Error('Symlink paths are not permitted'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  return current;
}
function read(root: string, path: string): string | null {
  const absolute = safePath(root, path);
  if (!existsSync(absolute)) return null;
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Expected bounded regular source file');
  return readFileSync(absolute, 'utf8');
}
export function assessProject(sourceRoot: string): ProjectAssessment {
  const root = repo(sourceRoot); const evidence: ProjectAssessment['evidence'] = [];
  const unknowns = ['Static analysis does not establish production authentication, runtime permissions, deployment, or browser behavior.'];
  const contents = new Map<string, string>();
  // Generic manifest inspection plus the explicit installed recipe's bounded evidence needs.
  for (const path of new Set([...GENERIC_MANIFESTS, ...helpdeskRecipe.inputs])) {
    const value = read(root, path); if (value === null) continue;
    contents.set(path, value); evidence.push({ path, sha256: sha256(value), startLine: 1, endLine: value.split('\n').length, note: 'Observed bounded source; not executed.' });
  }
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=all']);
  if (dirty) unknowns.push('Working tree contains changes; recipe-scope changes block application. Unrelated changes stay untouched.');
  const detectedStack: string[] = [];
  if (contents.has('pom.xml')) detectedStack.push('Java/Maven manifest observed');
  if (contents.has('pyproject.toml')) detectedStack.push('Python manifest observed');
  if (contents.has('go.mod')) detectedStack.push('Go manifest observed');
  if (contents.has('Cargo.toml')) detectedStack.push('Rust manifest observed');
  if (contents.has('package.json')) {
    detectedStack.push('JavaScript/Node package manifest observed');
    try {
      const pkg = JSON.parse(contents.get('package.json')!) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) detectedStack.push('TypeScript');
      const react = pkg.dependencies?.react;
      if (react) detectedStack.push(/^[~^]?19\./.test(react) ? 'React 19' : 'React (version requires review)');
      if (pkg.dependencies?.vue) detectedStack.push('Vue (version requires review)');
    } catch { unknowns.push('Package manifest could not be parsed; framework conclusions remain unknown.'); }
  }
  const covered = helpdeskRecipe.matches(contents, detectedStack);
  if (!covered) unknowns.push('No installed patch recipe covers this project yet. This is a coverage limitation, not a conclusion that the software cannot be made agentic. A tailored business and identity assessment is required.');
  return ProjectAssessmentSchema.parse({ schemaVersion: '1', projectId: 'project-' + sha256(root).slice(0, 12), baseCommit: git(root, ['rev-parse', 'HEAD']), detectedStack, businessFlows: covered ? [helpdeskRecipe.observedFlow] : [], identity: ['Unknown: requires host-specific authenticated session and authorization review.'], evidence, supportLevel: covered ? 'L2' : 'L0', unknowns, baseline: 'not-run' });
}
export function proposePlan(assessment: ProjectAssessment): AdaptationPlan {
  ProjectAssessmentSchema.parse(assessment);
  if (assessment.supportLevel !== 'L2' || !assessment.businessFlows.includes(helpdeskRecipe.observedFlow)) throw new Error('No installed recipe coverage: tailored plan needs developer review, not automatic patching');
  return AdaptationPlanSchema.parse({ schemaVersion: '1', planId: 'adapt-' + digest(assessment).slice(0, 16), projectId: assessment.projectId, baseCommit: assessment.baseCommit, assessmentHash: digest(assessment), ...helpdeskRecipe.planDetails, recipes: [helpdeskRecipe.ref], allowedPaths: helpdeskRecipe.outputs });
}
export function approvePlan(plan: AdaptationPlan, input: { approverId: string; authorizationRef: string; expiresAt?: string }): ApprovedChangeSet {
  AdaptationPlanSchema.parse(plan);
  if (!input.approverId.trim() || !input.authorizationRef.trim()) throw new Error('Explicit approver and authorization evidence are required');
  return ApprovedChangeSetSchema.parse({ schemaVersion: '1', approvalId: randomUUID(), approverId: input.approverId, authorizationRef: input.authorizationRef, planHash: digest(plan), baseCommit: plan.baseCommit, allowedPaths: plan.allowedPaths, allowedCommands: [], networkAllowlist: [], maximumCostUsd: 0, excludedActions: ['deployment', 'publishing', 'dependency installation', 'source execution', 'paid model calls'], approvedAt: new Date().toISOString(), expiresAt: input.expiresAt ?? new Date(Date.now() + 3600000).toISOString() });
}
export function previewPatch(root: string, plan: AdaptationPlan, assessment: ProjectAssessment): { path: string; before: string | null; after: string }[] {
  if (digest(assessment) !== plan.assessmentHash || digest(proposePlan(assessment)) !== digest(plan)) throw new Error('Plan does not match the assessed recipe');
  return helpdeskRecipe.preview(path => read(root, path));
}
export interface AppliedTransformation { patch: PatchArtifact; originals: Record<string, string | null>; businessHash: string; }
export function applyApprovedPlan(input: { sourceRoot: string; destination: string; assessment: ProjectAssessment; plan: AdaptationPlan; approval: ApprovedChangeSet }): AppliedTransformation {
  const root = repo(input.sourceRoot); const { plan, assessment } = input; const approval = ApprovedChangeSetSchema.parse(input.approval);
  if (approval.planHash !== digest(plan) || approval.baseCommit !== plan.baseCommit || Date.parse(approval.expiresAt) <= Date.now() || Date.parse(approval.approvedAt) > Date.now()) throw new Error('Approval expired or does not bind this plan/base');
  if (canonical(approval.allowedPaths) !== canonical(plan.allowedPaths) || approval.allowedCommands.length || approval.networkAllowlist.length || approval.maximumCostUsd !== 0) throw new Error('Approval scope mismatch');
  if (git(root, ['rev-parse', 'HEAD']) !== plan.baseCommit) throw new Error('Base commit drift');
  for (const evidence of assessment.evidence) { if (sha256(read(root, evidence.path) ?? '') !== evidence.sha256) throw new Error('Source hash drift: ' + evidence.path); }
  // Dirty source in scope cannot be silently lost when checkout materializes HEAD.
  if (git(root, ['status', '--porcelain', '--untracked-files=all', '--', ...helpdeskRecipe.inputs, ...helpdeskRecipe.outputs])) throw new Error('Dirty recipe scope; commit or resolve those changes before applying');
  const destination = resolve(input.destination);
  if (existsSync(destination)) throw new Error('Isolation destination already exists; use the original patch artifact to verify or revert');
  // Destination must be outside the source repository, never traverse a symlink parent.
  const parent = realpathSync(dirname(destination));
  if (parent !== dirname(destination) || destination === root || destination.startsWith(root + '/')) throw new Error('Unsafe isolation destination');
  const changes = previewPatch(root, plan, assessment);
  const trackedEntries = git(root, ['ls-tree', '-rz', '--full-tree', plan.baseCommit]).split('\0');
  if (trackedEntries.some(entry => entry.startsWith('120000 ') || /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.ssh|\.aws|\.npmrc|\.pypirc|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|id_(?:rsa|ed25519)|[^/]*\.(?:pem|key|p12))(?:\/|$)/i.test(entry.split('\t')[1] ?? ''))) throw new Error('Tracked symlinks or secret files cannot enter the isolated worktree');
  if (git(root, ['config', '--list']).split('\n').some(line => /^filter\./i.test(line))) throw new Error('Configured Git filters require separate execution review');
  git(root, ['worktree', 'add', '--detach', destination, plan.baseCommit]);
  for (const change of changes) { const target = safePath(destination, change.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, change.after, { flag: change.before === null ? 'wx' : 'w' }); }
  const patch = PatchArtifactSchema.parse({ schemaVersion: '1', planHash: digest(plan), baseCommit: plan.baseCommit, recipe: helpdeskRecipe.ref, changes: changes.map(c => ({ path: c.path, beforeHash: c.before === null ? null : sha256(c.before), afterHash: sha256(c.after) })), appliedAt: new Date().toISOString(), worktree: destination });
  return { patch, originals: Object.fromEntries(changes.map(c => [c.path, c.before])), businessHash: sha256(read(root, helpdeskRecipe.businessPath)!) };
}
export function verifyAdaptation(applied: AppliedTransformation): VerificationReport {
  const { patch } = applied; PatchArtifactSchema.parse(patch); const root = repo(patch.worktree);
  const checks: VerificationReport['checks'] = [];
  for (const change of patch.changes) {
    const value = read(root, change.path); const equal = value !== null && sha256(value) === change.afterHash;
    checks.push({ name: 'patch:' + change.path, status: equal ? 'pass' : 'fail', expected: change.afterHash ?? 'absent', actual: value === null ? 'absent' : sha256(value), evidence: [] });
    try { parse(change.path, value ?? ''); checks.push({ name: 'syntax:' + change.path, status: 'pass', expected: 'Parseable TSX', actual: 'TypeScript parser accepted', evidence: [] }); } catch { checks.push({ name: 'syntax:' + change.path, status: 'fail', expected: 'Parseable TSX', actual: 'Parse error', evidence: [] }); }
  }
  checks.push({ name: 'original-business-source', status: sha256(read(root, helpdeskRecipe.businessPath) ?? '') === applied.businessHash ? 'pass' : 'fail', expected: applied.businessHash, actual: sha256(read(root, helpdeskRecipe.businessPath) ?? ''), evidence: [] });
  for (const name of ['host-typecheck', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'browser-acceptance']) checks.push({ name, status: 'not-run', expected: 'Separately authorized isolated execution and observed evidence', actual: 'Static verifier does not execute customer code', evidence: [] });
  return { schemaVersion: '1', planHash: patch.planHash, observedAt: new Date().toISOString(), environment: 'Node static verifier; no customer code execution', checks };
}
export function revertAdaptation(applied: AppliedTransformation): void {
  const root = repo(applied.patch.worktree); PatchArtifactSchema.parse(applied.patch);
  if (canonical(applied.patch.changes.map(c => c.path)) !== canonical(helpdeskRecipe.outputs)) throw new Error('Unexpected rollback scope');
  // Validate the complete operation before writing anything. Never clobber later customer edits.
  for (const change of applied.patch.changes) {
    const original = applied.originals[change.path];
    if (original === undefined || (original === null ? null : sha256(original)) !== change.beforeHash) throw new Error('Rollback backup integrity mismatch');
    const value = read(root, change.path);
    if ((value === null ? null : sha256(value)) !== change.afterHash) throw new Error('Patch drift; manual rollback review required');
  }
  for (const change of applied.patch.changes) { const target = safePath(root, change.path); const original = applied.originals[change.path]!; if (original === null) unlinkSync(target); else writeFileSync(target, original); }
}

/** Source-bound fingerprint for a reviewed baseline/candidate behavioral harness. Includes absent output files. */
export function expectedBaselineCodeHash(assessment: ProjectAssessment, plan: AdaptationPlan): string {
  if (digest(assessment) !== plan.assessmentHash) throw new Error('Assessment does not match plan');
  const hashes = new Map<string, string | null>(assessment.evidence.map(item => [item.path, item.sha256]));
  for (const path of plan.allowedPaths) if (!hashes.has(path)) hashes.set(path, null);
  return digest([...hashes].sort(([a], [b]) => a.localeCompare(b)));
}
export function adaptationCodeHash(root: string, assessment: ProjectAssessment, plan: AdaptationPlan): string {
  if (digest(assessment) !== plan.assessmentHash) throw new Error('Assessment does not match plan');
  const paths = [...new Set([...assessment.evidence.map(item => item.path), ...plan.allowedPaths])].sort((a,b) => a.localeCompare(b));
  return digest(paths.map(path => { const value = read(repo(root), path); return [path, value === null ? null : sha256(value)]; }));
}
export { verifyAdaptationWithBehavior } from './behavior.js';

export * from './configuration.js';
