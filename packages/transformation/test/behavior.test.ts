import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { captureBaseline, writeBaseline, readBaseline, improvementRegistryHash, type PublicBehaviorAdapter } from '@ae/verification';
import { assessProject, proposePlan, approvePlan, applyApprovedPlan, verifyAdaptation, verifyAdaptationWithBehavior, adaptationCodeHash, expectedBaselineCodeHash, digest } from '../src/index.js';

// Trusted local fixture harness. Each case loads a fresh copy of the actual original/generated
// public business module; it is not exposed to arbitrary customer code via CLI or MCP.
let sequence = 0;
function adapter(root: string): PublicBehaviorAdapter {
  return { safety: 'isolated-seeded-fixture', async execute(scenario) {
    assert.equal(scenario.seed, 'fixture-default-v1');
    const source = readFileSync(join(root, 'src/tickets.ts'), 'utf8');
    const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
    const business = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}#case-${sequence++}`) as {
      readTicket: (tenant: string, id: string) => { id:string; tenantId:string; title:string; priority:string; version:number };
      changePriority: (tenant:string,id:string,priority:string,version:number) => unknown;
    };
    const before = business.readTicket('tenant-a', 'ticket-1');
    if (scenario.input === 'query') return { output: before, sideEffects: [], receipt: null };
    if (scenario.input === 'update') {
      const result = business.changePriority('tenant-a', 'ticket-1', 'high', before.version);
      const after = business.readTicket('tenant-a', 'ticket-1');
      return { output: result as never, sideEffects: [{ before, after }], receipt: { target: after.id, version: after.version } };
    }
    if (scenario.input === 'stale') {
      let rejected = false; try { business.changePriority('tenant-a', 'ticket-1', 'high', 99); } catch { rejected = true; }
      return { output: { rejected }, sideEffects: [], receipt: business.readTicket('tenant-a', 'ticket-1') };
    }
    throw new Error('Unreviewed fixture scenario');
  } };
}

test('source-bound original/generated business comparison executes same seeded public boundaries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ae-bound-behavior-')); const source = join(directory, 'source');
  cpSync(resolve('fixtures/existing-react-helpdesk'), source, { recursive: true });
  const git = (...args:string[]) => execFileSync('git', ['-C', source, ...args], { stdio:'pipe' });
  git('init'); git('config','user.name','AE fixture'); git('config','user.email','fixture@example.invalid'); git('add','.'); git('commit','-m','Original behavior baseline');
  const assessment = assessProject(source); const plan = proposePlan(assessment);
  const baselineCodeHash = expectedBaselineCodeHash(assessment, plan);
  assert.equal(adaptationCodeHash(source, assessment, plan), baselineCodeHash);
  const provenance = { sourceVersion: assessment.baseCommit, codeHash: baselineCodeHash, environment: 'Node trusted isolated fixture module', environmentHash: digest({ node:process.version, mode:'fresh-module-per-case' }), dataHash:digest('fixture-default-v1'), schemaVersion:'ticket-business-observation-v1', adapterVersion:'reviewed-fixture-domain-v1' };
  const baseline = await captureBaseline({ adapter:adapter(source), cases: ['query','update','stale'].map(id => ({ id,input:id,seed:'fixture-default-v1',covers:['Public host read/update and version check'] })), provenance, normalization:[], coverage:{scope:'Original and generated host public ticket business functions, same seeded records; outputs and persisted in-memory effects',unknowns:['Does not prove all inputs, HTTP identity/authorization, browser layout or model quality. Assistant wording and protocol/UI metadata are separate acceptance surfaces, not normalized business outputs.']} });
  writeBaseline(join(directory, 'baseline.json'), baseline);
  assert.equal(readBaseline(join(directory, 'baseline.json')).hash, baseline.hash);
  const applied = applyApprovedPlan({sourceRoot:source,destination:join(directory,'generated'),assessment,plan,approval:approvePlan(plan,{approverId:'test-user',authorizationRef:'explicit-fixture-plan-approval'})});
  const codeHash = adaptationCodeHash(applied.patch.worktree, assessment, plan);
  assert.notEqual(codeHash, baselineCodeHash);
  const input = {assessment,plan,baseline,adapter:adapter(applied.patch.worktree),provenance:{...provenance,codeHash},configuration:{baselineHash:baseline.hash,candidateCodeHash:codeHash,registryHash:improvementRegistryHash([]),enabled:[]},improvements:[]};
  assert.equal(verifyAdaptation(applied).checks.find(check=>check.name==='black-box-business-differential')?.status,'not-run');
  const result = await verifyAdaptationWithBehavior(applied,input);
  writeFileSync(join(directory, 'differential.json'), JSON.stringify(result.differential, null, 2));
  assert.equal(result.differential.cases.length, 3);
  assert.equal(result.verification.checks.find(check=>check.name==='black-box-business-differential')?.status,'pass');
  assert.equal(result.verification.checks.find(check=>check.name==='browser-acceptance')?.status,'not-run');
  await assert.rejects(verifyAdaptationWithBehavior(applied,{...input,provenance:{...input.provenance,codeHash:'0'.repeat(64)}}),/source drift/);
  await assert.rejects(verifyAdaptationWithBehavior(applied,{...input,assessment:{...assessment,baseCommit:'different'}}),/does not bind/);
  writeFileSync(join(applied.patch.worktree,'src/api.ts'),'// later source change');
  await assert.rejects(verifyAdaptationWithBehavior(applied,input),/source drift/);
});
