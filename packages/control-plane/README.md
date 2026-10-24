# Bounded configuration and releases

The default M1 control-plane fixture is in-memory: restart loses drafts and releases. An explicit PostgreSQL mode persists them as described below; neither mode claims production administration qualification. The same HTTP service and shared UI serve the console and native host tab. It creates no model loop, scheduler, provider account, credentials, connector, or arbitrary tool endpoint.

## Trusted integration

- Construct `InMemoryControlPlane` with fixed, server-registered capability versions. The optional current-principal resolver rechecks administrative authority; identity may not change tenant, application or subject during re-resolution.
- Only trusted principals with role `agentic:admin` can save, validate and publish. This role does not grant any business scope or permission. Non-administrators receive no draft, release-content or registry details in the management response.
- Mount `createConfigurationRoutes` at `/api/configuration` behind the API's exact-origin/host and JSON protections. Never resolve identity from browser role headers or JSON fields.
- At first run creation resolve `activeRelease(principal)` server-side and pin the whole snapshot. Idempotent run retries retain the originally selected release, not whichever release is current on retry.
- Runtime consumers must validate `verifyRelease`, apply configured instructions and execution bounds, and intersect the SDK tools with `releasedCatalog(release, principal, currentHostCatalog)`. Recheck the intersection before invocation and approval/resume, and continue host-side authorization at execution. The configuration store is not an execution permission check.
- Publish changes the default for future runs. Existing runs retain their release. Current host revocation or disabled capabilities still constrain those runs; publishing never grants host authority.

## Routes

- `GET /` returns management state, capability versions and release history for administrators.
- `POST /drafts` accepts `{ configuration, draftId?, expectedRevision? }`. Updates require the exact saved revision. Name, instructions, capability IDs and bounded limits are the only configuration fields.
- `POST /drafts/:id/validate` accepts `{ expectedRevision }` and returns structural/registry validation plus changes relative to the current release. It does not evaluate model quality or certify production safety.
- `POST /drafts/:id/publish` accepts `{ expectedRevision }`, revalidates and atomically selects a hashed immutable snapshot for new runs. Repeating the same draft revision returns the same release. It does not roll back a later active release.

Configuration limits: 80-character name, 8,000-character instructions, 32 selected registered capabilities, 1–16 turns and 1,000–240,000 milliseconds per execution segment. Storage is bounded at 1,000 drafts and 1,000 releases. Host policy and user confirmation remain independent.

## Verification

`control.test.ts` covers role/tenant/application isolation, current admin revocation, hash tampering, immutable snapshots, optimistic revisions, idempotent publication, fixed registry selection, rejected secrets/URLs, capability-version intersection and real Hono requests. `packages/ui/test/configuration.test.tsx` mounts React controls against the real store and covers save/validate/publish, no implicit publication, disabled writes, denied management, focused errors, dirty validation invalidation, duplicate pending actions and stale identity responses. Runtime enforcement and browser/production qualification are separate integration gates.

## Opt-in PostgreSQL control store

`@ae/control-plane/postgres` exports `PostgresControlPlane(databaseUrl, registeredCapabilities, currentPrincipal?)`. Call `initialize()` once before serving and `close()` on shutdown. The URL is trusted server configuration only and should be the same database used by the opt-in runtime; the independent `ae_control` SQL schema stores drafts, immutable releases, and active pointers. The store implements the explicit async `ControlPlanePort`. `asAsyncControlPlane(memory)` adapts the memory fixture for the same interface, and the HTTP module awaits either implementation.

Publication is one transaction under a tenant/application-scoped advisory lock. An exact draft revision has one release row, and an idempotent retry returns it without reactivating an older release. Updates require the current draft revision. Current administrator authority is rechecked before work and immediately before commit. Resolver identity is snapshotted before calling, so even an in-place callback mutation is rejected. Ordinary management readers receive no historical configuration documents. Release content is schema/hash checked on reads; capability execution still requires current runtime and host authorization.

`postgres_qualified` identifies this explicit database-backed mode, not production authentication, availability or deployment certification. The synchronous memory implementation still reports `memory_fixture`; no automatic fallback or migration takes place.

After a build, run `bash packages/control-plane/test/postgres/run.sh /path/to/official/postgresql/17/bin [port]`. This starts an isolated PostgreSQL 17.11 cluster on loopback, uses only synthetic data, launches separate Node processes to prove restart and concurrent publication behavior, tests permission and revision failures, and stops its own cluster in the same shell invocation. It does not touch an existing runtime database.
