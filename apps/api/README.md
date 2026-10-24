# Loopback API qualification fixture

This is genuine Hono HTTP composition of the governed Agents JS runtime and the
existing helpdesk business functions. It is **not production authentication,
DBOS durability, a paid model integration, or provider-quality evidence**.

After root workspace integration and `npm run build`:

```
AE_MODEL_IPC_DIR=/absolute/private/fixture-ipc node dist/apps/api/src/server.js
```

The independent model subagent must service that directory using the
FileModelProvider envelope protocol. An absent actor produces a bounded safe
failure, not canned production-model output. Runtime responses and metadata
explicitly disclose simulation and memory-only persistence.

The API binds only 127.0.0.1:4310. AE_API_PORT can select another nonprivileged
loopback port. AE_UI_ORIGIN defaults to http://127.0.0.1:5173 and must be an exact
HTTP loopback origin. A Vite /api proxy must use changeOrigin:true. Do not expose
this fixture to a network or disable browser security.

The server closure supplies a synthetic tenant-a / fixture-editor identity,
with editor and agentic:admin roles and tickets:read + tickets:write scopes.
The separate admin role enables fixture configuration, not additional business authority. There is no login,
credential, or browser-controlled identity selector. Production composition
must inject a trusted host session resolver into createApi and qualify it
separately. Each execution still traverses host authorization and version checks.

Routes:
- GET /api/meta and /api/capabilities
- GET /api/tickets/:ticketId (same existing fixture state used by tool receipts)
- POST /api/runs with {input, context?: {ticketId}} and Idempotency-Key
- GET /api/runs/:runId
- POST /api/runs/:runId/approval with {approvalId, decision, expectedHash}
- POST /api/runs/:runId/cancel with {}

All writes require exact allowed Origin and application/json. Unrecognized body
fields are rejected. Host is checked independently of Origin; no wildcard CORS.
Requests are limited to 32 KiB, input to 16 KiB, and 1000 retained intent records
per process. Runtime supplies bounded model calls, elapsed time, output and events.
The intent table reserves before execution; a concurrent duplicate shares the
same promise, a changed payload returns 409, and rejected/unknown promises remain
recorded rather than authorizing blind replay. Read the returned run ID to reconnect.
A process restart discards these protections and all fixture state; no crash-safe
or cross-process claim is made.

Verification:

```
npm run build
node --test dist/apps/api/test/http.test.js
```

The focused HTTP suite uses a labeled test ModelProvider through the actual
Agents runtime and real HTTP sockets. It proves approval-gated existing business
mutation/readback, duplicate prevention, tenant/owner isolation, rejection,
cancellation, strict input, JSON, Origin/Host and payload controls. It does not
substitute for independent-subagent File IPC qualification or rendered browser QA.

## Configuration and release integration

The server mounts the shared control-plane routes under /api/configuration behind
the same exact Host/Origin/JSON protections. Draft creation, revision-bound
validation and publication require the trusted agentic:admin role. The bounded
control store and default runtime remain memory fixtures.

A newly reserved run intent snapshots the current published release and matching
ID on the server. Client-supplied release, identity, roles and tenant fields are
rejected. Repeating the same intent after publication returns the original run;
only changed client input conflicts. Existing runs retain their pinned release,
while new runs use the new capability selection intersected with current host
permissions. GET /api/meta and /api/capabilities reflect the active selection.

RuntimePort is structural and accepts asynchronous get/decide/cancel/start. Its
response type admits postgres-dbos persistence for separately qualified adapters,
but this server does not select that backend or claim durable operation. A runtime
used with controlPlane must implement immutable release snapshots; the persistent
adapter must not be combined with it until that support is qualified.

## Explicit persistent composition

`src/persistent.ts` exports `createPersistentApi` for trusted server integration. It requires an explicit PostgreSQL URL, a durable host adapter, a ModelProvider, authenticated principal resolution, a current configuration-administration callback and exact loopback origins. It constructs `PostgresControlPlane` and `PersistentRuntime` against the same database and returns `{ app, runtime, controlPlane, close }`. It never infers a database or silently changes `server.ts`: the ordinary development server remains the in-memory fixture. No production login, provider account, credential or deployment is supplied.

Both control-plane reads and host catalog/business reads may be asynchronous. The persistent composition reports `postgres_qualified` only for its explicit mode and requires a published release before starting work. Browser JSON cannot provide principal, release, release ID, run ID or approval state. New runs select immutable releases server-side. An old run's approval remains pinned across newer publications and process restart; current host permissions and current capability revocations still apply.

The `ae_api.intents` table is a business idempotency ledger, not a scheduler. Tenant, application, subject and client intent key determine one server-owned run ID. An atomic first claim stores the normalized request hash, original release and integrity-checked start snapshot. Conflicting payloads receive 409; concurrent/restarted repeats use the same DBOS workflow ID and reauthorize returned state. A one-time startup reconciliation resubmits entries whose run has not yet been created, closing the committed-intent/before-workflow-submission crash window without a second queue or polling loop. DBOS remains the only execution owner. Existing account authentication, database access controls, retention and operational deployment remain unqualified.

Qualification: after building, run `bash tests/persistence/run-http-postgres.sh /path/to/official/postgresql/17/bin [port]`. The isolated synthetic PostgreSQL 17.11 test uses real HTTP sockets, publishes configuration, sends concurrent first intents, SIGKILLs/restarts the server, repeats the original intent without extra writes, restores and executes a bound approval, verifies new-release filtering and current revocation, rejects forged release/run IDs, checks subject/tenant/admin isolation, and kills the server between intent persistence and workflow submission to verify startup recovery. It creates and stops its own loopback-only cluster; it does not use production accounts or paid providers.
