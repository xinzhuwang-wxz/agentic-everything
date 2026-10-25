import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { PrincipalSchema, type BehaviorSelection, type JsonObject, type Principal, type ToolRequest, type ToolResult } from '@ae/contracts';
import { digest, PolicyError } from '@ae/policy';
import { inventoryCapabilityDefinitions } from './python-inventory.js';
import { currentHostPrincipal, parseCapabilityArguments, requireCapabilityScopes, validateCapabilityResult, validateDefinitions, type CapabilityTarget, type PreparedTarget, type TrustedCapabilityHost } from './host-boundary.js';

const stockSchema = z.strictObject({ sku: z.string(), tenantId: z.string(), available: z.number().int().nonnegative(), version: z.number().int().positive() });
export const javaSpringInventoryDefinitions = validateDefinitions(Object.fromEntries(Object.entries(inventoryCapabilityDefinitions).map(([name, definition]) => {
  const capability = { ...definition.capability, sourceRevision: 'java-spring-inventory-v1', description: definition.capability.description.replace('Python', 'Java/Spring'), bindingHash: digest({ source: 'java-spring-inventory-v1', name, schema: definition.capability.inputSchema }) };
  return [name, { parameters: definition.parameters, capability }];
})));

// An isolated, fixed Node HTTP client bridges the synchronous host port. No source,
// executable, endpoint or authorization header can be supplied by a tool argument.
const httpBridge = `
import { readFileSync } from 'node:fs';
try {
  const { endpoint, bearer, body } = JSON.parse(readFileSync(0, 'utf8'));
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + bearer }, body: JSON.stringify(body), redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(4000) });
  if (response.status >= 300 && response.status < 400) throw Error('Redirect denied');
  if (response.url !== endpoint) throw Error('Endpoint changed');
  let size = 0; const chunks = [];
  for await (const chunk of response.body) { size += chunk.length; if (size > 1048576) throw Error('Response too large'); chunks.push(chunk); }
  process.stdout.write(JSON.stringify({ status: response.status, body: JSON.parse(Buffer.concat(chunks).toString()) }));
} catch { process.stderr.write('Host HTTP exchange did not yield an authoritative result'); process.exitCode = 1; }
`;

/** Explicit Spring Core fixture HTTP adapter. Existing Java owns authorization,
 * business transactions and receipts. This is not a production IAM or MVC adapter. */
export class JavaSpringInventoryHost implements TrustedCapabilityHost {
  readonly policyVersion = 'java-spring-inventory-policy-v1';
  readonly definitions = javaSpringInventoryDefinitions;
  private readonly endpoint: string;
  private readonly deadlineAt: number;
  private writes = 0;
  constructor(private readonly options: { endpoint: URL; credentialFor: (principal: Principal) => string; deadlineAt?: number }) {
    const url = new URL(options.endpoint.href);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/ae' || url.search || url.hash || url.username || url.password) throw new PolicyError('HOST_ENDPOINT_DENIED');
    this.endpoint = url.href;
    this.deadlineAt = Math.min(Date.now() + 240_000, options.deadlineAt ?? Number.POSITIVE_INFINITY);
    if (!Number.isFinite(this.deadlineAt) || this.deadlineAt <= Date.now()) throw new PolicyError('HOST_EXECUTION_BUDGET_EXPIRED');
  }
  private rpc(operation: string, principal: Principal, args: JsonObject, operationId?: string): unknown {
    const identity = PrincipalSchema.parse(principal), bearer = this.options.credentialFor(structuredClone(identity));
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(bearer)) throw new PolicyError('HOST_CREDENTIAL_DENIED');
    const body = { operation, principal: identity, arguments: args, ...(operationId ? { operationId } : {}) };
    const input = JSON.stringify({ endpoint: this.endpoint, bearer, body });
    if (Buffer.byteLength(input) > 65_536) throw new PolicyError('HOST_REQUEST_TOO_LARGE');
    const remaining = this.deadlineAt - Date.now();
    if (remaining <= 0) throw new PolicyError('HOST_EXECUTION_BUDGET_EXPIRED');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', httpBridge], { input, encoding: 'utf8', timeout: Math.min(5_000, remaining), killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024, windowsHide: true, env: { PATH: '/usr/bin:/bin' } });
    if (child.error || child.status !== 0 || child.signal) throw new Error('Host HTTP outcome unconfirmed');
    const response = z.strictObject({ status: z.number().int(), body: z.unknown() }).parse(JSON.parse(child.stdout));
    if ([403, 409].includes(response.status)) {
      const error = z.strictObject({ error: z.enum(['TOKEN_DENIED', 'IDENTITY_DENIED', 'CLAIMS_DENIED', 'AUTHORITY_DENIED', 'RESOURCE_DENIED', 'INVALID_INPUT', 'OPERATION_CONFLICT', 'RESOURCE_VERSION_CONFLICT', 'INSUFFICIENT_STOCK', 'OPERATION_DENIED', 'ENDPOINT_DENIED', 'ORIGIN_DENIED']) }).parse(response.body);
      throw new PolicyError('HOST_' + error.error);
    }
    if (response.status !== 200) throw new Error('Host HTTP outcome unconfirmed');
    return z.strictObject({ result: z.unknown() }).parse(response.body).result;
  }
  current(principal: Principal, write = false): Principal {
    const current = currentHostPrincipal(principal, PrincipalSchema.parse(this.rpc('current_principal', principal, {})));
    if (!current.roles.some(role => (write ? ['operator'] : ['viewer', 'operator']).includes(role))) throw new PolicyError('ROLE_DENIED');
    requireCapabilityScopes(current, this.definitions[write ? 'reserve_stock' : 'read_stock']!.capability);
    return current;
  }
  supports(name: string): boolean { return Object.hasOwn(this.definitions, name); }
  authorizeCapability(principal: Principal, name: string): void { if (!this.supports(name)) throw new PolicyError('CAPABILITY_NOT_ALLOWED'); this.current(principal, this.definitions[name]!.capability.risk !== 'read'); }
  referenceTarget(name: string, args: JsonObject): string { return String(parseCapabilityArguments(this.definitions, name, args).sku); }
  private stock(principal: Principal, sku: string) {
    const current = this.current(principal), stock = stockSchema.parse(this.rpc('read_stock', current, { sku }));
    if (stock.tenantId !== current.tenantId || stock.sku !== sku) throw new PolicyError('HOST_RESOURCE_DENIED');
    return stock;
  }
  prepareTarget(principal: Principal, name: string, input: JsonObject): PreparedTarget {
    this.authorizeCapability(principal, name);
    const args = parseCapabilityArguments(this.definitions, name, input), stock = this.stock(principal, String(args.sku));
    if (name === 'read_stock') return { targetId: stock.sku, preview: { sku: stock.sku } };
    if (stock.version !== args.expectedVersion) throw new PolicyError('RESOURCE_VERSION_CONFLICT');
    if (Number(args.quantity) > stock.available) throw new PolicyError('INSUFFICIENT_STOCK');
    return { targetId: stock.sku, expectedResourceVersion: String(stock.version), preview: { ...args, before: stock.available, after: stock.available - Number(args.quantity) } };
  }
  assertReadable(principal: Principal, target: CapabilityTarget): void { if (!this.supports(target.capabilityId)) throw new PolicyError('CAPABILITY_NOT_ALLOWED'); this.stock(principal, target.targetId); }
  readResult(principal: Principal, request: ToolRequest, behavior?: BehaviorSelection): JsonObject {
    if (request.capabilityId !== 'read_stock' || request.capabilityVersion !== '1' || behavior || this.referenceTarget(request.capabilityId, request.arguments) !== request.targetId) throw new PolicyError('REQUEST_BINDING_MISMATCH');
    return { ...this.stock(principal, request.targetId) };
  }
  private receipt(principal: Principal, operationId: string, value: unknown, request?: ToolRequest): ToolResult {
    const result = validateCapabilityResult(operationId, value);
    if (result.status === 'succeeded') {
      const data = z.strictObject({ stock: stockSchema, orderId: z.string(), quantity: z.number().int().positive() }).parse(result.data);
      if (data.stock.tenantId !== principal.tenantId || (request && (data.stock.sku !== request.targetId || data.orderId !== request.arguments.orderId || data.quantity !== request.arguments.quantity || data.stock.version !== Number(request.expectedResourceVersion) + 1))) throw new Error('Host receipt binding mismatch');
    }
    return result;
  }
  write(principal: Principal, request: ToolRequest): ToolResult {
    const current = this.current(principal, true);
    if (request.capabilityId !== 'reserve_stock' || request.capabilityVersion !== '1') throw new PolicyError('CAPABILITY_NOT_ALLOWED');
    const args = parseCapabilityArguments(this.definitions, request.capabilityId, request.arguments);
    if (request.targetId !== args.sku || request.expectedResourceVersion !== String(args.expectedVersion)) throw new PolicyError('REQUEST_BINDING_MISMATCH');
    try {
      const result = this.receipt(current, request.operationId, this.rpc('reserve_stock', current, args, request.operationId), request);
      this.writes++; return result;
    } catch (error) {
      if (error instanceof PolicyError && /^HOST_(TOKEN_DENIED|IDENTITY_DENIED|AUTHORITY_DENIED|RESOURCE_DENIED|INVALID_INPUT|OPERATION_CONFLICT|RESOURCE_VERSION_CONFLICT|INSUFFICIENT_STOCK)$/.test(error.code)) return { status: 'denied', code: error.code, message: error.code };
      throw error;
    }
  }
  query(principal: Principal, operationId: string, request?: ToolRequest): ToolResult {
    const current = this.current(principal, true);
    return this.receipt(current, operationId, this.rpc('query_operation', current, {}, operationId), request);
  }
  get mutationDispatchCount(): number { return this.writes; }
}
