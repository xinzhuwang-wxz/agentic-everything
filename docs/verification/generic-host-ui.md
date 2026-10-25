# Domain-neutral mounted host seam

## Contract and limits

The browser SDK and both UI presentations accept an `AeReferenceContext`: a plain map of up to 16 reference identifiers. Keys are bounded to 64 identifier characters and values to 200 non-whitespace, non-control characters; serialized references remain within 4096 characters. This is not an arbitrary JSON business-payload API. Nested records, arrays, prose payloads, credential-like keys and oversized references are rejected before transport. Browser identity fields are excluded by the SDK; the HTTP admission boundary rejects them. References remain untrusted hints, never authorization.

The host may supply a display-only `contextLabel` and `suggestions` with a label and input. These render through the existing React/Kokonut components and are never inserted into request context or browser storage. Choosing a suggestion only fills the controlled composer. Hosts without suggestions receive domain-neutral defaults. The legacy ticket mount/direct-panel context retains its fixture suggestions and recovery behavior. The optional console accepts the same host mount props; its default remains the explicitly synthetic helpdesk preview.

Generic mounts use Web Crypto SHA-256 over a canonical API/session/reference tuple for both one-shot and conversation recovery namespaces. They wait for that scope before mounting or connecting, and fail closed if hashing is unavailable. Labels, suggestions and object property order do not rotate a scope. Explicit `sessionKey` rotation is still mandatory when the host's authenticated user, tenant or session changes. It is not automatic cookie/session detection. A context/scope switch removes the old view immediately; delayed old responses cannot rehydrate the new view. The legacy ticket alias retains existing keys so previously journaled fixture runs remain recoverable. No new transcript, approval, authority or result fields were added to either journal.

`createApi` admits the same bounded references on one-shot and conversation routes. Its runtime port is now domain-neutral. The optional legacy `ticketReader` retains the original business read route, with backwards-compatible detection of an existing `broker.host.read`. **Non-ticket hosts with any `broker.host.read` method must explicitly pass `ticketReader: false`.** This compatibility detection does not infer the method's business domain. The opt-out removes the legacy route without calling the unrelated method. Generic hosts are not required to fabricate ticket methods. Business data access, current rights, exact approval binding and operation receipt ownership remain unchanged.

## Concrete non-ticket integration

`fixtures/inventory-ui` mounts the same SDK, draggable assistant, administration tabs and in-chat approval over `PythonInventoryHost` / `ToolBroker` / `GovernedRuntime` through the actual generic Hono HTTP API. It passes `{sku: "desk-01"}`, not a ticket alias. A deterministic test model reads stock then proposes a three-desk reservation; the original Python/SQLite host independently validates identity, current rights, version and exact operation ID. A confirmed receipt refreshes the original stock view.

The test harness uses a disposable copy of the original Python fixture and the existing reviewed adapter template. It does not change original business files or baseline hashes and does not extend the headless transformation recipe's acceptance scope. The API/runtime remain the existing bounded memory fixture. This browser test does not qualify PostgreSQL history for inventory, production SSO, arbitrary host adaptation, paid model quality or deployment.

## Reproducible checks

- `npm run build`: strict project compile and package export preparation.
- `node --test --test-concurrency=1 dist/packages/ui/test/*.test.js dist/packages/host-sdk/test/*.test.js dist/apps/api/test/*.test.js`: mounted lifecycle, recovery, presentation and existing HTTP regression gates, plus actual Python inventory HTTP approval/identity/reference-boundary tests.
- `AE_BROWSER_EXECUTABLE=/path/to/qualified/chromium node tests/browser/inventory.mjs`: actual mounted inventory browser journey, screenshots and JSON evidence in the printed temporary directory. Chromium sandbox is enabled. Requests are restricted to the one synthetic loopback UI origin, service workers and WebSockets are blocked, and owned HTTP/Vite/browser processes close in `finally`.

## Recorded local results

On 2026-10-25, the full strict TypeScript compile plus package export preparation passed. The focused UI/SDK/API regression command passed 98/98 tests. An actual mounted JSDOM → SDK → HTTP → Python/SQLite test passed independently (1/1), including approval continuity through administration and remount, one reservation, one host refresh, and no raw reference/session/content storage; its final strict compilation is included in the assembled project gate.

The inventory Vite build and sandbox-enabled Chromium headless-shell run passed all six browser journey groups: one real Python/SQLite reservation (stock 12 → 9, version 2), one HTTP start, zero page errors and zero external requests. At 360px, the dialog has an actual scroll viewport (548px client height, 1466px scroll height), no descendant at a point below its bounds, and a fully visible focusable composer after scrolling. Viewport screenshots confirm receipt containment. The outline below the non-modal overlay is the underlying host stock card, not a leaking receipt.

The fixture-specific opt-out test also verifies that `ticketReader: false` returns 404 for the legacy route without dispatching an unrelated host `read` method. Evidence and inspected screenshots are retained under [qualification/generic-host-ui/evidence](../../qualification/generic-host-ui/evidence/verification.json). These local checks do not establish production authentication, provider quality, PostgreSQL inventory history or arbitrary-host acceptance.
