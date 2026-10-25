# Install, upgrade and recover the bounded AE release

This runbook covers the local source distribution and opt-in PostgreSQL/DBOS service. It does not authorize a production deployment, database migration, credential creation, customer-data import or deletion. The default server remains a synthetic loopback fixture. See [release evidence](verification/release-operations.md) and [security boundaries](../SECURITY.md).

## Fixed-source installation and diagnosis

Use Node 24, npm 11, Git and a reviewed clean AE checkout. A trusted handoff must provide the exact complete commit and Git tree hashes. Git hashes and local receipts verify integrity, not the identity of a publisher; there is no signed published package or registry release yet.

1. Review the fixed checkout and lockfile. Provision an operator-owned npm cache from the exact lockfile using `npm ci --ignore-scripts --cache /approved/cache` against the official npm registry in a separate disposable copy. This is the only network download step. No lifecycle scripts run.
2. Build the reviewed AE checkout once: `npm run build`.
3. Install into a new directory outside any host repository:

```sh
node packages/cli/dist/index.js install \
  --source /approved/ae-checkout --commit FULL_COMMIT_HASH --tree FULL_TREE_HASH \
  --destination /approved/ae-install-0.1.0 --cache /approved/cache
node packages/cli/dist/index.js doctor --installation /approved/ae-install-0.1.0
```

Install exports only regular committed blobs; dirty sources, floating pins, symlink path components, existing destinations and host-repository destinations are refused. It runs exact offline `npm ci --ignore-scripts` and the reviewed project's build. A cache miss fails rather than silently using the network. Builds are serialized and bounded; a killed build is failed, not a completed installation. A failed owned directory is retained for diagnosis, never automatically erased. Use a disk-backed destination/cache when memory-backed temporary storage is constrained.

A successful receipt covers source, lockfile, built output and all installed dependency files/links. Doctor reports the exact version, source and schema compatibility, integrity and Node compatibility. Do not edit an installation in place. Doctor's `ready` is installation integrity, not production or whole-product acceptance. Source-only development checkouts are not managed installations.

## Upgrade, compatible rollback and uninstall

```sh
node packages/cli/dist/index.js upgrade \
  --source /approved/ae-checkout --commit NEW_FULL_COMMIT_HASH --tree NEW_FULL_TREE_HASH \
  --previous /approved/ae-install-0.1.0 \
  --destination /approved/ae-install-next --cache /approved/cache
```

Upgrade checks the previous manifest and creates a separate fixed copy. It never changes a service, symlink, host, database or active release. Run schema/configuration dry-runs, backup/recovery qualification and both original-host regressions before separately approved activation. A prior installation remains available for a separately approved rollback. Rollback means selecting a compatible old binary or publishing a new immutable release containing the prior configuration; it is not a destructive down migration or erasure of completed business effects.

```sh
node packages/cli/dist/index.js uninstall \
  --installation /approved/ae-install-next --commit INSTALLED_FULL_COMMIT_HASH
```

Uninstall only removes the exact managed copy when its complete file/link inventory is unchanged. Changed or added user files, a wrong commit or a symlink path fail closed. Export needed operator evidence first; if you added files to the install, preserve them elsewhere and review the difference. Uninstall does not remove original hosts, AE/DBOS databases, host receipts, external credentials or deployment services. Disabling an embedded assistant requires the host's separately reviewed recipe revert; that does not undo business writes.

## One AE schema owner

`@ae/operations` owns only the fixed public `ae_*_v1` tables, `ae_control`, `ae_api` and its migration metadata. Every runtime/control/API initializer uses this owner. DBOS 5.3.0 remains the sole owner of its schema and scheduler. A host database is never an AE migration target.

Set `AE_DATABASE_URL` using your already-approved protected environment mechanism; do not put passwords into command history, source, logs or evidence.

```sh
node packages/cli/dist/index.js schema-check
# Only after reviewing its exact target and backup:
node packages/cli/dist/index.js schema-apply
```

`schema-check` is a read-only transaction: it reports pending steps, adopted legacy tables, schema fingerprint and compatible run/SDK/configuration pins. `schema-apply` serializes through PostgreSQL advisory locking and commits additive DDL with its checksum ledger atomically. Unsupported future versions, modified migration checksums and column/constraint/catalog drift stop initialization. Do not edit ledger checksums to suppress an error.

Legacy rows remain intact. Old unbound API intent tokens stay NULL and fail existing recovery validation; no migration guesses approval or identity. The old `ae-v1` / Agents SDK 0.21.0 run pins stay unchanged. Schema rollback keeps the additive columns; DBOS is never downgraded by AE. An incompatible future worker must keep the approved old worker/version available or have a separately tested migration.

## Configuration export, dry-run and import

The existing authenticated configuration API exposes POST `/api/configuration/transfer/export`, `/api/configuration/transfer/preview` and `/api/configuration/transfer/import` under the current API mount. Export accepts `draftId` and `expectedRevision`. Preview accepts `envelope`; import accepts `envelope` and the exact returned `expectedPreviewHash`.

The version-1 envelope contains only strict AE configuration fields, source draft/revision, tenant/application and exact capability version/binding hashes. Unknown fields, credential/provider-auth fields, hash edits, scope mismatches, stale capabilities and behavior baseline/registry drift are conflicts. Free-text instructions still need operator review and must not contain secrets. Hashes are integrity, not permission. Current host administration is checked on every action.

Preview never writes. Import creates a new revision-1 draft using the existing control-plane validation/CAS store, without overwriting drafts or releases or publishing. Review/validate that new draft and explicitly publish its exact revision through the existing workflow. Export does not export a secret store, session credentials or host permissions.

## Backup and restore

Before an authorized upgrade, stop admission and quiesce the AE HTTP/worker process. Preserve pending approvals and unknown operations; never convert them to successful/failed merely to make maintenance easier. Use PostgreSQL's own tools and an existing protected service configuration, not passwords embedded in process arguments:

```sh
PGSERVICE=ae-approved pg_dump --format=custom --no-owner --no-privileges --file ae-backup.dump
sha256sum ae-backup.dump
# Restore only into a separately approved empty restore target:
PGSERVICE=ae-restore pg_restore --exit-on-error --no-owner --no-privileges --dbname 'service=ae-restore' ae-backup.dump
```

Back up the complete AE + DBOS database together, not just AE public tables. Store the source/lock/schema/configuration versions and dump hash alongside it. Keep baseline/differential/delivery archives and their verified hashes separately. A dump may contain user inputs, tool data, approvals and SDK snapshots: access control, encryption, destination and retention are operator responsibilities requiring the appropriate authorization.

The synthetic qualification restores the complete fixture host ledger in the same dump. A real host may own a separate database; agree a consistent host backup/reconciliation procedure rather than assuming AE can back it up or rewind business effects. Restore to an isolated target first, verify archive hashes and schema dry-run, compare release/approval bindings, and resume one eligible old run with a simulated provider. Assert no repeated host writes. Never replay historical approvals or call all business operations again.

## Recovery and incident decisions

- Pending approval: keep the exact ID, arguments/target/version, expiry, release and principal binding. Resume only after live host rights pass. A newly active release does not rewrite old approvals.
- Unknown outcome: query the host using the same operation ID. No receipt is not proof that a write did not happen. Do not redispatch or erase its audit/operation record.
- Startup recovery reports blocked/deferred intents: inspect the exact binding/version and restore authority or the supported old worker; do not invent missing intent tokens.
- Schema drift/checksum failure: stop the affected worker; inspect the changed schema against a verified backup and candidate. Do not run arbitrary down SQL or downgrade DBOS.
- Rate/budget: enforce the declared turn/elapsed/input/conversation bounds. Persistent new-intent admission uses a PostgreSQL fixed UTC window per trusted tenant/application/subject, default 60 starts per 60 seconds (server bounds: 1–1000 starts, 1–3600 seconds). Exact replays do not consume another allowance; conflicting/unauthenticated requests fail before admission. Over quota returns 429 with finite Retry-After before intent reservation or workflow/model dispatch. One row per scope survives process restart; at most 100 rows older than two hours are removed per admitted request. This is new-run admission, not provider token/cost accounting, an all-route DDoS defense or a replacement scheduler.
- Failed installation: retain logs and the failed directory, fix the evidenced cache/tool/resource problem, and retry into a fresh directory. It is not safe to declare readiness from a partial build.

## Data retention and current-rights isolation

Conversation access expires after the existing 24-hour bound. Expiry alone does not remove data. `ConversationRetention` is a trusted operator port, not a browser/model tool. It requires live `agentic:retention` authority for the exact tenant/application/subject, a past cutoff, and at most 100 candidate conversations. Preview returns the bounded selection and its hash; apply binds that hash and rechecks rights before commit.

Only expired, terminal conversation projections are eligible. Missing, pending, manual-review, reconciling and unknown runs remain blocked. Physical deletion removes turn text and context; a minimal expired ID/scope/expiry tombstone remains to prevent replay/recreation. Run/approval/operation ledgers, API intents, DBOS checkpoints, backups and host data remain intact. This is projection retention, not whole-account erasure or a claim that all copies of text were deleted. A separately approved audit/backups/legal retention policy is required before any real-data use; no full-ledger deletion endpoint is shipped.

## Key rotation procedure and security review

AE owns no production secrets in this fixture. Secrets belong to the host/operator's approved secret mechanism; configuration import does not move them. Before an authorized rotation: identify the existing connector/host key reference and scope, stop new admissions, preserve unresolved receipts, arrange overlapping old/new verification only if the host permits it, inject the replacement through the approved mechanism, test allowed and denied synthetic requests, revoke the old key and verify old-key denial. Roll back only through an explicitly permitted credential path; never print or persist a key in a report. Rotation of a real credential/access grant needs its own authorization. The Java/HMAC or remote-MCP adapter's protocol qualification is separate from rotating a real account secret.

Generate fixed dependency and license evidence with `node scripts/release-audit.mjs /new/evidence-directory`. This runs official npm's lockfile CycloneDX SBOM, checks registry/integrity/version metadata, includes full installed license texts and supplemental notices, and performs a narrow tracked-source secret heuristic. Run `npm audit --package-lock-only --json --registry=https://registry.npmjs.org` separately; capture the exact report. A clean audit is only that registry's current advisory result, not proof of no vulnerabilities. Missing registry access or license text is not green.
