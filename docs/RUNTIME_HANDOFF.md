# Runtime handoff

## Implemented and verified

- Official @openai/agents 0.21.0 Runner owns the only bounded agent loop, with native approval interruption/resume.
- Explicit ModelProvider injection, strict request/response translation, disabled provider tracing, no paid model or secret needed.
- FileModelProvider emits actual hashed/correlated requests to a separate model actor and waits for validated responses.
  This is visibly `subagent_simulation`, token usage unmeasured, not a provider-quality claim.
- ToolBroker validates the curated two-tool surface, rechecks ordinary host roles/scopes/tenant/resource version,
  binds one-use approvals to principal/action/argument hash/target/version/policy/release/operation/expiry,
  and retains stable idempotent receipts. Model text is not authorization.
- AuthorizedTicketHost injects the existing fixture readTicket/changePriority functions without a parallel business store.
- Unknown write outcomes stop the SDK; replay never dispatches a new write. QueryOutcome may recover the exact host receipt;
  adapters lacking it enter manual review. Cancellation never promises rollback of prior effects.
- Tenant/subject-scoped views, safe event types, audit records without hidden chain-of-thought.

## API composition

Create AuthorizedTicketHost(existingBusinessFunctions, optionalCurrentPrincipalResolver), then ToolBroker(host),
then GovernedRuntime({model, broker, maxTurns?:8, maxElapsedMs?:240000}).

- start({principal, releaseId, input, context?:{ticketId}}) returns Promise<RunView> at pause or terminal.
- get(runId, principal), list(principal): authenticated views.
- decide(runId, principal, {approvalId, expectedHash, decision:'approve'|'reject'}).
- cancel(runId, principal); reconcile(runId, principal).
- broker.catalog(principal) returns only visible capabilities.

RunView includes runId, status, events, optional approval {binding,expectedHash,preview}, optional message,
receipts, persistence:'in-memory-fixture', modelMode:'configured-model-port'. It never serializes SDK RunState to browsers.
All principal/release inputs must originate from server session/configuration, never browser role/tenant fields.
Default application stores are process-local; API composition MUST advertise fixture mode and not production auth.

## Reproduction

npm run check runs strict TypeScript, source hygiene, official SDK tests and broker/IPC negative tests.
Independent actor qualification is opt-in, not an unattended unit fixture:

AE_HOST_FIXTURE=<absolute existing-react-helpdesk/src/tickets.ts> node tests/runtime/qualify-actor.mjs
AE_HOST_FIXTURE=<absolute existing-react-helpdesk/src/tickets.ts> node tests/runtime/qualify-actor-read.mjs

AE_MODEL_IPC defaults to /workspace/shared/ae-model-ipc. A separately running actor must inspect requests/*.json
and atomically write responses/*.json per the frozen envelope in FileModelProvider. The model actor must never
have access to approval grants or host mutation APIs. Approval in the first qualifier is an explicit test-harness
user decision after asserting zero mutations, not an assertion in the model response.

First actual qualification 2026-10-24: SDK model→read→pause→confirmed write→receipt→dynamic model final passed.
Before low/v1, after high/v2; mutationCount=1; repeated approval rejected. Actor request hashes correlated on all three turns.
Run ID d96d6e70-dfb1-4f0c-b3fa-dc2d59ceaa79; receipt 729f77fa-899d-495c-a82b-671326894429.
Local runtime transcripts are intentionally not committed; only synthetic qualification identifiers/results are recorded here.

## Memory-adapter boundary

The GovernedRuntime memory path does not use PostgreSQL. The in-memory approval/operation/run ledgers do not survive restart
and cannot coordinate multiple workers. That path makes no DBOS durable execution, cross-process restart, transaction/outbox, replay,
lease/fencing or exactly-once claim. Select the explicit persistent adapter for the separately qualified PostgreSQL/DBOS path; the memory-mode qualification flag is not a durable engine. Production authentication and deployment require independent host qualification.

Static capability v1 and fixture release are not a dynamic control-plane publisher. Streaming, real provider credentials,
browser rendering, external HTTP adapters and production telemetry are not qualified by these tests.

Second independent actor qualification also passed: differently worded inspect-only request for tenant-b viewer,
read-only tool catalog, ticket-2 low/v1, no approval proposal and zero mutations across two dynamic model rounds.
Final local check: npm run check passed 21 tests (6 foundation + 15 runtime/SDK/IPC), strict typecheck and source hygiene.


## Opt-in persistent adapter (2026-10-24)

A separate `@ae/runtime-adapters/persistent` entrypoint implements `PersistentRuntime` with PostgreSQL business records, DBOS-owned SDK phases, private pinned SDK snapshots, transactional approval consumption/operation reservation, and a durable host receipt port. Its asynchronous public API mirrors start/get/list/decide/cancel/reconcile with `persistence: 'postgres-dbos'`. Existing memory fixtures and default HTTP composition are not silently replaced.

The actual AE path passed 16 real PostgreSQL 17.11 cases across 30 fresh OS worker processes, including approval recovery, checkpoint/replay crash boundaries, duplicate/tampered decisions, three identity-isolation dimensions, revoked rights before replayed-data disclosure, monotonic reconciliation races, cancellation after commit and timeout-after-commit reconciliation. The synthetic host has a separate transactional durable ledger; no in-memory counter conceals replay. No arbitrary external exactly-once claim is made.

See [persistent runtime qualification](PERSISTENT_RUNTIME_QUALIFICATION.md) and [adapter contract](../packages/runtime-adapters/db/README.md) for exact evidence, observed warnings, API/host obligations and remaining gates. Dynamic releases and schema operations have separately scoped [release](verification/joined-release-qualification.md) and [operations](verification/release-operations.md) evidence. Production identity, live-provider quality and multi-worker deployment remain unqualified.
