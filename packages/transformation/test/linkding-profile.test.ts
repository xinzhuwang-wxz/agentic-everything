import test from 'node:test';
import assert from 'node:assert/strict';
import { isLinkdingSourcePath, linkdingHashes } from '../src/linkding-baseline.js';
test('Linkding pinned source paths include exact upstream public shortcut, not arbitrary unsafe paths',()=>{
 for(const path of Object.keys(linkdingHashes))assert.equal(isLinkdingSourcePath(path),true,path);
 for(const path of ['/etc/passwd','../escape','docs/../escape','docs//file','docs/./file','docs/src/assets/Other File.shortcut'])assert.equal(isLinkdingSourcePath(path),false,path);
});
