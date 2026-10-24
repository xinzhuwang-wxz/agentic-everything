# assistant-ui R4 bounded qualification

This isolated trial compares the shipped 9268d98 UI against `@assistant-ui/react@0.15.31` external-store runtime and real composer/message primitives. It is not a new AE runtime and is not imported by production code.

`prepare.mjs` derives the candidate panel from the frozen source using asserted replacements. All AE client calls, generation/locking/polling effects, pending request reconciliation, approval card, receipts, host callbacks, floating shell and admin tabs remain unchanged. Candidate code adds a text-only RunView projection, disables frontend tool invocation, and connects composer sends to the existing start callback. Original refresh/cancel/approve/reject buttons remain AE-owned.

No Markdown renderer, image message, attachment adapter, cloud adapter, model adapter, local runtime, tool callback, queue, import, edit, branch, regenerate, speech or feedback path is enabled. Plain Enter remains newline; Ctrl/Cmd+Enter sends; composition does not send. Escape must remain owned by the existing floating panel, not cancel a business run.

## Reproduce

Run commands from this directory on Node 24 / npm 11. Existing exact AE development tools are reused from `AE_QUALIFIED_ROOT` (or the current checkout); no unrecognized binary is downloaded. The root's dependency lock is not modified.

1. `npm ci --ignore-scripts --registry=https://registry.npmjs.org`
2. `AE_QUALIFIED_ROOT=/path/to/qualified/ae node link-dependencies.mjs`
3. `node prepare.mjs`
4. `AE_QUALIFIED_ROOT=/path/to/qualified/ae node build.mjs`
5. `node --test --test-concurrency=1 --import ./network-guard.mjs generated/panel.test.js generated/floating.test.js generated/store.test.js`
6. `AE_QUALIFIED_ROOT=/path/to/qualified/ae AE_BROWSER_EXECUTABLE=/path/to/qualified/chromium node browser.mjs`

The browser command runs the frozen real-Runner synthetic floating journey with the candidate UI alias, not a fake assistant-ui import. The ordinary unit tests still use controlled mock AeClient responses. Neither proves real-provider streaming or production SSO. The final report records exact outcomes and limits.

Strict source checking: run the qualified checkout’s existing TypeScript 5.9.3 with `-p qualification/assistant-ui/tsconfig.json` from the repository root. The root checkout must have its ordinary pinned dependencies; the spike adds no root dependencies. Use `AE_UI_VARIANT=baseline` for the same browser journey without the candidate UI alias.

The full decision and caveats are in `../../docs/verification/assistant-ui-comparison.md`. Both exact upstream MIT notices are preserved in evidence. `package-lock.json` pins only this optional qualification package.
