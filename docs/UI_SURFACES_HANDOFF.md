# AE host surfaces, first implementation

## Implemented

- `@ae/host-sdk`: `AgenticMount({ apiBase, ticketId, client?, title? })`; `createAeClient({ apiBase, fetch? })` injected transport. Explicit API base is required. Browser sends page context only; identity is server-owned.
- `@ae/ui`: `AgenticPanel` / `AgenticTab`, plus `@ae/ui/styles.css`. Chinese read / request / preview / confirm / reject / cancel / receipt journey, capability list, and server event history. Unknown outcomes remain unknown and block new execution.
- `apps/console`: separate responsive AE workspace, same component and API as embedded host. No second runtime or fake capability settings. Configuration and publishing are explicitly not implemented.
- Server-supplied simulation label and release, explicit memory-fixture limitation. No invented provider readiness, success, or timeline.
- Double-submit guard, exact server approval digest, expired confirmation disabled, context navigation invalidates stale results, run ID restored through server GET after refresh. No browser-side approval authorization.
- SDK start keeps Idempotency-Key stable for uncertain retries during a mounted client lifetime. Pending requests without a returned run ID are NOT recovered after a full page reload; this remains a qualification gap. Successful run IDs are restored via sessionStorage, which contains only run IDs.

## Transport contract

API base `/api`: GET `/meta`, GET `/capabilities` => `{ capabilities }`, POST `/runs` `{input,context:{ticketId}}` with Idempotency-Key, GET `/runs/:runId`, POST `/runs/:runId/approval` `{approvalId,decision,expectedHash}`, POST `/runs/:runId/cancel` `{}`. Error envelope `{error:{code,message}}`. RunView is structurally compatible with governed runtime; UI owns no runtime state transitions.

Console: `node node_modules/vite/bin/vite.js apps/console --config apps/console/vite.config.ts`; local loopback only, port 5173, `/api` proxy defaults to loopback 4310. Build after root TS build: `node node_modules/vite/bin/vite.js build apps/console --config apps/console/vite.config.ts`.

## UI reuse and evidence

Reviewed existing research's actual assistant-ui and CopilotKit demo observations, plus official [assistant-ui tool UI](https://www.assistant-ui.com/docs/tools), [custom runtime](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime), and [CopilotKit human-in-the-loop](https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop). Their context/tool/approval presentation patterns inform this slice. Neither library's client tool callback becomes an authority boundary. This slice reuses Radix accessible tabs rather than bringing a second chat runtime around the governed server. Radix dependencies retain upstream MIT licenses in the installation; no upstream code or branding/assets copied. Assistant-ui vs CopilotKit full runtime PoC remains unqualified, not claimed as integrated.

## Verification

`npm run check`: source hygiene, strict TypeScript, mounted React/jsdom and SDK transport tests. Covers preview before confirmation, bound digest, denial, double click, stale context, unknown outcomes, expiry and uncertain submission retry. Contract fixtures in UI tests are mocks, not proof of backend integration. Console Vite production bundle succeeds; Radix `use client` directive warnings are non-fatal in this client-only app. Parent owns browser pixels, real API wiring, server identity and runtime/host integration qualification. No screenshots or live-provider quality claimed here.

## Controlled UI reuse refinement

Second slice uses actual audited Kokonut free AI Input Search / resize hook and Status Island source, commit `590ded728c3414f871607a5d0662f9e70941d054`. See `packages/ui/THIRD_PARTY_NOTICES.md`, pristine source hashes and complete MIT license. No new dependencies, framework migration, React Bits shaders, copied business code, fabricated model options, progress timers or completion animations. Existing Radix tabs retained.

Composer now has a framed context band, bounded auto-resizing field, persistent safety hint, and Chinese IME-safe Ctrl/Command-Enter shortcut. Status island exposes only server run ID/status/event and receipt counts, supports touch outside-dismiss and Escape focus return. Approval is a separate, persistent structured parameter card with exact hash/operation details, never an island action. Console typography, separators, evidence cards and responsive layout use the same scoped AE token palette. Reduced motion disables all component animations; no approval animation exists.

Mounted interaction/source-integrity and build checks are evidence of code behavior only. No browser pixel/360px/200%-zoom acceptance or visual quality claim; authorized browser route remains pending.

## Configuration tab integration

`@ae/ui` exports ConfigurationPanel, createConfigurationClient and their public types. AgenticMount memoizes the runtime and configuration clients; both embedded host and standalone console now show the same Configuration tab against `/api/configuration`. Save, validation changes, publish acknowledgement and history come from the service. Publishing refreshes server metadata/capabilities but does not clear or repin an existing run.

An optional opaque `sessionKey` on AgenticMount is a host lifecycle boundary, not a credential or privilege signal and is never transmitted. The host must change it when authenticated user/tenant/session changes; that remounts the surface, clears old forms/pending state and separates stored run IDs. Default `fixture` is appropriate only for the current server-owned synthetic test identity. If passing custom configurationClient/runtime client, replace the instances on identity changes as well. Backend authentication/authorization remains mandatory. ConfigurationPanel discards old async responses after client replacement and removes mutation controls on authentication/permission denial.

Scoped form, capability checkbox, bounds, validation-diff and release-history styling shares the existing AE token system. This is not a model provider settings UI: the explicit memory fixture/subagent simulation notice remains. Mounted tests cover real control-plane operations and separate injected contract mocks, including keyboard navigation, publish rejection, load denial and stale identity responses. Browser visual acceptance remains a separate gate.
