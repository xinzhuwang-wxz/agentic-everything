# Acceptance status

This is the finite acceptance ledger for [the approved three milestones](../IMPLEMENTATION_PLAN.md#十五-三个完整里程碑与并行实施), not a new roadmap. It reconciles the initial source audit at `87c3a3d` and the subsequently qualified Java recipe, workflow and cost-measurement receipts on 2026-10-25. A passed component keeps its recorded scope; another candidate, platform or deployment does not inherit its result automatically.

**Core acceptance is not yet declared.** The original M2/M3 module requirements now have bounded evidence. Final assembled-candidate verification remains pending; it is not inferred from separately passing worktrees. The three external project adaptations begin after core acceptance, not as substitutes for those checks.

## Product and authorization boundary

AE is an open-source toolkit for the developer agent the user already has. It requires no AE website, account or service key. One consolidated source-bound development plan covers the approved engineering and verification; the adapted product's effectful business actions have their own in-chat confirmations. The host keeps its language, identity, permissions, business transactions and receipt ownership. A floating daily assistant and an administration tab share the same governed backend; a headless host need not acquire a browser UI.

All evidence here uses owned synthetic hosts, local processes and simulated model behavior. No production identity, paid-model quality/cost, arbitrary-host acceptance, public deployment or user-computer installation is claimed. Optional knowledge remains disabled. The mobile experiment is explicitly contract/fixture-only, as permitted by plan §15.3.

## M1: qualified integrated helpdesk journey

**Pass at the recorded frozen inputs.** The original React/TypeScript fixture is transformed by AE's lifecycle, not supplied pre-integrated. Its pre-apply baseline, original/candidate business comparison, default-OFF and selected-ON behavior, host UI, current authority, immutable release, approval and recovery paths have execution evidence.

- [Delivery qualification](verification/delivery-qualification.md): source/plan/approval/recipe/archive binding, original/generated typechecks and builds, ten business cases, actual HTTP and sandboxed Chromium. Completion requires observed clean process exit and owned-service cleanup, not child-supplied PASS.
- [Joined release qualification](verification/joined-release-qualification.md): member query → assignee approval; immutable OFF/ON/prior-configuration releases; pending confirmation refresh/offline/reconnect/cancel; SIGKILL/restart; current permission and capability revocation. A confirmed old-ON approval across a new-OFF release writes once. OFF does not undo a completed mutation.
- [Conversation backend](verification/conversation-continuity.md) and [conversation UI](verification/conversation-ui.md): multiple turns, ordered history across reload/restart, scoped identity/context changes and interrupted-run recovery without historical approval/write replay.
- [Negative-fault receipt](../qualification/m1-negative/evidence/qualification.json): actual delivery timeout/cleanup-failure processes and PostgreSQL host-commit/HTTP-disconnect/in-flight-cancel/reconcile boundaries. The earlier status saying these were unrun is superseded, not a new remaining gate.

The assembled M1 runtime `55faf91` passed strict build and 250 tests, five correlation and six conversation-browser groups and the joined-release matrix. Later shared-runtime, API or migration changes need affected-input integration checks; they do not reopen M1 for new features. Earlier failed attempts and narrower observations remain in the linked reports.

## M2: cross-stack adaptation and developer beta

| Original requirement | Current evidence | Status and exact boundary |
| --- | --- | --- |
| Second non-React/non-TS, non-ticket host through the same lifecycle | [Python inventory](verification/cross-stack-inventory.md): unchanged Python/SQLite domain, generated JSON adapter, 25 original/candidate unit cases, 13 independent business baseline cases, real CLI/SDK approval, write and receipt reconciliation | **Pass**, exact `python-inventory-synthetic-v1`; not arbitrary Python or inventory PostgreSQL recovery |
| One shared runtime/authority boundary and multiple host surfaces | [Generic host UI](verification/generic-host-ui.md): real generic HTTP and sandboxed browser over Python inventory, stock 12 → 9 with one mutation; current source hashes match its retained receipt | **Pass**, reviewed reference-context seam and synthetic mounts; this optional browser harness is not a new Python browser transformation recipe |
| Recipe conflict, drift, dirty scope, repeated apply and rollback | [Transformation tests](../packages/transformation/test/transformation.test.ts), [inventory lifecycle tests](../packages/transformation/test/inventory.test.ts), both source-bound delivery profiles | **Pass** at recorded fixture inputs; unsupported layouts explain the missing recipe rather than inventing success |
| Java/Spring recipe and authenticated remote MCP | [Java recipe lifecycle](verification/java-spring-recipe.md): real public CLI, pre-apply original CLI archive, 14 business parity cases, generated adapter, 15 runtime assertions, tamper rejection and source-preserving revert; [separate remote-MCP evidence](verification/java-spring-remote-mcp.md) | **Pass**, exact `java-spring-inventory@1.0.0` / Java 21 / Spring Core 6.2.19 fixture; no Boot/MVC, arbitrary Java rewriting, Java PG or production IAM claim |
| Second provider contract | [Chat Completions contract](verification/second-provider-contract.md): official SDK real loopback HTTP, strict schema correction, 13 focused tests and strict source checking | **Pass**, synthetic non-streaming contract only; no paid inference or vendor-quality claim |
| Versioned configuration import/export | [Release operations](verification/release-operations.md): strict same-scope envelope, read-only preview, conflict/current-admin checks and new-draft-only import | **Pass**, no credentials, cross-tenant transfer, overwrite or implicit publication |
| Fixed installation, version diagnostics, upgrade and uninstall | [Integrated distribution receipt](../qualification/release-operations/integrated-distribution-report.json): exact `87c3a3d` and legacy `55faf91` offline installs/full builds, doctor, side-by-side upgrade, guards, old-copy readiness and owned uninstall | **Pass**, eight local-source cases; no service activation, publisher authentication, general OS or production claim |
| Versioned deterministic workflow subset | [Workflow qualification](verification/deterministic-workflows.md): immutable definition/version/hash, read/branch/exact approval/terminal write, bounded retries, restart and unknown-result handling; full strict build, 14 focused tests and 15 actual PG/DBOS cases across 16 workers | **Pass**, finite trusted-server definitions on the existing DBOS owner; zero model calls, no parallel graph/canvas/arbitrary code, automatic write retry or implicit model-API routing |
| Direct/manual-recipe versus AE integration costs | [Paired measurement](verification/adaptation-costs.md): both React and Python arms produce identical bytes and run the same business profile; actual changed files/lines, stage times, observed rework/defects and evidence overhead recorded | **Pass for the stated scripted comparison**, not a human study or historical engineering-cost estimate. AE stage sums were higher; no speedup is claimed |

## M3: operations and bounded extensions

| Original requirement | Current evidence | Status and exact boundary |
| --- | --- | --- |
| One AE schema owner, dry-run, compatible old runs, backup/restore | [Operations qualification](verification/release-operations.md), [PG receipt](../qualification/release-operations/postgres-report.json): additive schema 1–3, failed-DDL rollback, concurrent/idempotent migration, preserved DBOS ownership, legacy approval, real dump/restore and single-write recovery | **Pass at recorded source**; final affected-input assembled PG run remains separate |
| Current-rights isolation, retention/deletion, bounded admission | Same report plus [retention pagination](../qualification/release-operations/retention-pagination-report.json): scoped physical projection deletion, blocked-run paging, transaction/current-rights/status-lock rechecks, durable rate counters and 429 behavior | **Pass at recorded source**; projection deletion is not whole-account, audit-ledger or backup erasure; admission is not provider billing |
| Configuration/release rollback and operational recovery | [Joined release](verification/joined-release-qualification.md), [operations runbook](operations.md) and installer receipt | **Pass for the qualified configuration/binary/data boundaries**; no destructive down migration or reversal of completed host effects |
| Security, dependency/license notices, SBOM and support | [Security](../SECURITY.md), [support matrix](support-matrix.md), [recorded release artifacts](verification/release-operations.md#retained-release-artifacts) and separately pinned [Java dependencies](../qualification/java-spring/README.md) | **Bounded review/inventory pass**; zero reported npm advisories at the recorded check is not a penetration test or permanent vulnerability guarantee |
| Key rotation | [Operator procedure](operations.md#key-rotation-procedure-and-security-review) | **Documented procedure**, no real account credential rotated; actual deployment needs its own authorized secret mechanism |
| Automation and A2A declared subset | [Extension evidence](../qualification/extensions/README.md): installed DBOS timezone/DST scheduling, bounded window/backfill, stable occurrence deduplication, pause/resume, SIGKILL recovery and official A2A SDK HTTP to persistent runtime | **Pass at recorded source**; no general cron/queue engine, arbitrary A2A peers, streaming or push; combined candidate PG checks remain separate |
| Mobile/miniprogram bridge experiment | Same extension report: versioned message/session/origin boundary reaches governed runtime without approval bypass | **Contract/fixture pass; real platform not-run/unverified**, the explicit §15.3 fallback; not a blocker for inventing an all-platform rollout |
| Optional knowledge | [Extension support declaration](../packages/extensions/README.md) | **Disabled/not implemented**. No ingest/retrieval/revoke claims; enabling it would require its own permission/ingest/revocation evidence |

## Exact remaining core release work

**Freeze and verify the assembled candidate.** The three source-level gaps found by the read-only audit are now closed by bounded implementation/measurement receipts, not by changing the plan:

- Java recipe: implementation `d2db94b`, evidence `0192f25`.
- Deterministic workflows: implementation/evidence `2b15a60`.
- Paired direct-versus-AE measurement: `dd03b9b`.

The integration owner must still retain the final strict aggregate and affected PostgreSQL/DBOS/API/recovery/extension/operations receipts for their combined source. Until those actually pass, core acceptance and `ReleaseQualified` remain pending. The successful installer receipt belongs to `87c3a3d`; it is not a substitute for the final combined runtime tests. Documentation-only changes do not require repeating unchanged compiler/installer inputs, and previously qualified unaffected slices are not reopened for new features.

This audit ran no heavy compiler, database or browser work. It checked source, evidence and hashes, then inspected the three new execution reports. Earlier failures remain visible in their original reports, including the Java `ct.sym` pre-apply failure and workflow compiler resource failures followed by the successful unchanged full build. [Audit method and evidence map](verification/core-acceptance-audit.md).

## Section 16.1 release gates

`SourcePlanApproved`, `BaselineArchived`, `PatchApplied`, `BuildVerified`, `ContractVerified`, `BehaviorParityVerified`, `ImprovementExpectedVerified`, `RuntimeConnected`, `BusinessAccepted` and `RecoveryAccepted` have named fixture evidence, not universal product badges. Inventory has no enabled improvement registry; the helpdesk OFF/selected-ON evidence stays separate. `ReleaseQualified` remains pending the exact work above and the final assembled receipt. No average score can override an unauthorized write, cross-tenant disclosure, repeated mutation or unexplained business drift.

Paid provider evaluation, production SSO, deployment, real customer data and user-computer operations require their corresponding authorization and environment. They are not silently treated as executed, nor invented as new local-fixture exit thresholds. Complex canvases, managed execution, marketplaces, permanent memory and universal SDK support remain excluded from this release.

## Delivery after core acceptance

Deliver accepted AE to its independent Mac directory and user-owned GitHub repository with matching commits. Then carry out the three real, distinct, manageable open-source adaptations in plan §20.4. Each must actually use AE, retain the original business baseline and comparison, truthful screenshots, license and attribution, and its own `<original-name>-agentic` directory/repository. The final AE README must link verified original and modified repositories and screenshots.

The owned helpdesk, Python, Java and mobile fixtures are not those external showcases. No showcase selection, download, adaptation, Mac delivery or publication is claimed here, and no placeholder URLs are supplied. These cases do not reopen M1/M2, but the overall assignment is not complete until their delivery and final links are checked.
