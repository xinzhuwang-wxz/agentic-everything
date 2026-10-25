# Support and troubleshooting

[Start here](docs/getting-started.md) · [Integration](docs/integrating.md) · [Security reports](SECURITY.md)

## Common first-run problems

| Symptom | What to check |
| --- | --- |
| Unsupported Node engine or dependency errors | Use Node 24 / npm 11; run `npm ci --ignore-scripts` at the checkout root. Do not modify the lockfile to hide a mismatch. |
| CLI module missing | Run `npm run build`; use `node packages/cli/dist/index.js`, not an assumed global `ae` command. |
| Assessment rejects the repository | Use a separate committed copy of the explicit fixture. A nested folder in AE is not the exact host Git root. Other layouts/stacks are not supported by this recipe. |
| Approval or source hash mismatch | Reinspect the change; generate and review a fresh plan if the source changed. Do not substitute an old approval. |
| Output file or destination already exists | CLI evidence output is create-only. Inspect and reuse the existing patch for verify/revert; do not overwrite evidence or bypass source-drift checks. |
| Generated mount cannot resolve `@ae/*` | The first slice expects AE workspace integration. The recipe does not install dependencies or publish packages. |
| Console loads but a run fails or times out | Check the API, exact loopback origin/proxy and the independently running file-IPC actor. No actor is launched automatically. |
| Run disappears after server restart | The default fixture is memory-only. For explicitly selected PostgreSQL/DBOS, inspect the exact connection, schema diagnostic, pinned versions and startup recovery report; do not replay writes. |
| Uncertain write or later patch edits | Stop and inspect/reconcile. Do not blindly repeat the action or force rollback. |

## Installation and operational diagnostics

Use the [fixed-source install/upgrade/recovery runbook](docs/operations.md) and [actual qualification evidence](docs/verification/release-operations.md). Doctor checks a managed installation, not an ordinary development checkout. An offline cache miss needs the exact approved lockfile cache, not a floating dependency update. A killed compiler is a failed build; use adequate disk-backed temporary storage and retry a fresh destination after diagnosing resource pressure. Changed installation files block uninstall so operator work is not erased.

For schema history or fingerprint drift, stop the affected worker and inspect a verified backup; never rewrite ledger checksums. HTTP `ADMISSION_RATE_LIMITED` is 429 with a finite Retry-After; exact repeated intents are not newly charged. Unknown outcomes require receipt reconciliation, not a new idempotency key. See the runbook for current support scope and data retention limits.

## Ask for help with a useful reproduction

Include the commit, OS, Node/npm versions, exact command, sanitized error and whether you used the supplied fixture. Say whether the model was mocked, simulated or a real provider, and which checks actually ran. Exclude credentials, private paths where unnecessary, customer data and private transcripts.

Use the maintainer channel from which you received this checkout. A public project URL, support inbox and community chat are not specified here. For security-sensitive findings, use the private-route guidance in [SECURITY.md](SECURITY.md). Contribution-ready fixes are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md).
