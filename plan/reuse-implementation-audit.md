# AE reuse implementation audit

Audit date: 2026-10-24 UTC. Baseline: `67bd11bf6ae4c4dc6869eb5fb45d138b6c642b85`. Audit work used a separate worktree, its own freshly compiled AE packages, Node 24.19.0, npm 11.9.0, and the existing exact dependency artifacts. No paid provider, production host, new service/key, website, external project adaptation, or publication was used. The findings below concern execution and composition, not a count of libraries.

## Decision

**Keep the working base: official Agents JS owns the agent loop; DBOS owns durable scheduling; PostgreSQL owns durable state; Hono/MCP/React/Radix/TypeScript supply their existing foundations.** The reviewed source does not contain a competing model loop, compiler, HTTP framework or durable scheduler. AE's custom approval binding, host authorization, receipt reconciliation, pre-apply baseline and declared business-difference semantics are necessary integration, not capabilities those foundations can be assumed to supply.

**Reuse is incomplete at the seams.** A real MCP version split was reproduced and fixed in `5bb191e`; the public transport was rejecting the recipe its own plan returned. Tool schemas are independently restated in three places and already disagree. The planned assistant-ui base was never integrated or locally qualified; copying three Kokonut presentation pieces is not equivalent to qualifying that chat base. The current business registry, policy and UI context still encode the helpdesk fixture. These require bounded corrections and an actual second-domain lifecycle, not a framework rewrite or a claim of whole-product readiness.

The operational sequence is therefore: preserve and rerun the working base → remove proven duplicate contract definitions → qualify the remaining composition on the same approved business journey → compare a narrow UI adapter where it can reduce custom state → add a different-domain host through a shared capability boundary. Do not restart research of every framework or import a whole third-party product.

## Evidence levels and what actually ran

- **Fresh in this audit:** strict build; 94 focused tests over Agents Runner, broker, release authorization, MCP stdio, React/jsdom, Radix tabs, Kokonut source hashes, contracts, host transport and control plane; a separate 48-test API/pre-apply/differential group. Both groups exited zero, with no skips. These are 142 selected tests, not the entire 188-test aggregate.
- **Fresh defect probes:** the real official MCP SDK client/server was launched over stdio. `ae_describe` returned recipe 1.0.0, `ae_plan` returned 1.1.0, `ae_verify` rejected that real plan reference, and the old reference entered the static verifier. A real Agents Runner invocation showed its advertised `ticketId` schema lacked the broker's `minLength:1,maxLength:100`. No tool mutation was needed for the schema probe.
- **Fresh after MCP fix:** lint, strict build and all three protocol tests passed. The positive path now obtains the actual plan's recipe reference, previews it, rejects unapplied bytes, materializes only the approved synthetic preview, then verifies current bytes. Old 1.0.0 and unknown references are explicit negatives. The test no longer fabricates an old recipe revision.
- **Prior, recorded execution, not rerun here:** real PostgreSQL 17.11/DBOS process recovery; published-release recovery; synthetic Chromium business journeys; independent file-actor runs. See the qualification documents below. A report of those runs is evidence of their stated scope, not fresh audit execution or proof of their combined composition.
- **Not run:** real-provider quality/cost/streaming; assistant-ui or CopilotKit against AE; production SSO; arbitrary host discovery/adaptation; remote authenticated MCP; multi-worker load, schema upgrades, backup/restore, knowledge, automation, A2A or native/mobile bridges.

The baseline's 188-test aggregate was already documented as passing. It did not catch the MCP split because its protocol test supplied a hand-written 1.0.0 reference. Green aggregate counts do not replace a real producer→consumer contract chain.

## Full module map

Pins `P1`–`P13` resolve to the exact artifact list below. “Recorded” means the checked-in qualification report was inspected but its service/browser suite was not rerun during this audit. Every capability family in plan §4 and architectural module in §7–§10 appears here; unimplemented modules do not receive invented adoption or execution credit.

| Architectural module / code | Mature base actually adopted | Execution evidence | Necessary AE integration and correction |
| --- | --- | --- | --- |
| Shared contracts, JSON Schema (`contracts`) | P1 Zod; P9 TypeScript | Fresh strict build and contract tests; existing schema exporter | Product artifact/approval schemas are justified. Shape validation is not authorization. Keep browser exports Node-free. |
| Artifact identity/hash (`contracts/hash`, `policy`, `transformation`) | Node crypto; P1 schema validation | Fresh contract, approval, pre-apply and archive tests | Three canonicalizers duplicate behavior. Consolidate only after golden digest compatibility tests; do not invalidate approvals/old runs by casually replacing a function. |
| Skill/CLI/MCP installation and delivery entry | Existing developer agent; P5 official MCP; Node CLI | Fresh real SDK stdio lifecycle; recorded exact CLI delivery | CLI/Skill call the same transformation core. MCP recipe facts were duplicated and stale, now fixed. Private workspace bins are not a clean distributable release qualification. |
| Project assessment/business evidence (`transformation/index`) | Git and P9 official TS parser | Fresh fixture baseline validation/MCP assessment; prior Python manifest test | Bounded manifest reads and one curated helpdesk flow, not generic call-graph/identity analysis. Keep unknowns honest. No custom compiler exists. |
| AST/recipe (`transformation/ast`, `recipes/react-helpdesk`) | P9 `createSourceFile`, TS visitor | Fresh build/MCP preview; recorded original/generated Vite builds | AST finds the existing App/main mount and inserts bounded glue. Valid small use of compiler API; adding ast-grep/ts-morph solely to satisfy a library list has no demonstrated benefit. Multi-language recipes remain open. |
| Transformation approvals/isolation/revert | Git worktree, Node filesystem/crypto, P1 | Fresh pre-apply, tamper, dirty/filter/source-root and delivery tests | Plan/base/path/expiry binding, non-overwriting rollback and receipt chain are AE product policy. Worktree is not a sandbox. |
| Transformation task context/questions/heartbeat/artifacts | Partial artifact schemas only | No durable transformation-task protocol run | Current CLI artifact chain is not a persistent developer-task service. Do not build another agent orchestration loop; use the host coding agent and later add only the missing task contract. |
| Pre-apply baseline capture | Node child process + existing fixture domain + P1 | Fresh actual original fixture capture and archive/forgery tests | Fixed trusted fixture collector, before patching, ten reset observations. Not a generic host baseline adapter. Keep the exact source/collector/plan chain. |
| Differential verification (`verification`) | P1 plus Node test runner/crypto | Fresh OFF/ON, effect/receipt, normalization and tamper tests | Exact before/after and no-extra-delta semantics are justified custom policy. This compares explicit observations; it is neither an execution sandbox nor a general testing replacement. |
| Business improvements/batch review | Shared behavior contracts, P1/P6/P7 | Fresh comparator/config UI tests; recorded ON/OFF PG/browser runs | Default OFF, predeclared deltas, published selections and prohibition on safety bypasses are necessary. Final selected combination/rollback still needs unified acceptance. |
| Identity/application boundary | Hono trusted server callback, host identity resolver | Fresh forged-header/body, tenant/application/subject and current-rights tests | Reuses host identity, no AE account/key. Synthetic resolver and `sessionKey` are not production SSO/token exchange. Generic policy is still coupled to tickets/editor/viewer. |
| Capability source/revision/registry | P1 fixed capability schemas; host business functions | Fresh release filtering/member/broker tests | Version/hash intersection is real. Generic `CapabilityAdapter` is declared but not consumed by the concrete runtime. Source discovery/accepted-revision lifecycle is not implemented. Remove duplicate SDK schemas first. |
| Agent release/control plane (`control-plane`) | P1/P4 Hono/P3 PostgreSQL | Fresh draft/validate/publish, immutable snapshot/current-catalog and real HTTP tests; recorded PG releases | Immutable release and current host revocation are justified. Catalog publication must never create host authority. Memory/PG implementations share contract tests, but migration/rollback/retention remain separate gaps. |
| Model port (`runtime-adapters/agents-model`, `file-model`) | P2 official Agents `Model` interface | Fresh actual Runner/model request; recorded independent actor traces | Port translates AE model request/results, bounds turns/output and cancellation. File polling is test IPC, not another agent loop. Simulated models prove integration only; no provider metrics or cost accounting. |
| Agent execution (`runtime-core`) | P2 `Agent`, `Runner`, `tool`, SDK approval pause | Fresh read→approval→write→receipt, reject/cancel/unknown, member/release/revocation tests | Keep SDK loop; AE wraps business trust boundaries. Four independently authored SDK definitions duplicate broker metadata and lose constraints. A shared tool factory is the next bounded fix. |
| Durable scheduling (`runtime-adapters/db/runtime`) | P2 + P3 DBOS; real PG recorded | Recorded DBOS engine and 24-case/45-process AE recovery report; fresh broker unit checks only | One DBOS workflow owner and versioned SDK snapshot. No custom lease queue identified. Do not move live authorization inside cached steps or change durable step ordering during deduplication. |
| Run/business ledger and intent recovery | P3 `pg`, DBOS identity, PostgreSQL transactions | Recorded killed worker/unknown receipt/published release tests; fresh intent reducer tests | AE approval/operation/event records and host receipt transaction are necessary. Startup intent recovery submits stable workflow IDs, not an alternate scheduler. No proof of database destruction/failover or multi-worker load. |
| Tool broker/invocation classification | P1 validation + existing host business methods | Fresh broker/member/current-rights/unknown/reconciliation tests | AE must own resolve→policy→approval→invoke→classify. SDK `needsApproval` cannot replace exact principal/args/target/version/release/expiry binding. Keep independent broker revalidation after SDK factory extraction. |
| Approval/recovery | P2 SDK interruption; P3 locked durable transactions | Fresh memory binding/cancellation; recorded durable atomic consume/reserve/restart | Two approvals are different layers: SDK continuation and business grant. They must not be collapsed. Duplicate decisions and unknown host outcomes require original receipts, not blind retries. |
| Deterministic workflow authoring | P3 DBOS underneath a fixed runtime phase workflow | Fixed phase recovery recorded; no general authored workflow test | No generic branching/workflow catalog delivered. Do not add a second workflow engine; first express one extra approved business flow on DBOS and test it. |
| HTTP API (`apps/api`) | P4 Hono + official Node adapter | Fresh real loopback HTTP approval, repeated intent, scope, origin/size and member routes | Host callbacks, request binding and safe error mapping are justified. `/api/tickets` and static model metadata are fixture composition, not general API support. |
| Host SDK/context/navigation (`host-sdk`) | P6 React/fetch/browser storage | Fresh transport and context/identity-generation tests; recorded host refresh/browser journey | Preserve host ownership and one run state. Context is only `{ticketId}`; uncertain start intent survives mount but not full reload without returned run ID. Generic page-instance/context contract is not delivered. |
| Floating daily assistant (`ui/floating`, `panel`) | P6 React portal; P7 Radix tabs; P8 Kokonut snippets | Fresh mounted focus/pointer/resize/modal/run continuity tests; recorded sandboxed Chromium | Custom host-reserved rectangles and nonmodal behavior are justified. Broader handwritten chat state remains unbenchmarked against planned assistant-ui. Keep launcher/approvals and compare only presentation adapter. |
| Host admin tab/configuration (`ui/configuration`, `apps/console`) | P6/P7; shared Hono control backend | Fresh actual control store-backed UI save/validate/publish/revocation tests | Correctly shares backend with daily surface; optional console is not a second service. No need for a new admin framework just to remove domain forms. |
| MCP tool connector/runtime remote auth | P5 used for developer toolkit only | Fresh stdio client/server; no authenticated remote transport | Do not claim MCP capability execution, OAuth/audience checks or remote egress from read-only toolkit tests. Reuse official remote transport when implementing that bounded adapter. |
| Outbound HTTP/egress policy | Browser same-origin fetch and loopback test HTTP only | Fresh inbound API guards; no general outbound connector test | No central server egress/redirect/DNS/credential-forwarding adapter exists. This is missing work, not a reason to write an HTTP client. Use official fetch plus one reviewed policy boundary. |
| Event delivery/audit | AE ordered event arrays in views/PG rows | Fresh run event sequences and authorization; recorded restart persistence | No SSE cursor service, transactional outbox, separate retained audit store or export. Memory broker audit array is not durable audit. Retain business evidence; do not treat SDK trace as audit. |
| Observability/usage | P2 tracing disabled; DBOS OTLP disabled | No AE telemetry export/usage qualification | Transitive OTel presence is not adoption. Introduce the standard exporter only for measured diagnostics; redact at boundary and leave audit authoritative. |
| Knowledge/import/retrieval and revocable grants | None adopted | Not implemented/run | Do not invent a vector store or whole ingestion framework yet. Qualify a mature retrieval component on an actual permitted corpus before adding AE grant-generation/deletion checks. |
| Conversation/long-term memory | Run views + SDK state; no conversation store | Fresh one-run restore tests; recorded durable run state | SDK history is not a general conversation lifecycle. Permanent/opt-in memory is explicitly deferred; no homemade memory service is warranted now. |
| Evaluation/datasets/release gates | P10 Node runner/jsdom/Playwright; AE artifact comparator | Fresh deterministic tests; recorded browser/actor reports | Harness/evidence gates are real. No provider holdout task-success/cost benchmark or general eval engine. Keep fake and provider evidence separate. |
| Config import/export, schema upgrade, retention/deletion | P3 initial SQL only | Initial schema recorded; upgrade/restore/delete not run | Initial DDL lives in store, control-plane and API intent composition. Before second schema change choose one migration owner; use PostgreSQL dump/restore for recovery instead of inventing backup format. |
| Automation/trigger scheduling | None integrated; DBOS remains available base | Not implemented/run | Future occurrence/identity/budget semantics belong to AE, but use qualified DBOS scheduling; do not create another scheduler. |
| A2A / AG-UI / external event mapping | None integrated | No conformance/interoperability run | AE event envelope is not AG-UI/A2A support. Add only declared SDK/protocol subsets with official peer tests when in scope. |
| Java/Spring, second-stack, mobile/mini-app bridge | No host adapter beyond React/TS fixture; Python manifest only | No second-stack lifecycle or platform run | Preserve native host stack. Do not copy ticket-specific runtime per language. One different-domain adapter must exercise shared broker/receipt/baseline contracts. |
| Distribution/supply chain/deploy/operations | P9/P11 build; npm exact lock; Git; retained P8/P12 notices | Fresh build/license artifact inspection; no clean install/publication/backup qualification | No lifecycle scripts used in this audit. Generate actual SBOM/license bundle and clean-pack smoke before release. Do not create AE website, service-key onboarding, or an external deployment. |
| Advanced canvas/marketplace/managed shell | None | Explicitly deferred, not implemented | Not a reuse defect. Do not import an entire orchestration product to manufacture scope. |

## Prioritized execution corrections

### R1: close the public MCP producer/consumer split — fixed separately

`5bb191e` exports copied recipe descriptors from transformation, removes transport-owned version/output-path copies, and changes the actual SDK test to consume the plan-produced reference. No dependency, approval policy or source-binding change. Repeat:

```sh
NODE_OPTIONS=--max-old-space-size=640 npm run build
node --test --test-concurrency=1 dist/packages/mcp-server/test/protocol.test.js
```

The old protocol fixture's 1.0.0 constant was the testing flaw. Adding a new version check only in prose would not have fixed it.

### R2: one reviewed capability definition feeding both SDK adapters — next code ticket

Minimal owner paths: `packages/capabilities/src/index.ts` (or a small `definitions.ts` imported there), `packages/runtime-adapters/src/agents-tools.ts` + export, the two runtime constructors, and focused tests. `capabilities` exports exact reviewed schema/description/risk/approval metadata; the adapter consumes that metadata and an invocation callback, calls the existing official `tool`, and rejects unknown/duplicate selected IDs. Both memory and durable runtimes use the factory. The existing broker still parses arguments independently and rechecks authority. Legacy hosts still select two tools, member-capable hosts explicitly select four. Keep release filtering, errorFunction, invocation IDs and the DBOS `runStep` names/order unchanged.

Dependency direction: capabilities depends only on contracts/policy/Zod; runtime-adapters consumes capabilities plus Agents; runtime-core already consumes runtime-adapters. Do not import runtime-core into capabilities or adapters. The factory is not another registry service or loop.

Add a contract test comparing all factory tools' parameters, approval flags and descriptions against the current capability catalog; instantiate real Runner to observe model-visible schemas; cover unknown IDs, empty/oversized ticket/member IDs, release allowlist, and two-tool legacy selection. Repeat after build:

```sh
node --test --test-concurrency=1 dist/packages/runtime-adapters/test/agents-tools.test.js \
  dist/tests/runtime/sdk.test.js dist/tests/runtime/release.test.js \
  dist/tests/runtime/read-authorization.test.js dist/packages/runtime-core/test/members.test.js \
  dist/packages/runtime-adapters/db/broker.test.js
```

The new test file is a required deliverable of R2, not claimed to exist at this audit checkpoint. Current observed mismatch: model receives `{"type":"string"}` for `read_ticket.ticketId`; capability catalog has `{"type":"string","minLength":1,"maxLength":100}`. Broker denial prevents unsafe dispatch, but drift wastes model turns and breaks a single contract truth.

### R3: qualify the actual combined product, not the union of component reports

Keep existing PG and browser harnesses. Extend the persistent HTTP harness with a published four-tool release and selected behavior, not another fake runtime: member lookup → assignee approval → HTTP interruption/restart → original receipt reconciliation; publish read-only/new behavior release → old bound approval with current revocation → rollback affecting new runs only. Add pending-assignee refresh/disconnect/cancel to the existing floating browser journey. Assert one mutation, same run/approval/receipt, current-rights denial, expected OFF/ON values and no stale-context callback. Use the existing commands after a coordinated PG/browser window:

```sh
bash tests/persistence/run-http-postgres.sh "$PG_BIN" 55469
bash tests/persistence/run-releases-postgres.sh "$PG_BIN" 55470
AE_BROWSER_EXECUTABLE="$QUALIFIED_CHROMIUM" node tests/browser/floating.mjs
```

These commands currently exercise narrower independent scenarios. The specified additions are necessary before their success is labeled combined acceptance. No database/browser was launched by this audit.

### R4: resolve the UI plan/implementation mismatch with one bounded comparison

Observed adoption is React + Radix + three Kokonut source fragments, not assistant-ui. The official [ExternalStoreRuntime guide](https://www.assistant-ui.com/docs/runtimes/custom/external-store) documents a presentation runtime backed by existing messages/callbacks; the [custom runtime overview](https://www.assistant-ui.com/docs/runtimes/custom/overview) distinguishes that from adopting a new backend. This supports a narrow candidate comparison, not a claim that the current package passes AE's safety or UI requirements. The current [upstream license](https://raw.githubusercontent.com/assistant-ui/assistant-ui/main/LICENSE) is MIT, but a future trial must pin and inspect its exact release artifact and license; no assistant-ui package was installed or run here.

Proposed single comparison: keep `AeClient`, the floating shell, the exact approval card and all server state authoritative; prototype only message/composer rendering via an external-store adapter. Do not enable client tools, branch/edit/regenerate, attachments or hosted persistence. Use the same pending approval, duplicate click, wrong/stale identity, unknown receipt, reload, IME, keyboard and narrow-screen cases. Measure extra adapter/custom state and dependencies, not screenshots alone. A checked-in trial should provide `node --test dist/packages/ui/test/assistant-store.test.js` plus the existing panel/floating/configuration suite. Retain current UI if the candidate does not reduce ownership/code or fails safety/lifecycle parity. Do not rewrite working UI before this evidence exists.

### R5: remove fixture assumptions at one real boundary, not by cloning core

The `CapabilityAdapter` interface is presently unused; `authorize()` hard-codes ticket scopes/roles, both runtime contexts use ticket IDs, and both brokers are ticket-specific. After R2/R3, add one explicit server-owned registration port carrying the reviewed definition, prepare/preview, current authorization, invoke and outcome query. Move helpdesk-specific scope/target/member handling behind its host adapter; preserve generic approval/version/receipt logic. Prove a Python inventory read + approved stock adjustment through the **same** SDK/DBOS/broker contracts and original inventory baseline, rather than counting `pyproject.toml` detection as cross-stack adaptation. Select a permitted mature native adapter/parser only for that concrete host, then execute it. This is larger M2 work, not part of the MCP fix or an authorization to fetch/adapt external projects.

### R6: release hygiene without another platform

- Consolidate canonical hashing through `@ae/contracts/hash` only after golden approval/plan/release/archive hashes and old-run compatibility prove identical accepted inputs; reject unsupported JSON explicitly. This is necessary de-duplication, not an algorithm rewrite.
- Choose one migration owner before upgrades: version AE runtime/control/API changes in ordered migrations and qualify old-run plus dump/restore on the existing PostgreSQL binary. DBOS keeps ownership of its schema.
- Update stale qualification summaries: `docs/FOUNDATION_HANDOFF.md` still says DBOS is not installed; `NOTICE.md` still uses the initial not-qualified wording. Keep historic evidence but link it as superseded by the specific durable report, without claiming all combinations pass.
- Use npm's existing lockfile/SBOM facilities rather than a homemade scanner: `npm sbom --package-lock-only --omit=dev --sbom-format=cyclonedx` is a candidate release command, **not run by this audit**. Retain full actual MCP mixed-license text, transitive notices, and packed-file checks. Package metadata alone is insufficient licensing clearance.

## Exact code and license provenance

Sources for the pins below are this baseline's `package.json`, `package-lock.json`, and the actual installed packages' `package.json` plus license files. The registry tarball URL and SHA-512 integrity identify exact code bytes; an npm version is not asserted to identify a Git commit. The root lockfile also pins transitive packages. This is a focused provenance check, not a complete SBOM, security scan or legal opinion.

- P1: `zod@4.6.7`, MIT.
- P2: `@openai/agents`, `agents-core`, `agents-openai` at 0.21.0, MIT. The imported Runner is real SDK code; providers are simulated in observed tests.
- P3: `@dbos-inc/dbos-sdk@5.3.0` and `pg@8.23.1`, MIT. PostgreSQL binary provenance is separately recorded in `docs/DURABILITY_QUALIFICATION.md`: 17.11, Debian package `17.11-0+deb13u1`, server SHA-256 `d2ce1ddffafa783f9acda4c92c86fc21e8288bff3782d739294f14fa797d7886`, client `9d8558f8dd57c8e92e218a20698383575d53742ca3f9e7c2b7fe5f246d5216ae`; recorded artifact hashes are not verified signed release metadata. No binary re-download/re-execution here.
- P4: `hono@4.13.13`, `@hono/node-server@2.1.5`, MIT.
- P5: MCP server/client/core 2.4.0. Package metadata says Apache-2.0, but each actual LICENSE explicitly retains MIT for unrelicensed prior contributions. Preserve the entire mixed-license notice; do not relabel everything Apache-only.
- P6: React/react-dom 19.3.1, MIT. P7: Radix Tabs 1.2.1, MIT.
- P8: Kokonut free repository at `590ded728c3414f871607a5d0662f9e70941d054`, MIT; pristine source/notice bytes and SHA-256 hashes are checked by the freshly executed provenance test. `packages/ui/THIRD_PARTY_NOTICES.md` lists exact upstream files, authors and changes. Only textarea hook, controlled composer and status disclosure were adopted, not a chat runtime. No React Bits/Pro code is adopted.
- P9: TypeScript 5.9.3, Apache-2.0; Vite 8.3.5, MIT, including its bundled dependency notices. P10: Node 24.19.0 test/assert; jsdom 30.1.3 MIT; Playwright Core 1.64.1 Apache-2.0 and bundled notices. Playwright installed code is not proof a browser ran here.
- P11: npm 11.9.0 and Git existing tools. No clean install was attempted; the audit reuses already-installed artifacts read-only and directs all `@ae/*` workspace links to its own source/build.
- P12: EAF semantic provenance commit `4068240525a42e55542277af2ebf0c617c82e38b`, retained MIT notice in `LICENSE`, `NOTICE.md`, and `runtime-core/docs`. This is attribution for earlier semantic adaptation, not a runtime dependency, compatibility contract, or reason to restore old product branding.
- P13: AE's own code at the audited Git revision and its root LICENSE; justified custom domains are explicitly separated in the module map. No external foundation is invented for unimplemented roadmap entries.

### Artifact identity table

| Package | Exact official artifact | Integrity (SHA-512) |
| --- | --- | --- |
| @openai/agents@0.21.0 | [registry tarball](https://registry.npmjs.org/@openai/agents/-/agents-0.21.0.tgz) | `sha512-NpJ74/dGbpYZiRYF474pCaBpxqh4A8+WHbZmaEZVQpRqieZAVH+MV4fesR9MtRGUZfpW5B91zuHzIilQp2iSxQ==` |
| @openai/agents-core@0.21.0 | [registry tarball](https://registry.npmjs.org/@openai/agents-core/-/agents-core-0.21.0.tgz) | `sha512-P2jJhc85xrKpe9GUOHAVfPHqK52my49fD1CI0LnfYEvBUwZxJXQI6lgSwby9nWhvQECveM9OvBUglAXuArsHXw==` |
| @openai/agents-openai@0.21.0 | [registry tarball](https://registry.npmjs.org/@openai/agents-openai/-/agents-openai-0.21.0.tgz) | `sha512-Y1u1ek6FwKx8j+T7gRYcm4kKyN0irqsyZm0XUDZ+g+8s15tu4EhNwNJ92zOHGx7Vjkr2RugWBxTeNspHjw/lQw==` |
| @dbos-inc/dbos-sdk@5.3.0 | [registry tarball](https://registry.npmjs.org/@dbos-inc/dbos-sdk/-/dbos-sdk-5.3.0.tgz) | `sha512-SuoJ8Rk9jU+s7KZ42nAsVsX7dHRymsb0mlnvOJxgPV8uAbaQikRYlVjkVZjSG8jKJM06TMlfDD8OtzjX0C66eg==` |
| pg@8.23.1 | [registry tarball](https://registry.npmjs.org/pg/-/pg-8.23.1.tgz) | `sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ==` |
| hono@4.13.13 | [registry tarball](https://registry.npmjs.org/hono/-/hono-4.13.13.tgz) | `sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==` |
| @hono/node-server@2.1.5 | [registry tarball](https://registry.npmjs.org/@hono/node-server/-/node-server-2.1.5.tgz) | `sha512-MgP/I06GdvsilDspMk/qmRzpk8LOUStP6jFAbSRi40W09DhoyUn+Mj7eyKICPqeYKybOjVFLVIAQzvu1bfIa7Q==` |
| @modelcontextprotocol/server@2.4.0 | [registry tarball](https://registry.npmjs.org/@modelcontextprotocol/server/-/server-2.4.0.tgz) | `sha512-rgR9yxSaAJ+bcsi/XroT/S2AfPiIWloXAnrdfYSCms9ivVju0ishu/wW0J21Ho6+ZOR1r7RyeRbjiRuF87ix5Q==` |
| @modelcontextprotocol/client@2.4.0 | [registry tarball](https://registry.npmjs.org/@modelcontextprotocol/client/-/client-2.4.0.tgz) | `sha512-LgrD2OphHuG12vfKFKz6SOnq7bKHQmhGJIAYdD+MZBn2npHEyry6uD8zvktodtl5CQM85MO0anUyD9JwmUmxww==` |
| @modelcontextprotocol/core@2.4.0 | [registry tarball](https://registry.npmjs.org/@modelcontextprotocol/core/-/core-2.4.0.tgz) | `sha512-z8QBKqdfXLPzkLQuG4xp8hrVEMm1PZ1IgxMN2sMbJiFiAKOWXnAzogXn2W4aqIBlP1ea6U5yiqVquvUNM1Cj6Q==` |
| react@19.3.1 | [registry tarball](https://registry.npmjs.org/react/-/react-19.3.1.tgz) | `sha512-QNhWdt7nrgVWWQG58QuGsAR3jv3Hbe4mb4vz7w2csnHavciZJgda1CPNaldF6eVxv90ud3jUXpKlHL69gO38yw==` |
| react-dom@19.3.1 | [registry tarball](https://registry.npmjs.org/react-dom/-/react-dom-19.3.1.tgz) | `sha512-Y0bARz53lhEC1NMCASs0/j+faB/zqt3R8hpvg1e8+61ZVJ4UL0UdC4cBbXfZMcIuhrfgeILTLe+ZeBCavQPtKQ==` |
| @radix-ui/react-tabs@1.2.1 | [registry tarball](https://registry.npmjs.org/@radix-ui/react-tabs/-/react-tabs-1.2.1.tgz) | `sha512-hRoJlode+hg5ZNlR+3tkfkUliIybdTpD5lkAvHQ9yaXseGf7XVO9Ib2GPEIOuaJJbo7YWYbNpDDRfo8Dhf6/xA==` |
| zod@4.6.7 | [registry tarball](https://registry.npmjs.org/zod/-/zod-4.6.7.tgz) | `sha512-g8W2D2kU6a8untc053fX1uVBKzM7yqAxW/3zwk83+6RyF2+SKOuV+c0wBDhUwzV1PaGapmZH+rmcUzPf+3CGwg==` |
| typescript@5.9.3 | [registry tarball](https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz) | `sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==` |
| vite@8.3.5 | [registry tarball](https://registry.npmjs.org/vite/-/vite-8.3.5.tgz) | `sha512-z1YpjieJ9g0ebTmQpLBv/oq9E3F9EIlOe+7LahW8SrE3LTiG3udBRUXQOlYXP9b+IC2q2phHeVxj9xGlw34OEQ==` |
| jsdom@30.1.3 | [registry tarball](https://registry.npmjs.org/jsdom/-/jsdom-30.1.3.tgz) | `sha512-hQMUPvRgN7KxsfIytDQji7bimuJeRQa6Qo5+iuiZQk5CafeRxLIA10/cG5YCBFNpD9RO3oqIiN4CO1Y44kxqXg==` |
| playwright-core@1.64.1 | [registry tarball](https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.1.tgz) | `sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==` |

## Reproduction commands and evidence index

Strict build and focused source tests used `NODE_OPTIONS=--max-old-space-size=640`; Node's test concurrency was 1. AE artifacts were compiled in the isolated worktree, not read from main's dist. Installed external dependencies were linked read-only; no lockfile or dependency changes occurred.

```sh
npm run build
node --test --test-concurrency=1 \
 dist/tests/runtime/sdk.test.js dist/tests/runtime/read-authorization.test.js \
 dist/tests/runtime/release.test.js dist/packages/runtime-core/test/members.test.js \
 dist/packages/runtime-adapters/db/broker.test.js dist/packages/mcp-server/test/protocol.test.js \
 dist/packages/ui/test/reuse-provenance.test.js dist/packages/ui/test/panel.test.js \
 dist/packages/ui/test/floating.test.js dist/packages/ui/test/configuration.test.js \
 dist/packages/host-sdk/test/transport.test.js dist/packages/contracts/test/contracts.test.js \
 dist/packages/control-plane/test/control.test.js
# Observed: 94 pass, 0 fail, 0 skip, 8.920 s (before MCP fix).

node --test --test-concurrency=1 \
 dist/apps/api/test/http.test.js dist/apps/api/test/configuration-http.test.js \
 dist/apps/api/test/member-http.test.js dist/apps/api/test/host-catalog.test.js \
 dist/apps/api/test/intents.test.js dist/tests/differential/verification.test.js \
 dist/packages/transformation/test/pre-apply.test.js \
 dist/packages/transformation/test/fixture-baseline.test.js \
 dist/packages/transformation/test/delivery.test.js dist/packages/transformation/test/behavior.test.js
# Observed: 48 pass, 0 fail, 0 skip, 7.106 s (before MCP fix).

npm run lint && npm run build
node --test --test-concurrency=1 dist/packages/mcp-server/test/protocol.test.js
# Observed after fix: 3 pass, 0 fail, 0 skip, 1.755 s.
```

Temporary logs `/tmp/ae-runtime-reuse-build.log`, `/tmp/ae-runtime-reuse-focused.log`, `/tmp/ae-runtime-reuse-integration.log`, `/tmp/ae-runtime-reuse-drift.json`, `/tmp/ae-mcp-drift-build.log` and `/tmp/ae-mcp-drift-fixed.log` are inspection material, not permanent deliverable links. Repeatable source tests and the exact observations above are the committed evidence.

Prior qualifications inspected: `docs/RUNTIME_HANDOFF.md`, `docs/DURABILITY_QUALIFICATION.md`, `docs/PERSISTENT_RUNTIME_QUALIFICATION.md`, `docs/FLOATING_UI_VERIFICATION.md`, `docs/UI_SURFACES_HANDOFF.md`, `docs/verification/delivery-qualification.md`, `docs/verification/behavior-improvements.md`, `packages/runtime-adapters/db/README.md`, `docs/acceptance-status.md` and the corresponding runnable test sources. Remaining limitations in those reports remain in force.
