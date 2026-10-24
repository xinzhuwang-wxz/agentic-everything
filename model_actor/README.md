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

## Generated-host flow: partial attempt

`host-qualification-partial-trace.json` records four model rounds in the generated-host/configuration acceptance attempt. The first three rounds read low/version 1, proposed high at that exact version, and summarized an actual succeeded high/version 2 receipt. The fourth was a new run whose actual catalog contained only `read_ticket`; the actor selected that read and explicitly declined unavailable write capability. The browser worker then reported premature server shutdown and a host refresh-loop defect. No read result or final response for that new run was received. Therefore this trace does **not** establish completion or acceptance of the new read-only run. Polling stopped, with no watcher left active. A fresh attempt must use separate IPC and evidence.

## Isolated synthetic generated-host fixture: final1

`host-final1-qualification-trace.json` records five new dynamic model rounds from a fresh isolated IPC directory, without reusing responses from the interrupted attempt. The old run supplied read/write capabilities: the actor read low/version 1, proposed high with the exact version and confirmation boundary, then summarized a succeeded high/version 2 host receipt. A new run supplied only `read_ticket`; the actor read actual high/version 2 and returned a final explicitly stating that no write capability was available and no change back to low was submitted. All five responses are simulated, with unmeasured usage. These are synthetic fixture results, not a real production application or paid model-provider qualification. Browser UI approval, release-pinning, host-state and refresh assertions remain the browser worker's separate evidence. No watcher remains active.
