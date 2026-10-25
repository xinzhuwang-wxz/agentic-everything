import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketCapabilities } from '@ae/capabilities';
import { DeterministicWorkflowRuntime } from './runtime.js';
import { WorkflowCatalog, validateDefinition, type WorkflowDefinition } from './definition.js';
import type { DurableTicketHost } from '../host-boundary.js';

test('server catalog pins and risk are checked before host access, DBOS submission or any business call', async () => {
  let accessed = 0;
  const host: DurableTicketHost = {
    currentPrincipal: async p => { accessed++; return p; },
    read: async () => { accessed++; throw Error('No host data access allowed'); },
    write: async () => { accessed++; throw Error('No host write allowed'); },
    query: async () => { accessed++; throw Error('No host query allowed'); },
  };
  const pin = (name: string) => { const value = ticketCapabilities.find(c => c.capabilityId === name)!; return { capabilityId: name, version: value.version, bindingHash: value.bindingHash }; };
  const definition: WorkflowDefinition = { schemaVersion: '1', workflowId: 'invalid-pins', version: 1, name: 'Invalid reviewed configuration', entry: 'read', maxElapsedMs: 1000, nodes: [
    { id: 'read', kind: 'read', capability: { ...pin('read_ticket'), version: 'unsupported' }, arguments: {}, next: 'end', retry: { maxAttempts: 1, delayMs: 0 } },
    { id: 'end', kind: 'end', message: '' },
  ] };
  const catalog = new WorkflowCatalog([definition]);
  const runtime = new DeterministicWorkflowRuntime({ databaseUrl: 'postgres://unused.invalid/test', host, catalog });
  const input = { principal: { tenantId: 't', applicationId: 'a', subjectId: 's', roles: ['editor'], scopes: ['tickets:read', 'tickets:write'] }, workflowId: definition.workflowId, version: 1, input: {} };
  await assert.rejects(runtime.start(input), /WORKFLOW_CAPABILITY_PIN_UNSUPPORTED/);
  definition.version = 2;
  const read = definition.nodes[0]!;
  if (read.kind !== 'read') throw Error('fixture');
  read.capability = pin('change_ticket_priority'); catalog.register(definition);
  await assert.rejects(runtime.start({ ...input, version: 2 }), /WORKFLOW_CAPABILITY_RISK_MISMATCH/);
  await assert.rejects(runtime.start({ ...input, version: 3 }), /WORKFLOW_VERSION_NOT_FOUND/);
  assert.equal(accessed, 0);
  definition.version = 3; read.capability = pin('read_ticket');
  const revision = validateDefinition(definition);
  const saved: import('../store.js').StoredRun = { view: { runId: 'run', status: 'running', events: [], receipts: [], persistence: 'postgres-dbos', modelMode: 'deterministic-workflow' },
    principal: input.principal, releaseId: `workflow-${revision.contentHash}`, input: revision.contentHash,
    snapshot: JSON.stringify({ schemaVersion: '1', revision, state: { cursor: 'end', input: {}, results: {}, completed: [] } }),
    pins: { sdk: '0.21.0', workflow: 'ae-deterministic-v1', policy: 'tickets-policy-v1', capability: '1' }, cancelled: false, phase: 'initial' };
  runtime.store.load = async () => saved;
  await assert.rejects(runtime.get('run', input.principal), /WORKFLOW_CHECKPOINT_INVALID/);
  assert.equal(accessed, 0, 'A corrupt state path is rejected before host access');
  await runtime.store.close();
});
