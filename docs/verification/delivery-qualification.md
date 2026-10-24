# Source-bound delivery qualification

## Scope and result

The fixed `react-helpdesk-synthetic-v1` profile completed a real CLI assessment → plan → approval record → isolated apply → delivery → bundle check on 2026-10-24. This is acceptance of the exact included synthetic fixture and the enumerated gates, not of arbitrary customer projects, paid-model quality, production identity, production durability or the three planned external adaptations.

The developer-host approval for a new profile-bound plan covers its fixed verification actions. Old unprofiled plans still produce static-only partial delivery. No arbitrary shell, adapter import, external PASS report, dependency download or new credential is accepted by the delivery command.

## Actual same-run evidence

- Source base commit: `85aeb19e9db2a5b9c977791d6cb21d13cda52e7e` in a disposable fixture repository.
- Plan SHA-256: `227145c9f6cfc7e72d69b3590504304aea0927f1e64f388ca1f81c7ac0e551b7`.
- Delivery started at `2026-10-24T18:03:08.580Z` and completed at `2026-10-24T18:03:18.739Z`.
- `deliver` exited 0, reported `complete` with scope `react-helpdesk-synthetic-v1`, and created 15 bounded artifact files plus its manifest.
- `delivery-check` exited 0 with `valid: true`; the parent observed zero exit, no signal/timeout, no forced cleanup and a closed owned process group. Browser/HTTP cleanup completed before the child wrote its report.
- Source Git status remained clean. Owned HTTP, Vite and Chromium processes had exited after completion.

The manifest binds assessment, exact plan, approval scope and validity, recipe/version, patch/rollback, baseline/candidate fingerprints, verification and artifact bytes. The behavioral archive independently records the complete fixed fixture tree hashes and source Git commit. These are explicit different fingerprint scopes, not interchangeable whole-repository claims.

Observed gates:

1. Four original/generated seeded business cases: read, cross-tenant denial, priority write and stale-version denial. Raw output, side effects and receipts retained; OFF parity required without normalizing business values.
2. Original and generated host strict TypeScript no-emit checks and actual Vite production builds.
3. Real loopback HTTP: unauthenticated 401, cross-tenant 404, missing-scope 403, no write before approval, one confirmed write, stable high-priority/version-2 receipt.
4. Sandboxed Chromium: original page/refresh; collapsed overlay; pointer drag and reload persistence; keyboard/Escape/focus; one approval retained through host navigation and then updating the original page; 360px layout and real touch interaction. No page errors or external requests. The narrow screenshot was also visually inspected.

5. Process completion: the parent independently records spawn/exit/signal/timeout and owned process-group closure. A child's PASS observations cannot override nonzero exit, incomplete cleanup, timeout or forced cleanup.

The model was deterministic and explicitly simulated. The tested runtime composition was the memory fixture; existing PostgreSQL/DBOS qualification was not rerun or imported as acceptance of this transformation.

## Negative controls and aggregate gates

- Missing/unqualified browser: actual `deliver` and `delivery-check` both exited 2, produced a valid partial bundle, and left all five execution gates not-run.
- A copied complete bundle with a forged browser evidence hash was rejected even after all outer artifact/verification hashes were recomputed.
- Removing its browser evidence reference while rebinding the outer hashes was also rejected.
- Tests cover source/base/approval drift, expiry, contradictory exclusions, symlinks, extra files, false PASS/complete, rollback integrity, unknown profile and phantom extra assessment evidence.
- The whole-workspace hygiene/typecheck/build and 141-test suite passed before the process-terminal regression was added. The latest terminal fix has a fresh strict build, 11/11 focused tests and the complete normal fixture run above; the integrator must rerun the expanded aggregate suite for the final merged revision.
- Final schema export from that compiled build: 36 schemas, including delivery and verification authorization.

Negative terminal controls cover otherwise-PASS observations followed by nonzero exit, signal, timeout, missing/failed cleanup, unclosed process group and forced cleanup. Two real qualification attempts were interrupted by SIGKILL during host-build stages and correctly produced failed bundles, including one with preserved business passes and one without a final child report. Their cause was not proven by a compiler diagnostic. Heavy runtime/browser imports were deferred until both serial build workers exited; the final normal run then completed. No failed attempt was relabeled as complete. The final RSS sample observed about 1119.8 MiB summed Node RSS and 531.2 MiB for the largest Node process; the per-process heap cap is not a total memory cap.

## Tooling, evidence retention and limits

Observed Node 24.19.0, TypeScript 5.9.3, Vite 8.3.5, Playwright Core 1.64.1 and Chromium 156.0.8078.47. The profile pins the qualified Chromium binary's path and SHA-256. Other browser installations/platforms are not silently qualified. Each Node execution heap is capped at 640 MiB; this is not an aggregate OS memory sandbox. The child process group has a bounded deadline, and only local loopback traffic is part of this reviewed fixture's execution.

Local qualification evidence is retained under `.delivery/qualification-2026-10-24/` in the qualification checkout: `bundle/`, final bundle check, aggregate log, negative-control results and screenshots. That directory is intentionally ignored by Git. The original live fixture/artifact workspace is `/tmp/ae-delivery-acceptance-NuilqM`, with the latest successful bundle in `terminal-final-delivery`; temporary paths are not permanent publication links. The committed workflow and tests reproduce a fresh bundle rather than reusing this report as PASS.

Bundle hashes and semantic checks are not signatures, trusted timestamps or an approval-identity service. Offline profile checking needs the matching AE toolchain and rejects provenance drift. Copying both fabricated observations and their hashes cannot become cryptographic proof of execution. The developer host remains responsible for real user authorization and truthful execution context.

See [delivery usage and status codes](../delivery.md) and the [adaptation Skill](../../skills/ae-adapt/SKILL.md).
