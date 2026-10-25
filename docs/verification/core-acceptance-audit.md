# Core acceptance evidence audit

Date: 2026-10-25 UTC. Read-only audit source: `87c3a3d212c36f3fc793ba57e3e0f111cf313ec2`. Documentation reconciliation does not change runtime, contracts, recipes, schema or dependencies. The [current acceptance ledger](../acceptance-status.md) is the product status; this report records how that status was derived.

## Method

Read the approved plan §§4.2, 13, 15, 16 and 20, prior acceptance checklist, module implementations/tests, retained qualification reports and support/runbook documentation. Distinguished actual observed receipts from implementation, focused transpile-only runs from strict compilation, and source-specific component passes from assembled-candidate acceptance. No compiler, browser, database service, installer or paid provider was run by this audit.

The nine source SHA-256 entries in `qualification/generic-host-ui/evidence/verification.json` all match this checkout. The nine Java/remote-MCP source entries in `docs/verification/java-spring-remote-evidence.json` also match. This checks byte continuity only, not a fresh execution or a signature. The root lockfile SHA-256 is `762d169e68e916a31eefbf749a8a8173f1e78065b559e03931ea4dc0b80c22fd`.

The installer owner separately supplied actual final evidence for clean legacy `55faf91f5a47e2b7e4f5af003faa2801cee097b8` (tree `ffddd0d59f0c5d5e483e5e9916c4613c8fad1fbb`) and candidate `87c3a3d212c36f3fc793ba57e3e0f111cf313ec2` (tree `efc2781a55a60d1977f9112f3bd313d552ccaec6`). Both offline dependency installs and full builds passed; all eight distribution cases, including final owned uninstall, passed. See [integrated distribution](../../qualification/release-operations/integrated-distribution-report.json) and [memory review/failures](../../qualification/release-operations/installer-memory-review.json). This audit does not replace their execution receipt.

## Stale open boxes that now have evidence

- M1's delivery timeout, cleanup failure and real in-flight fault work is recorded in `qualification/m1-negative`, and the frozen assembled M1 evidence remains intact.
- Python/SQLite inventory is a second, non-ticket business domain through the full shared lifecycle, with its own original 13-case baseline. It is not mere manifest detection.
- Generic reference-context HTTP/UI has real non-ticket browser/host evidence. Its optional UI harness is not the Python headless recipe.
- Java 21/Spring Core and official authenticated remote MCP, the second Chat Completions wire contract, configuration transfer and guarded fixed-source installation have separate execution receipts.
- Migration ownership, old-run/backup recovery, bounded physical projection retention, durable admission, notices/SBOM and operator procedures are implemented and qualified at recorded inputs.
- Bounded automation/A2A have real local PG/DBOS/official-SDK evidence. The mobile fixture is the fallback expressly allowed by the plan; optional knowledge remains disabled.

## Original requirements missing at the initial audit

1. §15.2 names a Java/Spring recipe. The actual Java report explicitly states adapter contract qualification and no automatic Java transformation recipe. Only React and Python recipes are registered in `packages/transformation/src/recipes`. Do not erase the distinction by relabeling the adapter.
2. §4.2/§15.2 require a versioned deterministic business workflow subset with testable branch/state/retry/recovery behavior. The source has the fixed internal durable agent phases and automation trigger; neither supplies evidence of a separately authored workflow definition. No generic authoring/parallel/canvas scope is requested by this finding.
3. §15.2 requests a manual-versus-AE comparison of changes, time, rework and defects. No paired measured report was found. A source line count or successful runtime duration alone is not all four measurements and cannot establish a human productivity claim.
4. The final assembled candidate must retain its affected-input regression evidence. Historical aggregate counts, isolated worktree typechecks and installer builds are not the same test. The root integration owner controls those runs and their final receipt.

These findings do not add acceptance thresholds, reopen already-qualified unchanged slices or authorize production actions. Earlier failures remain failures in their original reports, including killed/OOM compilers, the unavailable system Chromium attempt and corrected initial protocol/schema assertions. An honest supported subset is preferable to either a blanket green claim or an endless expansion of milestones.

## Bounded closure receipts reviewed after the initial audit

The initial findings above are historical observations at `87c3a3d`, not current open implementation gaps:

- **Java/Spring recipe closed:** feature `d2db94b` and evidence `0192f25` add the installed `java-spring-inventory@1.0.0` recipe and exact synthetic profile. The [actual public-CLI receipt](java-spring-recipe.md) records pre-apply original baseline, 14/14 business cases, preserved original CLI/source, 15 runtime assertions, eight rejected evidence-tamper variants and guarded revert. Strict build and 12 focused tests passed. The original host remains Java 21/Spring Core 6.2.19; no Boot/MVC or arbitrary-host claim is inferred.
- **Deterministic workflow subset closed:** `2b15a60` adds finite immutable versioned server-owned definitions on the same DBOS owner. [Evidence](deterministic-workflows.md) records the unchanged full strict build, 14 focused tests and 15 real PostgreSQL/DBOS cases across 16 fresh workers, including branch selection, exact approval/version recovery, bounded read retries, rights, cancellation, drift and unknown-no-redispatch behavior. Zero model calls. No parallel platform, visual authoring service or automatic write retry is claimed.
- **Measured integration comparison closed:** `dd03b9b` retains a [paired scripted direct/manual-recipe versus AE comparison](adaptation-costs.md) for React and Python. Both produce equal candidate bytes and run the same fixture acceptance; actual modification/time/rework/defect/overhead dimensions are recorded. The direct patch was already authored, shared-baseline and packaging costs differ, and human/historical/token costs are unknown. No productivity or speedup claim, and no new human-study gate.

The remaining original gate is the final assembled-candidate aggregate and affected-input integration verification. Individual full builds and the workflow PG pass do not prove the combined repository. Core acceptance remains pending that receipt; final delivery/showcases remain later work under the original sequence.
