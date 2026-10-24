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
| Run disappears after server restart | Expected limitation: state and fixture data are in memory. Refresh recovery is not crash durability. |
| Uncertain write or later patch edits | Stop and inspect/reconcile. Do not blindly repeat the action or force rollback. |

## Ask for help with a useful reproduction

Include the commit, OS, Node/npm versions, exact command, sanitized error and whether you used the supplied fixture. Say whether the model was mocked, simulated or a real provider, and which checks actually ran. Exclude credentials, private paths where unnecessary, customer data and private transcripts.

Use the maintainer channel from which you received this checkout. A public project URL, support inbox and community chat are not specified here. For security-sensitive findings, use the private-route guidance in [SECURITY.md](SECURITY.md). Contribution-ready fixes are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md).
