# Durable execution qualification

## Decision and scope

2026-10-24: **bounded engine qualification passed** with official `@dbos-inc/dbos-sdk@5.3.0` (MIT), Node 24.19.0, and real PostgreSQL 17.11 (Debian 17.11-0+deb13u1). This qualifies the tested DBOS primitives, **not the current AE runtime as durable**. `GovernedRuntime` remains explicitly an in-memory fixture. No alternate scheduler, replacement runtime, paid service, model API, production deployment, or host-project database was used.

The test is intentionally independent of Agents SDK provider quality. Its host effect is a synthetic local ledger. That ledger is an observable idempotency fixture, not a durable scheduler, actual host API, transaction-coordination implementation, or exactly-once proof.

## Actual observed results

`node tests/durability/qualify.mjs postgresql://agent@127.0.0.1:55439/ae_durability_qualification` passed on 2026-10-24 13:43 UTC (run ID prefix `66c5e8ec-1ef0-491a-bd56-5d0309e59863`). A second fresh-cluster run through the checked-in shell runner also passed at 13:43 UTC (prefix `401e410a-e567-46b4-9e2c-69964a9b39d2`). Evidence was retained in `/tmp/ae-dbos-qualification-sYIAOM` and `/tmp/ae-postgres-qualification-MdNzCw` during this session; temporary paths are not permanent artifacts.

| Case | Actual observation | Meaning / boundary |
| --- | --- | --- |
| Worker SIGKILL during unfinished step, then launch new worker | Workflow reached SUCCESS with persisted input/result | Real DBOS/PostgreSQL process-crash recovery, not memory replay |
| Completed step before crash | One fixture invocation across both processes | Checkpointed step result reused |
| Unfinished step at crash | Two fixture attempts | Uncheckpointed side effects may be attempted again |
| Same workflow ID submitted after success | Same result, one final-step execution | Completed workflow deduplication; not a concurrent submission stress test |
| Synthetic external effect completed before lost acknowledgment | Two attempts, one host effect, one reconciliation | Host idempotency/receipt lookup prevents duplicate effect in this fixture; DBOS alone does not |
| Cancel while a step is already running | CANCELLED; current step returned once; next step never ran | Cancellation is not rollback or forced interruption of arbitrary external work |

Runtime emitted a `pg` concurrent-query deprecation warning and a cancellation ownership message. Assertions still passed. Track upstream compatibility before upgrading to pg 9; do not suppress this evidence or imply clean stress qualification.

## Reproduction and environment

Run from repository root, after the dependency owner installs the exact lockfile:

```sh
bash tests/durability/run-postgres.sh /path/to/official/postgresql/bin
```

The runner creates a new synthetic database cluster under `/tmp`, listens only on `127.0.0.1:55439` (optional second argument changes port), runs the qualification, and stops its own server on exit. No inherited database URL is read. Child workers receive a minimal environment without model/provider/cloud credentials. Fixtures use random workflow ID prefixes. The harness refuses non-loopback URLs, other database names, and passwords. Test logs and the database are retained under the printed temporary paths for inspection; no cleanup touches other tasks.

This machine had no installed PostgreSQL server or client executables. Official Debian packages were downloaded and extracted, without apt installation, sudo, OS settings, or persistent credentials:

- https://deb.debian.org/debian/pool/main/p/postgresql-17/postgresql-17_17.11-0+deb13u1_amd64.deb
- https://deb.debian.org/debian/pool/main/p/postgresql-17/postgresql-client-17_17.11-0+deb13u1_amd64.deb
- Observed SHA-256 server: `d2ce1ddffafa783f9acda4c92c86fc21e8288bff3782d739294f14fa797d7886`
- Observed SHA-256 client: `9d8558f8dd57c8e92e218a20698383575d53742ca3f9e7c2b7fe5f246d5216ae`

These are downloaded-artifact fingerprints, not a claim of separately verified signed release metadata. Extracted packages plus downloads occupied 88 MiB in separate tmpfs, avoiding the approximately 611 MiB remaining repository volume. Initialization used trust authentication only for disposable synthetic data on isolated loopback. This is not a production setup recipe.

The reproducible runner keeps PostgreSQL and its tests in one owned command lifecycle and uses loopback TCP. Qualification includes clean shutdown of the owned server; it does not qualify arbitrary executor networking or process persistence.

## Compatibility plan before changing AE runtime

1. **One scheduler and one agent loop.** DBOS owns execution/recovery/waits. Agents SDK remains the only reasoning/tool loop. Do not place a bespoke lease scheduler alongside it or restart the whole current `Runner.run` blindly after a crash.
2. **AE remains domain authority.** Persist run identity, principal/tenant/application scope, immutable release, capability/policy versions, approval bindings and decisions, operation/receipt state, and event ordering in AE-owned tables. DBOS workflow status is not business authorization or approval state.
3. **Serialize only explicit snapshots.** Do not persist Agent/Runner objects, AbortControllers, closures, SDK interruption object identity, or the current session Map. Prove the pinned Agents SDK RunState serialization/rehydration boundary separately with an approval pause and a new process. Pin the recipe, release and workflow implementation versions for old runs.
4. **Model round/checkpoint granularity.** Record nondeterministic model output and tool-call identities as durable steps. A crash before a paid provider result is checkpointed can cause another provider call; qualify token/cost/retry handling before real APIs. Completed model output must replay without another model call.
5. **Governed write protocol.** Before a write: atomically reserve a stable invocation/idempotency identity, recheck current host authority and revocation, validate exact approval bindings/expiry, and record execution intent. On uncertain completion, query the host receipt using the same operation identity. Never consume a lost-ack approval and then blindly retry with a new key. Do not wrap arbitrary host mutations in DBOS automatic step retry.
6. **Crash windows to test end to end.** Before approval persistence; after decision persistence but before delivery; after approval consumption and before host request; after host mutation but before AE receipt; after AE receipt but before DBOS checkpoint; after cancellation during host request. Verify fresh-process recovery, cross-tenant denial, revoked authority, duplicate decisions, expired approval and exact event sequence in each relevant window.
7. **Cancellation distinction.** Record cancellation intent in AE and propagate it to DBOS and supported host AbortSignals. If a host write may have started, retain reconciliation state rather than declaring that cancellation undid it. No new governed steps after cancellation. Resuming a cancelled DBOS workflow must not revive a rejected/revoked AE approval.
8. **Rollout gate.** Review schema/transaction boundaries and snapshot compatibility, implement integration behind a selected runtime mode, then pass the fault matrix against real PostgreSQL. Existing in-memory mode must stay honestly labeled until this gate passes. No production migrations or deployment are authorized by this test.

## Not tested / not claimed

- AE approval persistence, Agents SDK snapshot recovery, real host authorization or model/API behavior.
- PostgreSQL crash/power loss, backup/restore, failover, disk-full or network partition.
- Multi-worker races, concurrent duplicate submissions, long-running scale, schema upgrades/downgrades or old-release recovery.
- Durability across destruction of the temporary filesystem or machine. The database is real PostgreSQL, but its disposable storage is not production durable storage.
- Exactly-once arbitrary external effects. Unknown results require host idempotency and reconciliation.

## Official references

- https://docs.dbos.dev/typescript/tutorials/workflow-tutorial
- https://docs.dbos.dev/typescript/tutorials/workflow-management
- https://docs.dbos.dev/typescript/reference/configuration
- https://github.com/dbos-inc/dbos-transact-ts

Current documentation may evolve beyond the installed version; executed fixture results above are tied to 5.3.0, not inferred from newer documentation.
