# Cross-stack inventory qualification

## Scope

This is a second owned synthetic host, not one of the three external open-source adaptations and not whole-M2 acceptance. The host remains Python with a standard-library SQLite business store. Its business task reserves a quantity for an order, rather than changing a ticket field. AE adds only `agentic/ae_adapter.py`; the original inventory domain, its current-rights records, transactions and receipt database remain host-owned.

The supported surface is a dependency-free local JSON CLI. No React, TypeScript host code, web UI, production login, external service or real model provider is needed. The TypeScript AE core remains the same shared core used by the React fixture. `complete` applies only to the exact `python-inventory-synthetic-v1` profile, its pinned source/template and enumerated assertions. It does not imply arbitrary Python support, Java/Spring support, authenticated remote MCP, production identity or DBOS recovery of this particular Python fixture.

## Coupling removed and retained boundaries

Before this change, the memory and persistent brokers selected a global four-ticket registry; SDK tools accepted only those four names; runtime access checks extracted `ticketId` and branched on member-capability names; approvals and persistent run validation hard-coded `tickets-policy-v1`; transformation selected one React recipe/collector/delivery profile.

The reviewed server-composed boundary now supplies:

- Strict Zod capability schemas and matching versioned catalog metadata. Missing or stripping schemas, mismatched schemas, unknown capability names and effectful tools without required approval fail closed.
- Current host identity and capability authority, a trusted target/version/preview resolver, current read authority and read results, host mutation and receipt query.
- An explicit host policy version. Approvals bind it; a persistent store accepts only the configured host policy. The default remains `tickets-policy-v1`, and existing ticket snapshots retain their tool schema and ordering.

The core still owns operation identity, exact approval consumption, release intersection and uncertain-outcome/no-blind-retry behavior. Neither model arguments nor browser/CLI-supplied registry metadata can become authority. A host is wired by trusted application code, not selected from an untrusted request. Python rechecks current rights and commits business mutation plus receipt atomically in its existing SQLite transaction.

`AuthorizedTicketHost` and the legacy durable ticket adapter preserve the original four-tool semantics behind this boundary. The original ticket HTTP routes and React host UI remain fixture-specific composition, not generic host UI claims. Conversation authority and target hooks remain live, outside cached DBOS steps; their existing ownership is unchanged.

## Reuse implementation

| Component | Existing base and license | Actual use and necessary integration |
| --- | --- | --- |
| Agent loop and approval pause | Official `@openai/agents` 0.21.0, MIT | Real `Agent`, `Runner`, SDK tool invocation and interruption/resume run against the Python host. The model port is explicitly simulated; AE retains business authorization. |
| Durable execution port | `@dbos-inc/dbos-sdk` 5.3.0, MIT | The same existing persistent runtime accepts the reviewed host boundary. Ticket broker and old-policy contract regressions run; this inventory profile does not claim a fresh PostgreSQL/DBOS recovery run. No second scheduler or worker queue was created. |
| Runtime schemas | Zod 4.6.7, MIT | One strict reviewed schema is used by catalog, broker and SDK. Pinned Zod strict-object metadata rejects stripping schemas. |
| Transformation | Existing Git isolation/rollback, TypeScript compiler API 5.9.3 (Apache-2.0), Python standard `ast` | Existing React AST recipe remains unchanged. Python adaptation adds a reviewed transport file, so introducing a Python source-rewrite framework would add no capability. Actual original/generated Python syntax is parsed in the authorized profile. |
| Business persistence | Existing host Python `sqlite3`, transactions and unittest | Original domain owns stock, current rights, optimistic versioning and atomic idempotency receipts. The generated adapter contains no transaction or agent loop. An extra HTTP framework or ORM is unnecessary for the declared local process boundary. |
| Behavioral acceptance | Existing AE baseline/archive/comparison/delivery contracts | A profile/recipe registry dispatches the same lifecycle to a distinct 13-case inventory baseline. This is not a duplicated transformation engine. |

No dependency or lockfile change is required for this slice. The available Java 21 runtime includes the `jdk.compiler` module despite lacking `javac`/Maven executables; a source-launch route may be viable but has not been exercised here. No cached Spring runtime was found in the bounded toolchain inspection. The planned Java/Spring adapter stays open rather than being silently replaced with Python.

## Acceptance path

1. Assess the exact committed original fixture, identify the Python reservation flow and produce its bounded recipe plan.
2. Explicitly approve `python-inventory-synthetic-v1`. General command/network allowlists remain empty; only the reviewed owned-fixture profile permits bounded local execution.
3. Capture and archive the original business baseline before applying any patch. The same one-use pre-apply receipt binds source, plan, approval and collector.
4. Materialize the isolated Git worktree and add only the generated adapter. Source drift, recipe-scope dirt, existing/conflicting output, ambiguous recipe matches and unsafe paths reject rather than overwrite.
5. Run the original and generated host's 25 unittest cases and compare 13 independently reset business observations: list/read/reserve, overstock, stale version, cross-tenant, viewer write, invalid quantity, exact replay, operation conflict, receipt query, missing receipt and current-rights revocation.
6. Exercise the same official SDK runtime: read stock; pause before any write; approve a three-unit reservation; reject duplicate approval, extra arguments, foreign tenant and viewer write; revoke current Python host rights between approval and execution with zero writes; then lose the response to a two-unit reservation and reconcile its original receipt without redispatch. Final stock is 7 from 12, version 3, with exactly two mutation dispatches.
7. Observe real CLI reads, reservation, exact replay and forbidden requests. Bundle and check the exact artifact chain and evidence. Guarded rollback removes only the generated adapter, leaves original business code/data intact and refuses later edits.

Business improvements are OFF in this profile and its improvement registry is empty. This preserves original business semantics; no invented ON improvement is used to inflate coverage. No browser acceptance is claimed by CLI evidence.

## Reproduction

After the standard trusted dependency installation and strict build, run the existing public CLI with the fixture committed into its own temporary Git root:

- `ae assess --repo <original> --out <assessment.json>`
- `ae plan --assessment <assessment.json> --verification-profile python-inventory-synthetic-v1 --out <plan.json>`
- `ae approve --plan <plan.json> --plan-hash <returned hash> --approver <trusted approver> --authorization-ref <actual authorization evidence> --out <approval.json>`
- `ae apply --repo <original> --worktree <new candidate> --assessment <assessment.json> --plan <plan.json> --approval <approval.json> --baseline-out <new baseline.json> --out <applied.json>`
- `ae deliver --repo <original> --assessment <assessment.json> --plan <plan.json> --approval <approval.json> --patch <applied.json> --out-dir <new bundle>`
- `ae delivery-check --bundle <bundle>`
- `ae revert --patch <applied.json>`

Use a new, owned synthetic database path per qualification. The fixture identity projection is not an identity provider. The process adapter takes its interpreter, source path and database path only from trusted composition, uses an isolated interpreter and minimal environment, bounds each process and total profile time, and checks clean child exit. It is not a sandbox for arbitrary customer source.

## Evidence status

Recorded on 2026-10-25:

- Full strict TypeScript checking of the implementation, all packages/apps and existing tests passed using the isolated worktree's explicit source aliases and unchanged installed dependency pins (1,024 MiB heap cap; observed exit 0). The source alias overlay prevents a symlinked dependency directory from resolving stale AE package types in a different checkout.
- Forty-six focused capability, official SDK, runtime, durable-broker/host-policy and Python runtime contract tests passed across the listed test files. The last pre-I/O target-denial regression was added and executed after the full strict run; the assembled integration check must include it.
- Twelve inventory lifecycle/public-CLI tests passed after the final deadline, cleanup and evidence-validation hardening. Thirty-three existing React/nonbrowser transformation regressions passed. Twenty-five original Python unittest cases pass and are rerun against original and candidate in the profile.
- A separate retained public CLI bundle passed `delivery-check` with ten passing checks, after guarded candidate rollback as well as during creation. The bundle uses a pre-apply original archive and a real generated adapter, not caller-supplied PASS evidence.
- Lint and whitespace/diff checks passed.

The focused public-CLI execution used isolated TypeScript transpile-only artifacts followed by a separate strict source check. Transpile-only execution is **not** by itself strict typecheck evidence. The final assembled source/build aggregate, including the independently developed conversation surface, is an integration gate and was not run in this worktree. Toolchain byte changes intentionally invalidate old profile artifacts and require fresh profile evidence. No existing closed gate is reset by this bounded second-host work, and no new platform/provider claim is inferred from these tests.
