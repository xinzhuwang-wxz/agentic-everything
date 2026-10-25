#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { assessProject, proposePlan, approvePlan, previewPatch, applyApprovedPlan, applyApprovedPlanWithBaseline, verifyAdaptation, revertAdaptation, createDelivery, checkDelivery, digest, type AppliedTransformation } from '@ae/transformation';
import type { AdaptationPlan, ProjectAssessment, VerificationReport } from '@ae/contracts';

const [command, ...args] = process.argv.slice(2);
function option(name: string): string { const position = args.indexOf('--' + name); const value = args[position + 1]; if (position === -1 || !value || value.startsWith('--')) throw new Error('Required --' + name); return value; }
function json<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T; }
function output(value: unknown): void { const text = JSON.stringify(value, null, 2) + '\n'; const index = args.indexOf('--out'); if (index >= 0) writeFileSync(option('out'), text, { flag: 'wx' }); else process.stdout.write(text); }
function verificationExit(report: VerificationReport): void { process.exitCode = report.checks.some(check => check.status === 'fail') ? 1 : report.checks.some(check => check.status !== 'pass') ? 2 : 0; }
const options: Record<string, string[]> = { assess: ['repo','out'], plan: ['assessment','verification-profile','out'], approve: ['plan','plan-hash','approver','authorization-ref','out'], preview: ['repo','plan','assessment','out'], apply: ['repo','worktree','assessment','plan','approval','baseline-out','out'], verify: ['patch','out'], revert: ['patch','out'], deliver: ['repo','assessment','plan','approval','patch','out-dir'], 'delivery-check': ['bundle','out'] };
try {
  if (command && options[command]) {
    const seen = new Set<string>();
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i]!;
      if (!flag.startsWith('--') || !options[command]!.includes(flag.slice(2)) || seen.has(flag)) throw new Error('Unknown or duplicate option: ' + flag);
      option(flag.slice(2)); seen.add(flag);
    }
  }
  switch (command) {
    case 'assess': output(assessProject(option('repo'))); break;
    case 'plan': { const profile = args.includes('--verification-profile') ? option('verification-profile') : undefined; if (profile !== undefined && profile !== 'react-helpdesk-synthetic-v1' && profile !== 'python-inventory-synthetic-v1') throw new Error('Unsupported verification profile'); const plan = proposePlan(json<ProjectAssessment>(option('assessment')), profile ? { verificationProfile: profile } : undefined); output({ plan, planHash: digest(plan) }); break; }
    case 'approve': { const { plan } = json<{plan: AdaptationPlan}>(option('plan')); if (option('plan-hash') !== digest(plan)) throw new Error('Explicit approved plan hash does not match'); output(approvePlan(plan, { approverId: option('approver'), authorizationRef: option('authorization-ref') })); break; }
    case 'preview': output(previewPatch(option('repo'), json<{plan: AdaptationPlan}>(option('plan')).plan, json<ProjectAssessment>(option('assessment')))); break;
    case 'apply': { const input = { sourceRoot: option('repo'), destination: option('worktree'), assessment: json<ProjectAssessment>(option('assessment')), plan: json<{plan: AdaptationPlan}>(option('plan')).plan, approval: json<import('@ae/contracts').ApprovedChangeSet>(option('approval')) }; if (input.plan.verificationAuthorization) output(await applyApprovedPlanWithBaseline({...input,baselinePath:option('baseline-out')})); else { if(args.includes('--baseline-out')) throw new Error('Baseline capture requires an explicitly approved verification profile'); output(applyApprovedPlan(input)); } break; }
    case 'verify': { const report = verifyAdaptation(json<AppliedTransformation>(option('patch'))); output(report); verificationExit(report); break; }
    case 'deliver': {
      const manifest = await createDelivery({ sourceRoot: option('repo'), assessment: json(option('assessment')), plan: json<{plan: AdaptationPlan}>(option('plan')).plan, approval: json(option('approval')), applied: json<AppliedTransformation>(option('patch')), outputDirectory: option('out-dir') });
      output(manifest); process.exitCode = manifest.status === 'failed' ? 1 : manifest.status === 'complete' ? 0 : 2; break;
    }
    case 'delivery-check': {
      const result = await checkDelivery(option('bundle')); output(result); process.exitCode = !result.valid || result.manifest?.status === 'failed' ? 1 : result.manifest?.status === 'complete' ? 0 : 2; break;
    }
    case 'revert': revertAdaptation(json<AppliedTransformation>(option('patch'))); output({ status: 'reverted', note: 'Only patch-owned files restored; isolated worktree retained.' }); break;
    default: throw new Error('Usage: ae assess|plan|approve|preview|apply|verify|deliver|delivery-check|revert. See skills/ae-adapt/SKILL.md.');
  }
} catch (error) { process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n'); process.exitCode = 1; }
