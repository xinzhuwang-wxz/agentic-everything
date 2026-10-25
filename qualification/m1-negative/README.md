# Finite M1 negative-boundary qualification

Test-only completion of the remaining frozen M1 fault matrix. No runtime feature,
endpoint, permission bypass, dependency or production-data change.

## Existing gates retained

- The persistent qualification already contains actual transactional host commit →
  cancellation before AE receipt persistence → SIGKILL/restart → original receipt
  reconciliation, and host timeout after commit. Those are not mocked status flags:
  `tests/persistence/qualify.mjs` checks independent host rows and write counts.
- The joined-release browser fixture exercises genuine browser offline/reconnect
  while an approval is pending, cancellation/reload/stale confirmation, rollback
  and explicit approval. It does not claim that offline event occurred during a
  host write.
- The assembled conversation qualification covers lost create/start HTTP responses,
  exact history/nonce recovery and current authority/identity isolation. An aborted
  turn-creation response is not an aborted approval/write response.

The two bounded additions below fill the precise remaining gaps without reopening
those passed gates or adding a new milestone.

## Actual delivery timeout and cleanup failures

Run after the repository's ordinary build, using its previously qualified Chromium
binary (the parent validates the binary but this test never launches it):

`node --max-old-space-size=256 qualification/m1-negative/process.mjs /tmp/new-empty-evidence-directory`

This calls the unmodified production `runFixtureDelivery`. Only inside this test
process, the fixed child spawn is redirected to `process-child.mjs`; no arbitrary
child override is added to production. The original trusted fixture assessment,
pre-apply baseline, exact candidate, authorization and browser-pin checks still run.
Actual process spawning, timer budget, SIGTERM, SIGKILL escalation, exit status,
process-group closure and terminal-report reduction are production behavior.

1. A real child that ignores SIGTERM never reports; the real deadline terminates
   it and the parent emits failure, not a completed delivery.
2. A real owned socket keeps `server.close` pending. A deliberately premature child
   PASS sentinel cannot override pending cleanup and the deadline/SIGKILL outcome.
3. A real Node cleanup error is recorded, then the child exits zero. Failed cleanup
   still prevents completion.

The child PASS sentinel is deliberately incomplete and is never claimed as a
business/browser acceptance or imported into a delivery artifact. The parent
observations are not fabricated `FixtureProcessOutcome` values. All owned process
groups must be absent before the test passes. No full host build is repeated.

## In-flight HTTP disconnect plus cancellation

Wait for an exclusive PostgreSQL slot, then run:

`bash qualification/m1-negative/run-inflight-postgres.sh /path/to/qualified/postgresql/bin`

Requires the current build and already qualified PostgreSQL 17.11. Uses one fresh
loopback-only database with 32MB shared buffers and a synthetic host/model. The
current persistent API's existing `after-host-write` fault boundary pauses after the
host transaction commits but before AE stores the receipt. Independent host queries
prove one committed mutation/receipt and a still-unresolved AE reservation. A real
HTTP approval response is aborted, and the server observes closure before response
completion. A separate cancel request must return `outcome-unknown`, never rollback.
The existing trusted runtime reconciliation method reads the same operation receipt;
there is no added HTTP reconciliation endpoint. A conflicting late decision and same-intent
replay must leave one host write, the exact receipt and two model calls. All database,
HTTP server and runtime processes close before success.

This complements, rather than replaces, the retained process-restart and actual
browser-offline tests. It is HTTP transport disconnection, not a claim of a physical
network outage or a real-provider result.

## Recorded execution

On 2026-10-25, all three OS negative cases and the real HTTP/PG race passed against
the unchanged strict-built `55faf91` candidate. See `evidence/qualification.json`
for exact timing, resource limits, earlier test-harness failure, warnings and
compiled-input provenance. The later root source addition did not silently change
the tested compiled inputs. These tests add no TypeScript input or runtime source;
the root's strict 250-test check remains the separate aggregate gate, not a claim
that this opt-in qualification ran as part of that command.
