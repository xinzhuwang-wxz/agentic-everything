# assistant-ui: bounded R4 comparison

Date: 2026-10-24 UTC. Frozen UI baseline: `9268d98cb72bbc38deea474c9244b23e3de0a98a`. The optional, runnable trial is in `qualification/assistant-ui/`; it is not imported by production packages and does not change the root dependency lock.

## Decision: retain the shipped presentation base

**Retain React/Radix plus the already-qualified Kokonut composer/resize/status components for the current single-run AE panel.** This closes R4's missing comparison; it does not claim assistant-ui was adopted or reject assistant-ui for future conversation-oriented features.

The actual `@assistant-ui/react@0.15.31` ExternalStoreRuntime and composer/message primitives ran successfully against the frozen panel behavior. They can be connected without a second model loop, client tool executor or authority store. The candidate passed the stated safety/lifecycle/UI cases. However, it removed none of AE's necessary run-generation, request-lock, uncertain-intent, polling, approval, receipt or host-permission ownership. It added a derived two-message projection, business-status translation and composer synchronization, while the enabled end-user capabilities stayed the same.

Measured with the same production fixture build and React instance:

| Metric | Shipped base | Real assistant-ui candidate |
| --- | ---: | ---: |
| Production JS | 387,046 B | 742,392 B |
| JS gzip | 117,942 B | 220,820 B |
| CSS / gzip | 19,869 / 4,757 B | 19,869 / 4,757 B |
| Authored panel + composer + resize code | 17,396 B | 18,348 B |
| Necessary AE lifecycle/approval logic removed | — | 0 |

The candidate adds 102,878 compressed JS bytes (+87.2%) for this fixture. Authored bytes increase 952 B (+5.5%); these are source-size observations, not a maintenance-cost or runtime-performance benchmark. The isolated lock resolves 95 installed package paths: 73 new package names and one different `nanoid` version relative to the main lock, with 21 already-present paths. This is not a claim that a future coordinated root install must add exactly 74 entries. Candidate node_modules occupies approximately 46 MiB; the 245 MiB root vendor tree was not copied.

A future feature requiring persistent multi-message histories, rich parts, branching or threaded composer workflows could change this trade-off. Such features must still be qualified against AE authority boundaries. The current product should not be rewritten merely to conform to the original candidate list.

## Concrete conversation gap and when to reopen the comparison

This comparison deliberately freezes the **current single-run workflow**. It does not satisfy the wider planned conversation product. `IMPLEMENTATION_PLAN.md` §4.3 requires reliable, isolated conversations; §9.2 specifies `POST /v1/conversations/:id/runs`; §11.1 distinguishes conversation history from SDK RunState, durable checkpoints, side effects and audit evidence. These are separate requirements, not features that can be declared unnecessary because this spike has only two projected messages.

The inspected implementation exposes `/api/runs`, not a conversation-bound start/history API. `RunView` has one run and its events/receipts, with no conversation ID or durable message collection. `AgenticPanel` replaces its current `runSnapshot` on the next completed-request cycle, retains only one local `lastInput`, and stores only a run ID in sessionStorage; restoration displays “已恢复的执行” rather than restoring the original message history. Principal/context generation guards are valuable, but they are not proof of a durable, authorized multi-turn conversation history. That missing module remains a concrete product gap after R4's bounded comparison is closed.

Reopen assistant-ui qualification when the conversation target has an approved, server-owned contract: stable conversation/message/run IDs, current-principal read authorization, ordered message history and retention, plus a defined second-turn/unfinished-run policy. At that seam, an ExternalStoreRuntime may replace actual custom work for message-list reconciliation, part rendering, composer state, history paging, scroll anchoring and focus behavior. The present two-message projection cannot measure those savings fairly. Any branching, edit, regeneration, queueing or rich parts must be separately product-approved and qualified, not enabled merely because the library offers them.

The new comparison should execute a real two-or-more-turn history, hydrate it after reload, switch conversations/principals while responses arrive, and reconcile interrupted runs without replaying writes. It must also verify that viewing or quoting a historical approval cannot authorize a new run, each run keeps its own release/current-rights/receipt binding, and history payloads stay inert. Re-measure removed custom state and shipped cost against that actual target. Neither assistant-ui's message repository nor an SDK RunState should become the authoritative conversation/permission store. This ticket does not implement that backend or broaden the frozen product scope.

## What was actually reused and executed

Official documentation identifies ExternalStoreRuntime as a messages-and-callbacks adapter rather than a new backend:

- [ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)
- [Custom runtime overview](https://www.assistant-ui.com/docs/runtimes/custom/overview)

The spike executes `useExternalStoreRuntime`, `AssistantRuntimeProvider`, `ThreadPrimitive.Root`, `ThreadPrimitive.MessageByIndex`, `MessagePrimitive.Parts`, `MessagePartPrimitive.Text`, `ComposerPrimitive.Root`, `ComposerPrimitive.Input` and `ComposerPrimitive.Send`. This is real library state/control/rendering, not an unused import or screenshot of an upstream demo.

`prepare.mjs` verifies the exact frozen panel SHA-256 before generating an isolated candidate. Asserted replacements change only the presentation/composer seams. The original client calls, lifecycle effects, pending request recovery, approval-card JSX, current-hash decision, receipt rendering, run callback, floating launcher and host admin tabs remain intact. The generated panel is disposable and is never an alternate production source of truth.

The adapter accepts only literal text derived from `RunView`; it has no tool, image, file, HTML, Markdown or URL message parts. It explicitly sets `unstable_enableToolInvocations:false`, with no model, cloud, history, queue, attachment, branch, import, edit, regeneration, speech, feedback or client-tool adapters. `onNew` validates user/text-only input and reaches the existing `client.start` path. Refresh, cancel, approve and reject remain the original AE buttons, not assistant-ui tool-approval callbacks. Unknown/manual-review/error states never become a presentation success.

Composer settings explicitly preserve Ctrl/Cmd+Enter submission, IME safety, ordinary Enter newline, no attachment paste, no automatic focus theft, and Escape owned by the floating shell. End-user confirmation remains in the conversation, not an admin queue. Message updates come from the existing poll/refresh snapshots; no SSE or real-provider token-stream claim is made.

## Exact artifact and license evidence

The official registry's latest version at inspection was 0.15.31. The trial pins it, not `latest`:

| Artifact | License | Official tarball and exact SHA-512 integrity |
| --- | --- | --- |
| `@assistant-ui/react@0.15.31` | MIT, copyright 2026 AgentbaseAI Inc. | [registry artifact](https://registry.npmjs.org/@assistant-ui/react/-/react-0.15.31.tgz), `sha512-vTTcI2963DO5CYrKh8CYkJ0stQcu0JXxUQM0nepsP2Zy4QfrovVuiYkAhKM1U4jMnGHy3sQ9ovxH0VTZrScnZg==` |
| `@assistant-ui/core@0.3.31` | MIT, copyright 2026 AgentbaseAI Inc. | [registry artifact](https://registry.npmjs.org/@assistant-ui/core/-/core-0.3.31.tgz), `sha512-NrTSgdUTM0SVmos3YMAAvPqDDNlxFmwVTjnA06T+4A7DcXswsKrBw65BsfSEn4m1DFSwaD3rfMlIFTEK3ei4uQ==` |

Exact package LICENSE files were read and preserved under `qualification/assistant-ui/evidence/`. React's declared peer range is `^18 || ^19`; both React and React DOM were pinned to AE's 19.3.1 and linked to the already-installed exact instances to avoid duplicate React. Installation used the official registry with `--ignore-scripts --no-audit --no-fund`; no lifecycle scripts or unknown-repository software ran. The initial default-cache metadata lookup failed with ENOENT for `/home/agent/.npm`; a writable isolated cache was used. There was no permission denial or bypass.

The local lock contains every transitive version, official tarball and integrity. `evidence/dependencies.json` records license metadata and hashes of the actual license/notice files found in each artifact. Metadata licenses are MIT, BSD-3-Clause and 0BSD. Two transitives (`react-remove-scroll-bar`, `use-composed-ref`) contain no top-level LICENSE/COPYING/NOTICE file in their installed artifacts; their metadata is not complete redistributor notice clearance. A future production adoption must resolve those notices. No new upstream source is copied into production. Registry signatures/provenance were recorded as metadata, not independently cryptographically verified.

The exact packaged `@assistant-ui/core/src/runtimes/external-store/external-store-adapter.ts` and runtime implementation were inspected. Frontend tool invocation is opt-in, not enabled by merely using the external store; this spike additionally fixes the flag to false. Package metadata/source reading was only preparation. The runs below establish the actual execution evidence.

## Verification and observed outcomes

1. Fresh strict TypeScript 5.9.3 checking of candidate source and tests: exit 0.
2. Fresh Vite bundling of candidate panel/test entries: exit 0. These are transpiled runnable bundles; the independent strict check above supplies type safety.
3. Fresh Node/jsdom candidate suite: **33 passed, 0 failed, 0 skipped**, 6.653 seconds for the recorded final run. Twenty panel and seven floating tests exercise the shipped contracts; six added tests cover projection, untrusted content, current approval hash, current-rights denial, reconnect/cancel and polling.
4. Fresh baseline and candidate production-build sandboxed Chromium runs: both passed the same seven recorded journey checks. The real Agents Runner uses the existing deterministic synthetic model and original helpdesk callbacks. Explicit confirmation updates the original host exactly once; the same pending approval survives closing and visiting host administration. Keyboard/focus/Escape, persisted pointer drag, 360px non-overflow layout and touch drag/tap are exercised.
5. Network guards are installed before unit modules load. They reject fetch/HTTP/socket attempts. Final candidate browser contexts abort non-fixture-origin HTTP before dispatch, block WebSockets and service workers. **Zero network attempts** were recorded by the final guards; malicious HTML, Markdown image URLs and tool-like JSON stay literal text and invoke no decision callback.
6. Same React 19.3.1 instance verified through realpath. Source diff between the frozen baseline and the borrowed qualified runtime build is empty across contracts, capability, runtime/adapters (including DB), API, UI and host SDK inputs.

The browser used the already-qualified sandboxed Chromium headless-shell with `chromiumSandbox:true`, never `--no-sandbox`. Backend compiled artifacts came read-only from qualified commit `644496278c53bffe831e170b93a8228c5ac15c06`, whose relevant production inputs are identical to baseline 9268d98. This comparison freshly bundled the UI; it does **not** claim to have freshly rebuilt the borrowed backend or rerun its PostgreSQL qualification.

### Initial failures and corrected harness assumptions

The first 33-test run had 31 passes and two failures, retained in `evidence/tests-first.log`:

- The generated floating test imported the panel instead of the package barrel, omitting `placeFloatingLauncher`. The generator now imports its candidate barrel; no production implementation changed.
- The old global `document.querySelectorAll('textarea')` assertion counted the autosize library's body-level measurement textarea. Actual library source marks it `aria-hidden=true`, `tabindex=-1` and hidden. The assertion now counts textarea elements inside `.ae-input`, the actual composer. All other frozen assertions remain, including height and IME. This is explicitly a test-selector qualification, not an assertion that the untouched original test passed.

Two initial strict-check issues (optional attachment length and the library's restricted textarea style type) were fixed in the candidate adapter. A first test invocation used `.mjs` names while Vite emitted `.js`; the runnable commands were corrected. None of these initial failures is omitted from the evidence, and no business/runtime code was changed to accommodate the library.

### Limits

This is a single-run presentation comparison, not full assistant-ui security or accessibility certification, performance benchmarking, vulnerability clearance, real-provider quality/streaming, production SSO, multi-thread persistence or full transitive redistribution clearance. Current-rights/error and stale-hash UI cases use controlled AeClient responses; the browser executes the actual existing synthetic server/runtime happy path. Server authorization remains independently enforced by existing AE runtime contracts. Do not extrapolate the candidate's passing UI tests to unenabled tool/cloud/image features.

## Reproduction and smallest patch

See `qualification/assistant-ui/README.md`, its isolated package lock, frozen-seam generator, six new test cases, browser harness and source/license/runtime-input evidence. Use the existing exact root development dependencies, Node 24.19.0 and npm 11.9.0. No root lock or production source edits are required.

The smallest justified production patch is **none**. Adopt the evidence-backed retention decision and reconcile plan/status wording accordingly. Keep this optional spike as reproducible comparison evidence, not a hidden alternate shipping UI or a requirement to install assistant-ui for normal AE use.
