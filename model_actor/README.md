# Independent model-API actor qualification

This is an API simulation, not a real provider integration, benchmark, or paid API call. Usage is **unmeasured**. Every response declares `provider: subagent_simulation` and `mode: simulated`.

The independent subagent read each actual SDK-serialized request and observed tool result, then chose its next tool call or final message. It did not read hidden fixtures or golden answers, modify host business state, generate authority, or hardcode a success sequence. The harness executed tools and supplied host receipts. No external model service, account, credential, or network provider was used.

## Helper

`respond.py` validates the request's canonical SHA-256 hash, checks the selected response shape and the supplied tool-schema subset, writes an atomic response, and appends a local trace. It contains **no inference or business logic**. An independent actor must supply each chosen output JSON. It is not a general JSON Schema validator; the runtime's strict contracts remain authoritative.

Example invocation:

```
python model_actor/respond.py /path/to/ipc/requests/REQUEST_ID.json .runtime/chosen.json --trace .runtime/actor-trace.jsonl
```

Chosen output contains `message`, `toolCalls` (`callId`, `name`, `arguments`), and `finishReason`. The helper supplies protocol, provenance, and ID fields. Request and response files are paired by request ID, with responses under the sibling `responses` directory. A response cannot overwrite an existing response. Hashing uses recursively sorted keys, compact JSON and UTF-8 for the qualified request shapes.

## Observed qualification

Five actual actor rounds completed:

1. Read the requested ticket before proposing a change.
2. Used the observed low priority and exact version to propose high priority, explicitly subject to confirmation.
3. Reported success only after the host supplied a succeeded mutation receipt and resulting version.
4. A differently worded, inspect-only request exposed only the read tool; the actor selected that tool for the different ticket.
5. Summarized that ticket's actual priority/version and stopped without a write proposal.

The runtime worker separately reports an approval pause with zero mutations, one write after explicit harness approval, and rejection of repeated approval. That is harness approval, not proof of real end-user UI approval. The actor only sees serialized model input/tool outputs; host audit evidence is the source for approval enforcement.

`qualification-trace.json` retains request IDs, canonical request and response hashes, finish reasons, tool names and simulation provenance. Raw conversations and detailed local response traces remain uncommitted in `.runtime` / shared IPC. No hidden chain of thought is recorded. No watcher remains running; per-request file checks were bounded and only started after runtime handshake.

Limitations: these rounds demonstrate a dynamic in-session model simulation and read-only intent variation, not production model quality, measured provider usage, broad capability coverage, or real provider reliability. A real provider adapter remains future work.

## Separate UI/HTTP flow

`ui-qualification-trace.json` records three further actual model rounds from the UI/HTTP acceptance run, separately from the original five rounds. A Chinese request asked to read the current ticket, preview low-to-high priority, and wait for confirmation. The actor read the contextual ticket, proposed high using the returned version 1, then issued a Chinese final only after receiving a succeeded host receipt reporting high/version 2. The actor performed no approval or host mutation. Browser/UI observations and confirmation enforcement belong to the browser qualification worker's evidence, not to this model trace. All three responses remain explicitly simulated with unmeasured usage. No model watcher remains active.
