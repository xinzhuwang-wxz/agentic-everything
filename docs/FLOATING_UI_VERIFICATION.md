# Floating assistant verification

Verified 2026-10-24 in the isolated `feat/floating-assistant` worktree, based on `f1fcac5`.

## Passed

- Strict TypeScript compilation of the UI/host SDK closure and transformation/SDK test closure, each with a 512 MiB Node heap cap.
- 38 UI tests, including seven floating interaction tests and all prior approval, unknown-outcome, session/context, configuration and onRunChange regressions.
- 15 transformation/SDK tests, including actual baseline/generated Vite production builds, byte-preserving original business/API source, rollback and source-bound behavioral comparison.
- `npm run lint` and `git diff --check`.
- `tests/browser/floating.mjs` against the real recipe-generated synthetic helpdesk, sandboxed Chromium 156, unchanged compiled runtime from the base checkout, and a deterministic synthetic ModelProvider. The script records the runtime root rather than claiming a new full runtime build.

Final browser evidence: `/tmp/ae-floating-browser-iQvnZL/evidence.json`; screenshots `host-collapsed.png`, `approval.png`, `host-management.png`, `narrow-open.png`. Approval and narrow screenshots were visually inspected. No browser page errors.

Browser checks: original host refresh; draggable launcher without click activation; coordinate restoration on reload; keyboard move/open/Escape with focus return; configuration/activity navigation in the original host while retaining the same approval; confirmed priority write with original page changing once from version 1 to 2; 360px layout with visible non-overlapping launcher and no horizontal overflow; real touch pointer drag followed by tap open/close. Reduced-motion context was enabled. All owned browser, Vite and API servers were shut down.

Activation handles an unmoved touch pointer-up and consumes a following synthetic click, with a dedicated regression test. Panel placement avoids the launcher; the real touch-drag and screenshot checks exercise these rules.

## Not claimed

This report covers the focused compilations and browser checks above. The [core acceptance record](acceptance-status.md) supplies assembled-source strict build and aggregate evidence; these focused UI results do not substitute for that gate.

This is a local synthetic fixture, not any of the external multi-project acceptance cases, not a paid/provider model evaluation, and not production authentication or durability qualification. Host applications must supply correct session lifecycle, reserved-control rectangles and modal suspension/stacking integration; arbitrary host controls are not auto-detected.
