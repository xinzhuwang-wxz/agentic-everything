#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { doctorInstallation, installFixedSource, uninstallFixedSource, inspectAeSchema, migrateAeSchema, type SqlPool } from '@ae/operations';
import type { AppliedTransformation } from '@ae/transformation';
import type { AdaptationPlan, ProjectAssessment, VerificationReport } from '@ae/contracts';

const [command, ...args] = process.argv.slice(2);
function option(name: string): string { const position = args.indexOf('--' + name); const value = args[position + 1]; if (position === -1 || !value || value.startsWith('--')) throw new Error('Required --' + name); return value; }
function json<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T; }
function output(value: unknown): void { const text = JSON.stringify(value, null, 2) + '\n'; const index = args.indexOf('--out'); if (index >= 0) writeFileSync(option('out'), text, { flag: 'wx' }); else process.stdout.write(text); }
function verificationExit(report: VerificationReport): void { process.exitCode = report.checks.some(check => check.status === 'fail') ? 1 : report.checks.some(check => check.status !== 'pass') ? 2 : 0; }
const options: Record<string, string[]> = { install: ['source','commit','tree','destination','cache','out'], upgrade: ['source','commit','tree','destination','cache','previous','out'], doctor: ['installation','out'], uninstall: ['installation','commit','out'], 'schema-check':['out'], 'schema-apply':['out'], assess: ['repo','out'], plan: ['assessment','verification-profile','out'], approve: ['plan','plan-hash','approver','authorization-ref','out'], preview: ['repo','plan','assessment','out'], apply: ['repo','worktree','assessment','plan','approval','baseline-out','out'], verify: ['patch','out'], revert: ['patch','out'], deliver: ['repo','assessment','plan','approval','patch','out-dir'], 'delivery-check': ['bundle','out'] };
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
    case 'install': case 'upgrade': output(installFixedSource({source:option('source'),commit:option('commit'),tree:option('tree'),destination:option('destination'),cache:option('cache'),...(command==='upgrade'?{previous:option('previous')}:{})})); break;
    case 'doctor': {const result=doctorInstallation(option('installation'));output(result);process.exitCode=result.integrity&&result.nodeCompatible?0:2;break;}
    case 'uninstall': output(uninstallFixedSource(option('installation'),option('commit')));break;
    case 'schema-check': case 'schema-apply': {
      if(!process.env.AE_DATABASE_URL)throw new Error('Set AE_DATABASE_URL for the explicitly authorized AE database');
      const {Pool}=createRequire(import.meta.url)('pg') as {Pool:new(options:{connectionString:string;max:number})=>SqlPool&{end():Promise<void>}};
      const pool=new Pool({connectionString:process.env.AE_DATABASE_URL,max:2});try{output(await(command==='schema-check'?inspectAeSchema(pool):migrateAeSchema(pool)));}finally{await pool.end();}break;
    }
    // Operations commands must not retain transformation/browser tooling while compiling an installation.
    case 'assess': { const { assessProject } = await import('@ae/transformation'); output(assessProject(option('repo'))); break; }
    case 'plan': { const { proposePlan, digest } = await import('@ae/transformation'); const profile = args.includes('--verification-profile') ? option('verification-profile') : undefined; if (profile !== undefined && profile !== 'react-helpdesk-synthetic-v1' && profile !== 'python-inventory-synthetic-v1' && profile !== 'java-spring-inventory-synthetic-v1' && profile !== 'reveal-upstream-v1' && profile !== 'linkding-upstream-v1') throw new Error('Unsupported verification profile'); const plan = proposePlan(json<ProjectAssessment>(option('assessment')), profile ? { verificationProfile: profile } : undefined); output({ plan, planHash: digest(plan) }); break; }
    case 'approve': { const { approvePlan, digest } = await import('@ae/transformation'); const { plan } = json<{plan: AdaptationPlan}>(option('plan')); if (option('plan-hash') !== digest(plan)) throw new Error('Explicit approved plan hash does not match'); output(approvePlan(plan, { approverId: option('approver'), authorizationRef: option('authorization-ref') })); break; }
    case 'preview': { const { previewPatch } = await import('@ae/transformation'); output(previewPatch(option('repo'), json<{plan: AdaptationPlan}>(option('plan')).plan, json<ProjectAssessment>(option('assessment')))); break; }
    case 'apply': { const { applyApprovedPlan, applyApprovedPlanWithBaseline } = await import('@ae/transformation'); const input = { sourceRoot: option('repo'), destination: option('worktree'), assessment: json<ProjectAssessment>(option('assessment')), plan: json<{plan: AdaptationPlan}>(option('plan')).plan, approval: json<import('@ae/contracts').ApprovedChangeSet>(option('approval')) }; if (input.plan.verificationAuthorization) output(await applyApprovedPlanWithBaseline({...input,baselinePath:option('baseline-out')})); else { if(args.includes('--baseline-out')) throw new Error('Baseline capture requires an explicitly approved verification profile'); output(applyApprovedPlan(input)); } break; }
    case 'verify': { const { verifyAdaptation } = await import('@ae/transformation'); const report = verifyAdaptation(json<AppliedTransformation>(option('patch'))); output(report); verificationExit(report); break; }
    case 'deliver': {
      const { createDelivery } = await import('@ae/transformation');
      const manifest = await createDelivery({ sourceRoot: option('repo'), assessment: json(option('assessment')), plan: json<{plan: AdaptationPlan}>(option('plan')).plan, approval: json(option('approval')), applied: json<AppliedTransformation>(option('patch')), outputDirectory: option('out-dir') });
      output(manifest); process.exitCode = manifest.status === 'failed' ? 1 : manifest.status === 'complete' ? 0 : 2; break;
    }
    case 'delivery-check': {
      const { checkDelivery } = await import('@ae/transformation');
      const result = await checkDelivery(option('bundle')); output(result); process.exitCode = !result.valid || result.manifest?.status === 'failed' ? 1 : result.manifest?.status === 'complete' ? 0 : 2; break;
    }
    case 'revert': { const { revertAdaptation } = await import('@ae/transformation'); revertAdaptation(json<AppliedTransformation>(option('patch'))); output({ status: 'reverted', note: 'Only patch-owned files restored; isolated worktree retained.' }); break; }
    default: throw new Error('Usage: ae assess|plan|approve|preview|apply|verify|deliver|delivery-check|revert|install|upgrade|doctor|uninstall|schema-check|schema-apply. See skills/ae-adapt/SKILL.md.');
  }
} catch (error) { process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n'); process.exitCode = 1; }
