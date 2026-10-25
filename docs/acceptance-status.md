# Acceptance and release scope

**The bounded AE release and three pinned upstream integrations are accepted.**
Validated executable source: `d9bb07d99193b87210441389b1e6544bd1cff160`,
tree `e880bf1a7e48b4ea8a7331cc5771dbad88701dbe`, qualified on 2026-10-25 UTC.
Documentation-only release commits do not change these executable inputs.

Acceptance covers the finite core requirements and the exact reviewed reveal.js,
linkding and Kanboard profiles, not arbitrary-host adaptation or production deployment.

## Assembled verification

| Gate | Actual evidence | Scope |
| --- | --- | --- |
| Standard build | Clean strict TypeScript compile and package export linking, 640 MiB heap; exit 0 | Current Linux executable source above |
| Aggregate regression | 348 tests passed, zero failed or skipped; 111.76 seconds | Same compiled source; `node scripts/test.mjs` |
| Source hygiene | `npm run lint`, Git diff whitespace check and narrow changed-source credential-pattern review passed | No dependency/lockfile changes; heuristic review is not exhaustive secret detection |
| reveal.js | Actual approved baseline/apply/deliver/check lifecycle, original/candidate navigation, 14 broker/authority/recovery assertions and independent 10-flow browser acceptance | Exact upstream/profile; original QUnit comparison retains four unchanged MathJax CDN failures |
| linkding | Complete six-gate lifecycle/check; original 356 tests, candidate 356 tests plus separate 20 native tests; runtime, interrupted-response, native revocation and browser acceptance | Recipe 1.0.4; final desktop/mobile screenshots manually inspected |
| Kanboard | Complete six-gate lifecycle/check; original and candidate each 53 tests / 475 assertions; 20 runtime/browser checks | Recipe 1.0.4; current-role/target checks, recovery and truthful assignee labels; final screenshots manually inspected |

See [pinned upstream integrations](verification/external-cases.md) for profiles,
toolchains, exact source pins and boundaries. Case repositories retain their
accepted delivery manifests, checks and original/candidate screenshots. Static
verification alone leaves execution gates not-run; only the authorized executed
profile can produce a complete delivery.

## Retained component qualification

The fixed-source installer was qualified on macOS at code
`942493175df0e183bc1e1d990db1a359671da50a`: strict build, 325/325 tests,
all eight install/upgrade/integrity/refusal/rollback/uninstall cases and ready
installation doctor. Receipt SHA-256:
`d507185c6d1fee072dda3f11a6016fbe1e74ca5d1f9a50e2e1239f0c66286532`.
Installer inputs remain unchanged. This receipt does **not** claim the newer
external-case profiles were executed on macOS; their qualification above is Linux.

The unchanged PostgreSQL/DBOS runtime and operations inputs retain the real
`ec84e21` PostgreSQL 17.11 receipts: 11 operations/admission/current-authority
cases, four bounded retention cases and 15 deterministic workflow cases across
16 workers, including crash recovery and unknown-outcome no-redispatch. Each
retains its originally observed scope, not a new database run of every case.
The locked dependency notice/SBOM and recorded advisory review remain applicable
to the unchanged lockfile. Source qualification is not service activation.

Release artifacts require the standard strict build from a clean source checkout.
Transpile-only output is not strict-build evidence.

## Qualified product requirements

- **M1:** original React/TypeScript host baseline and isolated transformation;
  default-OFF/selected-ON business comparison; member lookup and single approved
  mutation; floating assistant/admin surfaces; release pinning; refresh,
  offline/reconnect/cancel; conversation continuity; current-rights revocation and
  crash/lost-response receipt recovery. See [delivery](verification/delivery-qualification.md),
  [joined release](verification/joined-release-qualification.md),
  [conversation UI](verification/conversation-ui.md) and
  [negative faults](../qualification/m1-negative/README.md).
- **M2:** Python/SQLite and Java 21/Spring Core recipes through the same lifecycle,
  generic reference-context UI/HTTP, read-only authenticated remote MCP, second
  provider wire contract, versioned configuration transfer, managed source
  installation, finite versioned deterministic workflows and a measured scripted
  direct-versus-AE integration comparison. See [examples](examples.md),
  [workflows](verification/deterministic-workflows.md) and
  [comparison](verification/adaptation-costs.md).
- **M3:** one AE schema owner, additive compatible recovery, actual backup/restore,
  scoped bounded retention, durable admission, notices/SBOM and operator key
  rotation procedure; bounded DBOS automation/A2A and mobile bridge experiment.
  See [operations](operations.md), [operations evidence](verification/release-operations.md)
  and [extensions](../qualification/extensions/README.md).

The fixture gates `SourcePlanApproved`, `BaselineArchived`, `PatchApplied`,
`BuildVerified`, `ContractVerified`, `BehaviorParityVerified`,
`ImprovementExpectedVerified`, `RuntimeConnected`, `BusinessAccepted`,
`RecoveryAccepted` and `ReleaseQualified` are satisfied for their named profiles
and declared release scope. They are not universal product badges. No aggregate
score overrides an unauthorized write, repeated mutation, cross-tenant disclosure
or unexplained business drift.

## Boundaries

All recorded model behavior is simulated; provider evidence is a loopback wire
contract, not live-model quality or cost. Optional knowledge is disabled. Mobile
is contract/fixture-only, as permitted by the plan; a real mobile platform is not
qualified. Arbitrary Java, Spring Boot/MVC, production identity, deployment,
customer data, universal platform support and whole-account erasure are not
claimed. The scripted cost comparison is not a human productivity or speedup
claim. See the [support matrix](support-matrix.md).
