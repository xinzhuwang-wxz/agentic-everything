import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent, Runner, RunContext, RunState, tool } from '@openai/agents';
import { z } from 'zod';
import type { JsonObject, ModelRequest } from '@ae/contracts';
import { ticketCapabilities, ticketToolDefinitions } from '@ae/capabilities';
import { AgentsModelPort, createAgentsTools } from '@ae/runtime-adapters';

const allIds = ticketCapabilities.map(capability => capability.capabilityId);
const unused = async () => { throw new Error('No invocation expected'); };
function withoutDialect(schema: JsonObject) {
  // Zod emits 2020-12; the official Agents SDK emits draft-07. No constraints are discarded.
  const { $schema: _dialect, ...shape } = schema;
  return shape;
}
const valid = {
  read_ticket: { ticketId: 't1' },
  change_ticket_priority: { ticketId: 't1', priority: 'high', expectedVersion: 1 },
  read_ticket_members: { ticketId: 't1' },
  change_ticket_assignee: { ticketId: 't1', assigneeId: 'm1', expectedVersion: 1 },
} as const;

test('all official SDK tools share exact catalog constraints, description and approval facts', async () => {
  const tools = createAgentsTools(allIds, unused);
  assert.deepEqual(tools.map(tool => tool.name), allIds);
  for (const tool of tools) {
    const capability = ticketCapabilities.find(candidate => candidate.capabilityId === tool.name)!;
    assert.deepEqual(withoutDialect(tool.parameters as JsonObject), withoutDialect(capability.inputSchema));
    assert.equal(tool.description, capability.description);
    assert.equal(await tool.needsApproval(new RunContext({}), valid[tool.name as keyof typeof valid], 'call-1'), capability.approvalRequired);
    assert.equal(capability.risk === 'read', !capability.approvalRequired);
  }
});

test('catalog selection remains fail-closed, ordered and compatible with two-tool hosts', () => {
  for (const ids of [['unknown'], ['toString'], ['read_ticket', 'unknown'], ['read_ticket', 'read_ticket']]) {
    assert.throws(() => createAgentsTools(ids, unused), /CAPABILITY_NOT_ALLOWED|DUPLICATE_CAPABILITY/);
  }
  assert.deepEqual(createAgentsTools([], unused), []);
  const legacy = ['read_ticket', 'change_ticket_priority'];
  assert.deepEqual(createAgentsTools(legacy, unused).map(tool => tool.name), legacy);
  assert.deepEqual(createAgentsTools(['read_ticket_members'], unused).map(tool => tool.name), ['read_ticket_members']);
});

test('official SDK rejects empty or oversized IDs and extra fields before executor dispatch', async () => {
  let invoked = 0;
  const tools = createAgentsTools(allIds, async () => { invoked++; return 'unused'; });
  for (const tool of tools) {
    const good = valid[tool.name as keyof typeof valid];
    const bad: JsonObject[] = [{ ...good, ticketId: '' }, { ...good, ticketId: 'x'.repeat(101) }, { ...good, unexpected: true }];
    if (tool.name === 'change_ticket_assignee') bad.push({ ...good, assigneeId: '' }, { ...good, assigneeId: 'x'.repeat(101) });
    for (const args of bad) {
      const text = JSON.stringify(args);
      await assert.rejects(tool.invoke(new RunContext({}), text, { toolCall: { type: 'function_call', name: tool.name, callId: 'call-bad', arguments: text } }));
    }
  }
  assert.equal(invoked, 0);
});

test('factory forwards normalized arguments and stable invocation identity without swallowing failures', async () => {
  const calls: unknown[] = [];
  const [tool] = createAgentsTools(['read_ticket'], async (...args) => { calls.push(args); return 'receipt'; });
  const args = { ticketId: 'x'.repeat(100) }, text = JSON.stringify(args);
  await assert.rejects(tool!.invoke(new RunContext({}), text), /TOOL_CALL_ID_REQUIRED/);
  assert.equal(calls.length, 0);
  assert.equal(await tool!.invoke(new RunContext({}), text, { toolCall: { type: 'function_call', name: 'read_ticket', callId: 'stable-call', arguments: text } }), 'receipt');
  assert.deepEqual(calls, [['read_ticket', args, 'stable-call']]);
  const [failing] = createAgentsTools(['read_ticket'], async () => { throw new Error('trusted-executor-failure'); });
  await assert.rejects(failing!.invoke(new RunContext({}), text, { toolCall: { type: 'function_call', name: 'read_ticket', callId: 'failure', arguments: text } }), /trusted-executor-failure/);
});

test('real Runner advertises canonical schemas through the existing ModelProvider port', async () => {
  let observed: ModelRequest | undefined;
  const agent = new Agent({ name: 'Canonical schema qualification', tools: createAgentsTools(allIds, unused), model: new AgentsModelPort({ async complete(request) {
    observed = request;
    return { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: 'No business action.', toolCalls: [], finishReason: 'stop' };
  } }, 'schema-qualification') });
  await new Runner({ tracingDisabled: true }).run(agent, 'Inspect tool schemas only.');
  assert.ok(observed);
  for (const tool of observed.tools) {
    const capability = ticketCapabilities.find(candidate => candidate.capabilityId === tool.name)!;
    assert.deepEqual(withoutDialect(tool.inputSchema), withoutDialect(capability.inputSchema));
    assert.equal(tool.description, capability.description);
  }
  assert.equal(observed.tools.length, allIds.length);
  assert.deepEqual(observed.tools[0]!.inputSchema.properties && (observed.tools[0]!.inputSchema.properties as JsonObject).ticketId, { type: 'string', minLength: 1, maxLength: 100 });
});

test('canonical capability definitions retain reviewed provenance and cannot be reassigned', () => {
  assert.ok(Object.isFrozen(ticketToolDefinitions));
  for (const definition of Object.values(ticketToolDefinitions)) assert.ok(Object.isFrozen(definition));
  assert.equal(ticketToolDefinitions.read_ticket.source, 'fixture-host-v1');
  assert.equal(ticketToolDefinitions.change_ticket_assignee.source, 'fixture-ticket-members-v1');
});

test('official SDK restores a pre-factory approval snapshot using the same call ID and canonical tool', async () => {
  let modelCalls = 0, invoked = 0;
  const port = new AgentsModelPort({ async complete(request) {
    modelCalls++;
    return { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: modelCalls === 1 ? '' : 'Observed receipt.',
      toolCalls: modelCalls === 1 ? [{ callId: 'persisted-call', name: 'change_ticket_priority', arguments: { ticketId: 't1', priority: 'high', expectedVersion: 1 } }] : [],
      finishReason: modelCalls === 1 ? 'tool-calls' : 'stop' };
  } }, 'snapshot-qualification');
  // Exact pre-factory SDK shape: the broker already enforced the stricter canonical limits.
  const oldAgent = new Agent({ name: 'Stable restored agent', model: port, tools: [tool({ name: 'change_ticket_priority', description: 'Legacy qualification shape.',
    parameters: z.strictObject({ ticketId: z.string(), priority: z.enum(['low', 'high']), expectedVersion: z.number().int().positive() }), needsApproval: true, errorFunction: null, execute: unused })] });
  const runner = new Runner({ tracingDisabled: true });
  const paused = await runner.run(oldAgent, 'Propose the approved fixture write.');
  assert.equal(paused.interruptions.length, 1); assert.equal(modelCalls, 1);
  const currentAgent = new Agent({ name: 'Stable restored agent', model: port, tools: createAgentsTools(['change_ticket_priority'], async (name, args, callId) => {
    invoked++; assert.equal(name, 'change_ticket_priority'); assert.equal(callId, 'persisted-call'); assert.deepEqual(args, valid.change_ticket_priority);
    return JSON.stringify({ receiptId: 'stable-receipt', priority: 'high' });
  }) });
  const restored = await RunState.fromString(currentAgent, paused.state.toString());
  assert.equal(restored.getInterruptions().length, 1);
  restored.approve(restored.getInterruptions()[0]!);
  const completed = await runner.run(currentAgent, restored);
  assert.equal(completed.interruptions.length, 0); assert.equal(invoked, 1); assert.equal(modelCalls, 2);
});
