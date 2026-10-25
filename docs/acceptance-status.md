# Core acceptance and release scope

**The bounded AE core release is accepted.** Validated code commit:
`942493175df0e183bc1e1d990db1a359671da50a`, tree
`c2d4d12209c6128a3aff62197ab027fda3f3ec44`. Acceptance recorded on
2026-10-25 UTC. Documentation-only release changes do not change these validated
runtime, test, recipe, schema or dependency inputs.

Acceptance covers the finite requirements in the approved implementation plan,
not arbitrary-host adaptation, external-project adaptations or production deployment.

## Final assembled verification

| Gate | Actual evidence | Status |
| --- | --- | --- |
| Exact assembled source | Clean macOS qualification of the commit/tree above; standard clean, strict TypeScript compile and export linking at the reviewed 640 MiB compiler budget | Pass |
| Aggregate regression | Same macOS candidate: 325 tests passed, zero failed or skipped | Pass |
| Fixed-source distribution | Same macOS candidate: all eight installation, side-by-side upgrade, integrity/refusal, rollback-readiness and owned-uninstall cases; doctor ready, integrity true, metadata consistent | Pass |
| Operations integration | `ec84e21` real PostgreSQL 17.11 receipt: 11 schema/adoption/concurrency/legacy/backup-restore/current-authority/admission/HTTP/restart cases and clean server shutdown | Pass; relevant sources unchanged |
| Retention integration | Same source: four bounded paging, exact scope, stale evidence/current-rights and concurrent status-lock cases; clean shutdown | Pass; relevant sources unchanged |
| Deterministic workflows | Same source: 15 real PostgreSQL/DBOS cases across 16 workers, including crash recovery, bound approval, branch/read retry, revocation and unknown-no-redispatch; clean shutdown | Pass; relevant sources unchanged |
| Supply chain and tracked-source review | Current lock hash and all current-release evidence hashes verified; exact locked dependency notices and SBOM, recorded zero npm advisories, no findings from narrow tracked-source secret heuristic | Pass within the stated review scope |

The macOS qualification receipt SHA-256 is
`d507185c6d1fee072dda3f11a6016fbe1e74ca5d1f9a50e2e1239f0c66286532`.
This is source qualification, not service activation or deployment.

The source comparison from `ec84e21` to the validated commit changes the installer
build launcher and portable Python selection, plus documentation/supply-chain
artifacts. PostgreSQL/DBOS runtime, API, control-plane, extension, workflow and
operations integration harness inputs did not change. The exact-source macOS
aggregate and distribution checks cover the changed assembled inputs; unchanged
component receipts retain only their originally observed scope.

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
