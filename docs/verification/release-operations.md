# Release operations qualification

This report qualifies a bounded synthetic operations path, not all M3 gates or production deployment. The implementation is in `@ae/operations`, configuration transfer uses the existing control plane, and the commands/runbook are in [operations](../operations.md).

## Observed candidate 8781169

- Node 24.19.0 / npm 11.9.0; the exact clean candidate 8781169 passed `npm run check`: lint, strict typecheck, clean build and all 257 tests. The legacy 55faf91 build passed separately. Final root assembly with other workstreams remains an integration-owner gate.
- Real PostgreSQL 17.11: empty-schema read-only dry-run; actual failed SQL rolls back all DDL and ledger entries; old 55faf91 worker creates a pending Agents SDK checkpoint; legacy rows/admission-independent intent tokens remain unchanged during concurrent schema adoption; repeated migration is idempotent; schema/default/checksum drift is rejected.
- Four concurrent migrations produce one complete history. DBOS migration rows remain unchanged. A previous binary can still read the exact pending approval against additive upgraded schema; no down migration is run.
- Actual pg_dump custom backup, destruction of only the harness-owned synthetic database, fresh database creation and pg_restore restore the exact private run/configuration/approval/SDK state. A new worker resumes the original pinned release once. Repeating the decision leaves exactly one durable host mutation. Wrong-tenant read fails.
- Physical expired projection retention is scoped to current tenant/application/subject and at most 100 candidates. Pending/unknown runs and other scopes remain. A post-delete current-rights failure rolls the transaction back. Successful deletion removes turn text/context, leaves replay tombstones and preserves immutable run/operation/approval records. Whole-data erasure is not claimed.
- Durable admission: 12 concurrent attempts allow exactly three with a configured cap of three. Counters survive reconnection; trusted tenant/application/subject scopes remain separate; old windows renew; cleanup removes only 100 of 150 expired rows. Real HTTP allows two new intents, replays the same ID without recharge, rejects conflicting content with 409 and a fresh over-quota intent with 429 plus finite Retry-After. No extra model call or intent is created. A separate restarted HTTP process still rejects the over-quota request, and no-auth returns 401.
- Configuration transfer: strict version-1 envelope, exact content hash, capability version/binding and behavior registry validation; unsupported/secret fields, scope mismatch, drift, stale preview and current admin revocation fail closed. Preview is read-only; import creates a new revision-1 draft without publication or overwrite. These tests use the existing memory control store/real HTTP router; full pg_dump/restore separately preserves actual PG configuration snapshots.
- Official npm audit on the exact lockfile returned zero reported advisories. Official npm CycloneDX SBOM generation and installed license-text inventory passed: 152 locked external package entries, 129 installed. Uninstalled optional platform packages remain in the SBOM; their binaries are not redistributed. MCP's full mixed Apache/MIT license is retained; saxes's upstream v6.0.0 license supplements its omitted npm license file. This is not an assurance that no vulnerability exists.

## Installation qualification

The fixed-source installer, side-by-side upgrade, integrity doctor and guarded uninstall are implemented. The first clean offline attempt correctly failed on an incomplete cache rather than using the network. After the exact lockfile cache was populated from the official registry, an install build was killed under temporary-memory pressure. These are failed attempts, not passing installation evidence. Owned artifacts/cache were preserved on disk, with file hashes/modes verified and original temporary paths retained as links. The controlled disk-backed rerun on exact 8781169 passed all seven cases: clean offline legacy and candidate builds, side-by-side upgrade, installed public CLI doctor, modified/extra/permission-changed file refusal, symlink/wrong-version refusal, previous-copy readiness and non-destructive owned uninstall. Four additional actual guard cases reject wrong tree, dirty source, an existing host-repository destination and a symlink source before creating any destination. No compilation or database process remains running.

## Reproduction

```sh
npm ci --ignore-scripts
npm run check
# Build the old commit in a separate checkout first; never overwrite its node_modules.
bash tests/operations/run-postgres.sh /official/postgresql/17/bin /built/legacy-55faf91 55519
# Use an existing complete approved cache and disk-backed TMPDIR if needed.
node tests/operations/qualify-distribution.mjs /approved/npm-cache
node scripts/release-audit.mjs /new/release-evidence
npm audit --package-lock-only --json --registry=https://registry.npmjs.org
```

The PG harness only accepts its password-free loopback synthetic database and stops its owned server. Workers use minimal environments and deterministic simulated providers. The installer never runs a network fallback or lifecycle script and never activates a service. Archive/signature trust, production SSO, provider costs, scale/HA, real credential rotation, deployment, general deletion and all other adapters retain their separate support/evidence status.

Initial SQL qualification exposed PostgreSQL `name[]` parsing at the catalog check; changing the query to return `text[]` fixed it, and the complete sequence was rerun. Failures are retained rather than reclassified as pass.

## Retained release artifacts

[PostgreSQL/DBOS report](../../qualification/release-operations/postgres-report.json), [distribution report](../../qualification/release-operations/distribution-report.json), [installer guards](../../qualification/release-operations/installer-guards.json), [exact lockfile dependency review](../../qualification/release-operations/dependency-audit.json), [CycloneDX SBOM](../../qualification/release-operations/sbom.cyclonedx.json), [full dependency licenses](../../qualification/release-operations/THIRD_PARTY_LICENSES.txt), [official npm advisory result](../../qualification/release-operations/npm-audit.json), and [evidence hashes](../../qualification/release-operations/evidence-manifest.json). The synthetic dump and detailed process logs remain in the private qualification workspace, not the source distribution.

These close the implemented migration/configuration dry-run, old-run/backup recovery, fixed-source installation/diagnosis/compatible upgrade/uninstall, bounded admission and projection-retention gates for the recorded candidate. They do not mark all M3 extensions or an arbitrary production environment qualified. See [declared operational support](../support-matrix.md).

## Bounded review follow-up

The reviewed source follow-up ends at `b369c0d`. Installer Git inspection now reuses the transformation hooks/fsmonitor/filter preflight before status, and doctor/uninstall validate local receipt metadata against installed version, lockfile and schema. The receipt remains an editable accidental-drift guard, not a signature or independent provenance check. Configuration HTTP transfer has its own 128 KiB UTF-8 bound, including an export check against the complete import wrapper; other routes retain their 32 KiB limit. A previously accepted multibyte draft with 32 long capability identifiers now round-trips through export, preview and new-draft import.

Retention now has scope/cutoff/limit-bound opaque keyset cursors with exact microsecond ordering and page-only blocked diagnostics. The explicit 1–10-page preview helper drains past all-blocked pages; apply still binds each reviewed page hash, locks current run statuses and rechecks authority. The runbook includes the exercised bounded preview/apply loop, not an unbounded maintenance daemon.

Observed follow-up evidence:

- Clean `8b5226a` passed the full `npm run check`, including strict typecheck/build and all 260 tests.
- The retention source at `df2c560` passed strict build. PostgreSQL 17.11 qualification at `b15629e` passed all four new cases: 101 blocked rows followed by an eligible projection; exact keyset/budget/scope semantics; payload/status/replay/current-rights conflicts; and a real concurrent run-status lock/recheck. All blocked/foreign rows and all 103 immutable run rows remain. The server was stopped.
- Final reviewed `b369c0d` passed 12 focused installer/configuration/operations tests using lightweight ES-module transpilation, plus lint. These are not a full strict build claim for that exact commit.
- A post-review in-process installation attempt passed the legacy install/build/doctor, but its candidate compiler was OS-killed (137) without a TypeScript diagnostic. It is a failed attempt, not passing upgrade evidence. The fixture was changed to separate bounded public CLI install/upgrade processes so first-stage inventory buffers are released before the next compiler. The fresh previous version remains until side-by-side/rollback assertions finish.
- A subsequent preliminary full typecheck at 768 MiB was also OS-killed before that separate-process installer retry could execute. Final integrated strict/build/test and affected public-CLI install acceptance are therefore pending the integration owner's execution. No further identical heavy retries were made.

The original `8781169` reports and their hashes remain unchanged. See the [four-case retention report](../../qualification/release-operations/retention-pagination-report.json) and [source-specific follow-up status](../../qualification/release-operations/review-followup.json). Reproduce the new PostgreSQL cases after a successful build with `bash tests/operations/run-retention-postgres.sh /official/postgresql/17/bin 55519`; reproduce the changed distribution fixture with disk-backed `TMPDIR`, `NODE_OPTIONS=--max-old-space-size=256` and the existing `qualify-distribution.mjs` command above. The latter retains the 640 MiB reviewed child-build bound; parent and each public CLI process are separately capped at 256 MiB.

## Integrated installer closure

The exact clean integrated `87c3a3d212c36f3fc793ba57e3e0f111cf313ec2` (tree `efc2781a55a60d1977f9112f3bd313d552ccaec6`) passed a fresh strict full build and all eight source-installation cases on 2026-10-25. Both legacy `55faf91` and the integrated candidate actually ran offline `npm ci --ignore-scripts` and the full reviewed build at the unchanged 640 MiB compiler old-space cap. The gate exercised side-by-side upgrade, installed public CLI diagnostics, malformed/inconsistent receipt refusal, modified/extra/mode-changed files, symlink/wrong-version refusal, prior-copy readiness and owned uninstall with the original host untouched. No build or receipt was fabricated, and no activation, publication or database change occurred.

Measured parent-memory fixes keep unrelated transformation tooling out of operations CLI commands, hash inventory files with one reusable 64 KiB buffer and run the identical previous-installation doctor in a short-lived process. The worker uses fixed reviewed code and separate path arguments, never a shell or caller-provided code, and does not inherit Node loader options. All existing integrity and source guards remain. The observed upgrade parent fell from about 88 MiB to 44 MiB before compilation. The successful complete installer run took 40.1 seconds with about 943 MiB peak sampled aggregate RSS; these measurements are not guaranteed resource limits.

Earlier OS-killed attempts remain failures. A separate 512 MiB compiler diagnostic failed explicitly with V8 heap exhaustion and was not adopted. The prior successful legacy installation and failed candidate from `24cd5cd` remain retained. Only four separately reviewed, inactive and reproducible dependency directories from older failures were reclaimed; their complete non-dependency file inventories were checked unchanged. Original historical reports remain untouched.

The first memory fix passed lint, strict build and all 302 compiled tests on tree `8fa176982b3ab49256542d64cad02ca672e89539`. The additional isolated-doctor change passed all four focused distribution regressions using ES-module transpilation, and the exact final source passed the strict full build and full installer above. Final aggregate test evidence is recorded separately rather than inferred from those scoped runs.

See the [eight-case integrated distribution report](../../qualification/release-operations/integrated-distribution-report.json) and [memory diagnosis and retained-failure review](../../qualification/release-operations/installer-memory-review.json). Detailed process logs remain in the private qualification workspace; the review records their hashes.
