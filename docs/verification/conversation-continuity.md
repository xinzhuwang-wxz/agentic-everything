# Bounded, host-authorized conversation continuity

Status: the bounded backend passed synthetic SDK/PG/HTTP qualification, including final authority, cancellation, reconciliation and connection-pool boundary cases. The bounded UI and its separate synthetic qualification are described in [conversation UI](conversation-ui.md); no real-provider or production readiness claim.

## Reuse and actual ownership

The already pinned official OpenAI Agents JS 0.21.0 (MIT) remains the only agent loop. Its real `MemorySession` and `Runner.run(..., { session })` perform history composition and SDK session bookkeeping. The package's `Session` interface, transaction-aware session hooks and implementation were inspected; two actual SDK turns, rehydration, approval interruption and serialized `RunState` resumption were executed with a synthetic model. No provider or key was used.

`MemorySession` is deliberately phase-local, not advertised as durable storage. It is populated from an authorized, immutable-prefix projection of AE's PostgreSQL text records, then discarded. SDK-generated function calls, outputs, pending approvals and internal history mutations are never copied into the durable conversation collection. PostgreSQL persists bounded user/final-assistant text, not a second agent loop or SDK execution store. DBOS 5.3.0 remains the only workflow scheduler and recovery owner. Existing run checkpoints, approval ledger, operation reservations and host receipts keep their separate ownership and identities.

Custom code is limited to the evidenced gap: scope/current-history policy, ordered inert text projection, atomic conversation/intent/run linkage, and an authenticated API seam. Neither the SDK nor a chat renderer can supply a host's historical field-data authorization.

## Domain-neutral seam, currently qualified helpdesk adapter

Conversation `context` is a bounded JSON reference, not a permanent ticket-shaped core contract. A trusted server host opts in with `conversationHistory`:

- `parseContext(reference)` accepts only that host's strict context-reference schema. Identity, tenant, role, permission and unknown fields must be rejected. AE additionally rejects parsers that silently strip or rewrite input. This is not a generic client-supplied authorization object.
- `authority(currentPrincipal, context)` verifies current access and returns a nonempty opaque revision covering all historical field/data grants and context policies for the supported tools. The host must change the revision whenever relevant historical visibility changes, including member visibility and permissions not expressed by ordinary roles/scopes. Do not reuse an epoch across such changes. Returning a resource version or owner ID alone is not sufficient.
- `authorizeTarget(currentPrincipal, context, { capabilityId, targetId })` confines every prepared/executed tool target to the authorized context boundary. It must throw on unsupported or out-of-context targets.

The synthetic helpdesk implementation uses strict `{ ticketId }`, verifies host access and confines all tools to that ticket. No arbitrary-host capability catalog, automatic schema inference or cross-stack integration is implied. Existing `DurableTicketHost` capabilities remain the separately qualified fixed registry. Legacy `POST /api/runs` remains strict and one-shot; it is not silently placed into a conversation.

No AE identity provider, account, service key or website is introduced. The existing trusted host-session resolver supplies tenant/application/subject. Browser fields and model output never supply that identity.

## Conservative historical disclosure policy

A conversation records an authority hash of its immutable context reference, host revision, current tenant/application/subject/roles/scopes and exact currently available capability versions/binding hashes. Every history read, new turn, resumed SDK session and model disclosure checks that this hash still matches live authority. Model calls check before dispatch, after response before checkpointing, and again after DBOS replay. History reads check after fetching text; completion checks before and after its text write in the same transaction. Host writes additionally check after operation reservation, immediately before dispatch. Conversation-bound run views also require this check; the legacy run endpoint cannot bypass it.

Any mismatch denies the entire historical projection and continuation. AE does not try to redact an old assistant summary by guessing which words came from which formerly visible fields. This intentionally over-denies after a harmless grant change. A new conversation can begin under the new authority. Old conversation text and checkpoint bytes remain private retained records, not model input or public response. Checking ownership or successfully reading today's resource is not sufficient to release old text.

Only successful prior turns become model context, as inert user and final assistant messages. Tool calls/results, receipts, approval cards, SDK snapshots and hidden reasoning are excluded. The current run may still use its private SDK checkpoint under its original release and fresh authority checks. Viewing/quoting old text cannot authorize a new operation. Exact approval hash, invocation/call ID, operation idempotency and current host execution permission checks are unchanged.

Authorization checks cannot retract data already delivered before a later revocation. This bounded implementation does not claim cross-system atomicity between an arbitrary host's permission database and an external provider; authority is rechecked at the existing disclosure boundary. No real-provider disclosure was exercised here.

## HTTP contract and lifecycle

All routes inherit existing authenticated principal resolution, origin/body controls and `Cache-Control: no-store`.

- `POST /api/conversations`, strict body `{ context }` and `Idempotency-Key`: create/retrieve the same owned conversation for that creation intent. Changing its context conflicts.
- `GET /api/conversations/:conversationId`: ordered literal text messages, context, creation/expiry, run IDs/releases/statuses and optional `activeRunId`.
- `POST /api/conversations/:conversationId/runs`, strict body `{ input, context? }` and `Idempotency-Key`: reserve a turn and submit its server-selected release to existing DBOS execution. If supplied, context must match exactly. Omission uses the stored authorized reference.
- Existing `GET /api/runs/:runId`, approval and cancel routes retain per-run payloads and authority. Conversation history contains no actionable approval object.

Message IDs are stable `<runId>:user` and `<runId>:assistant`; sequence is stable by reserved turn and role. A new turn cannot start while another is queued, running, awaiting approval, unknown, reconciling or under manual review. Succeeded/failed/rejected/cancelled runs are terminal for admission; only succeeded user/assistant pairs feed the next model turn. Failed/rejected/cancelled input/status remains visible without inventing a successful assistant reply.

A conversation-row lock serializes turn admission. The turn, immutable release/start binding and existing intent ledger commit in one transaction. A crash after commit but before submission uses the existing bounded startup intent reconciliation and the same deterministic DBOS workflow ID. This is not a new polling scheduler. The run's successful status and final assistant text commit in one transaction; replay cannot duplicate messages or re-execute an old tool from history. Successful outcome reconciliation adds its inert receipt-confirmation text in that same receipt/status transaction. If authority changes during reconciliation, a savepoint rolls back only the optional text projection; the proven host receipt remains canonical and subsequent content reads still deny. Transactional checks reuse the held client rather than checking out a nested connection while holding run locks.

Intent identity includes the conversation ID only for conversation-bound runs. Existing one-shot intent IDs remain unchanged. Public payloads cannot provide a private conversation binding, SDK state or release snapshot.

## Bounds and deliberate omissions

This is session-sized continuity: 24-hour read/continuation expiry, at most 20 turns, and 128 KiB of persisted conversation text, reserving space for the existing maximum assistant output. Capacity fails closed; history is not silently truncated or summarized. Expiry is an access/continuation limit, not a promise of physical deletion. Retention administration, backup deletion and production migration policy remain separate work.

No long-term memory, automatic cross-conversation recall, branching, edit/regenerate, queueing, attachment parts, token streaming or SDK-managed provider conversations. No `assistant-ui` production dependency is introduced. The existing floating/admin shells now consume this contract through the separately qualified bounded conversation coordinator; the [presentation comparison](assistant-ui-bounded-comparison.md) records the actual reuse decision.

## Reproduction and observed evidence

- `node qualification/conversations/probe.mjs`: actual installed SDK 0.21.0 session composition, two turns, rehydration and approval-state resume; passed.
- Final fresh `npm run build`: passed with strict TypeScript. Focused SDK/session/intent tests: 8/8 passed. Final aggregate tests: 200/200 passed, 0 failed/skipped, 25.286 seconds. `node scripts/lint.mjs` and `git diff --check` also passed.
- `bash tests/persistence/run-conversations-postgres.sh /tmp/ae-durability-pg/root/usr/lib/postgresql/17/bin 55472`: final expanded 16-case run passed with clean PostgreSQL shutdown (command exit 0, PostgreSQL stop exit 0, postmaster PID removed). The suite uses a disposable synthetic PostgreSQL 17.11 database, real HTTP/DBOS/SDK, fresh worker processes and SIGKILL. It is not part of ordinary unit-test pass counts.

Production-host history authority, production SSO/origins, concurrent multi-worker load and real-provider quality/cost/privacy remain outside this qualification. Shared migration, retention and recovery evidence is recorded separately in [operations](release-operations.md).


The final 16 PostgreSQL/HTTP groups cover: two-turn history and exact reload after SIGKILL; duplicate intents without model replay; tenant/application/subject/context/target isolation; approved checkpoint restart after field-grant changes; mid-model revocation before text persistence; post-reservation revocation before write; cancellation during the final target callback; all nine other pool connections occupied while completion reuses its transaction client; unknown-outcome admission blocking and successful reconciliation continuity; late reconciliation text-savepoint rollback with canonical success retained; exact call/approval/release pins and one write per intended target; owner/read access insufficient after field epoch changes; capability/role/expiry denial; commit-before-submission recovery; text-capacity rejection; and legacy one-shot compatibility.

The concurrent-cancellation case waits for the broker's persisted `denied/CANCELLED` result before asserting zero host dispatches. An interrupted approval HTTP response may report the existing safe internal error; it is not treated as permission to retry. The authoritative run/operation state is checked separately. The late reconciliation case changes authority on the second transactional history check, after the provisional text UPDATE, and proves that text is rolled back while the confirmed operation receipt and succeeded run remain. Current public reads return 403, not “the write did not happen.”

### Qualification limits

Upstream DBOS/pg emitted a deprecation warning about concurrent queries during some worker starts, and the deliberate cancellation case reported a workflow ownership/cancellation message. These were not suppressed. No database/process was left running, and no real provider, credential, customer data, deployment or external browser was used.
