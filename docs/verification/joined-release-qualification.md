# Joined member, release, behavior and recovery qualification

## Owner and bounded plan

Ticket **AE-M1-JOINED**, owner `qualify/joined-release-20261024`, base `9268d98`.
Scope: the existing synthetic PostgreSQL host/HTTP worker, one joined scenario helper,
a browser helper using the existing transformed React fixture, and acceptance evidence.
No production runtime, UI redesign, dependencies, queue, model provider, external host,
external showcase project or deployment is added.

Reuse: `@openai/agents@0.21.0` (MIT) remains the only agent loop;
`@dbos-inc/dbos-sdk@5.3.0` (MIT) and PostgreSQL 17.11 remain the durable execution
owner/store; Hono, the existing control plane, `projectTicketBehavior`, host SDK,
React UI and Playwright Core remain the existing integration/harness components.
The synthetic PG host implements the already-reviewed title projection rather than
adding a second behavior implementation. Existing SQL call/receipt ledgers are
used to distinguish no dispatch, one dispatch and one mutation.

Planned joined sequence:
1. Publish default-OFF A; member query → pending assignee approval. Publish read-only
   ON B, SIGKILL/restart, then execute old A under unchanged live authority. New B
   sees only its read/member tools and the ON projection.
2. Separately revoke the old run's current capability and current host write authority;
   neither a pinned release nor an earlier approval may override those revocations.
3. Publish full ON C. In the generated UI, restore a pending assignee confirmation
   after refresh and offline/reconnect, then cancel without a dispatch.
4. Start another C run, publish D containing A's prior OFF configuration, and restart.
   The old C approval stays C; future page reads/new runs use D. Approval produces
   one assignee mutation. OFF does not compensate that historical mutation.

Here rollback means a **new immutable publication of prior settings**. Retrying an
old draft publication does not reactivate it. Publishing read-only B is not live
permission revocation. Build, joined scenario execution, process exits and cleanup
must be observed before any gate is marked passed.

## Result

**PASS for this fixed synthetic joined sequence, 2026-10-24. Not overall M1 or AE acceptance.**

- Fresh `NODE_OPTIONS="--max-old-space-size=640 --max-semi-space-size=1" npm run check`:
  lint, strict no-emit typecheck, clean build/emit/export linking and **195/195 tests** passed;
  zero failed/skipped tests and command exit 0. The strict compiler inputs were not
  changed after this build; the final browser/cleanup harness changes ran below.
- `AE_BROWSER_EXECUTABLE=/tmp/ae-browser-qualification/root/usr/lib/chromium/chromium-headless-shell bash tests/persistence/run-http-postgres.sh /tmp/ae-durability-pg/root/usr/lib/postgresql/17/bin 55463`:
  the existing HTTP matrix and **six joined scenario groups passed twice**. The final
  run used PostgreSQL **17.11** and sandboxed Chromium **156.0.8078.47**. Browser page
  errors and attempted external page requests were both zero. The deterministic
  model and host remained synthetic, with no paid provider or production account.
- Final raw evidence directory: `/tmp/ae-persistence-postgres-yiS8bg`.
  `joined-summary.json` contains exact releases, approvals, run IDs, tool catalogs,
  host observations and browser facts; `process-summary.json` confirms command exit
  0, PostgreSQL stop exit 0 and removal of its owned postmaster PID. Normal workers
  exited 0; injected restart boundaries were observed SIGKILLs. The browser and Vite
  preview were closed before the joined report became passed.
- Screenshots in `joined-browser/` show refreshed pending approval, the actual offline
  error, cancelled state, old ON approval after OFF rollback, and the single approved
  assignment. The offline alert and completed assignment were visually inspected.

### Exact joined observations

1. A run `intent-a7bfce6c1adaede27714cc1a29d22c0ea12f7d8e5657c1fa987b6534e7347e3d`
   read the current ticket and its eligible member, then paused on an assignee
   approval. After B publication and SIGKILL/restart it retained the **same approval
   and A snapshot**, succeeded under still-valid authority, and duplicate intent/
   confirmation left exactly **one dispatch and one mutation**.
2. A new B run exposed exactly `read_ticket` and `read_ticket_members`, returned the
   ON title projection with all other returned ticket fields equal to host truth,
   and had **no approval or write**. Removing a capability from a new release did
   not retroactively revoke A.
3. Separate old-A approvals failed on current `CAPABILITY_NOT_ALLOWED` and current
   `ROLE_DENIED`. Each had **zero host dispatches and zero mutations**. These are live
   revocation checks, not an inference from read-only publication.
4. Security, authorization and corruption categories were rejected by the registered
   behavior schema. An HTTP selection for an unregistered authorization-bypass
   improvement returned 403 and did not change the active release.
5. The real generated UI restored one C assignee approval after page refresh and a
   real browser offline/online cycle. Its binding stayed unchanged, and the server
   remained pending with zero writes. UI cancellation survived reload and the later
   process restart. A stale approval returned **409 RUN_NOT_AWAITING_THIS_APPROVAL**,
   not a successful mutation.
6. A second C/ON run stayed pinned after D republished **exactly A's configuration**
   as a new immutable release and the API was SIGKILLed/restarted. UI approval wrote
   one assignment; the earlier ON read receipt retained `Printer offline`, while
   current ordinary D/OFF reads retained the stored surrounding whitespace. The
   assignee and version 2 remained: **OFF did not undo the write**. A fresh D run
   followed the full member/assignee path with OFF output and cancelled with zero
   dispatch. All four stored release snapshots remained structurally identical to
   the objects returned by their publications.

### Resource failures and recovery

The first two fresh aggregate attempts were OS-killed during typecheck (exit 137).
A direct 384/512 MiB diagnostic reached V8 heap limits; direct 640 MiB was SIGKILLed
near 653 MiB RSS. `/tmp` is tmpfs, and duplicating the existing vendor installation
had unnecessarily consumed 241 MiB. Replacing only those immutable third-party
copies with links to the same locked installation freed that RAM; worktree-local
`@ae` links and newly built AE output remained independent. The subsequent full
fresh check passed at 640 MiB. No old AE build was imported, no source or compiler
coverage was reduced, and none of the failed attempts count as successful checks.

### Remaining limits

This joins the named member/release/behavior/pending-confirmation gates for one
synthetic fixture. It is **not** a new verification profile automatically imported
into `delivery-check`, nor a general host or production acceptance claim. The older
lost-write-response/receipt-reconciliation checks remain separate: this new UI
sequence disconnects **before approval**, not during an in-flight host mutation.
Deliberate delivery timeout/cleanup-hang OS fault injection, cross-stack lifecycle,
Java/Spring/authenticated remote MCP, clean installation/upgrade/backup restore,
retention/isolation, real-provider quality/cost and remaining release-readiness gates
are not qualified here. No post-acceptance external showcase project was touched.
No production runtime or UI change was required by this execution.

Retained evidence bundle: `/workspace/shared/ae-joined-evidence-20261024.tar.gz`
(SHA-256 manifest inside). It includes the fresh check log, failed resource attempts,
114 compiler-input hashes, 273 generated-output hashes, joined qualification sources,
final process/run summaries and five browser screenshots. Evidence is retained outside
the source repository; it is not a production runtime transcript or a generated build commit.
