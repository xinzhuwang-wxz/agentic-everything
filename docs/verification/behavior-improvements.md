# Behavior improvements: bounded synthetic vertical slice

The host management rail now contains **行为改进**, separate from capability permissions and ordinary assistant definition. It uses the existing draft, revision check, validation, immutable release and PostgreSQL publication path. There is no second configuration system or audit ledger.

## Contract and trust boundary

- `BehaviorCatalog` registers only `business-behavior` improvements, each with reason/evidence, impact, risk, examples, exact per-case before/after paths and default OFF. Security, authorization and corruption findings are not compatibility options.
- `AgentConfiguration.behavior` is optional. Absent means legacy behavior; explicit choices bind baseline hash, candidate implementation hash, registry hash and exact improvement ID/version. Unknown IDs, versions, mismatched hashes, duplicate choices and overlapping selected deltas fail closed.
- Only host administrators save/publish choices. Published release content hashes cover the choices, publisher and timestamp; old releases remain available. No browser identity or behavior snapshot is accepted as runtime authority.
- Ordinary `/api/tickets/:id` reads use the current server-selected release. Existing runs retain their starting release, including across stored-run serialization. A new release never changes the old run snapshot or rolls the application's active pointer backward to satisfy an old run.
- The memory host and durable host protocol accept an explicit behavior selection. The deterministic host business projection executes after current authorization, not in a model prompt. Persistent compositions reject a configured catalog unless the adapter explicitly declares implementation support; old adapters cannot silently ignore an enabled option. Adapters must validate the entire selection and implement it, not merely copy the support marker.
- OFF changes future reads/new runs; it is not compensation for past writes. Current authorization remains mandatory for new reads, existing run access and cached receipts.

## Installed synthetic example

`packages/capabilities/src/behavior.ts` registers `synthetic-ticket-title-trim@1`: trim surrounding whitespace from the returned title, without mutating stored data, priority, resource version or permissions. Ordinary host reads and assistant tool reads call the same deterministic function with an explicit snapshot.

The two-case baseline has reproducible observation and manifest hashes. The candidate hash binds the actual executable rule body, **not a whole repository source attestation**. Its exact contract permits only `synthetic-title → output/title`: `"  Printer offline  "` to `"Printer offline"`; the already-clean case must remain equal. This is synthetic fixture evidence, not automatic defect discovery, a genuine customer migration, or a claim that all inputs are covered. The original three external-project cases remain deferred.

## Executable checks

- `tests/runtime/behavior.test.ts`: OFF parity, ON exact delta, unrelated difference rejection; malformed/unknown/safety entries; administrator-only selection; immutable release audit; current ordinary page versus a paused old run; current permission revocation.
- UI tests: dedicated left tab, default OFF/evidence display, preserve unsaved selection when switching tabs, preserve active-release behavior through ordinary configuration edits, mismatch/permission rejection, publisher and historical choices.
- `packages/control-plane/test/postgres/run.sh`: existing PG qualification plus `behavior.mjs`, proving OFF/ON/OFF publication across separate Node processes, restart, immutable old selections, current pointer and denied unauthorized/hash-mismatched edits. Uses disposable loopback PostgreSQL 17.11 only.
- `tests/browser/behavior.mjs`: transforms the synthetic React host, builds privately, runs API/UI/sandboxed Chromium in one process namespace; chooses/publishes ON and OFF through the real UI; verifies ordinary host output and simulated assistant receipts, history, reload and narrow layout. The model is deterministic and explicitly simulated. No paid provider or external service is used.

The behavior-specific PG test qualifies control-plane persistence. A later [joined qualification](joined-release-qualification.md) now separately exercises behavior-enabled member/assignee DBOS runs through persistent HTTP, published release rollback and process restart with the generated UI. Its exact fixed-fixture scope does not broaden this original control-store test or the delivery profile. No production deployment or credential changes occurred.

## Recorded local result (2026-10-24)

- `NODE_OPTIONS=--max-old-space-size=640 npm run check`: PASS, lint + strict typecheck + build + **133/133 tests**. The first aggregate attempt hit the 512 MiB JavaScript emit heap limit after lint/typecheck; it was not treated as a pass. Increasing the bounded heap to 640 MiB produced the complete pass without changing source or reducing checks.
- PostgreSQL 17.11 control and behavior qualification: PASS on the final compiled artifacts; the disposable database was stopped normally.
- Sandboxed Chromium behavior journey: PASS on final artifacts, four scenario groups, zero page errors; screenshots include OFF, published ON and 390px layout. API, UI and browser ran in the same invocation and were stopped afterward.
- Unsupported durable adapter: rejected before database startup with `HOST_BEHAVIOR_NOT_SUPPORTED`.
