# Integrate without replacing the host

[← README](../README.md) · [Try the fixture first](getting-started.md)

## Two different integrations

**Development-time:** your coding agent reads the [AE Skill](../skills/ae-adapt/SKILL.md) and uses the local CLI to prepare a reviewed change. It remains responsible for source inspection, consent and evidence. The current recipe is deterministic and recognizes one explicit fixture layout. There is no MCP server to configure yet.

**Product runtime:** the adapted product mounts AE's UI, which talks to a server composed with host-approved business functions. Page context narrows a request; it is not a role, credential or permission grant.

## The current host contract

The [fixture](../fixtures/existing-react-helpdesk/src/tickets.ts) provides:

- `readTicket(tenantId, ticketId)`
- `changePriority(tenantId, ticketId, priority, expectedVersion)`

The [capability adapter](../packages/capabilities/src/index.ts) wraps those functions with current-principal, scope, tenant and version checks. A business write requires bound approval and produces an operation receipt. An unknown outcome is not permission to dispatch the write again.

The generated mount imports `AgenticMount` from `@ae/host-sdk` and `@ae/ui/styles.css`; it supplies `apiBase="/api"` and the current `ticketId`. See the [UI/SDK handoff](UI_SURFACES_HANDOFF.md) for component/transport contracts. These packages currently resolve inside the AE workspace; no public registry install is claimed. The recipe deliberately does not alter the customer's dependency manifest or lockfile.

## Explore the local Console

This is a developer qualification setup, not a turnkey live-model demo. First build AE with `npm run build`. A separately running model actor must service the file-IPC envelopes described in [runtime qualification](RUNTIME_HANDOFF.md#reproduction). The server does not launch that actor for you.

In one terminal, with a private absolute directory for that actor:

```bash
: "${AE_MODEL_IPC_DIR:?Set the private absolute IPC directory used by your actor}"
export AE_MODEL_IPC_DIR
node dist/apps/api/src/server.js
```

In a second terminal, at the AE root:

```bash
node node_modules/vite/bin/vite.js apps/console --config apps/console/vite.config.ts
```

Open `http://127.0.0.1:5173`. The API uses `127.0.0.1:4310`, and the Vite proxy preserves the expected loopback request setup. If either port is occupied, stop and coordinate the configuration rather than using someone else's running fixture. An absent actor times out safely; it does not become a fake successful model response.

To bundle the Console without launching a service:

```bash
node node_modules/vite/bin/vite.js build apps/console --config apps/console/vite.config.ts
```

The Console and embedded surface use the same components and API contract; the Console does not implement capability publishing or configuration management. Review [API routes and controls](../apps/api/README.md) before changing either entry point.

## Before a real product integration

The loopback server has a synthetic, server-owned editor identity. It is not production authentication. A real integration must supply a trusted host session resolver, qualify tenant/resource permissions and explicitly decide which actions may be offered.

Do not expose the fixture on a network. Production readiness also requires durable approval and operation ledgers, restart/recovery testing, a qualified model provider, real-host tests and browser acceptance. PostgreSQL/DBOS and other host stacks remain work to implement and qualify. The [plan](../IMPLEMENTATION_PLAN.md) describes that direction, not shipped features.

AE's TypeScript core does not require that the host be TypeScript. The intended boundary is an authorized host API or adapter; recipes and compatibility must be proven individually. Keep host identity, data ownership and business rules in place.
