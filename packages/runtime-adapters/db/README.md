# Opt-in PostgreSQL runtime

`PersistentRuntime` is a separate, explicit `@ae/runtime-adapters/persistent` entrypoint. The existing `GovernedRuntime` remains an in-memory fixture. Selecting this adapter requires an operator-provided PostgreSQL URL and a host implementation with a durable operation-key ledger. It does not silently enable deployment, production authentication, or migrations against a host business database.

```ts
const runtime = new PersistentRuntime({ databaseUrl, model, host });
await runtime.launch();
const view = await runtime.start({ principal: serverSessionPrincipal, releaseId: serverReleaseId, input });
await runtime.decide(view.runId, serverSessionPrincipal, decision);
await runtime.shutdown();
```

All `start/get/list/decide/cancel/reconcile` methods are asynchronous. Public views retain the existing status/event/approval/receipt shape, with `persistence: 'postgres-dbos'`. Principals and release identifiers must come from server authentication/configuration, never browser role, tenant, grant, or SDK state fields. The module currently implements the bounded, static two-capability fixture recipe, not a general dynamic release publisher. Passing a dynamic release snapshot explicitly fails with DYNAMIC_RELEASE_UNSUPPORTED; it is never silently ignored.

## Ownership and trust

- DBOS 5.3.0 is the only scheduler, workflow identity authority and recovery engine. No custom queue, polling dispatcher, lease worker, or alternate agent loop exists here. One configured runtime instance is supported per worker process.
- Agents SDK 0.21.0 Runner is the only model/tool loop. Model outputs, reads and governed invocations are durable DBOS steps. No paid provider is part of the qualification. A model call interrupted before its checkpoint can be made again; cost/usage guarantees remain unqualified.
- AE owns versioned runs, exact approval bindings, atomic approval-consumption/operation-reservation, receipts and ordered public events. The PostgreSQL tables are separate from the synthetic host-owned ledger. DBOS workflow status is not an approval.
- Every run pins SDK, workflow, capability and policy versions plus its server-selected release identifier. Unsupported pins fail closed. Pending SDK state is a private recovery snapshot, never returned in the public view, never an alternate dispatcher. Tracing secrets are excluded. The ModelProvider port only yields tool calls/text, not hidden reasoning records.
- The durable broker delegates argument validation, stable operation identity, preview creation and approval binding creation to the existing ToolBroker/policy implementation. It independently persists and atomically consumes that exact binding. Current host identity/rights, target scope and version are checked again before dispatch.
- Fresh authorization/target-access gates run outside cached DBOS tool/model results, including before every new model dispatch. Early live denial uses an idempotent AE business-state transaction rather than changing DBOS checkpoint step positions. Receipt replay checks current authority, but does not require the pre-write resource version to remain unchanged after the operation's own successful mutation. Cached receipts cannot authorize another write.

## Transaction/recovery boundaries

`ae_runs_v1`, `ae_approvals_v1`, and `ae_operations_v1` are created by the versioned initial migration in `store.ts`. This is an opt-in initial schema, not a production upgrade/rollback framework. SQL values are parameterized. Run-row locks serialize approval, reservation, event and cancellation updates.

Initial creation is inside an already submitted DBOS workflow. A decision is submitted under `ae-v1:<runId>:<approvalId>` before its authoritative transaction commits, closing the committed-decision-but-never-scheduled gap. A read-only preflight rejects invalid hashes/owners/expiry before they can poison that workflow identity; the transactional check remains authoritative. Identical decisions return the same persisted view. Conflicting decisions are rejected.

Approvals and SDK checkpoints commit together. Approval consumption and stable operation reservation commit together before crossing the host boundary. If the process dies after reservation, recovery only queries the host using that same operation identity. An absent receipt is not proof that a mutation never happened: no new write is dispatched. An operator/user must reconcile unresolved outcomes; the adapter does not automatically retry them.

The `DurableTicketHost` contract requires:

1. `currentPrincipal` resolves current server-side identity/rights without accepting model-generated authority.
2. `read` independently checks current tenant/application/resource access.
3. `write` accepts the AE operation key and binds it to the exact request. The host atomically commits its business mutation and durable receipt, or otherwise provides an equivalent authoritative reconciliation mechanism. The qualification host demonstrates a separate transaction/ledger, not shared in-memory deduplication.
4. `query` checks current access and returns the exact authoritative receipt for that operation, or an explicit unknown result. Returning no receipt never authorizes blind replay.

A timeout/abort stops waiting, not the external operation. Any exception after entering `write` is conservatively unknown. Confirmed operation receipts are monotonic: a delayed unknown observation cannot overwrite success, and reconciliation updates the canonical receipt and run status in the same locked transaction. Durable stored unknown outcomes remain unknown even if cancellation or revoked access interrupts replay. Cancellation before dispatch prevents new tools; cancellation with an unresolved reservation retains `outcome-unknown`, even if the host may already have committed. Reconciliation can establish success without claiming rollback. DBOS does not guarantee exactly-once arbitrary external mutations.

## Qualification and remaining limits

Run the opt-in suite after `npm run build`:

```sh
bash tests/persistence/run-postgres.sh /path/to/official/postgresql/17/bin
```

The harness enforces PostgreSQL 17.11, a dedicated synthetic database on loopback, minimal child environments, fresh OS processes and independent durable host evidence. See `docs/PERSISTENT_RUNTIME_QUALIFICATION.md` for observed results, including initial failures and corrections. Unit tests do not imply this service-backed suite ran.

Not qualified: production SSO, customer data, real model APIs/costs, arbitrary business capabilities, dynamic release snapshots, schema upgrades, database loss/failover, concurrent multi-worker load, unbounded retention, or production deployment. The initial schema has no retention administration or production connection hardening. Keep database/snapshot access private and apply operator-managed permissions and backups before any separately authorized production work.
