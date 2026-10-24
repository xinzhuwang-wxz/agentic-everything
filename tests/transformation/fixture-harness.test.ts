import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertFixtureAuthorization, assertTrustedFixtureDelivery, checkFixtureDeliveryEvidence, fixtureAuthorization, runFixtureDelivery } from '../../packages/transformation/src/fixture-harness.js';
import { helpdeskRecipe } from '../../packages/transformation/src/recipes/react-helpdesk.js';
function fixture() {
  const work=mkdtempSync(join(tmpdir(),'ae-trust-test-')),sourceRoot=join(work,'source'),candidateRoot=join(work,'candidate');
  cpSync(resolve('fixtures/existing-react-helpdesk'),sourceRoot,{recursive:true});cpSync(sourceRoot,candidateRoot,{recursive:true});
  for(const change of helpdeskRecipe.preview(path=>{try{return readFileSync(join(sourceRoot,path),'utf8');}catch{return null;}})){mkdirSync(join(candidateRoot,change.path,'..'),{recursive:true});writeFileSync(join(candidateRoot,change.path),change.after);}
  return {work,sourceRoot,candidateRoot};
}
test('fixed execution profile requires exact explicit scope',()=>{
  assertFixtureAuthorization(fixtureAuthorization);
  for(const value of [undefined,{}, {...fixtureAuthorization,maximumHeapMiB:641},{...fixtureAuthorization,actions:['browser']},{...fixtureAuthorization,command:'echo pass'}])assert.throws(()=>assertFixtureAuthorization(value));
});
test('trust checks whole original and exact recipe candidate, including unlisted executable inputs',()=>{
  const f=fixture();try{
    assertTrustedFixtureDelivery(f);
    writeFileSync(join(f.sourceRoot,'extra.ts'),'throw Error("untrusted")');assert.throws(()=>assertTrustedFixtureDelivery(f),/Full source/);rmSync(join(f.sourceRoot,'extra.ts'));
    writeFileSync(join(f.candidateRoot,'src/ae/AgenticMount.tsx'),'export {};');assert.throws(()=>assertTrustedFixtureDelivery(f),/exact trusted recipe/);
  }finally{rmSync(f.work,{recursive:true,force:true});}
});
test('symlink and modified business domain cannot enter trusted execution',()=>{
  const f=fixture();try{
    symlinkSync(join(f.work,'source'),join(f.candidateRoot,'extra'));assert.throws(()=>assertTrustedFixtureDelivery(f),/symlink|unapproved path/);rmSync(join(f.candidateRoot,'extra'));
    writeFileSync(join(f.sourceRoot,'src/tickets.ts'),'export const injected = true;');assert.throws(()=>assertTrustedFixtureDelivery(f),/Full source/);
  }finally{rmSync(f.work,{recursive:true,force:true});}
});
test('unavailable unqualified browser gives explicit not-run evidence, never a fabricated pass',async()=>{
  const f=fixture();try{
    const result=await runFixtureDelivery({...f,outputDirectory:join(f.work,'evidence'),verificationAuthorization:fixtureAuthorization,authorizationExpiresAt:new Date(Date.now()+60000).toISOString(),browserExecutable:join(f.work,'unavailable-browser')});
    assert.equal(result.status,'fail');assert.equal(result.checks.length,5);assert.ok(result.checks.every(c=>c.status==='not-run'));
    const artifacts=Object.fromEntries(Object.entries(result.artifacts).map(([key,path])=>[key,JSON.parse(readFileSync(path,'utf8'))]));
    await checkFixtureDeliveryEvidence(artifacts as unknown as Parameters<typeof checkFixtureDeliveryEvidence>[0]);
    artifacts.report.status='pass';await assert.rejects(checkFixtureDeliveryEvidence(artifacts as unknown as Parameters<typeof checkFixtureDeliveryEvidence>[0]));
  }finally{rmSync(f.work,{recursive:true,force:true});}
});
