# Host UI and SDK contract

## Daily assistant and host management

Daily interaction uses a draggable circular launcher above the existing business page. Opening it shows the existing governed assistant in a non-modal conversation panel, not a new runtime or a separate required administration site. Configuration, capability permissions and execution records remain in the host's appropriate administration navigation. `apps/console` is an optional preview, not a required host replacement.

`AgenticMount` accepts `floating={{ applicationId, reservedAreas?, suspended?, layer? }}` and `managementVisible`. The host places this one mount at a stable page/shell location and drives `managementVisible` from its own navigation. With floating enabled the management tabs do not contain an Assistant tab. Without floating, the legacy inline presentation remains available for compatibility. New React helpdesk recipe output selects floating presentation, adds a host administration navigation toggle, and retains all original business content and refresh logic.

There is one `AgenticPanel` state owner. The floating shell only presents its existing conversation children through a body portal. Closing, dragging, or hiding the management section does not unmount the composer, approval or current run. Configuration uses the existing ConfigurationPanel/API and server-returned `canConfigure`; the launcher grants no administration or business authority. `onRunChange` preserves observable-run deduplication and current-context generation checks.

## Placement and accessibility

- 56px circular launcher, pointer capture for mouse/touch dragging, 6px movement threshold separating drag from click. Cancelled pointers never become open actions.
- Launcher focus: arrows move by 16px, Home resets position, Enter/Space opens. Close or Escape restores launcher focus. Nested status details handle their own Escape first. The conversation is explicitly non-modal and does not trap focus or block host pointer interactions outside its own rectangle.
- Position is stored as coordinates only under `ae:launcher:v1:<encoded applicationId>`. Supply a stable, nonempty namespace for each host application. No messages, business context, credentials or principal data are stored with position. Invalid or inaccessible storage falls back safely. Resize clamps the launcher and panel to the viewport; reset remains available in the panel.
- `reservedAreas` are host-owned viewport rectangles for critical controls/navigation. Placement chooses the nearest free candidate outside these rectangles. The host must keep at least one launcher-sized free region and update rectangles when its layout changes. This is not an automatic detector for arbitrary host business controls.
- The portal layer defaults to 40; the host owns its stacking scale and must place native/non-native modals above it. Pass `suspended=true` while a host modal owns interaction or the page must hide assistant UI; state is retained without cancelling work. Resuming a suspended open panel does not steal focus. A native top-layer modal also naturally sits above the portal. Do not use an unbounded maximum z-index.
- CSS is scoped to AE classes, with no global host reset. Reduced-motion disables component animation and transitions. The panel chooses a side or vertical region that does not overlap the launcher, so the launcher cannot cover confirmation controls.

## Identity and transport

`AgenticMount({ apiBase, ticketId, client?, title?, onRunChange?, configurationClient?, sessionKey?, floating?, managementVisible? })`. Explicit API base is required. Browser sends page context only; identity, tenant, scopes and approval authority remain server-owned.

Change the opaque `sessionKey` whenever authenticated user/tenant/session changes. This remounts all UI state and separates stored run IDs. The default `fixture` applies only to the current synthetic test identity, not production authentication. Replace injected runtime/configuration client instances at the same boundary. This is a lifecycle boundary, never an authorization grant.

API base `/api`: GET `/meta`, GET `/capabilities`, POST `/runs` with `{input,context:{ticketId}}` and Idempotency-Key, GET `/runs/:runId`, POST `/runs/:runId/approval` with `{approvalId,decision,expectedHash}`, and POST `/runs/:runId/cancel`. UI states follow server receipts; unknown outcomes block new execution and require reconciliation. Configuration uses the same backend state; publishing refreshes metadata/capabilities without changing an existing run's release.

Successful run IDs restore via sessionStorage and server GET. Uncertain starts retain idempotency keys only during the mounted client lifetime; full-reload recovery of a start without a returned run ID remains a qualification gap. No claim of production authentication or durability is made by the synthetic browser fixture.

## Reuse and verification

Radix accessible tabs, audited Kokonut-derived controlled input/status surfaces and the existing governed client remain in use. No second chat/runtime dependency was added. See `packages/ui/THIRD_PARTY_NOTICES.md` for pinned source and licenses.

Public mounted tests cover floating pointer thresholds/cancel, app-separated persistence, keyboard/focus, narrow resize, reserved rectangles, modal suspension and run continuity, plus existing approval, denied/unknown outcomes, stale identity/context, configuration and callback regression tests. Transformation tests build the real baseline and recipe-generated host and preserve original domain/API files.

`tests/browser/floating.mjs` generates a fresh synthetic host with the real transformation approval/apply flow, builds its recipe output, and uses sandboxed Chromium against the governed API with a deterministic test model. Set `AE_BROWSER_EXECUTABLE` to a previously qualified executable. `AE_BROWSER_RUNTIME_ROOT` optionally identifies an already-built checkout of the unchanged runtime; the report records that root explicitly. It tests original-page refresh, drag/reload, keyboard/Escape, management navigation without dropping approval, explicit write and host refresh exactly once, narrow layout and touch. Screenshots and JSON evidence are written to the printed temporary directory. This is local synthetic-browser coverage, not external-project or model-quality acceptance. All launched browser and HTTP servers close in `finally`.
