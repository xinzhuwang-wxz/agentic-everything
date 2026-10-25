# Release operations qualification

This report qualifies a bounded synthetic operations path, not all M3 gates or production deployment. The implementation is in `@ae/operations`, configuration transfer uses the existing control plane, and the commands/runbook are in [operations](../operations.md).

## Observed before final assembly

- Node 24.19.0 / npm 11.9.0; strict legacy and candidate TypeScript builds passed. The pre-admission assembled aggregate passed 256/256; seven focused operation/configuration tests passed after admission was added. The final assembled aggregate remains an integration-owner gate.
- Real PostgreSQL 17.11: empty-schema read-only dry-run; actual failed SQL rolls back all DDL and ledger entries; old 55faf91 worker creates a pending Agents SDK checkpoint; legacy rows/admission-independent intent tokens remain unchanged during concurrent schema adoption; repeated migration is idempotent; schema/default/checksum drift is rejected.
- Four concurrent migrations produce one complete history. DBOS migration rows remain unchanged. A previous binary can still read the exact pending approval against additive upgraded schema; no down migration is run.
- Actual pg_dump custom backup, destruction of only the harness-owned synthetic database, fresh database creation and pg_restore restore the exact private run/configuration/approval/SDK state. A new worker resumes the original pinned release once. Repeating the decision leaves exactly one durable host mutation. Wrong-tenant read fails.
- Physical expired projection retention is scoped to current tenant/application/subject and at most 100 candidates. Pending/unknown runs and other scopes remain. A post-delete current-rights failure rolls the transaction back. Successful deletion removes turn text/context, leaves replay tombstones and preserves immutable run/operation/approval records. Whole-data erasure is not claimed.
- Durable admission: 12 concurrent attempts allow exactly three with a configured cap of three. Counters survive reconnection; trusted tenant/application/subject scopes remain separate; old windows renew; cleanup removes only 100 of 150 expired rows. Real HTTP allows two new intents, replays the same ID without recharge, rejects conflicting content with 409 and a fresh over-quota intent with 429 plus finite Retry-After. No extra model call or intent is created. A separate restarted HTTP process still rejects the over-quota request, and no-auth returns 401.
- Configuration transfer: strict version-1 envelope, exact content hash, capability version/binding and behavior registry validation; unsupported/secret fields, scope mismatch, drift, stale preview and current admin revocation fail closed. Preview is read-only; import creates a new revision-1 draft without publication or overwrite. These tests use the existing memory control store/real HTTP router; full pg_dump/restore separately preserves actual PG configuration snapshots.
- Official npm audit on the exact lockfile returned zero reported advisories. Official npm CycloneDX SBOM generation and installed license-text inventory passed: 152 locked external package entries, 129 installed. Uninstalled optional platform packages remain in the SBOM; their binaries are not redistributed. MCP's full mixed Apache/MIT license is retained; saxes's upstream v6.0.0 license supplements its omitted npm license file. This is not an assurance that no vulnerability exists.

## Installation qualification

The fixed-source installer, side-by-side upgrade, integrity doctor and guarded uninstall are implemented. The first clean offline attempt correctly failed on an incomplete cache rather than using the network. After the exact lockfile cache was populated from the official registry, an install build was killed under temporary-memory pressure. These are failed attempts, not passing installation evidence. Owned artifacts/cache were preserved on disk, with file hashes/modes verified and original temporary paths retained as links. The controlled disk-backed rerun passed clean offline legacy and candidate builds, side-by-side upgrade, installed public CLI doctor, modified/extra-file refusal, symlink/wrong-version refusal, previous-copy readiness and non-destructive owned uninstall. A final rerun also covers mode-change protection after hardening the manifest inventory.

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
