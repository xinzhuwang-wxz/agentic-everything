# Source-bound delivery qualification

## Scope and result

The fixed `react-helpdesk-synthetic-v1` profile completed a real CLI assessment → plan → approval record → isolated apply → delivery → bundle check on 2026-10-24. This is acceptance of the exact included synthetic fixture and the enumerated gates, not of arbitrary customer projects, paid-model quality, production identity, production durability or the three planned external adaptations.

The developer-host approval for a new profile-bound plan covers its fixed verification actions. Old unprofiled plans still produce static-only partial delivery. No arbitrary shell, adapter import, external PASS report, dependency download or new credential is accepted by the delivery command.

## Actual same-run evidence

- Source base commit: `0b39ca03c173d24acbebdebd6b1745a7181b1c62` in a disposable fixture repository.
- Plan SHA-256: `42d76b0e9ceee576765e579483c973d4bd168e59a87c7232d64b21550aa0748e`.
- Original baseline captured at `2026-10-24T19:25:48.929Z`, exclusively archived before apply at `2026-10-24T19:25:48.990Z`. Delivery reused exactly those observations, without recapture; its original 300-second budget was not reset.
- Delivery started at `2026-10-24T19:27:18.867Z` and completed at `2026-10-24T19:27:28.101Z`.
- `deliver` exited 0, reported `complete` with scope `react-helpdesk-synthetic-v1`, and created 16 bounded artifact files plus its manifest.
- `delivery-check` exited 0 with `valid: true`; the parent observed zero exit, no signal/timeout, no forced cleanup and a closed owned process group. Browser/HTTP cleanup completed before the child wrote its report.
- Source Git status remained clean. Owned HTTP, Vite and Chromium processes had exited after completion.

The pre-apply record binds all ten case inputs/outputs, actual fixture commit/tree, collector/toolchain, assessment, plan and approval. Core apply requires a private one-use receipt minted only after exclusive archive write and flush. Offline checking validates the archive coverage, binding and hash chain; timestamps alone are not proof of ordering.

The manifest binds assessment, exact plan, approval scope and validity, recipe/version, patch/rollback, baseline/candidate fingerprints, verification and artifact bytes. The behavioral archive independently records the complete fixed fixture tree hashes and source Git commit. These are explicit different fingerprint scopes, not interchangeable whole-repository claims.

Observed gates:

1. Ten original/generated seeded business cases: ticket read, cross-tenant denial, priority write, stale priority version, ticket-scoped member query, cross-tenant member query, assignee write, foreign/inactive assignee denial and stale assignee version. Raw output, side effects and receipts retained; OFF parity required without normalizing business values.
2. Original and generated host strict TypeScript no-emit checks and actual Vite production builds.
3. Real loopback HTTP: unauthenticated 401, cross-tenant 404, missing-scope 403, no write before approval, one confirmed write, stable high-priority/version-2 receipt. A separate fresh synthetic session queries members, confirms one assignment and preserves one receipt through a deliberately lost acknowledgment; that reconciliation is explicitly memory-host receipt recovery, not process restart.
4. Sandboxed Chromium: original page/refresh; collapsed overlay; pointer drag and reload persistence; keyboard/Escape/focus; one approval retained through host navigation and then updating the original page; 360px layout and real touch interaction. No page errors or external requests. A fresh browser context for a fresh synthetic host session queries members, pauses for confirmation, then updates the ordinary host assignee to member-a/version 2 exactly once. Its screenshot was inspected.

5. Process completion: the parent independently records spawn/exit/signal/timeout and owned process-group closure. A child's PASS observations cannot override nonzero exit, incomplete cleanup, timeout or forced cleanup.

The model was deterministic and explicitly simulated. The tested runtime composition was the memory fixture; a separate real PostgreSQL/DBOS 24-scenario, 45-process matrix qualified member/assignee restart recovery. It is not imported as evidence that this CLI-transformed host used PostgreSQL. See [persistent qualification](../PERSISTENT_RUNTIME_QUALIFICATION.md).

## Negative controls and aggregate gates

- Core and public CLI reject missing/caller-forged baseline receipts, source-root reuse, archive drift/overwrite and configured Git filters before status; apply failures preserve the archived baseline.

- Missing/unqualified browser: actual `deliver` and `delivery-check` both exited 2, produced a valid partial bundle, and left all five execution gates not-run.
- A copied complete bundle with a forged browser evidence hash was rejected even after all outer artifact/verification hashes were recomputed.
- Removing its browser evidence reference while rebinding the outer hashes was also rejected.
- Tests cover source/base/approval drift, expiry, contradictory exclusions, symlinks, extra files, false PASS/complete, rollback integrity, unknown profile and phantom extra assessment evidence.
- Latest source: hygiene, strict full build and all 188 aggregate tests passed; aggregate Node heap was capped at 384 MiB. Browser and PG qualification used this compiled implementation; only the browser test-session isolation was corrected afterward, without changing product code. The integrator should repeat its final gate after merging.
- Final schema export from that compiled build: 36 schemas, including delivery and verification authorization.

Pure unit negative terminal controls cover otherwise-PASS observations followed by nonzero exit, signal, timeout, missing/failed cleanup, unclosed process group and forced cleanup. A deliberate real timeout/cleanup-hang injection has not been run; those paths have unit coverage and code review, not separate OS-fault qualification. The successful run observed about 1119.8 MiB summed Node RSS and 531.2 MiB for the largest Node process; a per-process heap cap is not a total memory cap.

## Tooling, evidence retention and limits

Observed Node 24.19.0, TypeScript 5.9.3, Vite 8.3.5, Playwright Core 1.64.1 and Chromium 156.0.8078.47. The profile pins the qualified Chromium binary's path and SHA-256. Other browser installations/platforms are not silently qualified. Each Node execution heap is capped at 640 MiB; this is not an aggregate OS memory sandbox. The child process group has a bounded deadline, and only local loopback traffic is part of this reviewed fixture's execution.

Local current evidence is retained in `/tmp/ae-members-cli-WcFwsR`: `baseline-before-apply.json`, `patch.json`, `delivery-final/`, `check-final.json`, and `process-final.json`. The preceding failed browser-session attempt remains in `delivery/`; it reset the synthetic backend but reused a tab with its old run ID, so the product correctly kept the input locked. Qualification used a fresh context for the new synthetic host rather than altering product session behavior. The successful retry reused the exact original archive within its original total budget and took 9.60 seconds (maximum child-process RSS 540456 KiB, not aggregate concurrent RSS). Temporary paths are not permanent publication links. The committed workflow reproduces fresh evidence, never imports this report as PASS.

Bundle hashes and semantic checks are not signatures, trusted timestamps or an approval-identity service. Offline profile checking needs the matching AE toolchain and rejects provenance drift. Copying both fabricated observations and their hashes cannot become cryptographic proof of execution. The developer host remains responsible for real user authorization and truthful execution context.

See [delivery usage and status codes](../delivery.md) and the [adaptation Skill](../../skills/ae-adapt/SKILL.md).
