import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketCapabilities } from '@ae/capabilities';
import { inputState, resolveArguments, resolveBinding, validateDefinition, WorkflowCatalog, type WorkflowDefinition } from './definition.js';

const pin = (id: string) => { const capability = ticketCapabilities.find(value => value.capabilityId === id)!; return { capabilityId: id, version: capability.version, bindingHash: capability.bindingHash }; };
const fixture = (): WorkflowDefinition => ({ schemaVersion: '1', workflowId: 'ticket-triage', version: 1, name: 'Controlled priority triage', entry: 'read', maxElapsedMs: 10000, nodes: [
  { id: 'read', kind: 'read', capability: pin('read_ticket'), arguments: { ticketId: { kind: 'input', path: ['ticketId'] } }, next: 'branch', retry: { maxAttempts: 2, delayMs: 0 } },
  { id: 'branch', kind: 'branch', value: { kind: 'result', node: 'read', path: ['priority'] }, equals: 'low', then: 'write', else: 'skip' },
  { id: 'write', kind: 'write', capability: pin('change_ticket_priority'), arguments: { ticketId: { kind: 'input', path: ['ticketId'] }, expectedVersion: { kind: 'result', node: 'read', path: ['version'] }, priority: { kind: 'literal', value: 'high' } }, next: 'done' },
  { id: 'done', kind: 'end', message: 'The approved host operation completed.' },
  { id: 'skip', kind: 'end', message: 'No change is needed.' },
] });

test('immutable workflow catalog snapshots are detached and retain multiple explicit versions', () => {
  const value = fixture(), catalog = new WorkflowCatalog([value]);
  const old = catalog.get(value.workflowId, 1);
  value.name = 'changed';
  assert.equal(catalog.get(value.workflowId, 1).definition.name, old.definition.name);
  assert.throws(() => catalog.register(value), /WORKFLOW_VERSION_IMMUTABLE/);
  value.version = 2; catalog.register(value);
  assert.equal(catalog.list().length, 2);
  old.definition.name = 'external mutation';
  assert.notEqual(catalog.get(value.workflowId, 1).definition.name, old.definition.name);
  assert.throws(() => catalog.get(value.workflowId, 3), /WORKFLOW_VERSION_NOT_FOUND/);
});

test('bounded bindings resolve only own data properties with missing values failing closed', () => {
  const definition = fixture(), state = inputState(definition, { ticketId: 't1', array: ['a'] });
  state.results.read = { priority: 'low', version: 1 };
  const node = definition.nodes.find(value => value.id === 'write')!;
  assert.equal(node.kind, 'write');
  if (node.kind !== 'write') throw Error('fixture');
  assert.deepEqual(resolveArguments(node, state), { ticketId: 't1', priority: 'high', expectedVersion: 1 });
  assert.equal(resolveBinding({ kind: 'input', path: ['array', '0'] }, state), 'a');
  assert.throws(() => resolveBinding({ kind: 'input', path: ['missing'] }, state), /WORKFLOW_VALUE_MISSING/);
  assert.throws(() => resolveBinding({ kind: 'input', path: ['toString'] }, state), /WORKFLOW_VALUE_MISSING/);
});

test('workflow validator rejects cycles, dangling/unreachable nodes and repeated node IDs', () => {
  const cycle = fixture(); (cycle.nodes[0] as Extract<WorkflowDefinition['nodes'][number], { kind: 'read' }>).next = 'read';
  assert.throws(() => validateDefinition(cycle), /WORKFLOW_CYCLE_DENIED/);
  const dangling = fixture(); (dangling.nodes[0] as Extract<WorkflowDefinition['nodes'][number], { kind: 'read' }>).next = 'missing';
  assert.throws(() => validateDefinition(dangling), /WORKFLOW_TARGET_MISSING/);
  const unreachable = fixture(); unreachable.nodes.push({ id: 'orphan', kind: 'end', message: '' });
  assert.throws(() => validateDefinition(unreachable), /WORKFLOW_UNREACHABLE_NODE/);
  const duplicate = fixture(); duplicate.nodes.push(duplicate.nodes[0]!);
  assert.throws(() => validateDefinition(duplicate), /WORKFLOW_GRAPH_INVALID/);
});

test('terminal-write constraint and read-result domination prevent unresolved downstream work', () => {
  const nonterminal = fixture(); (nonterminal.nodes[2] as Extract<WorkflowDefinition['nodes'][number], { kind: 'write' }>).next = 'branch';
  assert.throws(() => validateDefinition(nonterminal), /WORKFLOW_WRITE_MUST_BE_TERMINAL/);
  const missing = fixture(); (missing.nodes[1] as Extract<WorkflowDefinition['nodes'][number], { kind: 'branch' }>).value = { kind: 'result', node: 'write', path: [] };
  assert.throws(() => validateDefinition(missing), /WORKFLOW_RESULT_NOT_DOMINATING/);
  const bypass = fixture(); bypass.nodes.unshift({ id: 'start', kind: 'branch', value: { kind: 'literal', value: true }, equals: true, then: 'read', else: 'branch' }); bypass.entry = 'start';
  assert.throws(() => validateDefinition(bypass), /WORKFLOW_RESULT_NOT_DOMINATING/);
});

test('limits reject excessive retries, nodes, input and executable/prototype shapes', () => {
  const retry = fixture(); (retry.nodes[0] as Extract<WorkflowDefinition['nodes'][number], { kind: 'read' }>).retry.maxAttempts = 4;
  assert.throws(() => validateDefinition(retry), /WORKFLOW_DEFINITION_INVALID/);
  const extra = { ...fixture(), javascript: 'return process.env' };
  assert.throws(() => validateDefinition(extra), /WORKFLOW_DEFINITION_INVALID/);
  assert.throws(() => validateDefinition({ ...fixture(), nodes: Array(33).fill(fixture().nodes[0]) }), /WORKFLOW_DEFINITION_INVALID/);
  assert.throws(() => inputState(fixture(), { value: 'x'.repeat(16385) }), /WORKFLOW_DATA_LIMIT/);
  assert.throws(() => inputState(fixture(), JSON.parse('{"__proto__":{"admin":true}}')), /WORKFLOW_UNSAFE_KEY/);
  assert.throws(() => inputState(fixture(), { value: () => true }), /WORKFLOW_JSON_REQUIRED/);
  let nested: unknown = 1; for (let i = 0; i < 14; i++) nested = { a: nested };
  assert.throws(() => inputState(fixture(), nested), /WORKFLOW_DATA_LIMIT/);
});

test('equivalent object key order keeps definition hash stable, changed branches require a new hash', () => {
  const first = validateDefinition(fixture());
  const second = validateDefinition({ ...fixture(), name: fixture().name });
  assert.equal(first.contentHash, second.contentHash);
  const changed = fixture(); (changed.nodes[1] as Extract<WorkflowDefinition['nodes'][number], { kind: 'branch' }>).equals = 'high';
  assert.notEqual(validateDefinition(changed).contentHash, first.contentHash);
});
