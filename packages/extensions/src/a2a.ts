import { AgentCard, Task, Message, Role, TaskState, type SendMessageRequest, type GetTaskRequest, type CancelTaskRequest } from '@a2a-js/sdk';
import { JsonRpcTransportHandler, ServerCallContext, validateVersion, type A2ARequestHandler } from '@a2a-js/sdk/server';
import { RequestMalformedError, UnsupportedOperationError, TaskNotCancelableError, TaskNotFoundError } from '@a2a-js/sdk/errors';
import type { Principal, RunStatus } from '@ae/contracts';
import { PolicyError } from '@ae/policy';
import { currentPrincipal, intentId, type ExtensionAuthority, type ExtensionRun, type ExtensionRuntime } from './runtime.js';

export const a2aSubset = Object.freeze({ protocol: '1.0', sdk: '@a2a-js/sdk@1.3.0', transport: 'JSONRPC', operations: ['SendMessage', 'GetTask', 'CancelTask'], input: 'single text/plain message', streaming: false, pushNotifications: false, externalDispatch: false, approval: 'host-only', multiTurn: false });
const states: Record<RunStatus, TaskState> = {
  queued: TaskState.TASK_STATE_SUBMITTED, running: TaskState.TASK_STATE_WORKING,
  'awaiting-approval': TaskState.TASK_STATE_INPUT_REQUIRED, succeeded: TaskState.TASK_STATE_COMPLETED,
  failed: TaskState.TASK_STATE_FAILED, rejected: TaskState.TASK_STATE_REJECTED, cancelled: TaskState.TASK_STATE_CANCELED,
  'outcome-unknown': TaskState.TASK_STATE_INPUT_REQUIRED, reconciling: TaskState.TASK_STATE_WORKING, 'manual-review': TaskState.TASK_STATE_INPUT_REQUIRED,
};
function task(run: ExtensionRun): Task {
  const contextId = `ae-context-${run.runId}`;
  return { id: run.runId, contextId, artifacts: [], history: [], status: {
    state: states[run.status], timestamp: run.events.at(-1)?.timestamp,
    message: { extensions: [], referenceTaskIds: [], metadata: undefined, messageId: `${run.runId}:${run.status}`, contextId, taskId: run.runId, role: Role.ROLE_AGENT,
      parts: [{ content: { $case: 'text', value: run.message ?? (run.status === 'awaiting-approval' ? 'Approval must be reviewed in the host application.' : run.status) }, mediaType: 'text/plain', metadata: undefined, filename: '' }] },
  }, metadata: { aeStatus: run.status, approvalChannel: 'host-only' } };
}
function requireHistoryLength(length: number | undefined): void { if (length !== undefined && (!Number.isInteger(length) || length < 0 || length > 100)) throw new RequestMalformedError('historyLength must be an integer from 0 to 100.'); }
function requireTaskId(id: string): void { if (!/^intent-[a-f0-9]{64}$/.test(id)) throw new TaskNotFoundError(); }

/** Official SDK owns JSON-RPC serialization/versioning; existing AE runtime owns all task state and execution. */
export class RuntimeA2AHandler implements A2ARequestHandler {
  readonly card: AgentCard;
  constructor(private readonly runtime: ExtensionRuntime, private readonly authority: ExtensionAuthority, endpoint: string,
    private readonly admit: (principal: Principal, messageId: string) => Promise<void>) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new PolicyError('A2A_ENDPOINT_TLS_REQUIRED');
    this.card = { provider: undefined, signatures: [], name: 'AE governed runtime', description: 'Bounded text tasks. Approval remains in the host application. No streaming, push, file transfer or multi-turn continuation.', version: '0.1.0',
      supportedInterfaces: [{ url: url.href, protocolBinding: 'JSONRPC', protocolVersion: '1.0', tenant: '' }],
      capabilities: { extensions: [], streaming: false, pushNotifications: false, extendedAgentCard: false }, defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
      securitySchemes: { hostBearer: { scheme: { $case: 'httpAuthSecurityScheme', value: { scheme: 'Bearer', bearerFormat: 'host-issued', description: 'Validated by the host; tokens are never task data.' } } } },
      securityRequirements: [{ schemes: { hostBearer: { list: [] } } }],
      skills: [{ id: 'ae-host-task', name: 'Governed host task', description: 'Current host capabilities only; host authorization is checked for each operation.', tags: ['bounded', 'host-authorized'], examples: [], inputModes: [], outputModes: [], securityRequirements: [] }],
    };
  }
  async getAgentCard(): Promise<AgentCard> { return structuredClone(this.card); }
  private async principal(context: ServerCallContext, tenant: string): Promise<Principal> {
    const value = context.state.get('ae.principal') as Principal | undefined;
    if (!context.user?.isAuthenticated || !value || (tenant && tenant !== value.tenantId) || (context.tenant && context.tenant !== value.tenantId)) throw new TaskNotFoundError();
    return currentPrincipal(this.authority, value);
  }
  async sendMessage(params: SendMessageRequest, context: ServerCallContext): Promise<Task> {
    const principal = await this.principal(context, params.tenant);
    requireHistoryLength(params.configuration?.historyLength);
    const message = params.message;
    if (!message || message.role !== Role.ROLE_USER || !message.messageId.trim() || message.messageId.length > 128 || message.taskId || message.contextId || message.referenceTaskIds.length || message.extensions.length || message.metadata || params.metadata) throw new RequestMalformedError('Only a new bounded text task is supported.');
    if (params.configuration?.taskPushNotificationConfig || params.configuration?.returnImmediately) throw new UnsupportedOperationError('Push and asynchronous send are outside the declared subset.');
    if (params.configuration?.acceptedOutputModes.length && !params.configuration.acceptedOutputModes.includes('text/plain')) throw new UnsupportedOperationError('Only text/plain output is supported.');
    if (message.parts.length !== 1) throw new RequestMalformedError('Exactly one text/plain part is required.');
    const part = message.parts[0]!;
    if (part.content?.$case !== 'text' || part.mediaType !== 'text/plain' || part.metadata || part.filename) throw new RequestMalformedError('Only text/plain is supported.');
    const input = part.content.value.trim();
    if (!input || input.length > 16384) throw new RequestMalformedError('Text must be 1..16384 characters.');
    await this.admit(principal, message.messageId);
    const release = await this.authority.release(principal);
    // Exact replay identity includes content. Different content is a distinct task, not an approval or continuation.
    const runId = intentId('a2a-v1', principal, [message.messageId, input]);
    return task(await this.runtime.start({ runId, principal, ...release, input }));
  }
  async getTask(params: GetTaskRequest, context: ServerCallContext): Promise<Task> {
    requireTaskId(params.id);
    requireHistoryLength(params.historyLength);
    const principal = await this.principal(context, params.tenant);
    try { return task(await this.runtime.get(params.id, principal)); } catch { throw new TaskNotFoundError(); }
  }
  async cancelTask(params: CancelTaskRequest, context: ServerCallContext): Promise<Task> {
    requireTaskId(params.id);
    const principal = await this.principal(context, params.tenant);
    let run: ExtensionRun;
    try { run = await this.runtime.get(params.id, principal); } catch { throw new TaskNotFoundError(); }
    if (['succeeded', 'failed', 'rejected', 'cancelled'].includes(run.status)) throw new TaskNotCancelableError();
    const result = await this.runtime.cancel(params.id, principal);
    // Unknown host outcomes must not be mislabeled as canceled.
    if (result.status !== 'cancelled') throw new TaskNotCancelableError('Host outcome requires reconciliation; no cancellation success is claimed.');
    return task(result);
  }
  async getAuthenticatedExtendedAgentCard(): Promise<never> { throw new UnsupportedOperationError(); }
  async *sendMessageStream(): AsyncGenerator<never> { throw new UnsupportedOperationError(); }
  async *resubscribe(): AsyncGenerator<never> { throw new UnsupportedOperationError(); }
  async listTasks(): Promise<never> { throw new UnsupportedOperationError(); }
  async createTaskPushNotificationConfig(): Promise<never> { throw new UnsupportedOperationError(); }
  async getTaskPushNotificationConfig(): Promise<never> { throw new UnsupportedOperationError(); }
  async listTaskPushNotificationConfigs(): Promise<never> { throw new UnsupportedOperationError(); }
  async deleteTaskPushNotificationConfig(): Promise<never> { throw new UnsupportedOperationError(); }
}

/** Mount explicitly in the trusted host HTTP app. No listener, token storage, or external call is created here. */
export function a2aHttpEndpoint(handler: RuntimeA2AHandler, authenticate: (request: Request) => Promise<Principal | undefined>) {
  const transport = new JsonRpcTransportHandler(handler);
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const principal = await authenticate(request);
    if (!principal) return new Response('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return new Response('JSON required', { status: 415 });
    if (Number(request.headers.get('content-length')) > 65536) return new Response('Request too large', { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) return new Response('Body required', { status: 400 });
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.byteLength; if (length > 65536) { await reader.cancel(); return new Response('Request too large', { status: 413 }); } chunks.push(next.value); }
    let body: Record<string, unknown>;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; } catch { return new Response('Invalid JSON', { status: 400 }); }
    const params = body?.params as Record<string, unknown> | undefined;
    if (params?.tenant && params.tenant !== principal.tenantId) return new Response('Tenant mismatch', { status: 403 });
    // Only server state establishes identity. SDK can independently parse a matching params.tenant.
    const context = new ServerCallContext({ requestedVersion: request.headers.get('A2A-Version') ?? '0.3', user: { isAuthenticated: true, userName: principal.subjectId }, state: new Map([['ae.principal', structuredClone(principal)]]) });
    try {
      validateVersion(context.requestedVersion, handler.card, 'JSONRPC');
      if (!a2aSubset.operations.includes(String(body?.method))) throw new UnsupportedOperationError();
      const response = await transport.handle(body, context);
      return Response.json(response, { headers: { 'A2A-Version': '1.0', 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ jsonrpc: '2.0', id: body?.id ?? null, error: JsonRpcTransportHandler.mapToJSONRPCError(error) });
    }
  };
}
