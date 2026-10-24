import { randomUUID } from 'node:crypto';
import { Usage, type Model, type ModelRequest as SdkRequest, type ModelResponse as SdkResponse, type StreamEvent } from '@openai/agents';
import { ModelResponseSchema, type JsonObject, type ModelProvider, type ModelRequest } from '@ae/contracts';

/** OpenAI Agents JS owns the only agent loop; this port only translates model I/O. */
export class AgentsModelPort implements Model {
  private calls = 0;
  constructor(private provider: ModelProvider, private runId: string, private maxCalls = 8) {}
  async getResponse(input: SdkRequest): Promise<SdkResponse> {
    if (++this.calls > this.maxCalls) throw new Error('Model turn budget exceeded');
    const messages: ModelRequest['messages'] = [];
    if (input.systemInstructions) messages.push({ role: 'system', content: input.systemInstructions });
    if (typeof input.input === 'string') messages.push({ role: 'user', content: input.input });
    else for (const item of input.input) {
      if (item.type === 'reasoning') continue; // Never persist or expose hidden chain-of-thought.
      const object = item as unknown as Record<string, unknown>;
      const role = object.role === 'user' ? 'user' : object.role === 'system' ? 'system' : item.type === 'function_call_result' ? 'tool' : 'assistant';
      messages.push({ role, content: typeof object.content === 'string' ? object.content : JSON.stringify(item) });
    }
    const request: ModelRequest = { schemaVersion: '1', requestId: randomUUID(), runId: this.runId, messages,
      tools: input.tools.filter(tool => tool.type === 'function').map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters as JsonObject })) };
    let removeAbort = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      const stop = () => reject(new Error('Model request cancelled'));
      if (input.signal?.aborted) stop();
      else { input.signal?.addEventListener('abort', stop, { once: true }); removeAbort = () => input.signal?.removeEventListener('abort', stop); }
    });
    let response;
    try { response = ModelResponseSchema.parse(await Promise.race([this.provider.complete(request, input.signal), aborted])); }
    finally { removeAbort(); }
    if (response.message.length > 16_384 || JSON.stringify(response).length > 262_144) throw new Error('Model response exceeds bounded output limit');
    if (response.requestId !== request.requestId) throw new Error('Model response request mismatch');
    if (response.finishReason === 'error' || response.finishReason === 'length') throw new Error(`Model returned ${response.finishReason}`);
    if (response.toolCalls.length > 1) throw new Error('First-loop qualification only permits one tool per model turn');
    const output: SdkResponse['output'] = response.toolCalls.map(call => ({ type: 'function_call', callId: call.callId, name: call.name, arguments: JSON.stringify(call.arguments) }));
    if (!response.toolCalls.length) output.push({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: response.message }] });
    return { usage: new Usage({ requests: 1 }), output, responseId: request.requestId, providerData: { mode: response.mode, usage: 'unmeasured' } };
  }
  async *getStreamedResponse(_request: SdkRequest): AsyncIterable<StreamEvent> { throw new Error('Streaming is not qualified for this adapter'); }
}
