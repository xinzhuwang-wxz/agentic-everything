import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReferenceContext, referenceContextKey } from '../src/context.js';
test('reference context is a stable copy independent of object insertion order',()=>{
 const original={warehouseRef:'warehouse-1',sku:'desk-01'};const copy=normalizeReferenceContext(original);
 original.sku='desk-02';assert.deepEqual(copy,{sku:'desk-01',warehouseRef:'warehouse-1'});
 assert.equal(referenceContextKey(copy),referenceContextKey({sku:'desk-01',warehouseRef:'warehouse-1'}));
 assert.notEqual(referenceContextKey({sku:'a:b',documentRef:'c'}),referenceContextKey({sku:'a',documentRef:'b:c'}));
});
test('reference context is not an arbitrary business or authority envelope',()=>{
 for(const context of [null,[],new Date(),{sku:''},{sku:'desk 01'},{record:{id:'1'}},{message:'a conversation transcript'},{accessToken:'abc'},{'bad key':'a'}])assert.throws(()=>normalizeReferenceContext(context as never));
 assert.deepEqual(normalizeReferenceContext({sku:'desk-01',principal:{subjectId:'forged'},tenantId:'forged',roles:['admin']} as never),{sku:'desk-01'});
});
