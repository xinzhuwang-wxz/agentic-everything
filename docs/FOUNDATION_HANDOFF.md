# Foundation contracts and toolchain

## Shared contracts

Import browser-safe schemas and inferred types from `@ae/contracts`.
The source of truth is `packages/contracts/src/index.ts`, with transformation and runtime modules.
`@ae/contracts/hash` is Node-only SHA-256 and canonical JSON; never import this subpath in a browser bundle.
Each schema is strict. Schemas validate shape, not provenance or authorization: a parsed principal,
approval or observation is not automatically trusted. Server consumers enforce those properties.
`npm run schemas` exports standard JSON Schemas under `dist/schemas`.

Transformation exports: ProjectAssessment, AdaptationPlan, ApprovedChangeSet, PatchArtifact,
VerificationReport and EvidenceRef, each with a matching `Schema` suffix (e.g. ProjectAssessmentSchema).
The plan digest is external to the plan, preventing self-referential hashing. Recipe-specific
change content and scanner internals may use narrower internal structures without enlarging these contracts.

Runtime exports: Principal, CapabilityVersion, ToolRequest, ToolResult, ApprovalBinding,
ApprovalDecision, RunStatus, RunEvent, CapabilityAdapter, ModelRequest, ModelResponse and ModelProvider.
Model output cannot supply principal, approve a write, or choose an operationId. Model mode is explicitly
`simulated` or `provider`; no paid API has been exercised. Tool outcome-unknown is distinct from failed.

## Build layout for package owners

Create a real package only when implemented. A package named @ae/foo uses src/index.ts and
package.json exports {".": {"types": "./src/index.ts", "default": "./dist/index.js"}}.
Root compilation emits dist/packages/foo/src/*.js; link-build copies it into package-local dist.
Package-local build output is ignored. The @ae/* TypeScript paths map to packages/*/src/index.ts.
Source tests named *.test.ts compile and run with Node test runner, sequentially to bound memory.
Use node:test and node:assert/strict, including mounted UI tests. Fixtures are excluded from core compilation.

## Toolchain and verification

Node 24 and npm 11 run the locked TypeScript workspace. Exact package versions and integrity are in package-lock.json; use `npm ci --ignore-scripts`, `npm run check` and `npm run schemas`.

The official Agents JS loop owns model execution. Explicit PostgreSQL/DBOS composition owns durable scheduling; memory mode remains a separate fixture. React/Radix and the attributed Kokonut components supply presentation. The bounded assistant-ui comparison is documented separately and does not add another runtime owner.

[Core acceptance](acceptance-status.md) records the current assembled build and regression evidence. [Persistent qualification](PERSISTENT_RUNTIME_QUALIFICATION.md), [UI comparison](verification/assistant-ui-bounded-comparison.md) and [support matrix](support-matrix.md) state their tested inputs and limits. Schema generation alone is not business, recovery or production qualification.
