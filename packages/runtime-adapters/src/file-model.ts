import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ModelRequestSchema, ModelResponseSchema, type ModelProvider, type ModelRequest, type ModelResponse } from '@ae/contracts';
import { digest } from '@ae/policy';

/** Explicit development-only model API. A separate agent actor writes bounded, correlated responses. */
export class FileModelProvider implements ModelProvider {
  readonly mode = 'subagent_simulation';
  constructor(private directory: string, private timeoutMs = 120_000) {}
  async complete(input: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    const request = ModelRequestSchema.parse(input);
    if (!/^[a-zA-Z0-9_-]+$/.test(request.requestId)) throw new Error('Unsafe request ID');
    const requestHash = digest(request);
    const requestDirectory = join(this.directory, 'requests'), responseDirectory = join(this.directory, 'responses');
    await Promise.all([mkdir(requestDirectory, { recursive: true }), mkdir(responseDirectory, { recursive: true })]);
    const path = join(requestDirectory, `${request.requestId}.json`), temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ schemaVersion: '1', requestId: request.requestId, requestHash, request }, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
    const responsePath = join(responseDirectory, `${request.requestId}.json`), deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error('Model request cancelled');
      try {
        const info = await stat(responsePath);
        if (info.size > 262144) throw new Error('Model response exceeds byte limit');
        const envelope = JSON.parse(await readFile(responsePath, 'utf8')) as Record<string, unknown>;
        if (envelope.requestId !== request.requestId || envelope.requestHash !== requestHash || envelope.provider !== 'subagent_simulation' || envelope.usage !== 'unmeasured') throw new Error('Model response correlation mismatch');
        const response = ModelResponseSchema.parse(envelope.response);
        if (response.requestId !== request.requestId || response.mode !== 'simulated') throw new Error('Model response identity mismatch');
        if (response.toolCalls.length > 4 || response.message.length > 16384) throw new Error('Model response budget exceeded');
        if ((response.finishReason === 'tool-calls') !== (response.toolCalls.length > 0)) throw new Error('Model response finish reason mismatch');
        return response;
      } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Independent model actor response deadline exceeded');
  }
}
