import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aeMigrations, AE_COMPATIBILITY, installFixedSource, doctorInstallation, ConversationRetention, type SqlPool } from '../src/index.js';
test('migration ownership is one additive fixed list, never DBOS or host schemas',()=>{
  assert.deepEqual(aeMigrations.map(m=>m.version),[1,2]);
  for(const m of aeMigrations){assert.doesNotMatch(m.sql,/\bDROP\b|\bDELETE\b|\bdbos\b|qualification_host/i);assert.match(m.sql,/IF NOT EXISTS/);}
  assert.equal(AE_COMPATIBILITY.runWorkflow,'ae-v1');assert.equal(AE_COMPATIBILITY.sdk,'0.21.0');
});
test('install rejects unpinned sources and symlink destinations before copying or commands',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ae-distribution-unit-'));
  try{mkdirSync(join(dir,'source'));mkdirSync(join(dir,'cache'));symlinkSync(join(dir,'source'),join(dir,'link'));
    assert.throws(()=>installFixedSource({source:join(dir,'source'),destination:join(dir,'new'),cache:join(dir,'cache'),commit:'main',tree:'head'}),/FULL_SOURCE_PIN/);
    assert.throws(()=>installFixedSource({source:join(dir,'source'),destination:join(dir,'link','new'),cache:join(dir,'cache'),commit:'a'.repeat(40),tree:'b'.repeat(40)}),/SYMLINK_PATH/);
    writeFileSync(join(dir,'source','.ae-installation.json'),'{}');assert.throws(()=>doctorInstallation(join(dir,'source')),/INVALID_INSTALL_RECEIPT/);
  }finally{rmSync(dir,{recursive:true});}
});
test('retention refuses missing/current revoked authority and unsafe bounds without SQL',async()=>{
  const pool={connect:async()=>{throw new Error('must not connect');}} as unknown as SqlPool;
  const p={tenantId:'a',applicationId:'app',subjectId:'u',roles:['agentic:retention'],scopes:[]};
  const denied=new ConversationRetention(pool,()=>({...p,roles:[]}));
  await assert.rejects(denied.run(p,{cutoff:new Date().toISOString()}),/RETENTION_AUTHORITY/);
  const changed=new ConversationRetention(pool,()=>({...p,tenantId:'other'}));await assert.rejects(changed.run(p,{cutoff:new Date().toISOString()}),/RETENTION_AUTHORITY/);
  const allowed=new ConversationRetention(pool,p=>p);
  for(const request of [{cutoff:'invalid'},{cutoff:new Date(Date.now()+1e6).toISOString()},{cutoff:new Date().toISOString(),limit:101}])await assert.rejects(allowed.run(p,request),/INVALID_RETENTION_BOUND/);
});
