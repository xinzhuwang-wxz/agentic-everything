import { z } from 'zod';
import { JsonObjectSchema, type JsonObject, type JsonValue } from '@ae/contracts';
import { digest, PolicyError } from '@ae/policy';

const id = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const key = z.string().min(1).max(100).refine(value => !['__proto__', 'prototype', 'constructor'].includes(value));
const scalar = z.union([z.string().max(16384), z.number().finite(), z.boolean(), z.null()]);
const binding = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: scalar }),
  z.strictObject({ kind: z.literal('input'), path: z.array(key).max(8) }),
  z.strictObject({ kind: z.literal('result'), node: id, path: z.array(key).max(8) }),
]);
const capability = z.strictObject({ capabilityId: id, version: z.string().min(1).max(64), bindingHash: z.string().regex(/^[a-f0-9]{64}$/) });
const args = z.record(key, binding).refine(value => Object.keys(value).length <= 32);
export const WorkflowDefinitionSchema = z.strictObject({
  schemaVersion: z.literal('1'), workflowId: id, version: z.number().int().min(1).max(1_000_000), name: z.string().min(1).max(120),
  entry: id, maxElapsedMs: z.number().int().min(100).max(240_000),
  nodes: z.array(z.discriminatedUnion('kind', [
    z.strictObject({ id, kind: z.literal('read'), capability, arguments: args, next: id,
      retry: z.strictObject({ maxAttempts: z.number().int().min(1).max(3), delayMs: z.number().int().min(0).max(1000) }) }),
    z.strictObject({ id, kind: z.literal('write'), capability, arguments: args, next: id }),
    z.strictObject({ id, kind: z.literal('branch'), value: binding, equals: scalar, then: id, else: id }),
    z.strictObject({ id, kind: z.literal('end'), message: z.string().max(2000) }),
  ])).min(1).max(32),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowNode = WorkflowDefinition['nodes'][number];
export type WorkflowBinding = z.infer<typeof binding>;
export interface WorkflowRevision { definition: WorkflowDefinition; contentHash: string }
export interface WorkflowState { cursor: string; input: JsonObject; results: Record<string, JsonValue>; completed: string[] }

/** Bound JSON before recursive schema parsing or hashing. No evaluation, templates or JS hooks. */
export function boundedJson(value: unknown, maxBytes: number): void {
  let remaining = 4096;
  const visit = (item: unknown, depth: number): void => {
    if (--remaining < 0 || depth > 12) throw new PolicyError('WORKFLOW_DATA_LIMIT');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object' || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)) throw new PolicyError('WORKFLOW_JSON_REQUIRED');
    for (const [name, child] of Object.entries(item)) {
      if (['__proto__', 'prototype', 'constructor'].includes(name)) throw new PolicyError('WORKFLOW_UNSAFE_KEY');
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > maxBytes) throw new PolicyError('WORKFLOW_DATA_LIMIT');
}
const successors = (node: WorkflowNode): string[] => node.kind === 'end' ? [] : node.kind === 'branch' ? [...new Set([node.then, node.else])] : [node.next];
const bindings = (node: WorkflowNode): WorkflowBinding[] => node.kind === 'branch' ? [node.value] : node.kind === 'end' ? [] : Object.values(node.arguments);
export function validateDefinition(value: unknown): WorkflowRevision {
  boundedJson(value, 65536);
  const parsed = WorkflowDefinitionSchema.safeParse(value);
  if (!parsed.success) throw new PolicyError('WORKFLOW_DEFINITION_INVALID');
  const definition = parsed.data;
  const nodes = new Map(definition.nodes.map(node => [node.id, node]));
  if (nodes.size !== definition.nodes.length || !nodes.has(definition.entry)) throw new PolicyError('WORKFLOW_GRAPH_INVALID');
  const parents = new Map(definition.nodes.map(node => [node.id, [] as string[]]));
  for (const node of nodes.values()) for (const next of successors(node)) {
    if (!nodes.has(next)) throw new PolicyError('WORKFLOW_TARGET_MISSING');
    parents.get(next)!.push(node.id);
    if (node.kind === 'write' && nodes.get(next)!.kind !== 'end') throw new PolicyError('WORKFLOW_WRITE_MUST_BE_TERMINAL');
  }
  const ordered: WorkflowNode[] = [], visiting = new Set<string>(), visited = new Set<string>();
  const visit = (name: string): void => {
    if (visiting.has(name)) throw new PolicyError('WORKFLOW_CYCLE_DENIED');
    if (visited.has(name)) return;
    visiting.add(name);
    for (const next of successors(nodes.get(name)!)) visit(next);
    visiting.delete(name); visited.add(name); ordered.unshift(nodes.get(name)!);
  };
  visit(definition.entry);
  if (visited.size !== nodes.size) throw new PolicyError('WORKFLOW_UNREACHABLE_NODE');
  // A result must exist on every path to its consumer, not only one branch.
  const dominators = new Map<string, Set<string>>();
  for (const node of ordered) {
    const prior = parents.get(node.id)!;
    const shared = prior.length ? new Set(dominators.get(prior[0]!)!) : new Set<string>();
    for (const parent of prior.slice(1)) for (const candidate of shared) if (!dominators.get(parent)!.has(candidate)) shared.delete(candidate);
    for (const ref of bindings(node)) if (ref.kind === 'result' && (nodes.get(ref.node)?.kind !== 'read' || !shared.has(ref.node))) throw new PolicyError('WORKFLOW_RESULT_NOT_DOMINATING');
    shared.add(node.id); dominators.set(node.id, shared);
  }
  return { definition, contentHash: digest(definition) };
}

/** Trusted server configuration catalog. Registration is not permission to execute a capability. */
export class WorkflowCatalog {
  private readonly revisions = new Map<string, WorkflowRevision>();
  constructor(definitions: readonly unknown[] = []) { for (const definition of definitions) this.register(definition); }
  register(value: unknown): WorkflowRevision {
    const revision = validateDefinition(value), { workflowId, version } = revision.definition;
    const key = `${workflowId}:${version}`, existing = this.revisions.get(key);
    if (existing && existing.contentHash !== revision.contentHash) throw new PolicyError('WORKFLOW_VERSION_IMMUTABLE');
    if (!existing && this.revisions.size >= 1000) throw new PolicyError('WORKFLOW_CATALOG_LIMIT');
    this.revisions.set(key, structuredClone(revision));
    return structuredClone(revision);
  }
  get(workflowId: string, version: number): WorkflowRevision {
    const revision = this.revisions.get(`${workflowId}:${version}`);
    if (!revision) throw new PolicyError('WORKFLOW_VERSION_NOT_FOUND');
    return structuredClone(revision);
  }
  list(): WorkflowRevision[] { return structuredClone([...this.revisions.values()]); }
}
export function inputState(definition: WorkflowDefinition, input: unknown): WorkflowState {
  boundedJson(input, 16384);
  return { cursor: definition.entry, input: JsonObjectSchema.parse(input), results: {}, completed: [] };
}
export function resolveBinding(binding: WorkflowBinding, state: WorkflowState): JsonValue {
  if (binding.kind === 'literal') return binding.value;
  let value: JsonValue | undefined = binding.kind === 'input' ? state.input : state.results[binding.node];
  for (const part of binding.path) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) throw new PolicyError('WORKFLOW_VALUE_MISSING');
    value = (value as Record<string, JsonValue>)[part];
  }
  if (value === undefined) throw new PolicyError('WORKFLOW_VALUE_MISSING');
  return structuredClone(value);
}
export function resolveArguments(node: Extract<WorkflowNode, { kind: 'read' | 'write' }>, state: WorkflowState): JsonObject {
  return Object.fromEntries(Object.entries(node.arguments).map(([name, value]) => [name, resolveBinding(value, state)]));
}
