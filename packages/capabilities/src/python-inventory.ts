import { spawnSync } from 'node:child_process';
import { qualifiedPython } from './python-runtime.js';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { JsonObjectSchema, PrincipalSchema, type BehaviorSelection, type CapabilityVersion, type JsonObject, type Principal, type ToolRequest, type ToolResult } from '@ae/contracts';
import { digest, PolicyError, samePrincipal } from '@ae/policy';
import { parseCapabilityArguments, validateCapabilityResult, validateDefinitions, type CapabilityTarget, type PreparedTarget, type TrustedCapabilityHost } from './host-boundary.js';

const readArgs = z.strictObject({ sku: z.string().min(1).max(100) });
const reserveArgs = z.strictObject({ sku: z.string().min(1).max(100), orderId: z.string().min(1).max(100), quantity: z.number().int().positive().max(1_000_000), expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
const stockSchema = z.strictObject({ sku: z.string(), tenantId: z.string(), available: z.number().int().nonnegative(), version: z.number().int().positive() });
const definition = (name: string, parameters: z.ZodObject, write: boolean) => {
  const source = 'python-inventory-sqlite-v1';
  const capability: CapabilityVersion = { schemaVersion: '1', capabilityId: name, version: '1', description: write ? 'Reserve available stock for one order at its exact current version. Explicit trusted approval and current host authority are mandatory.' : 'Read accessible stock availability and version from the existing Python inventory.',
    inputSchema: z.toJSONSchema(parameters) as JsonObject, outputSchema: {}, risk: write ? 'write' : 'read', requiredScopes: [write ? 'inventory:reserve' : 'inventory:read'], sourceRevision: source,
    bindingHash: digest({ name, source, version: '1', inputSchema: z.toJSONSchema(parameters) }), approvalRequired: write, idempotency: 'operation-key', supportsOutcomeQuery: true, timeoutMs: 5_000 };
  return { capability, parameters };
};
export const inventoryCapabilityDefinitions = validateDefinitions({ read_stock: definition('read_stock', readArgs, false), reserve_stock: definition('reserve_stock', reserveArgs, true) });
export const inventoryCapabilities = Object.values(inventoryCapabilityDefinitions).map(d => structuredClone(d.capability));

/** Reviewed local Python transport. It does not authenticate end users or execute arbitrary customer source safely.
 * Construction is trusted server composition; paths/interpreter never come from model or HTTP arguments.
 * The lifecycle verifier separately binds the exact owned generated adapter and original business bytes. */
export class PythonInventoryHost implements TrustedCapabilityHost {
  readonly policyVersion = 'inventory-policy-v1';
  readonly definitions = inventoryCapabilityDefinitions;
  private readonly adapterPath: string;
  private readonly databasePath: string;
  private readonly interpreter: string;
  private writes = 0;
  private readonly deadlineAt: number;
  constructor(options: { adapterPath: string; databasePath: string; interpreter?: string; deadlineAt?: number; currentPrincipal?: (p: Principal) => Principal }) {
    this.adapterPath = resolve(options.adapterPath); this.databasePath = resolve(options.databasePath);
    this.deadlineAt = Math.min(Date.now() + 240_000, options.deadlineAt ?? Number.POSITIVE_INFINITY);
    if (!Number.isFinite(this.deadlineAt) || this.deadlineAt <= Date.now()) throw new PolicyError('HOST_EXECUTION_BUDGET_EXPIRED');
    if (!isAbsolute(options.adapterPath) || !isAbsolute(options.databasePath) || realpathSync(this.adapterPath) !== this.adapterPath || !lstatSync(this.adapterPath).isFile() || realpathSync(dirname(this.databasePath)) !== dirname(this.databasePath)) throw new PolicyError('HOST_PATH_DENIED');
    try { const stat = lstatSync(this.databasePath); if (!stat.isFile() || stat.isSymbolicLink()) throw new PolicyError('HOST_PATH_DENIED'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    this.interpreter = qualifiedPython(options.interpreter, this.deadlineAt);
    this.resolvePrincipal = options.currentPrincipal ?? (p => p);
  }
  private readonly resolvePrincipal: (p: Principal) => Principal;
  private rpc(operation: string, principal: Principal, args: JsonObject, operationId?: string): unknown {
    const id = randomUUID();
    const input = JSON.stringify({ id, operation, principal, arguments: args, ...(operationId ? { operationId } : {}) });
    if (Buffer.byteLength(input) > 65536) throw new PolicyError('HOST_REQUEST_TOO_LARGE');
    const remaining = this.deadlineAt - Date.now();
    if (remaining <= 0) throw new PolicyError('HOST_EXECUTION_BUDGET_EXPIRED');
    const child = spawnSync(this.interpreter, ['-I', '-B', this.adapterPath, '--database', this.databasePath], { input, encoding: 'utf8', timeout: Math.min(5_000, remaining), killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, windowsHide: true, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
    if (child.error || child.status !== 0 || child.signal) throw new Error('Host process did not return a confirmed result');
    const response = z.discriminatedUnion('ok', [z.strictObject({ id: z.string(), ok: z.literal(true), result: z.unknown() }), z.strictObject({ id: z.string(), ok: z.literal(false), error: z.strictObject({ code: z.string(), message: z.string() }) })]).parse(JSON.parse(child.stdout));
    if (response.id !== id) throw new Error('Host response correlation mismatch');
    if (!response.ok) throw new PolicyError('HOST_' + response.error.code.toUpperCase());
    return response.result;
  }
  current(principal: Principal, write = false): Principal {
    const identity = PrincipalSchema.parse(structuredClone(principal));
    const resolved = PrincipalSchema.parse(this.resolvePrincipal(structuredClone(identity)));
    if (!samePrincipal(identity, resolved)) throw new PolicyError('PRINCIPAL_CHANGED');
    const current = PrincipalSchema.parse(this.rpc('current_principal', resolved, {}));
    if (!samePrincipal(identity, current)) throw new PolicyError('PRINCIPAL_CHANGED');
    if (!current.roles.some(role => (write ? ['operator'] : ['operator', 'viewer']).includes(role))) throw new PolicyError('ROLE_DENIED');
    if (!current.scopes.includes(write ? 'inventory:reserve' : 'inventory:read')) throw new PolicyError('SCOPE_DENIED');
    return current;
  }
  supports(name: string): boolean { return Object.hasOwn(this.definitions, name); }
  authorizeCapability(principal: Principal, name: string): void { if (!this.supports(name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED'); this.current(principal, this.definitions[name]!.capability.risk !== 'read'); }
  private stock(principal: Principal, sku: string) {
    const p = this.current(principal); const stock = stockSchema.parse(this.rpc('read_stock', p, { sku }));
    if (stock.sku !== sku || stock.tenantId !== p.tenantId) throw new PolicyError('HOST_RESOURCE_DENIED');
    return stock;
  }
  referenceTarget(name: string, args: JsonObject): string { return String(parseCapabilityArguments(this.definitions, name, args).sku); }
  prepareTarget(principal: Principal, name: string, arguments_: JsonObject): PreparedTarget {
    this.authorizeCapability(principal, name);
    const args = parseCapabilityArguments(this.definitions, name, arguments_);
    const stock = this.stock(principal, String(args.sku));
    if (name === 'read_stock') return { targetId: stock.sku, preview: { sku: stock.sku } };
    const reservation = reserveArgs.parse(args);
    if (stock.version !== reservation.expectedVersion) throw new PolicyError('RESOURCE_VERSION_CONFLICT');
    if (reservation.quantity > stock.available) throw new PolicyError('INSUFFICIENT_STOCK');
    return { targetId: stock.sku, expectedResourceVersion: String(stock.version), preview: { sku: stock.sku, orderId: reservation.orderId, quantity: reservation.quantity, before: stock.available, after: stock.available - reservation.quantity, version: stock.version } };
  }
  assertReadable(principal: Principal, target: CapabilityTarget): void { if (!this.supports(target.capabilityId)) throw new PolicyError('CAPABILITY_NOT_ALLOWED'); this.stock(principal, target.targetId); }
  readResult(principal: Principal, request: ToolRequest, behavior?: BehaviorSelection): JsonObject {
    if (request.capabilityId !== 'read_stock' || behavior) throw new PolicyError('HOST_CAPABILITY_OR_BEHAVIOR_DENIED');
    return { ...this.stock(principal, request.targetId) };
  }
  write(principal: Principal, request: ToolRequest): ToolResult {
    const p = this.current(principal, true);
    if (request.capabilityId !== 'reserve_stock' || request.capabilityVersion !== '1') throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    const args = reserveArgs.parse(request.arguments);
    if (request.targetId !== args.sku || request.expectedResourceVersion !== String(args.expectedVersion)) throw new PolicyError('REQUEST_BINDING_MISMATCH');
    // Only a well-formed host rejection proves no new mutation. Transport exceptions remain unknown.
    try {
      const result = validateCapabilityResult(request.operationId, this.rpc('reserve_stock', p, args, request.operationId));
      if (result.status === 'succeeded') { this.writes++; this.validateReservation(result, request); const data = JsonObjectSchema.parse(result.data); if (stockSchema.parse(data.stock).tenantId !== p.tenantId) throw new Error('Host receipt tenant mismatch'); }
      return result;
    } catch (error) { if (error instanceof PolicyError && /^HOST_(ACCESS_DENIED|INVALID_INPUT|NOT_FOUND|STALE_VERSION|INSUFFICIENT_STOCK|OPERATION_CONFLICT)$/.test(error.code)) return { status: 'denied', code: error.code, message: error.code }; throw error; }
  }
  private validateReservation(result: Extract<ToolResult, { status: 'succeeded' }>, request?: ToolRequest): void {
    const data = z.strictObject({ stock: stockSchema, orderId: z.string(), quantity: z.number().int().positive() }).parse(result.data);
    if (request && (data.stock.sku !== request.targetId || data.orderId !== request.arguments.orderId || data.quantity !== request.arguments.quantity)) throw new Error('Host receipt request mismatch');
  }
  query(principal: Principal, operationId: string, request?: ToolRequest): ToolResult {
    const p = this.current(principal, true);
    const result = validateCapabilityResult(operationId, this.rpc('query_operation', p, {}, operationId));
    if (result.status === 'succeeded') { this.validateReservation(result, request); const data = JsonObjectSchema.parse(result.data); const stock = stockSchema.parse(data.stock); if (stock.tenantId !== p.tenantId) throw new PolicyError('HOST_RESOURCE_DENIED'); }
    return result;
  }
  get mutationDispatchCount(): number { return this.writes; }
}
