import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
test('vendored Kokonut originals match audited fixed commit manifest',async()=>{
 const base='packages/ui/vendor/kokonut/';
 const manifest=JSON.parse(await readFile(base+'manifest.json','utf8')) as {commit:string;files:{file:string;sha256:string}[]};
 assert.equal(manifest.commit,'590ded728c3414f871607a5d0662f9e70941d054');
 for(const item of manifest.files)assert.equal(createHash('sha256').update(await readFile(base+item.file)).digest('hex'),item.sha256);
 const license=await readFile(base+'LICENSE','utf8');assert.match(license,/MIT License/);assert.match(license,/2025 kokonutUI/);
});
