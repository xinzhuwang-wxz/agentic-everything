# Support and troubleshooting

[Start here](docs/getting-started.md) · [Integration](docs/integrating.md) · [Security reports](SECURITY.md)

## Common first-run problems

| Symptom | What to check |
| --- | --- |
| Unsupported Node engine or dependency errors | Use Node 24 / npm 11; run `npm ci --ignore-scripts` at the checkout root. Do not modify the lockfile to hide a mismatch. |
| CLI module missing | Run `npm run build`; use `node packages/cli/dist/index.js`, not an assumed global `ae` command. |
| Assessment rejects the repository | Use a separate committed copy of the matching React helpdesk, Python inventory or Java/Spring Core inventory fixture. A nested folder in AE is not the host Git root. Other layouts need a reviewed custom adaptation, not a forced recipe match. |
| Approval or source hash mismatch | Reinspect the change; generate and review a fresh plan if the source changed. Do not substitute an old approval. |
| Output file or destination already exists | CLI evidence output is create-only. Inspect and reuse the existing patch for verify/revert; do not overwrite evidence or bypass source-drift checks. |
| Generated mount cannot resolve `@ae/*` | The React recipe expects AE workspace integration. It does not install dependencies or publish packages; the Python recipe uses a standard-library JSON adapter, and the Java recipe emits a reviewed Spring Core/JDK HTTP adapter. |
| Console loads but a run fails or times out | Check the API, exact loopback origin/proxy and the independently running file-IPC actor. No actor is launched automatically. |
| Run disappears after server restart | The default fixture is memory-only. For explicitly selected PostgreSQL/DBOS, inspect the exact connection, schema diagnostic, pinned versions and startup recovery report; do not replay writes. |
| Uncertain write or later patch edits | Stop and inspect/reconcile. Do not blindly repeat the action or force rollback. |

## Installation and operational diagnostics

Use the [fixed-source install/upgrade/recovery runbook](docs/operations.md) and [actual qualification evidence](docs/verification/release-operations.md). Doctor checks a managed installation, not an ordinary development checkout. An offline cache miss needs the exact approved lockfile cache, not a floating dependency update. A killed compiler is a failed build; use adequate disk-backed temporary storage and retry a fresh destination after diagnosing resource pressure. Changed installation files block uninstall so operator work is not erased.

For schema history or fingerprint drift, stop the affected worker and inspect a verified backup; never rewrite ledger checksums. HTTP `ADMISSION_RATE_LIMITED` is 429 with a finite Retry-After; exact repeated intents are not newly charged. Unknown outcomes require receipt reconciliation, not a new idempotency key. See the runbook for current support scope and data retention limits.

## Integration boundaries that can look like failures

- Generic UI mounts accept bounded reference identifiers, not arbitrary nested business data or browser-supplied identity. Supply a trusted server host boundary and rotate `sessionKey` when the authenticated user/tenant/session changes. [Reference and scope contract](docs/verification/generic-host-ui.md).
- A non-ticket host with a `broker.host.read` method must explicitly set `ticketReader: false` in `createApi`; method naming alone does not identify its business domain.
- MCP stdio is a read-only developer toolkit. Its absence of apply/approve/revert tools is intentional. Use the already-approved CLI workflow for mutation. Remote MCP qualifies a separate authenticated read-only subset, not a production login setup.
- A profile `complete`, managed-installation `ready`, and whole-core release acceptance are different statuses. Check the [acceptance ledger](docs/acceptance-status.md) and [support matrix](docs/support-matrix.md) before widening a claim.

## Ask for help with a useful reproduction

Include the commit, OS, Node/npm versions, exact command, sanitized error and whether you used the supplied fixture. Say whether the model was mocked, simulated or a real provider, and which checks actually ran. Exclude credentials, private paths where unnecessary, customer data and private transcripts.

Use the maintainer channel from which you received this checkout. A public project URL, support inbox and community chat are not specified here. For security-sensitive findings, use the private-route guidance in [SECURITY.md](SECURITY.md). Contribution-ready fixes are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md).
