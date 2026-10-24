# Configuration preflight qualification — 2026-10-24

Scope: shared versioned report contract, one transformation service, CLI command, read-only MCP tool, Skill guidance, and host-owned same-task continuation seam. Not a deployed configuration website, credential store/UI, provider validator, hosted AE service, or durable task engine.

## Observed verification

- `node scripts/lint.mjs`: passed.
- Scoped strict TypeScript compilation at 512 MiB: passed. The test-only config is `tests/configuration/tsconfig.json` (the original run used an equivalent temporary root config). Reproduce with `node --max-old-space-size=512 node_modules/typescript/bin/tsc -p tests/configuration/tsconfig.json`, then prepare local package exports as for the normal build.
- `node --test dist/packages/transformation/test/configuration.test.js dist/packages/mcp-server/test/protocol.test.js`: **8 passed, 0 failed**.
- Tests cover missing/invalid/configured/restored synthetic status; current recheck before continuation; unchanged task UUID; no callback while blocked; separate hosted credential; no self-hosted AE account; absent checker honestly unverified; read-only usable; poisoned checker return/error not echoed; launch-only URL handling; CLI structured output/exit code and no environment-secret echo; official SDK stdio initialize/list/call and strict secret/URL argument rejection; original path, symlink, recipe and drift safeguards.

No production/customer secret was read or generated. The CLI test sets only a synthetic marker to demonstrate that preflight does not read environment credentials. URL injection uses `example.invalid` solely as a test fixture; it is not a deployed setup page.

## Explicit gaps

Default CLI and stdio do not have a real status validator connected. Provider-dependent preflight therefore returns `needs_configuration`, reason `verification_unavailable`, configuration URL null. There is no claim that the user's key is missing. A trusted host must connect its existing secure provider configuration and current-state validator; actionable local wiring is documented in `skills/ae-adapt/references/configuration.md`. Source distribution does not yet offer an end-user credential-entry flow.

The continuation seam only calls the host's pending-step callback after rechecking, with the same task UUID. The host still owns its original task record, permissions, idempotency and completed-effect ledger; this helper does not durably save tasks or automatically restart work. All existing CLI/MCP operations are static and remain usable without keys. A future provider-consuming operation must call this shared gate rather than invent another checker.

Full aggregate build/suite was not run for this patch because another worker was performing browser/compile acceptance in a memory-constrained workspace. Narrow compile and real stdio tests passed. Real provider authentication, model quality, cost, paid calls, credential configuration, registration, cloud deployment and hosted URL verification: **not run**.
