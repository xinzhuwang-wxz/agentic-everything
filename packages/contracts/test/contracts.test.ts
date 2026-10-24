import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrincipalSchema, ModelResponseSchema, ToolResultSchema, RelativePath, ApprovalDecisionSchema, CapabilityVersionSchema } from '../src/index.js';
import { contentHash } from '../src/hash.js';
import { z } from 'zod';

test('canonical hashing ignores object key ordering, preserves array ordering', () => {
  assert.equal(contentHash({ b: 2, a: 1 }), contentHash({ a: 1, b: 2 }));
  assert.notEqual(contentHash([1, 2]), contentHash([2, 1]));
  assert.throws(() => contentHash({ value: NaN }));
});
test('contracts fail closed on injected authority and missing tenant', () => {
  assert.equal(PrincipalSchema.safeParse({ applicationId: 'app', subjectId: 'u', roles: [], scopes: [] }).success, false);
  assert.equal(ModelResponseSchema.safeParse({ schemaVersion: '1', requestId: 'r', mode: 'simulated', message: '', toolCalls: [], finishReason: 'stop', approved: true }).success, false);
});
test('relative paths cannot escape or use ambiguous components', () => {
  for (const path of ['/tmp/x', '../x', 'src/../x', 'src\\x', 'src//x', './x']) assert.equal(RelativePath.safeParse(path).success, false, path);
  assert.equal(RelativePath.parse('src/ae/bridge.ts'), 'src/ae/bridge.ts');
});
test('unknown outcomes cannot be mislabeled as retryable failures', () => {
  assert.equal(ToolResultSchema.parse({ status: 'outcome-unknown', operationId: 'op', message: 'No receipt yet' }).status, 'outcome-unknown');
  assert.equal(ToolResultSchema.safeParse({ status: 'outcome-unknown', operationId: 'op', message: 'No receipt', retryable: true }).success, false);
});
test('approval decision requires exact digest', () => {
  assert.equal(ApprovalDecisionSchema.safeParse({ approvalId: 'a', decision: 'approve' }).success, false);
  assert.equal(ApprovalDecisionSchema.safeParse({ approvalId: 'a', decision: 'approve', expectedHash: 'a'.repeat(64) }).success, true);
});
test('runtime schema emits standard JSON Schema', () => {
  const schema = z.toJSONSchema(CapabilityVersionSchema);
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
});
