import { z } from 'zod';
import { CapabilityVersionSchema, JsonObjectSchema, PrincipalSchema, ToolRequestSchema, ToolResultSchema, type BehaviorSelection, type CapabilityVersion, type JsonObject, type Principal, type ToolRequest, type ToolResult } from '@ae/contracts';
import { digest, PolicyError, samePrincipal } from '@ae/policy';

/** Server-composed, reviewed definitions. Never accept a registry or authority hook from request JSON. */
export interface CapabilityDefinition { readonly capability: CapabilityVersion; readonly parameters: z.ZodObject }
export type CapabilityDefinitions = Readonly<Record<string, CapabilityDefinition>>;
export interface CapabilityTarget { capabilityId: string; targetId: string }
export interface PreparedTarget { targetId: string; expectedResourceVersion?: string; preview: JsonObject }
export interface TrustedCapabilityHost {
  readonly policyVersion: string;
  readonly definitions: CapabilityDefinitions;
  readonly behaviorRegistryHash?: string;
  current(principal: Principal, write?: boolean): Principal;
  supports(capabilityId: string): boolean;
  authorizeCapability(principal: Principal, capabilityId: string): void;
  /** Pure reference extraction after strict schema validation; no business I/O or authority. */
  referenceTarget(capabilityId: string, args: JsonObject): string;
  prepareTarget(principal: Principal, capabilityId: string, args: JsonObject): PreparedTarget;
  assertReadable(principal: Principal, target: CapabilityTarget): void;
  readResult(principal: Principal, request: ToolRequest, behavior?: BehaviorSelection): JsonObject;
  write(principal: Principal, request: ToolRequest): ToolResult;
  query(principal: Principal, operationId: string, request?: ToolRequest): ToolResult;
}

/** Validate both runtime schema and public metadata, retaining Zod for the official SDK. */
export function validateDefinitions(definitions: CapabilityDefinitions): CapabilityDefinitions {
  if (!definitions || typeof definitions !== 'object' || !Object.keys(definitions).length) throw new PolicyError('HOST_CAPABILITY_DEFINITIONS_REQUIRED');
  const validated: Record<string, CapabilityDefinition> = Object.create(null) as Record<string, CapabilityDefinition>;
  for (const [id, definition] of Object.entries(definitions)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(id) || !(definition.parameters instanceof z.ZodObject) || !(definition.parameters.def.catchall instanceof z.ZodNever)) throw new PolicyError('HOST_CAPABILITY_SCHEMA_REQUIRED');
    const capability = CapabilityVersionSchema.parse(definition.capability);
    const json = z.toJSONSchema(definition.parameters) as JsonObject;
    if (json.additionalProperties !== false || digest(capability.inputSchema) !== digest(json) || capability.capabilityId !== id) throw new PolicyError('HOST_CAPABILITY_SCHEMA_MISMATCH');
    // This bounded runtime always requires approval for effects, independently of an SDK default.
    if (capability.risk !== 'read' && !capability.approvalRequired) throw new PolicyError('HOST_WRITE_APPROVAL_REQUIRED');
    validated[id] = Object.freeze({ capability: Object.freeze(structuredClone(capability)), parameters: definition.parameters });
  }
  return Object.freeze(validated);
}
export function parseCapabilityArguments(definitions: CapabilityDefinitions, name: string, args: JsonObject): JsonObject {
  if (!Object.hasOwn(definitions, name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED');
  const parsed = definitions[name]!.parameters.safeParse(args);
  if (!parsed.success) throw new PolicyError('INVALID_ARGUMENTS');
  const result = JsonObjectSchema.parse(parsed.data);
  // Transforms/defaults may not silently change the operation the model asked to execute.
  if (digest(result) !== digest(args)) throw new PolicyError('ARGUMENT_NORMALIZATION_DENIED');
  return result;
}
export function prepareCapabilityRequest(principal: Principal, runId: string, callId: string, definition: CapabilityDefinition, args: JsonObject, target: PreparedTarget) {
  const write = definition.capability.risk !== 'read';
  const request = ToolRequestSchema.parse({ schemaVersion: '1', invocationId: callId, runId, capabilityId: definition.capability.capabilityId, capabilityVersion: definition.capability.version, arguments: args, targetId: target.targetId,
    ...(target.expectedResourceVersion !== undefined ? { expectedResourceVersion: target.expectedResourceVersion } : {}), operationId: digest({ runId, callId, tenant: principal.tenantId, application: principal.applicationId }) });
  return { request, write, preview: JsonObjectSchema.parse(target.preview) };
}
export function validateCapabilityResult(operationId: string, value: unknown): ToolResult {
  const result = ToolResultSchema.parse(value);
  if ('operationId' in result && result.operationId !== operationId) throw new PolicyError('HOST_RECEIPT_OPERATION_MISMATCH');
  return result;
}

/** Generic floor; the host must additionally enforce its current domain/resource rights. */
export function currentHostPrincipal(identity: Principal, resolved: Principal): Principal {
  const current = PrincipalSchema.parse(resolved);
  if (!samePrincipal(identity, current)) throw new PolicyError('PRINCIPAL_CHANGED');
  return structuredClone(current);
}
export function requireCapabilityScopes(principal: Principal, capability: CapabilityVersion): void {
  if (capability.requiredScopes.some(scope => !principal.scopes.includes(scope))) throw new PolicyError('SCOPE_DENIED');
}
