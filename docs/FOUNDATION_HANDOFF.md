# Foundation handoff

## Frozen first-loop contract

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

## Actual initial checks

Node v24.19.0; npm 11.9.0. TypeScript 5.9.3; Zod 4.6.7; @types/node 24.10.1.
`npm run check`: passed source hygiene, strict typecheck, build and six contract tests.
`npm run schemas`: passed, twenty JSON Schema exports. These are foundation checks, not business E2E,
SDK integration, durable recovery, UI acceptance, or production release qualification.

Official registry lookups on 2026-10-24 found Agents JS 0.21.0, DBOS SDK 5.3.0 and assistant-ui 0.15.31.
Runtime uses only the selected Agents JS loop. DBOS is not installed because no real database is qualified;
no alternative durable workflow engine is silently introduced. UI uses React/Radix for the first governed
surface, without claiming assistant-ui compatibility or hiding its pending qualification.
All npm installs use registry.npmjs.org with ignore-scripts and exact top-level versions; package-lock.json
pins integrity and transitive versions. No dependency installation script or paid API was run.
