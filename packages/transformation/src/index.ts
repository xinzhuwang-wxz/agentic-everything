import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { ProjectAssessmentSchema, AdaptationPlanSchema, ApprovedChangeSetSchema, PatchArtifactSchema, type ProjectAssessment, type AdaptationPlan, type ApprovedChangeSet, type PatchArtifact, type VerificationReport } from '@ae/contracts';

const INPUTS = ['package.json', 'src/App.tsx', 'src/tickets.ts'];
const OUTPUTS = ['src/App.tsx', 'src/ae/AgenticMount.tsx'];
const RECIPE = { id: 'react-helpdesk', version: '1.0.0' };
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
function parse(path: string, text: string): ts.SourceFile {
  const result = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const diagnostics = (result as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length) throw new Error('Source syntax is unsupported: ' + path);
  return result;
}
function mainOpening(text: string): number {
  const source = parse('src/App.tsx', text); let position: number | undefined;
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name?.text !== 'App' || !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) continue;
    const visit = (node: ts.Node): void => { if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'main') { if (position !== undefined) throw new Error('Ambiguous main JSX mount'); position = node.openingElement.end; } ts.forEachChild(node, visit); };
    visit(statement);
  }
  if (position === undefined) throw new Error('No supported default App/main mount');
  return position;
}
export function assessProject(sourceRoot: string): ProjectAssessment {
  const root = repo(sourceRoot); const evidence: ProjectAssessment['evidence'] = []; const unknowns = ['Static analysis does not establish production authentication, runtime permissions, deployment, or browser behavior.'];
  const contents = new Map<string, string>();
  for (const path of INPUTS) { const value = read(root, path); if (value === null) { unknowns.push('Missing input: ' + path); continue; } contents.set(path, value); evidence.push({ path, sha256: sha256(value), startLine: 1, endLine: value.split('\n').length, note: 'Observed bounded source; not executed.' }); }
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=all']);
  if (dirty) unknowns.push('Working tree contains changes; recipe-scope changes block application. Unrelated changes stay untouched.');
  let supported = false; let detectedStack: string[] = [];
  try {
    const pkg = JSON.parse(contents.get('package.json') ?? '{}') as { dependencies?: Record<string, string> };
    const reactVersion = pkg.dependencies?.react ?? '';
    if (/^[~^]?19\./.test(reactVersion)) detectedStack = ['TypeScript', 'React 19'];
    mainOpening(contents.get('src/App.tsx') ?? '');
    const service = parse('src/tickets.ts', contents.get('src/tickets.ts') ?? '');
    const exports = service.statements.filter(ts.isFunctionDeclaration).filter(n => n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(n => n.name?.text);
    supported = detectedStack.length > 0 && exports.includes('readTicket') && exports.includes('changePriority');
  } catch { unknowns.push('Required bounded recipe pattern is missing or cannot be parsed.'); }
  if (!supported) unknowns.push('Unsupported framework or layout: no patch can be applied.');
  return ProjectAssessmentSchema.parse({ schemaVersion: '1', projectId: 'helpdesk-' + sha256(root).slice(0, 12), baseCommit: git(root, ['rev-parse', 'HEAD']), detectedStack, businessFlows: supported ? ['Observed App imports readTicket; existing ticket domain functions remain host-owned.'] : [], identity: ['Unknown: requires host-specific authenticated session and authorization review.'], evidence, supportLevel: supported ? 'L2' : 'L0', unknowns, baseline: 'not-run' });
}
export function proposePlan(assessment: ProjectAssessment): AdaptationPlan {
  ProjectAssessmentSchema.parse(assessment);
  if (assessment.supportLevel !== 'L2') throw new Error('Unsupported project: assessment only');
  return AdaptationPlanSchema.parse({ schemaVersion: '1', planId: 'adapt-' + digest(assessment).slice(0, 16), projectId: assessment.projectId, baseCommit: assessment.baseCommit, assessmentHash: digest(assessment), goals: ['Add an Agentic entry and embedded assistant without replacing the existing helpdesk.'], nonGoals: ['Production identity provisioning', 'Deployment', 'Database migration', 'Paid model calls'], capabilities: ['ticket.read', 'ticket.update (host authorization and explicit runtime approval required)'], recipes: [RECIPE], allowedPaths: OUTPUTS, dependencies: ['@ae/host-sdk@0.1.0 and @ae/ui@0.1.0 (provided by the AE workspace; installation not authorized by this recipe)'], commands: [], networkAllowlist: [], dataFlows: ['Existing host API remains authoritative; browser receives no server credential.'], migrations: [], verification: ['Patch hashes', 'TSX syntax', 'Original business domain source unchanged', 'Runtime/browser acceptance separately required'], rollback: ['Restore only patch-owned files when their post-apply hashes still match.'], cost: { currency: 'USD', maximum: 0, paidCallsAllowed: false } });
}
export function approvePlan(plan: AdaptationPlan, input: { approverId: string; authorizationRef: string; expiresAt?: string }): ApprovedChangeSet {
  AdaptationPlanSchema.parse(plan);
  if (!input.approverId.trim() || !input.authorizationRef.trim()) throw new Error('Explicit approver and authorization evidence are required');
  return ApprovedChangeSetSchema.parse({ schemaVersion: '1', approvalId: randomUUID(), approverId: input.approverId, authorizationRef: input.authorizationRef, planHash: digest(plan), baseCommit: plan.baseCommit, allowedPaths: plan.allowedPaths, allowedCommands: [], networkAllowlist: [], maximumCostUsd: 0, excludedActions: ['deployment', 'publishing', 'dependency installation', 'source execution', 'paid model calls'], approvedAt: new Date().toISOString(), expiresAt: input.expiresAt ?? new Date(Date.now() + 3600000).toISOString() });
}
const MOUNT = `import React from 'react';\nimport { AgenticMount } from '@ae/host-sdk';\nimport '@ae/ui/styles.css';\n\n// The server authenticates the host session. Never place a credential in this module.\nexport function HelpdeskAgenticMount() {\n  return <AgenticMount apiBase="/api" ticketId="ticket-1" />;\n}\n`;
export function previewPatch(root: string, plan: AdaptationPlan, assessment: ProjectAssessment): { path: string; before: string | null; after: string }[] {
  if (digest(assessment) !== plan.assessmentHash || digest(proposePlan(assessment)) !== digest(plan)) throw new Error('Plan does not match the assessed recipe');
  const app = read(root, 'src/App.tsx'); if (app === null) throw new Error('Missing App');
  if (read(root, OUTPUTS[1]!) !== null || app.includes('HelpdeskAgenticMount')) throw new Error('Integration already exists or conflicts');
  const position = mainOpening(app);
  const after = "import { HelpdeskAgenticMount } from './ae/AgenticMount.js';\n" + app.slice(0, position) + '<HelpdeskAgenticMount />' + app.slice(position);
  return [{ path: OUTPUTS[0]!, before: app, after }, { path: OUTPUTS[1]!, before: null, after: MOUNT }];
}
export interface AppliedTransformation { patch: PatchArtifact; originals: Record<string, string | null>; businessHash: string; }
export function applyApprovedPlan(input: { sourceRoot: string; destination: string; assessment: ProjectAssessment; plan: AdaptationPlan; approval: ApprovedChangeSet }): AppliedTransformation {
  const root = repo(input.sourceRoot); const { plan, assessment } = input; const approval = ApprovedChangeSetSchema.parse(input.approval);
  if (approval.planHash !== digest(plan) || approval.baseCommit !== plan.baseCommit || Date.parse(approval.expiresAt) <= Date.now() || Date.parse(approval.approvedAt) > Date.now()) throw new Error('Approval expired or does not bind this plan/base');
  if (canonical(approval.allowedPaths) !== canonical(plan.allowedPaths) || approval.allowedCommands.length || approval.networkAllowlist.length || approval.maximumCostUsd !== 0) throw new Error('Approval scope mismatch');
  if (git(root, ['rev-parse', 'HEAD']) !== plan.baseCommit) throw new Error('Base commit drift');
  for (const evidence of assessment.evidence) { if (sha256(read(root, evidence.path) ?? '') !== evidence.sha256) throw new Error('Source hash drift: ' + evidence.path); }
  // Dirty source in scope cannot be silently lost when checkout materializes HEAD.
  if (git(root, ['status', '--porcelain', '--untracked-files=all', '--', ...INPUTS, ...OUTPUTS])) throw new Error('Dirty recipe scope; commit or resolve those changes before applying');
  const destination = resolve(input.destination);
  if (existsSync(destination)) throw new Error('Isolation destination already exists; use the original patch artifact to verify or revert');
  // Destination must be outside the source repository, never traverse a symlink parent.
  const parent = realpathSync(dirname(destination));
  if (parent !== dirname(destination) || destination === root || destination.startsWith(root + '/')) throw new Error('Unsafe isolation destination');
  const changes = previewPatch(root, plan, assessment);
  const trackedEntries = git(root, ['ls-tree', '-r', '--full-tree', plan.baseCommit]).split('\n');
  if (trackedEntries.some(entry => entry.startsWith('120000 ') || /\t(?:.*\/)?(?:\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12))$/i.test(entry))) throw new Error('Tracked symlinks or secret files cannot enter the isolated worktree');
  if (git(root, ['config', '--list']).split('\n').some(line => /^filter\./i.test(line))) throw new Error('Configured Git filters require separate execution review');
  git(root, ['worktree', 'add', '--detach', destination, plan.baseCommit]);
  for (const change of changes) { const target = safePath(destination, change.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, change.after, { flag: change.before === null ? 'wx' : 'w' }); }
  const patch = PatchArtifactSchema.parse({ schemaVersion: '1', planHash: digest(plan), baseCommit: plan.baseCommit, recipe: RECIPE, changes: changes.map(c => ({ path: c.path, beforeHash: c.before === null ? null : sha256(c.before), afterHash: sha256(c.after) })), appliedAt: new Date().toISOString(), worktree: destination });
  return { patch, originals: Object.fromEntries(changes.map(c => [c.path, c.before])), businessHash: sha256(read(root, 'src/tickets.ts')!) };
}
export function verifyAdaptation(applied: AppliedTransformation): VerificationReport {
  const { patch } = applied; PatchArtifactSchema.parse(patch); const root = repo(patch.worktree);
  const checks: VerificationReport['checks'] = [];
  for (const change of patch.changes) {
    const value = read(root, change.path); const equal = value !== null && sha256(value) === change.afterHash;
    checks.push({ name: 'patch:' + change.path, status: equal ? 'pass' : 'fail', expected: change.afterHash ?? 'absent', actual: value === null ? 'absent' : sha256(value), evidence: [] });
    try { parse(change.path, value ?? ''); checks.push({ name: 'syntax:' + change.path, status: 'pass', expected: 'Parseable TSX', actual: 'TypeScript parser accepted', evidence: [] }); } catch { checks.push({ name: 'syntax:' + change.path, status: 'fail', expected: 'Parseable TSX', actual: 'Parse error', evidence: [] }); }
  }
  checks.push({ name: 'original-business-source', status: sha256(read(root, 'src/tickets.ts') ?? '') === applied.businessHash ? 'pass' : 'fail', expected: applied.businessHash, actual: sha256(read(root, 'src/tickets.ts') ?? ''), evidence: [] });
  for (const name of ['host-typecheck', 'host-business-tests', 'authenticated-runtime', 'browser-acceptance']) checks.push({ name, status: 'not-run', expected: 'Separately authorized isolated execution and observed evidence', actual: 'Static verifier does not execute customer code', evidence: [] });
  return { schemaVersion: '1', planHash: patch.planHash, observedAt: new Date().toISOString(), environment: 'Node static verifier; no customer code execution', checks };
}
export function revertAdaptation(applied: AppliedTransformation): void {
  const root = repo(applied.patch.worktree); PatchArtifactSchema.parse(applied.patch);
  if (canonical(applied.patch.changes.map(c => c.path)) !== canonical(OUTPUTS)) throw new Error('Unexpected rollback scope');
  // Validate the complete operation before writing anything. Never clobber later customer edits.
  for (const change of applied.patch.changes) {
    const original = applied.originals[change.path];
    if (original === undefined || (original === null ? null : sha256(original)) !== change.beforeHash) throw new Error('Rollback backup integrity mismatch');
    const value = read(root, change.path);
    if ((value === null ? null : sha256(value)) !== change.afterHash) throw new Error('Patch drift; manual rollback review required');
  }
  for (const change of applied.patch.changes) { const target = safePath(root, change.path); const original = applied.originals[change.path]!; if (original === null) unlinkSync(target); else writeFileSync(target, original); }
}
