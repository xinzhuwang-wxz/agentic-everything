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
with editor role and tickets:read + tickets:write scopes. There is no login,
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
