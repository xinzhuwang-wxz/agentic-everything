# assistant-ui: bounded multi-turn comparison

Date: 2026-10-25. Target: server-owned `ConversationView`, at most 40 literal-text messages / 20 turns, stable message IDs, one unfinished run, no paging, branching, queue or attachments.

## Decision

**Retain the current React/Radix/Kokonut presentation base for bounded-v1.** Deliver the conversation module rather than requiring a framework conversion. This reopens and executes the new multi-turn target; it does not merely reuse the earlier single-run conclusion. assistant-ui is technically viable with a constrained adapter and is not rejected as inherently unsafe.

The current baseline adds a stable-key text map and retains its qualified composer/resize/status components. `ConversationSession` still owns authenticated snapshot loading, scoped generations, pending-intent/input-hash journal, admission recovery, polling and run selection. Approvals, receipts, retries and permission checks remain run-local and AE-owned.

The candidate replaces list iteration/part rendering and can swap composer primitives. It removes **zero required controller, journal, authorization, approval or run-workflow modules**. It cannot remove custom paging, rich parts, branching or scroll anchoring because none exists in this bounded target. React already reconciles the stable-key list. Replacing the already-reused Kokonut composer is a mature-base swap, not eliminating newly invented conversation machinery.

The additional glue is real: message/date/status projection, hiding library-only optimistic placeholders, keyed scope lifecycle, disabled features, explicit history-persistence opt-out and text-only send validation. The small candidate does not have production styling/card parity; its source bytes are not a fair shipping-size comparison. The old single-run comparison's +102,878 gzip JS bytes are historical evidence, **not** a newly measured bounded-v1 cost. No new full-build/performance claim is made.

## Actual execution

[Portable source and reproduction](../../qualification/assistant-ui/bounded/README.md) use the existing parent qualification's exact `@assistant-ui/react@0.15.31` pin, React 19.3.1 and existing Vite/TypeScript/jsdom. Real ExternalStoreRuntime, Thread, Message and Composer primitives ran; this is not an import-only survey.

Original focused run: **12 passed, 0 failed/skipped**, 1.573 seconds. Independent strict TypeScript and Vite SSR bundling exited 0. Same React instance verified; network guards recorded zero attempts. No new installation, full build, browser, PostgreSQL or model API ran for this qualification. Exact logs and original failure/correction evidence are in [bounded/evidence](../../qualification/assistant-ui/bounded/evidence/).

Coverage includes exact ordered IDs/text/timestamps after reload; all 40 messages; conversation/principal switches checked at layout commits; no previous-scope IDs in the new runtime export; stale-scope response rejection; explicit denial unmounting history and composer; latest queued/unmaterialized, running, awaiting-approval and manual-review status separate from completed history; hostile HTML/Markdown/tool/approval strings remaining literal; one composer send reaching AE; non-text/assistant-role append rejection; and absent paging, branch, queue, attachment and frontend-tool capabilities.

## Material library behavior and boundaries

- **Frontend tools are opt-in, not on by default.** The tested adapter explicitly uses `unstable_enableToolInvocations:false`, only text parts, and no tool/result/approval/resume adapters. Runtime `answerToolCall` is false. The packaged `_driveToolInvocations` returns without creating the tracker when not enabled.
- **An unkeyed message-array swap retains old nonvisible branches.** A positive test observed the new visible IDs while `runtime.thread.export()` still contained old IDs. That is intentional branching behavior, not a library bug claim. The constrained adapter remounts by principal/conversation/generation and guards mismatched snapshots before rendering. New runtime exports contain only current-scope IDs; this is not a forensic memory-erasure claim.
- **Snapshot synchronization runs in an effect.** The keyed boundary prevents exposing old history while `setAdapter` catches up. AE fetch-generation/authorization guards remain necessary.
- **An inherited history adapter can write completed history.** A positive control observed one actual `history.unstable_copy` call. `unstable_persistsHistory:true` suppressed it in the constrained adapter, even with ambient history deliberately supplied. The current AE root has no such ambient adapter, so this is an integration obligation, not an existing production data-leak finding. The flag is experimental and needs upgrade regression coverage.
- **Running tails get library-only optimistic placeholders.** The adapter hides these and does not invent durable server IDs. Library export omits them; latest run status remains separate from historical message status.

Source behavior is pinned in `@assistant-ui/core/src/react/runtimes/useExternalStoreRuntime.ts`, `external-store-history-copy.ts`, and `runtimes/external-store/{external-store-adapter,external-store-thread-runtime-core}.ts`. Existing parent qualification evidence preserves upstream licenses and package integrity; production adoption would still need its documented transitive-notice clearance.

This is presentation qualification, not proof of backend authorization, durable replay, browser layout, accessibility or the completed product. Parent integration tests remain required. Reconsider adoption when an approved feature actually needs substantial message/viewport/rich-part/paging behavior and a new bounded experiment demonstrates replacement of real custom work.
