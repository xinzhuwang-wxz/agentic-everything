import test from 'node:test';
import assert from 'node:assert/strict';
import {revealRecipe,revealHashes} from '../src/recipes/reveal.js';
import {parse} from '../src/ast.js';
test('reveal recipe fails closed without exact pinned input hashes',()=>{assert.equal(revealRecipe.matches(new Map(),[]),false);assert.equal(revealRecipe.matches(new Map(Object.keys(revealHashes).map(k=>[k,'not the upstream bytes'])),[]),false)});
test('reveal recipe emits bounded modules, conflicts fail closed, host source unchanged',()=>{const changes=revealRecipe.preview(()=>null);assert.deepEqual(changes.map(c=>c.path),revealRecipe.outputs);assert.ok(changes.every(c=>c.path.startsWith('agentic/')&&c.path.endsWith('.mjs')&&c.before===null));for(const c of changes)parse(c.path,c.after);assert.throws(()=>revealRecipe.preview(()=>''),/conflicts/);assert.ok(!revealRecipe.outputs.includes('index.html'));assert.equal(revealRecipe.planDetails.cost.maximum,0)});
