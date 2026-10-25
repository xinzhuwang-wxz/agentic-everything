# Persistent AE runtime qualification

2026-10-24: the opt-in `PersistentRuntime` passed a real PostgreSQL 17.11 / DBOS 5.3.0 / Agents SDK 0.21.0 process-restart matrix. This extends the earlier isolated engine qualification with AE's actual ModelProvider port, SDK loop, approval bindings, host-rights checks, durable business ledger and external host receipt protocol. The existing `GovernedRuntime` remains an explicitly labeled in-memory fixture.

## Observed results

Command: `bash tests/persistence/run-postgres.sh /tmp/ae-durability-pg/root/usr/lib/postgresql/17/bin 55449`, after `npm run build`.

Full matrix passed at 19:25:15 UTC with 24 cases and 45 fresh OS worker processes. Run prefix: `c2c8a9c7-47b8-4eae-b32f-0be82232ee0a`. Temporary evidence: `/tmp/ae-persistence-postgres-V44pjB/result.json`, with worker logs and observations in the same directory. These paths are inspection evidence, not permanent deliverable links. PostgreSQL was stopped by the owned runner on completion. Parent/worker heaps were capped at 384/640 MiB.

- Create → read → approval pause → SIGKILL → fresh process: same approval ID, hash, expiry, operation binding and events. Approval resumes the pinned SDK snapshot, not a new conversation. Exactly one host mutation, stable receipt and high/v2 readback.
- Model results checkpointed before the restart are not requested again. The final model turn receives the actual durable host receipt. Model requests are synthetic and deterministic, not a quality/cost evaluation.
- Repeated identical decisions return exactly the persisted view without additional model calls or host writes. Conflicting decisions are rejected.
- Valid principals from another tenant, application or subject cannot get or approve the run.
- SIGKILL after model/read checkpoints but before approval persistence: initial workflow recovers one approval without repeating model calls or changing the read receipt, then executes the approved write once.
- SIGKILL after committed decision: DBOS automatically recovers the already-submitted phase and executes once. No application-owned recovery queue is used.
- SIGKILL after operation reservation but before dispatch: no host write occurs after restart; unknown outcome is retained and reconciliation enters manual review. Missing receipt is not treated as permission to retry.
- SIGKILL after host mutation/receipt transaction, before AE receives the result: recovery queries the same operation key and returns the exact host receipt. One host write, one effect.
- SIGKILL after AE receipt transaction, before DBOS checkpoints the step: cached AE receipt is reused, with no host outcome query or second write, even though the target is now version 2.
- Cancel after host commit while acknowledgment is held: public status remains unknown; after restart, reconciliation returns the exact committed receipt. No write retry or resumed model turn occurs.
- Host acknowledgment delayed five seconds after commit against a one-second phase deadline: prompt unknown outcome, not false cancellation/rollback; reconciliation confirms the exact receipt and one write.
- Write rights revoked while approval is paused: fresh-process resume is denied with `ROLE_DENIED`; no host write or receipt.
- Cancel/reject while paused survive process death and cannot be revived by later approval.
- A checkpointed unknown write remains unknown if write rights are revoked before restart. Cancellation while that nonnull unknown result is held immediately returns unknown, survives restart, and reconciles the exact receipt.
- A supplied dynamic release snapshot is rejected explicitly rather than silently ignored.
- Tampered approval hash is rejected without occupying/poisoning the valid approval workflow ID; the subsequent valid decision succeeds.

The host fixture owns separate PostgreSQL tables in `qualification_host`, including principals, tickets, calls, and receipts. Its business update and operation receipt commit in one transaction. State is never reset between process deaths. Assertions inspect this ledger independently of AE status; a process-local counter cannot conceal duplicated effects.

## Durable boundary guarantees

1. Read-only preflight rejects invalid inputs before submitting a stable DBOS approval workflow. Authoritative approval validation and consumption remain in locked database transactions.
2. Trusted governed-tool classifications cross durable steps and remain available before SDK error wrapping. Arbitrary exception text is not exposed.
3. Any exception after entering the external write is conservatively unknown, including policy-shaped exceptions. Abort/timeout stops waiting, not the external operation. Exact operation IDs are validated on host receipt responses.

Logs retain the `pg` concurrent-query deprecation warning and DBOS duplicate-workflow queue-name warnings (`_dbos_internal_queue` versus undefined). Assertions passed, but this is not warning-free stress qualification. Track upstream compatibility; do not suppress these observations.

## Replay and reconciliation boundaries

DBOS can return an already checkpointed tool result without re-entering the broker. Current rights and resource access are checked outside cached tool/model results before data exposure or new model calls. An exact post-DBOS-tool-checkpoint crash/revocation test verifies no new final model turn or duplicate write. Early live denial updates AE business state idempotently without reusing a DBOS step position.

Operation receipt transitions are monotonic: canonical receipt and reconciliation status update in one locked transaction. A deterministic delayed-unknown versus successful query race verifies both callers observe the same confirmed receipt/status. Stored unknown write results, not only empty reservations, participate in cancellation and replay-failure classification.

## Member/assignee session acceptance

The same durable session read its ticket and eligible members, paused on an exact assignment approval, survived a process restart, committed the host assignment with an atomic receipt, lost the acknowledgment, checkpointed unknown, and survived another SIGKILL. Explicit reconciliation queried the same operation once and returned the original receipt: one mutation, no redispatch and no additional model turn. Foreign, inactive and ticket-unscoped members were denied before dispatch; version, member eligibility and role changes after approval were rejected after restart with zero mutation.

The legacy HTTP-PG harness was adjusted to explicitly register its supported four-tool catalog after configuration defaults became fail-closed to two; that separate HTTP-PG suite was not rerun in this milestone.

This exercises the dedicated transactional synthetic PostgreSQL host. The CLI/browser delivery profile separately uses its memory-backed transformed host. These are different execution compositions, not one manufactured combined PASS.

## Integration contract

Legacy hosts expose only the original two tools. Member tools require `listMembers` and an explicit exact current capability catalog. Persistent HTTP configuration likewise defaults to two tools; trusted composition opts in through `capabilityCatalog`, checked against the reviewed fixed registry. Runtime rechecks current host support and authorization independently.

See `packages/runtime-adapters/db/README.md` for the asynchronous runtime API, host obligations, transaction boundaries, version pins and package subpath. This adapter is explicit opt-in. HTTP composition must use a trusted server principal/release and label the selected persistence mode; the default memory fixture has not silently changed.

AE and DBOS do not guarantee exactly-once arbitrary external mutations. Safe recovery depends on the host's stable operation-key receipt protocol. Unknown results do not authorize another write.

## Qualification limits

Production authentication/SSO, live-model behavior and costs, arbitrary business adapters, multi-worker load, production database failover and production deployment remain unqualified. The selected release/behavior combination and migration/backup/retention operations have separate [joined-release](verification/joined-release-qualification.md) and [operations](verification/release-operations.md) evidence; this report alone does not qualify them. PostgreSQL storage in this suite is disposable synthetic test storage.


This component receipt records a strict build, source hygiene and 188 aggregate tests at its source. Current assembled-source regression is recorded in [core acceptance](acceptance-status.md).
