import test from 'node:test';
import assert from 'node:assert/strict';
import { LINKDING_FILES, linkdingRecipe, checkLinkdingTemplate } from '../src/recipes/linkding.js';
test('linkding recipe is domain-specific, exact-template and approval-required',()=>{
 assert.equal(linkdingRecipe.ref.id,'linkding-django');
 assert.equal(linkdingRecipe.matches(new Map(),['Python manifest observed']),false);
 assert.throws(()=>linkdingRecipe.preview(()=>null),/Pinned linkding input drift/);
 assert.match(LINKDING_FILES['agentic/runtime.mjs']!,/GovernedRuntime/);
 assert.match(LINKDING_FILES['agentic/runtime.mjs']!,/ToolBroker/);
 assert.match(LINKDING_FILES['ae_linkding/host.py']!,/transaction.atomic/);
 assert.match(LINKDING_FILES['ae_linkding/host.py']!,/tag_bookmarks/);
 assert.doesNotMatch(LINKDING_FILES['ae_linkding/host.py']!,/import requests|http_client\./);
 assert.equal(checkLinkdingTemplate('ae_linkding/host.py',LINKDING_FILES['ae_linkding/host.py']!),true);
 assert.equal(checkLinkdingTemplate('ae_linkding/host.py',LINKDING_FILES['ae_linkding/host.py']!+'# drift'),false);
 assert.deepEqual(linkdingRecipe.planDetails.cost,{currency:'USD',maximum:0,paidCallsAllowed:false});
});
