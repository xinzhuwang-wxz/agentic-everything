#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { ConfigurationPreflight, assessProject, proposePlan, approvePlan, previewPatch, applyApprovedPlan, verifyAdaptation, revertAdaptation, digest, type AppliedTransformation } from '@ae/transformation';
import type { AdaptationPlan, ProjectAssessment } from '@ae/contracts';

const [command, ...args] = process.argv.slice(2);
function option(name: string): string { const position = args.indexOf('--' + name); const value = args[position + 1]; if (position === -1 || !value || value.startsWith('--')) throw new Error('Required --' + name); return value; }
function json<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T; }
function output(value: unknown): void { const text = JSON.stringify(value, null, 2) + '\n'; const index = args.indexOf('--out'); if (index >= 0) writeFileSync(option('out'), text, { flag: 'wx' }); else process.stdout.write(text); }
try {
  switch (command) {
    case 'preflight': {
      const report = await new ConfigurationPreflight().check({ taskId: option('task-id'), mode: option('mode') as 'self_hosted' | 'hosted', step: option('step') as 'read_only' | 'model' });
      output(report); if (report.status === 'needs_configuration') process.exitCode = 2; break;
    }
    case 'assess': output(assessProject(option('repo'))); break;
    case 'plan': { const plan = proposePlan(json<ProjectAssessment>(option('assessment'))); output({ plan, planHash: digest(plan) }); break; }
    case 'approve': { const { plan } = json<{plan: AdaptationPlan}>(option('plan')); if (option('plan-hash') !== digest(plan)) throw new Error('Explicit approved plan hash does not match'); output(approvePlan(plan, { approverId: option('approver'), authorizationRef: option('authorization-ref') })); break; }
    case 'preview': output(previewPatch(option('repo'), json<{plan: AdaptationPlan}>(option('plan')).plan, json<ProjectAssessment>(option('assessment')))); break;
    case 'apply': output(applyApprovedPlan({ sourceRoot: option('repo'), destination: option('worktree'), assessment: json(option('assessment')), plan: json<{plan: AdaptationPlan}>(option('plan')).plan, approval: json(option('approval')) })); break;
    case 'verify': output(verifyAdaptation(json<AppliedTransformation>(option('patch')))); break;
    case 'revert': revertAdaptation(json<AppliedTransformation>(option('patch'))); output({ status: 'reverted', note: 'Only patch-owned files restored; isolated worktree retained.' }); break;
    default: throw new Error('Usage: ae preflight|assess|plan|approve|preview|apply|verify|revert. See skills/ae-adapt/SKILL.md.');
  }
} catch (error) { process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n'); process.exitCode = 1; }
