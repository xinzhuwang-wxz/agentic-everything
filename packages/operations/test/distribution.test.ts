import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installFixedSource, doctorInstallation, uninstallFixedSource } from '../src/distribution.js';
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');

test('installer disables configured fsmonitor and refuses filters before status or destination writes',()=>{
  const directory=mkdtempSync(join(tmpdir(),'ae-install-preflight-'));
  try{
    const source=join(directory,'source'),cache=join(directory,'cache'),destination=join(directory,'installation');
    mkdirSync(source);mkdirSync(cache);
    const git=(args:string[])=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',source,...args],{encoding:'utf8'}).trim();
    git(['init','-q']);
    writeFileSync(join(source,'package.json'),'{}\n');writeFileSync(join(source,'package-lock.json'),'{}\n');
    writeFileSync(join(source,'.gitattributes'),'tracked.txt filter=ae-preflight-fixture\n');writeFileSync(join(source,'tracked.txt'),'original fixture\n');
    git(['add','.']);git(['-c','user.name=AE Fixture','-c','user.email=fixture@example.invalid','commit','-qm','synthetic preflight fixture']);
    const commit=git(['rev-parse','HEAD']),tree=git(['rev-parse','HEAD^{tree}']);
    const helper=join(directory,'marker-helper.cjs'),marker=join(directory,'helper-ran');
    // The configured helper can only write this owned fixture marker; it must never run during preflight.
    writeFileSync(helper,"require('node:fs').writeFileSync(process.argv[2], 'fixture helper ran');\n");
    const command=`'${process.execPath}' '${helper}' '${marker}'`;
    git(['config','core.fsmonitor',command]);
    const index=readFileSync(join(source,'.git/index'));
    assert.throws(()=>installFixedSource({source,destination,cache,commit,tree:'b'.repeat(40)}),/SOURCE_PIN_MISMATCH/);
    assert.equal(existsSync(marker),false);assert.equal(existsSync(destination),false);
    assert.deepEqual(readFileSync(join(source,'.git/index')),index,'read-only status must not refresh the index');
    git(['config','filter.ae-preflight-fixture.clean',command]);
    git(['config','filter.ae-preflight-fixture.process',command]);
    git(['config','filter.ae-preflight-fixture.required','true']);
    writeFileSync(join(source,'tracked.txt'),'modified fixture requires filter evaluation by unguarded status\n');
    assert.throws(()=>installFixedSource({source,destination,cache,commit,tree}),/SOURCE_GIT_FILTERS_REQUIRE_REVIEW/);
    assert.equal(existsSync(marker),false);assert.equal(existsSync(destination),false);
    assert.deepEqual(readFileSync(join(source,'.git/index')),index);
  }finally{rmSync(directory,{recursive:true});}
});

test('doctor and uninstall reject inconsistent or malformed editable receipt metadata',()=>{
  const root=mkdtempSync(join(tmpdir(),'ae-install-receipt-'));
  try{
    writeFileSync(join(root,'package.json'),'{"version":"0.1.0"}\n');
    writeFileSync(join(root,'package-lock.json'),'{}\n');
    const receipt={format:'ae-source-install-v1',version:'0.1.0',commit:'a'.repeat(40),tree:'b'.repeat(40),sourceHash:'c'.repeat(64),lockHash:hash(readFileSync(join(root,'package-lock.json'))),schema:0,node:process.versions.node,npm:'11.9.0',files:['package-lock.json','package.json'].map(path=>({path,type:'file',mode:statSync(join(root,path)).mode&0o777,hash:hash(readFileSync(join(root,path)))}))};
    const write=(value:unknown)=>writeFileSync(join(root,'.ae-installation.json'),JSON.stringify(value));
    write(receipt);assert.equal(doctorInstallation(root).integrity,true);
    for(const changes of [{version:'9.9.9'},{lockHash:'0'.repeat(64)},{schema:1}]){
      write({...receipt,...changes});const result=doctorInstallation(root);
      assert.equal(result.metadataConsistent,false);assert.equal(result.integrity,false);assert.equal(result.status,'modified');
      assert.throws(()=>uninstallFixedSource(root,receipt.commit),/UNINSTALL_MODIFIED_INSTALLATION/);
      assert.equal(existsSync(join(root,'package.json')),true);
    }
    for(const changes of [{tree:'invalid'},{sourceHash:'invalid'},{node:'22.0.0'},{npm:'10.0.0'},{schema:-1},{extra:'unexpected'},{files:[...receipt.files,receipt.files[0]]},{files:[{...receipt.files[0],path:'../elsewhere'}]},{files:[{...receipt.files[0],path:'./package.json'}]},{files:[{...receipt.files[0],mode:0o1000}]},{files:[{...receipt.files[0],hash:'invalid'}]},{files:[{...receipt.files[0],target:'unexpected'}]}]){
      write({...receipt,...changes});assert.throws(()=>doctorInstallation(root),/INVALID_INSTALL_RECEIPT/);
      assert.throws(()=>uninstallFixedSource(root,receipt.commit),/INVALID_INSTALL_RECEIPT/);
      assert.equal(existsSync(join(root,'package.json')),true);
    }
    write(receipt);assert.equal(doctorInstallation(root).integrity,true);
    // A consistent rewritten receipt is intentionally not an authenticity test; it is only local state.
  }finally{rmSync(root,{recursive:true});}
});

test('doctor hashes full multi-chunk files and detects boundary, final-byte and truncation changes',()=>{
  const root=mkdtempSync(join(tmpdir(),'ae-install-hash-chunks-'));
  try{
    writeFileSync(join(root,'package.json'),'{"version":"0.1.0"}\n');
    writeFileSync(join(root,'package-lock.json'),'{}\n');
    const payload=Buffer.alloc(3*64*1024+17);for(let i=0;i<payload.length;i++)payload[i]=i%251;
    writeFileSync(join(root,'payload.bin'),payload);
    const receipt={format:'ae-source-install-v1',version:'0.1.0',commit:'a'.repeat(40),tree:'b'.repeat(40),sourceHash:'c'.repeat(64),lockHash:hash(readFileSync(join(root,'package-lock.json'))),schema:0,node:process.versions.node,npm:'11.9.0',files:['package-lock.json','package.json','payload.bin'].map(path=>({path,type:'file',mode:statSync(join(root,path)).mode&0o777,hash:hash(readFileSync(join(root,path)))}))};
    writeFileSync(join(root,'.ae-installation.json'),JSON.stringify(receipt));
    assert.equal(doctorInstallation(root).integrity,true);
    for(const offset of [0,64*1024-1,64*1024,2*64*1024,payload.length-1]){
      const modified=Buffer.from(payload);modified[offset]=modified[offset]!^0xff;writeFileSync(join(root,'payload.bin'),modified);
      assert.equal(doctorInstallation(root).integrity,false,`changed byte ${offset} must be hashed`);
      assert.throws(()=>uninstallFixedSource(root,receipt.commit),/UNINSTALL_MODIFIED_INSTALLATION/);
    }
    writeFileSync(join(root,'payload.bin'),payload.subarray(0,payload.length-1));assert.equal(doctorInstallation(root).integrity,false);
    writeFileSync(join(root,'payload.bin'),payload);assert.equal(doctorInstallation(root).integrity,true);
  }finally{rmSync(root,{recursive:true});}
});
