# Contributing to AE

The best contribution makes an existing product easier to adapt **and** makes the result easier to verify.

## Good first contributions

- Improve the [first-run guide](docs/getting-started.md) by reproducing it in a clean checkout and recording the exact failure.
- Add a regression test for source drift, revoked authority, duplicate approval, unknown outcomes or stale UI context.
- Propose a small non-agentized fixture for a new host stack before building a broad adapter.
- Improve accessible UI states without moving authorization into the browser.

For broader changes, explain the target host, user outcome, trust boundary and proof plan first. A recipe should have explicit preconditions, owned paths, dependencies, permission boundaries, verification and rollback. One working fixture is more useful than an untested compatibility list.

## Local development

Read [AGENTS.md](AGENTS.md) and the relevant part of [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Use an isolated branch/worktree. AE is independent: do not alter another project or production system as a side effect.

```bash
npm ci --ignore-scripts
npm run check
```

Node 24, npm 11 and Git are required. `check` is source hygiene, strict typecheck and the compiled Node test suite. `lint` is a narrow repository check, not ESLint. `npm run schemas` exports JSON Schema to `dist/schemas`; `npm run dev` only watches TypeScript. Do not enable dependency lifecycle scripts without reviewing them.

## Find the right code

| Change | Starting point |
| --- | --- |
| Contracts and schema validation | `packages/contracts` |
| Assessment, recipes, patching and rollback | `packages/transformation`, `recipes`, `packages/cli` |
| Runtime and model interfaces | `packages/runtime-core`, `packages/runtime-adapters` |
| Host authority and business tools | `packages/capabilities`, `packages/policy` |
| Embedded UI and browser transport | `packages/ui`, `packages/host-sdk` |
| Local HTTP/Console composition | `apps/api`, `apps/console` |

Coordinate contract and dependency changes before editing shared interfaces or the root lockfile. Do not introduce a second agent loop or durable scheduler.

## A reviewable change includes

1. The user-visible outcome and supported scope, including what remains unqualified.
2. Tests for both the happy path and the relevant failure/denial path.
3. Exact commands and results; distinguish **pass**, **fail** and **not run**.
4. Compatibility, permission, dependency and rollback notes where relevant.
5. License and source/revision attribution for substantial ports or reused material.

Never commit keys, credentials, real customer data, private model transcripts, dependency directories or generated builds. Model/provider tests must state whether they are mocks, independent simulation or real-provider execution. Do not silently enable paid model calls.

This checkout does not define a public submission URL or promise a review SLA. Share a patch through the channel where you obtained the project, or use the repository's contribution interface if a maintainer has made one available. For sensitive reports, follow [SECURITY.md](SECURITY.md), not a public issue.
