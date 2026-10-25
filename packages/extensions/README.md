# Bounded extension adapters

This opt-in server package covers the §15.3 extension gate, not a new execution platform. AE's existing `PersistentRuntime` remains the task state, approval, host authorization and execution owner. DBOS 5.3.0 remains the sole scheduler. No extension tables, migrations, second queue, task database, model loop, credentials, external dispatch or automatically installed schedules are added.

## Supported boundary

| Adapter | Declared support | Owner | Evidence |
| --- | --- | --- | --- |
| Automation | One explicit daily local-time cron, IANA timezone, start/end window no longer than 31 days, lateness no longer than one hour, stable per-occurrence intent, pause/resume, live authority checks | Runtime adapters | `packages/extensions/test/extensions.test.ts`; `tests/extensions/run-postgres.sh` |
| A2A | Official SDK 1.3.0, protocol 1.0 JSON-RPC, new single text/plain `SendMessage`, `GetTask`, `CancelTask`, host Bearer authentication and tenant/user scoping | Extension adapter + host authentication owner | Official client/server wire compatibility tests; loopback HTTP to real PostgreSQL runtime |
| Mobile/miniprogram | Strict versioned start/status/cancel message contract, host-issued expiring session and verified-origin boundary | Host integration owner | Local bridge fixture and real governed-runtime fixture |
| Optional knowledge | Disabled; no ingest, retrieval, embeddings or RAG engine | Not enabled | No claims of knowledge authorization/import/revocation qualification |

Mobile/miniprogram real-platform integration is **unverified**. No native application, mini-program, store build, SDK completeness, device behavior or platform deployment is claimed. A2A is a declared subset, not full protocol conformance or an interoperability claim for every peer.

## Composition

Pass the existing `PersistentRuntime` to the adapters. Provide `ExtensionAuthority.current` backed by current host identity/permissions and `release` backed by trusted server-side release selection. These callbacks must never select identity or release snapshots from an incoming message. The runtime checks host permissions again while executing.

For automation, create a `DBOSClient` with the same system database and explicit `applicationName: 'ae-persistent-runtime'`. Supply `dbosSchedulePort(client)` when constructing `BoundedAutomation`, before launching the runtime. The client is owned and eventually destroyed by the composing worker. The client lookup is intentional: DBOS's workflow-local `getSchedule` is checkpointed, while a recovery authorization/pause check must read current schedule state. Only an explicit `create(definition, actor)` call creates a schedule. Construction registers a workflow but schedules nothing.

Only `minute hour * * *` daily cron is supported. Configuration cannot insert an arbitrary cron, queue, callback URL, token or task payload beyond bounded text. `automaticBackfill` is false. No automatic catch-up, interval loop, cron parser or competing scheduler is implemented. Window and lateness are enforced in the callback, including replay. DST follows the installed DBOS IANA scheduler: missing local occurrences do not run; repeated local hours identify separate UTC occurrences. Duplicate delivery of the same exact definition/UTC occurrence uses one deterministic existing-runtime intent. Changing a definition under the same automation ID is refused. New definitions require a new explicit ID. Pause prevents unaccepted callback dispatch; it does not cancel a task already accepted by the governed runtime. Expiry prevents new dispatch but does not delete schedule metadata. Operators can delete expired schedules through the existing DBOS lifecycle tools.

Mount `a2aHttpEndpoint(handler, authenticate)` explicitly in the trusted host HTTP application. The handler creates no listener. `authenticate` validates a host-issued credential and returns the authenticated principal; it must not trust body fields. Supply a mandatory bounded `admit(principal, messageId)` callback to `RuntimeA2AHandler` using the host's admission/rate policy. `getAgentCard()` returns the card for out-of-band discovery or an independently mounted discovery route. HTTPS is required except explicit loopback fixtures. Incoming requests are capped at 64 KiB; the adapter makes no outbound network call.

A2A exact text/message-ID replay maps to the same runtime intent. Different content is a new task, not continuation or approval. Blocking send returns a terminal/interrupted runtime state. Poll and cancel use the runtime ledger rather than a second A2A task store. Approval maps to INPUT_REQUIRED with a host-only instruction. Outcome-unknown/manual-review also remain INPUT_REQUIRED with the exact AE state in metadata. Cancellation that cannot establish a safe canceled state returns TaskNotCancelable; it never converts an unknown host effect to success. Streaming, asynchronous send, task list, push notifications, file parts, arbitrary metadata, in-band authentication, approval decisions and multi-turn continuation are rejected. Version 0.3 compatibility, gRPC and REST are not enabled.

`MobileFixtureBridge` is a server-side contract experiment. A real platform adapter must obtain origin and session from its trusted platform transport, not from posted JSON. The session is supplied separately from the strictly validated client envelope. A client cannot provide principals, roles, release snapshots or approval decisions. The result always includes `qualification: 'contract-fixture-only'`. No raw SDK checkpoints, approval grants or receipts are serialized by this bridge.

## Reproducible verification

1. Install the repository's exact dependencies with `npm ci --ignore-scripts` after integration of the approved SDK pin.
2. `npm run build`
3. `node --test dist/packages/extensions/test/extensions.test.js`
4. `bash tests/extensions/run-postgres.sh /path/to/postgresql/17/bin 55519`

The fourth command creates and stops a disposable loopback-only PostgreSQL 17.11 cluster. It uses only synthetic host rows and a visibly simulated model. It explicitly creates local fixture schedules, invokes bounded DBOS backfill, SIGKILLs a worker before its approval checkpoint, starts a replacement, and checks deduplication against independent host/model evidence. It also drives the official A2A client over loopback HTTP into the actual persistent runtime, and the mobile fixture into that same runtime. No external message, real account credential, paid model call or real platform deployment occurs. Evidence is written into the printed temporary directory, including `report.json` and worker logs. Functional pass is distinct from authorization to publish or deploy.

## Failure handling

- Schedule owner/definition/clock/timezone errors: reject before runtime admission; repair trusted configuration or create a new explicitly approved ID. Never silently widen a window or enable catch-up.
- Paused or deleted schedule: skip before creating a run. Resume only within the original unexpired window. Inspect the existing run separately if already admitted.
- Revoked identity or capability: stop through the host/runtime policy boundary. Do not restore permission from the stored principal snapshot.
- Worker crash: restart the same pinned runtime and workflow registration. DBOS recovers its workflow; stable intent IDs retain the existing ledger. Do not blindly create a replacement task to hide an unknown effect.
- Unknown host outcome or failed cancellation: retain the runtime's unknown/manual-review state and use the existing receipt reconciliation workflow. This adapter cannot approve or retry a write.
- Unsupported A2A feature/version: return an explicit protocol error. Do not silently downgrade to a legacy transport or call an unadvertised external agent.
- Mobile origin/session failure: reject, obtain a fresh session through the actual host authentication channel, and preserve the unverified-platform status until platform-specific evidence exists.

## Reuse and dependencies

- DBOS 5.3.0, MIT, already pinned by AE. Actual schedule/lifecycle APIs are used, with `DBOSClient` for live recovery reads. Official reference: https://docs.dbos.dev/typescript/reference/methods
- Official `@a2a-js/sdk` 1.3.0, Apache-2.0, protocol 1.0. Its `JsonRpcTransportHandler`, version validator, generated codecs and official `ClientFactory` are executed. The package's only nonoptional dependency is `jose`; Express, gRPC and database peers are not enabled. Source: https://github.com/a2aproject/a2a-js and specification: https://a2a-protocol.org/v1.0.0/specification/
- Custom code is limited to AE-specific trusted principal/release admission, state mapping, bounded schedule policy and the fixture bridge. Using the SDK's independent task store/executor would duplicate AE task state and the agent loop, so the official transport is paired with a request handler over the existing runtime instead.
