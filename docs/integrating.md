# Integrate without replacing the host

[← README](../README.md) · [Try a disposable fixture](getting-started.md) · [Support matrix](support-matrix.md)

## Development toolkit and product runtime are different boundaries

Your existing developer agent reads the [AE Skill](../skills/ae-adapt/SKILL.md), inspects the host, and uses the shared CLI or [read-only MCP toolkit](../packages/mcp-server/README.md) to prepare one source-bound plan. After approval it carries out the covered isolated changes, verification, delivery and rollback preparation. Loading an MCP tool or reading a repository does not create mutation authority.

Three installed recipes recognize reviewed fixture layouts: `react-helpdesk@1.1.0`, `python-inventory@1.0.0` and `java-spring-inventory@1.0.0`. They preserve their original business source and share the same transformation contracts. For other layouts, prepare and verify a tailored integration rather than claiming an unsupported recipe succeeded. AE does not require an AE account, website or service key.

The adapted product uses the shared runtime, its host-approved capabilities and, when appropriate, the embedded UI. Page references narrow the requested context; they are not roles, credentials or permission grants. Headless hosts can use a CLI/API/MCP surface without adding an artificial browser page.

## Trusted host contract

The server-composed [trusted capability host](../packages/capabilities/src/host-boundary.ts) supplies:

- Strict reviewed capability schemas, risk/approval metadata and versioned catalog bindings.
- Current authenticated principal and capability/resource authorization.
- A bounded target/version/preview resolver, authorized reads and host-owned writes.
- Operation receipt lookup for uncertain outcomes, or an explicit unsupported/manual-review result.

AE keeps the single agent loop, exact approval binding/consumption, release intersection and unknown-outcome policy. The host keeps its identity system, business rules, transactions and database ownership. A write requires approval bound to the actual principal, capability, arguments, target/version, operation, release, policy and expiry. Current authority is checked again before execution. A timeout or lost response is not permission to repeat a business mutation.

[React helpdesk](verification/delivery-qualification.md), [Python inventory](verification/cross-stack-inventory.md) and [Java/Spring Core](verification/java-spring-recipe.md) exercise this boundary through their own lifecycle profiles and original business baselines. The Java profile generates the exact independently qualified adapter; it is not arbitrary Java discovery or Spring Boot/MVC integration. Do not copy the runtime or authorization implementation per host.

## Mount the daily assistant and administration view

`AgenticMount` from `@ae/host-sdk` and `@ae/ui/styles.css` provide the host-mounted surfaces. Use one of:

- `context: { sku: 'desk-01' }` or another bounded map of reference identifiers.
- The backwards-compatible `ticketId` alias for the helpdesk fixture, not both forms together.

Provide `apiBase`, a host-owned `sessionKey`, optional display-only `contextLabel`/`suggestions`, `floating` launcher options, `managementVisible` for the host's administration navigation, and `onRunChange` to refresh original business data after a confirmed receipt. The launcher is draggable and opens the daily conversation; business confirmation stays inside it. Administration tabs use the same configuration backend, not a second authority or a separate approval step for ordinary work.

References are untrusted flat identifiers: at most 16, bounded key/value sizes and 4096 serialized characters; nested payloads, credential-like keys and identity fields reject. Suggestions fill the composer only. Generic recovery journals use a Web Crypto digest of API/session/references; they do not store raw reference values or conversation text. Rotate `sessionKey` whenever the authenticated user, tenant or session changes. The component cannot infer a server-side identity change from cookies alone.

See the [actual inventory mount](../fixtures/inventory-ui/main.tsx), [generic UI contract and browser evidence](verification/generic-host-ui.md), and [conversation qualification](verification/conversation-ui.md). The optional inventory UI is a separately composed qualification fixture, not a browser output promised by its headless recipe. React UI packages currently resolve through the AE workspace; no public registry package is claimed. A non-React host needs a reviewed mounting/bridge integration, not a rewrite of its business language.

## Compose the HTTP API

`createApi` accepts the same shared runtime and trusted host boundary. Inject authentication through trusted server composition, never request JSON. For a generic non-ticket host set `ticketReader: false`, especially if the host has an unrelated `read` method: backwards compatibility otherwise detects that method as the legacy ticket reader. The actual generic inventory [HTTP composition](../tests/support/inventory-ui.ts) shows the explicit opt-out.

Use the existing [configuration routes](../apps/api/README.md#configuration-and-release-integration) for draft/validate/publish and [versioned transfer](operations.md#configuration-export-dry-run-and-import) for same-scope import/export. Publication creates an immutable release; new runs use the active release, while existing runs stay pinned and still obey current revocation.

The default development server uses a synthetic server-owned identity and memory state. It is not authentication and loses state at restart. The explicit `createPersistentApi` composition uses PostgreSQL/DBOS, a trusted durable host adapter, actual principal/admin callbacks and a published release. The [persistent API guide](../apps/api/README.md#explicit-persistent-composition), [recovery evidence](PERSISTENT_RUNTIME_QUALIFICATION.md) and [operations runbook](operations.md) state its qualified limits. No database, real identity or provider credential is inferred automatically.

## Deterministic business workflows

For a finite, reviewed business flow that does not need a model planner, `@ae/runtime-adapters/workflows` provides a trusted-server `WorkflowCatalog` and `DeterministicWorkflowRuntime`. Definitions pin ID/version/content hash and capability bindings, with sequential read/branch/approval/terminal-write/end nodes. DBOS remains the scheduler and the existing host broker retains authority, approval and receipt ownership. Read technical failures may retry within their declared bound; writes never automatically retry.

Use the [composition and recovery guide](verification/deterministic-workflows.md). This adapter is explicitly selected per worker and is not silently routed through the model-oriented HTTP API or a new end-user workflow editor. It introduces no arbitrary code evaluation, parallel graph or second scheduler.

## Explore the local Console

The optional Console is a preview of the same host SDK/components/configuration API. Its default helpdesk composition is synthetic, not a turnkey live-model service. Build with `npm run build`. A separately running actor must service the file-IPC model envelopes described in [runtime qualification](RUNTIME_HANDOFF.md#reproduction); the server does not launch it for you.

In one terminal, using the actor's private absolute directory:

```bash
: "${AE_MODEL_IPC_DIR:?Set the private absolute IPC directory used by your actor}"
export AE_MODEL_IPC_DIR
node dist/apps/api/src/server.js
```

In a second terminal:

```bash
node node_modules/vite/bin/vite.js apps/console --config apps/console/vite.config.ts
```

Open `http://127.0.0.1:5173`. The API uses `127.0.0.1:4310`; the Vite proxy preserves its loopback request boundary. If a port is occupied, coordinate configuration instead of attaching to an unknown service. An absent actor times out safely. To build without launching a service:

```bash
node node_modules/vite/bin/vite.js build apps/console --config apps/console/vite.config.ts
```

## Before using real data or deploying

Qualify the actual host authentication, current tenant/resource authority, capability scope, model endpoint, receipt/idempotency protocol, recovery, network policy and browser/platform integration. Review backup, retention, rate/budget and secret-rotation procedures against that environment. The existing synthetic receipts are useful regression evidence, not a production certificate or authorization to deploy.

The [support matrix](support-matrix.md) records what is implemented and tested; [acceptance status](acceptance-status.md) records the accepted core and its exact scope. No arbitrary-host claim, live-model quality claim or deployment is implied by a successful fixture.
