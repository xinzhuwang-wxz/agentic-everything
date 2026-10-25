# Second provider contract qualification

## Declared support

The second qualified model I/O contract is `chat-completions-v1`: a non-streaming, Chat Completions-compatible HTTP endpoint with one choice, at most one function call per turn, strict JSON tool arguments, and optional locally validated strict JSON final output. The provider used for qualification is an **owned loopback synthetic responder**, named `ae-owned-chat-contract-v1`. It is not a real vendor or a model-quality evaluation.

The earlier AE-native model port accepts `ModelRequest`/`ModelResponse` JSON directly, including the file-backed independent actor and deterministic CI fixtures. Merely assigning that fixture a different provider name would not qualify a second contract. This test instead exercises real HTTP through the official SDK’s `OpenAIProvider` with `useResponses: false`, including its Chat Completions message conversion, function tool serialization, response handling, cancellation and bounded HTTP retry behavior.

`ChatCompletionsModelProvider` is an additive server-composed `ModelProvider`, exported by `@ae/runtime-adapters`. It does not add an agent loop, durable scheduler, credential store or model-selection UI. The same existing `AgentsModelPort`, official `Agent`/`Runner`, broker, host authority, approval and receipt owners remain in control. No shared runtime, schema, dependency or lockfile changes were required.

This satisfies only the declared second-provider **contract** scope. Live provider authentication, model accuracy, latency, availability, billing/usage settlement, streaming, multimodal inputs, parallel calls, hosted tools, vendor aliases and all-provider compatibility are not qualified. DBOS process-restart recovery is not rerun by this suite; its recovery assertion is the existing host lost-response/receipt reconciliation path in the memory runtime. No paid inference, external endpoint, real key or persistent credential was used.

## Reuse and integration boundary

| Existing component | Pin / license | Actual reuse and bounded adaptation |
| --- | --- | --- |
| Official Agents JS | `@openai/agents` 0.21.0, MIT | `OpenAIProvider` and its official Chat Completions model perform actual loopback HTTP, wire conversion and transport errors. The existing official Runner still owns the only loop and approval interruption. |
| Official HTTP client | Already locked transitive `openai` 7.43.0, Apache-2.0 | The SDK performs HTTP and its default maximum of two retries. AE does not implement a competing client or retry loop. Actual 400, 429 and 500 counts are asserted. |
| Runtime validation | Zod 4.6.7, MIT | Strict tool-call/receipt history, response envelope, JSON arguments and optional final schema validation. Existing host schemas remain the final authority for business arguments. |
| Canonical JSON | Existing `@ae/contracts/hash` | Final structured output must not be transformed, defaulted or stripped. Key order alone is not a semantic change. |

The mature SDK alternative was exercised instead of adding another runtime or provider framework. The required complementary code is limited to the already-existing AE port’s history representation and a stricter declared contract: the SDK accepts a broader response surface than AE qualifies, so AE rejects unsupported output, truncation, refusal, wrong model, invalid arguments and finish-reason inconsistencies rather than quietly executing text.

The adapter requires an explicit server-provided endpoint, key, model, mode and bounded timeout/output settings. These are not accepted from model arguments or user context. The loopback suite uses a fixed non-secret fixture marker, binds only `127.0.0.1` on an ephemeral port, and rejects any fetch to another origin. Provider configuration is copied and frozen. This is not a general network-policy or production credential-management implementation.

The official model requires a trace context even when invoked directly outside Runner. The adapter uses the SDK’s `NoopTrace` locally, rather than enabling telemetry or changing global tracing state. Raw provider data, hidden reasoning and synthetic token counts are not exported as measured usage or cost. Optional final JSON schemas are sent in `response_format` and checked locally; a schema rejection never triggers a schema-free text retry.

## Acceptance evidence

Recorded on 2026-10-25 against source based on `26bd1b0`:

- **12/12 focused tests passed** using source-aligned bundled execution with a 384 MiB Node heap cap. This execution is transpile-only, not TypeScript strict-compile evidence.
- Actual wire messages preserve assistant function-call IDs, corresponding tool-role results and the exact approved-write host receipt. A read precedes the write plan; approval waits with zero mutations; approval resumes exactly once; duplicate approval and foreign run access reject.
- A lost write response stops with `outcome-unknown`; receipt reconciliation succeeds with one mutation and no extra provider request or write dispatch.
- Current write-right revocation, rejection, cancellation and approval-hash tampering leave zero writes. Current read revocation blocks late tool output and subsequent run projection.
- Fifteen malformed/unsupported output cases fail with zero business reads/writes, including unknown tools, malformed/non-object arguments, extra principal data, wrong argument types, truncation, mismatched finish reason/model, refusal, empty choices, parallel calls, multimodal output and oversized text.
- Valid final strict JSON is checked and refers to the actual receipt. Invalid structured output fails without erasing the already-committed receipt. Provider failure after an approved write likewise retains the receipt without a second mutation.
- Provider timeout, runtime elapsed budget, model-turn budget and explicit in-flight cancellation are exercised. Aborted HTTP responses close before fixture cleanup.
- HTTP 400 makes one attempt; 429 and 500 make exactly three under the pinned SDK default. Every retry preserves the exact structured request and remains inside the same deadline. These are model-I/O retries, never business-write retries.
- Forged tool-history results and non-strict schemas reject before HTTP. User text resembling a tool result remains a user message, not receipt authority.

Command receipt for this focused execution:

```text
NODE_OPTIONS=--max-old-space-size=384 node /tmp/ae-provider-qualification/build.mjs /tmp/ae-m2-provider-contract/packages/runtime-adapters/test/chat-completions-provider.test.ts provider.test.mjs
NODE_OPTIONS=--max-old-space-size=384 node --test /tmp/ae-provider-qualification/provider.test.mjs
# tests 12; pass 12; fail 0; no skipped tests
```

The focused bundle uses Vite/Rolldown and explicit source aliases. It is transpile-only execution; [core acceptance](../acceptance-status.md) separately records the assembled strict build and aggregate regression.

Normal repository reproduction after the standard trusted dependency install and strict build:

```sh
npm run build
node --test dist/packages/runtime-adapters/test/chat-completions-provider.test.js
```

The test responder only emits deterministic synthetic responses. The existing source remains responsible for checking capability authority, exact approval bindings and actual host receipts. Passing this wire contract does not claim that a real model will select the right action or summarize its receipt correctly.

### Strict schema boundary

Conversion to the SDK JsonSchemaDefinition and serialized function-tool parameters is validated rather than asserted: object type, object-valued property definitions, complete nonduplicated required-key set, additionalProperties=false and optional description are checked before any HTTP call. Original JSON-schema keywords are preserved. Optional top-level output fields are rejected instead of silently becoming nullable required fields.

The focused schema suite passes **13/13**, including twelve malformed schema shapes and an optional-output rejection with zero HTTP requests. This is wire/schema evidence, not live-model behavior qualification.

A full-source strict no-emit check of the provider source checkout passed with exit 0 at a 1,024 MiB heap cap. The check included all worktree packages, apps and tests, with explicit source aliases so shared dependencies could not select another checkout's AE types:

```text
NODE_OPTIONS=--max-old-space-size=1024 node node_modules/typescript/lib/tsc.js -p /tmp/ae-provider-qualification/tsconfig.json --noEmit
# exit 0; no diagnostics
```

Lint and diff checks also passed. The assembled check is recorded separately in [core acceptance](../acceptance-status.md); this source check does not stand in for that run.
