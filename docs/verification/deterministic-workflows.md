# Bounded deterministic workflows

`@ae/runtime-adapters/workflows` is an explicit server-side adapter for a small, versioned deterministic business workflow subset. It does not invoke a model. DBOS remains the sole scheduler, recovery/checkpoint and durable-sleep owner; AE's existing `PersistentStore` and `PersistentToolBroker` remain the business permission, approval and receipt authorities. This closes the original deterministic-workflow module, not a general workflow platform.

## Declared subset

A server-owned `WorkflowCatalog` registers strictly validated JSON definitions. Each definition has an explicit workflow ID, positive integer version and canonical content hash. Re-registering different content under the same ID/version is rejected. Catalog reads return detached copies. Catalog configuration is supplied by trusted server composition; it is not an end-user JSON registry, permission grant or executable script. The adapter does not provide an administrative HTTP/UI authoring service or a database-backed catalog editor. Persist catalog source files through the host's normal reviewed configuration/deployment process.

The graph has at most 32 reachable nodes, is acyclic and executes sequentially:

- `read`: one exact registered read capability, argument bindings, a next node and 1–3 attempts with 0–1000 ms durable delay. Only technical exceptions from read execution can retry; policy denials do not. The invocation/operation identity is unchanged across retries.
- `branch`: compare one input or earlier read-result value with a literal JSON scalar, selecting exactly one successor. Result references must point to a read that dominates the consumer on every path.
- `write`: one exact registered effect capability, its normal server-generated operation preview and an exact user approval. A write must lead directly to an `end` node, so every path has at most one mutation. There are no automatic write retries, including for explicit failures or unknown outcomes.
- `end`: finish with a bounded, declarative message. A false branch can end without requesting approval or producing a mutation.

Arguments use only literal scalars or bounded own-property paths into the input or completed read results. No JavaScript, expressions, templates, URL actions, shell, model planner, arbitrary condition callback, loops, parallel execution, visual canvas, compensating transactions or multi-write saga is implemented. Unknown references, prototype keys, excessive depth/data, cycles, unreachable nodes, non-dominating reads, unsupported capability versions/hashes and capability risk mismatches fail closed.

Definitions are limited to 64 KiB, run input to 16 KiB, each retained result to 128 KiB and state to 192 KiB, with a maximum nesting depth of 12 and 4096 traversed JSON values. Per-phase elapsed time is at most 240 seconds. An approval pause ends a phase; it is not an unbounded running worker. Existing approval expiry remains authoritative.

## Trusted integration

```ts
import { DeterministicWorkflowRuntime, WorkflowCatalog } from '@ae/runtime-adapters/workflows';

const catalog = new WorkflowCatalog([reviewedDefinition]);
const runtime = new DeterministicWorkflowRuntime({ databaseUrl, host, catalog });
await runtime.launch();
const view = await runtime.start({
  principal: serverAuthenticatedPrincipal,
  workflowId: 'ticket-triage',
  version: 1,
  input: { ticketId: 'authorized-resource' },
});
// Surface view.approval using the host's existing exact-confirmation experience.
// Only forward a real authenticated user's decision, never approve from workflow content.
const resumed = await runtime.decide(view.runId, serverAuthenticatedPrincipal, userDecision);
await runtime.shutdown();
```

The principal, host authority, catalog and optional immutable `AgentRelease` must come from trusted server composition. If a release is supplied, execution also intersects its pinned capabilities with current host authority. Every action node pins capability ID, version and binding hash. Reading a definition, selecting a workflow or possessing its hash never authorizes a business action.

The complete definition and its hash are persisted with the private run snapshot before execution. New catalog versions affect new runs only; an old run can recover when only a newer definition is loaded in the current catalog, provided its pinned workflow implementation and exact registered capability versions remain supported. The public view is explicitly labeled `modelMode: 'deterministic-workflow'`, not a simulated or configured model. It exposes the pinned workflow version/hash, last cursor, completed nodes, ordinary status/events, approval and host receipts. Snapshot input/state remains private.

One selected runtime configuration is supported per worker process. Deterministic workers register `ae-deterministic-phase-v1` with DBOS application version `ae-deterministic-v1`; agent workers retain their existing identities. Existing run JSON gains no new SQL tables or migrations. `PersistentStore` defaults to legacy `ae-v1` and rejects deterministic runs; the deterministic store rejects legacy runs before interpreting their checkpoints. Do not point a legacy run/history API at this adapter and reinterpret its snapshot. This is coexistence with fail-closed routing, not an automatic migration between workflow types.

## Approval, retries and recovery

A decision is submitted to DBOS before its authoritative decision transaction commits. The existing ledger atomically consumes the exact approval and reserves a stable operation ID before host dispatch. Principal, capability, arguments, target version, release, policy and expiry remain bound by the existing broker.

Every run/read/replay gate checks current host identity and resource access outside cached DBOS results. Current capability rights are checked again before action execution. Cancellation before dispatch prevents new actions. Cancellation after a write may have begun retains unknown outcome rather than claiming rollback.

Read retries use recorded DBOS steps and durable sleeps, not a second queue or timer scheduler. A completed read receipt is reused; an unfinished read is safe to repeat within its explicit retry bound. Policy errors are not retried. After reservation of a write, recovery can only reuse an AE receipt or query the host's same operation key. An absent host receipt is not permission to retry. Unknown outcomes stop the workflow and require explicit `reconcile`; unresolved cases become manual review. Reconciliation confirms only the terminal host write and never resumes another business action.

Hosts retain ownership of current authorization, target/resource version checks, mutation transactions and authoritative operation receipts. Exactly-once arbitrary external mutations are not promised. The existing host receipt protocol is required for safe recovery.

## Qualification

Focused unit tests are part of the normal compiled test suite. The explicit real-database fault matrix is:

```sh
npm run build
node --test dist/packages/runtime-adapters/db/workflows/*.test.js
bash tests/workflows/run-postgres.sh /path/to/official/postgresql/17/bin 55472
```

The harness uses an isolated loopback PostgreSQL 17.11 database, DBOS 5.3.0, fresh OS workers, SIGKILL and independent synthetic host mutation/receipt counters. It does not read inherited provider credentials, use a paid model, connect to customer systems or publish/deploy anything. It tests definition pinning, exact approval restart, true/false branches, repeated decisions, current rights, cancellation/rejection, bounded read retries including restart, reservation/host-commit/receipt crash windows, unknown outcome reconciliation and runtime-pin incompatibility.

On 2026-10-25, the real database matrix passed all **15 cases across 16 fresh OS workers**, with **zero model calls**. Independent host evidence showed exactly one write/effect for approved completion, recovery after host commit, recovery after AE receipt and lost acknowledgment; the reservation-before-dispatch crash retained manual review with zero writes. Read retry succeeded after two attempts, exhausted at exactly three, and survived SIGKILL without resetting its bound. The current-rights replay gate denied a revoked checkpointed read before branch/approval.

The final unchanged full strict build passed with `NODE_OPTIONS=--max-old-space-size=576 npm run build`; 14 compiled focused tests (8 workflow and 6 existing host-boundary tests), source hygiene and diff checks passed. The owned PostgreSQL server stopped cleanly and `pg_ctl status` confirmed no server remained. See [the permanent evidence summary](deterministic-workflow-evidence.json) for all cases, exact commands, pins and limitations. Assembled-repository regression evidence is recorded separately in [core acceptance](../acceptance-status.md).

The runtime keeps the existing `PersistentRunView`/model HTTP contract separate from its ledger-view union and checks the legacy mode before returning data. The known `pg` concurrent-query deprecation warning remains visible; the passing matrix is not warning-free distributed-load qualification.

## Reuse decision and limits

Adopted runtime: existing pinned `@dbos-inc/dbos-sdk@5.3.0` (MIT). Adopted governance: AE's already integrated durable broker/store and host receipt protocol, unchanged. The added code is only the missing declarative definition validator, immutable catalog and bounded DBOS program traversal. Replacing DBOS with a workflow engine or orchestrating repeated model calls would add an unnecessary second execution authority; compiling user definitions to arbitrary JavaScript would remove the finite validation boundary. Existing DBOS `registerWorkflow`, `startWorkflow`, `runStep`, `sleepms`, cancellation and recovery are exercised directly by the qualification.

Not claimed: a visual workflow editor, parallel graphs, arbitrary executable definitions, automatic write retry/compensation, a separate catalog service, production SSO, production database failover/backup guarantees, distributed-load qualification, customer host correctness or full production deployment. The shared legacy SDK pin in the business ledger remains for compatibility; no Agents SDK/model loop is executed by this adapter.
