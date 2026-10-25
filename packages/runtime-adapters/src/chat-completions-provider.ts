import { OpenAIProvider, NoopTrace, withTrace, type AgentInputItem, type ModelRequest as SdkRequest } from '@openai/agents';
import { z } from 'zod';
import { canonicalJson } from '@ae/contracts/hash';
import { JsonObjectSchema, ModelRequestSchema, ModelResponseSchema, type ModelProvider, type ModelRequest, type ModelResponse } from '@ae/contracts';

const historyCall = z.strictObject({ type: z.literal('function_call'), callId: z.string().min(1), name: z.string().min(1), arguments: z.string(), id: z.string().optional(), status: z.literal('completed').optional() });
const historyResult = z.strictObject({ type: z.literal('function_call_result'), callId: z.string().min(1), name: z.string().min(1), status: z.literal('completed'), output: z.union([z.string(), z.strictObject({ type: z.literal('text'), text: z.string() })]), id: z.string().optional() });
const historyMessage = z.strictObject({ type: z.literal('message'), role: z.literal('assistant'), status: z.literal('completed'), content: z.array(z.strictObject({ type: z.literal('output_text'), text: z.string() })), id: z.string().optional() });
const wireCall = z.strictObject({ id: z.string().min(1), type: z.literal('function'), function: z.strictObject({ name: z.string().min(1), arguments: z.string() }) });
// Metadata can vary, but executable or multimodal message fields cannot silently degrade to text.
const wireResponse = z.object({ id: z.string().min(1), object: z.literal('chat.completion'), model: z.string().min(1), choices: z.array(z.object({ index: z.literal(0), finish_reason: z.enum(['stop', 'tool_calls']), message: z.strictObject({ role: z.literal('assistant'), content: z.string().nullable(), tool_calls: z.array(wireCall).max(1).optional(), refusal: z.null().optional() }) })).length(1) });

/** Stateless model I/O adapter, not an agent loop. Configuration is trusted server composition.
 * Qualified contract: non-streaming Chat Completions text/strict function calls, one choice/call.
 * The existing official Runner, broker, approval and receipt owners remain unchanged.
 */
export class ChatCompletionsModelProvider implements ModelProvider {
  readonly contract = 'chat-completions-v1' as const;
  private readonly provider: OpenAIProvider;
  private readonly outputType: SdkRequest['outputType'];
  constructor(private readonly options: {
    baseURL: string; apiKey: string; model: string; mode: 'simulated' | 'provider';
    timeoutMs?: number; maxOutputTokens?: number;
    structuredOutput?: { name: string; schema: z.ZodObject };
  }) {
    this.options = Object.freeze({ ...options, ...(options.structuredOutput ? { structuredOutput: Object.freeze({ ...options.structuredOutput }) } : {}) });
    if (!['simulated', 'provider'].includes(options.mode)) throw new Error('Provider mode must be explicit');
    const endpoint = new URL(options.baseURL);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !options.apiKey || !options.model.trim()) throw new Error('Invalid trusted provider configuration');
    if (!Number.isInteger(options.timeoutMs ?? 30_000) || (options.timeoutMs ?? 30_000) < 1 || (options.timeoutMs ?? 30_000) > 240_000) throw new Error('Invalid provider timeout');
    if (!Number.isInteger(options.maxOutputTokens ?? 1024) || (options.maxOutputTokens ?? 1024) < 1 || (options.maxOutputTokens ?? 1024) > 16_384) throw new Error('Invalid provider output budget');
    if (options.structuredOutput) {
      if (!(options.structuredOutput.schema.def.catchall instanceof z.ZodNever) || !/^[a-zA-Z0-9_-]{1,64}$/.test(options.structuredOutput.name)) throw new Error('Structured output requires an explicit strict object schema');
      this.outputType = { type: 'json_schema', name: options.structuredOutput.name, strict: true, schema: z.toJSONSchema(options.structuredOutput.schema) };
    } else this.outputType = 'text';
    // Explicit endpoint/key prevent ambient SDK credentials or default endpoints from being selected.
    // The SDK's bounded HTTP retry behavior remains inside this request's cancellation deadline.
    this.provider = new OpenAIProvider({ baseURL: options.baseURL, apiKey: options.apiKey, useResponses: false, strictFeatureValidation: true });
  }
  async complete(candidate: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    const request = ModelRequestSchema.parse(candidate);
    if (JSON.stringify(request).length > 262_144) throw new Error('Provider input exceeds bounded limit');
    const input = restoreHistory(request);
    for (const tool of request.tools) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name) || tool.inputSchema.type !== 'object' || tool.inputSchema.additionalProperties !== false) throw new Error('Provider tools require strict object schemas');
    }
    const deadline = AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    combined.throwIfAborted();
    const model = await this.provider.getModel(this.options.model);
    // The SDK model requires a trace context even outside Runner; a local disabled trace
    // prevents an ambient caller from accidentally exporting provider payloads.
    const response = await withTrace(new NoopTrace(), () => model.getResponse({ input, modelSettings: { parallelToolCalls: false, maxTokens: this.options.maxOutputTokens ?? 1024 }, tools: request.tools.map(tool => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.inputSchema, strict: true })), outputType: this.outputType, handoffs: [], tracing: false, signal: combined }));
    combined.throwIfAborted();
    if (JSON.stringify(response.providerData).length > 262_144) throw new Error('Provider response exceeds bounded limit');
    const raw = wireResponse.parse(response.providerData);
    if (raw.model !== this.options.model) throw new Error('Provider model mismatch');
    const choice = raw.choices[0]!;
    const calls = choice.message.tool_calls ?? [];
    if ((calls.length > 0) !== (choice.finish_reason === 'tool_calls')) throw new Error('Provider finish reason mismatch');
    const toolCalls = calls.map(call => {
      if (!request.tools.some(tool => tool.name === call.function.name)) throw new Error('Provider called an unavailable tool');
      return { callId: call.id, name: call.function.name, arguments: JsonObjectSchema.parse(JSON.parse(call.function.arguments)) };
    });
    const message = choice.message.content ?? '';
    if (message.length > 16_384) throw new Error('Provider message exceeds bounded limit');
    if (!calls.length && this.options.structuredOutput) {
      const value = JsonObjectSchema.parse(JSON.parse(message));
      const parsed = JsonObjectSchema.parse(this.options.structuredOutput.schema.parse(value));
      if (canonicalJson(parsed) !== canonicalJson(value)) throw new Error('Structured output cannot normalize provider data');
    }
    // Do not persist providerData, hidden reasoning or vendor usage as measured cost.
    return ModelResponseSchema.parse({ schemaVersion: '1', requestId: request.requestId, mode: this.options.mode, message, toolCalls, finishReason: calls.length ? 'tool-calls' : 'stop' });
  }
  async close(): Promise<void> { await this.provider.close(); }
}

/** Recover the exact SDK items serialized by AgentsModelPort, never interpret user text as a call.
 * Tool results must match a preceding call; arbitrary tool-role text cannot acquire receipt status.
 */
function restoreHistory(request: ModelRequest): AgentInputItem[] {
  const input: AgentInputItem[] = [];
  const pending = new Map<string, string>();
  const seen = new Set<string>();
  for (const message of request.messages) {
    if (message.role === 'user' || message.role === 'system') { input.push({ role: message.role, content: message.content }); continue; }
    const item: unknown = JSON.parse(message.content);
    if (message.role === 'tool') {
      const result = historyResult.parse(item);
      if (pending.get(result.callId) !== result.name) throw new Error('Provider history result correlation mismatch');
      pending.delete(result.callId);
      input.push(result);
    } else {
      const parsed = z.union([historyCall, historyMessage]).parse(item);
      if (parsed.type === 'function_call') {
        if (seen.has(parsed.callId)) throw new Error('Provider history duplicate call ID');
        seen.add(parsed.callId); pending.set(parsed.callId, parsed.name);
      }
      input.push(parsed);
    }
  }
  if (pending.size) throw new Error('Provider history contains unresolved calls');
  return input;
}
