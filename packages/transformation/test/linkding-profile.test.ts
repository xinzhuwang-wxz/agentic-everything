import test from 'node:test';
import assert from 'node:assert/strict';
import { isLinkdingSourcePath, linkdingHashes, linkdingPassedCount } from '../src/linkding-baseline.js';
test('Linkding pinned source paths include exact upstream public shortcut, not arbitrary unsafe paths',()=>{
 for(const path of Object.keys(linkdingHashes))assert.equal(isLinkdingSourcePath(path),true,path);
 for(const path of ['/etc/passwd','../escape','docs/../escape','docs//file','docs/./file','docs/src/assets/Other File.shortcut'])assert.equal(isLinkdingSourcePath(path),false,path);
});
test('pinned pytest terminal summary includes separately reported subtests',()=>{
 assert.equal(linkdingPassedCount('356 passed, 15 subtests passed in 48.01s\n'),356);
 assert.equal(linkdingPassedCount('20 passed in 1.23s\n'),20);
 assert.ok(Number.isNaN(linkdingPassedCount('356 failed in 1s\n')));
});
