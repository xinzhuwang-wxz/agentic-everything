# Persistent AE runtime qualification

2026-10-24: the opt-in `PersistentRuntime` passed a real PostgreSQL 17.11 / DBOS 5.3.0 / Agents SDK 0.21.0 process-restart matrix. This extends the earlier isolated engine qualification with AE's actual ModelProvider port, SDK loop, approval bindings, host-rights checks, durable business ledger and external host receipt protocol. The existing `GovernedRuntime` remains an explicitly labeled in-memory fixture.

## Observed results

Command: `bash tests/persistence/run-postgres.sh /tmp/ae-durability-pg/root/usr/lib/postgresql/17/bin 55449`, after `npm run build`.

Full matrix passed at 14:20:24 UTC with 16 cases and 30 fresh OS worker processes. Run prefix: `d4a64e75-5d12-4e3c-871d-aa61c5bf9ad1`. Temporary evidence: `/tmp/ae-persistence-postgres-XJIqq6/result.json`, with worker logs in the same directory. These temporary paths are inspection evidence, not permanent deliverable links. PostgreSQL was stopped by the owned runner on completion.

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

## Failures discovered and corrected

1. Initially, invalid approval input started the stable DBOS approval workflow before validation. DBOS correctly retained that error, preventing a subsequent valid decision under the same identity. Read-only preflight now rejects invalid inputs before workflow submission; authoritative approval validation/consumption remains in locked database transactions.
2. DBOS and the Agents SDK serialize/wrap thrown errors. Relying only on `instanceof PolicyError` at the outer runtime boundary obscured revoked-rights codes and could misclassify a timed-out unknown write. Governed tool results now carry the trusted classification across the durable step, and the runtime retains that classification before the SDK wraps the error. Arbitrary exception text is not exposed.
3. Any exception after entering the external write is conservatively unknown, including policy-shaped exceptions. Abort/timeout stops waiting, not the external operation. Exact operation IDs are validated on host receipt responses.

Logs retain the `pg` concurrent-query deprecation warning and DBOS duplicate-workflow queue-name warnings (`_dbos_internal_queue` versus undefined). Assertions passed, but this is not warning-free stress qualification. Track upstream compatibility; do not suppress these observations.

## Independent-review corrections

Review found a missing boundary beyond the first restart matrix: DBOS can return an already checkpointed tool result without re-entering the broker. Current rights and resource access are now checked outside cached tool/model results before data exposure or new model calls. An exact post-DBOS-tool-checkpoint crash/revocation test verifies no new final model turn or duplicate write. Early live denial updates AE business state idempotently without reusing a DBOS step position.

Review also found that concurrent reconciliation could let a delayed unknown response overwrite an earlier confirmed success. The operation receipt transition is now monotonic, and canonical receipt plus reconciliation run status update in one locked transaction. A deterministic delayed-unknown versus successful query race verifies both callers observe the same confirmed receipt/status. Stored unknown write results, not only empty reservations, are included when classifying cancellation and replay failure.

## Integration contract

See `packages/runtime-adapters/db/README.md` for the asynchronous runtime API, host obligations, transaction boundaries, version pins and package subpath. This adapter is explicit opt-in. HTTP composition must use a trusted server principal/release and label the selected persistence mode; the default memory fixture has not silently changed.

AE and DBOS do not guarantee exactly-once arbitrary external mutations. Safe recovery depends on the host's stable operation-key receipt protocol. Unknown results do not authorize another write.

## Remaining gates

Production authentication/SSO, real model/API behavior and costs, dynamic release snapshots, arbitrary business adapters, multi-worker concurrency/load, schema migration/rollback upgrades, database crash/failover/backup restoration, retention, and production deployment remain unqualified. PostgreSQL storage is disposable local test storage. No real customer data, user computer, production service, paid provider or public exposure was used.


Regression gate: `npm run check` passed all 67 existing tests with strict typecheck and hygiene. The worktree reuses installed dependencies but links each `@ae/*` package locally. An initial whole-node_modules symlink mixed the root's newer transformation recipe with this worktree's older fixture, causing one unrelated MCP test failure; the local-package overlay corrected it without source changes or installation. The final service-backed matrix above was rebuilt with the isolated local links. No generated diagnostic modifications are committed.
