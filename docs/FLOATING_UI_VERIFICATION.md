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

The real touch-drag check found that Chromium can omit the compatibility click after a touch sequence. Activation now handles an unmoved touch pointer-up and consumes any following synthetic click, with a dedicated regression test. A screenshot review also found panel/launcher overlap; panel placement now avoids the launcher instead of merely raising its z-index.

## Not claimed

Full-project TypeScript compilation was killed by the environment (exit 137), including a single 512 MiB attempt. It produced no TypeScript diagnostic. The focused compilations and tests above passed; root integration still owns the full aggregate gate. An initial browser development-server attempt lacked a JSX dev-runtime alias, then the next attempt crashed during page loading; a bounded-memory production-build/preview runner resolved these harness failures.

This is a local synthetic fixture, not any of the external multi-project acceptance cases, not a paid/provider model evaluation, and not production authentication or durability qualification. Host applications must supply correct session lifecycle, reserved-control rectangles and modal suspension/stacking integration; arbitrary host controls are not auto-detected.
