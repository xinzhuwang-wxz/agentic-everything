# Agentic Everything

### Give your product agentic capabilities. Keep what makes it yours.

**AE equips the developer agent you already use to adapt an existing product: inspect its code, propose a tailored integration, then deliver approved changes with evidence and a rollback path.**

Keep your product's language, business logic and permissions. Add an embedded assistant and governed actions, not another disconnected chatbot.

[Get started](docs/getting-started.md) · [See the first example](docs/examples.md) · [Integrate](docs/integrating.md) · [中文](docs/README.zh-CN.md) · [Contribute](CONTRIBUTING.md)

![AE journey: your developer agent uses AE to adapt an existing product, with reviewed changes and the host retaining authority.](docs/assets/ae-journey.svg)

> **Early development preview.** The executable starting point is one React/TypeScript helpdesk recipe, a governed runtime, a loopback API and shared UI surfaces. The local model path is explicitly simulated. Read-only MCP stdio tools and an opt-in PostgreSQL/DBOS runtime are implemented with bounded local qualification; production identity, scale and operations remain unqualified. [What works today →](#what-works-today)

## From an existing app to an agentic product

The first example begins with a plain ticket page, not a prebuilt AI demo.

| Before | AE's first slice | What stays yours |
| --- | --- | --- |
| React ticket page with ordinary domain functions | Inspect the known source layout and preview a two-file integration | The original language and app |
| No assistant or Agentic tab | Add a host-mounted surface in an isolated Git worktree | The original source worktree |
| Priority and assignee business functions | Route model-requested actions through host authorization and bound approval | The existing business function and resource version checks |
| No execution evidence | Show run events and operation receipts; stop on unknown outcomes | The host remains the authority |

The [fixture](fixtures/existing-react-helpdesk), [versioned recipe](recipes/react-helpdesk/1.1.0/recipe.json) and [tests](packages/transformation/test/transformation.test.ts) are in the repository. The current transformer recognizes that explicit layout; it does not claim general semantic understanding of arbitrary codebases. Helpdesk is a proving ground, not AE's industry boundary.

## Start with your own developer agent

Open this checkout in your existing developer agent and give it this prompt:

> Read skills/ae-adapt/SKILL.md and docs/getting-started.md. Try AE on a disposable copy of the included helpdesk fixture. Include the fixed synthetic verification profile in one plan. Show me the source assessment, proposed diff, plan hash, verification actions and limits before applying changes. After I approve, complete the permitted checks and deliver the inspectable bundle with its actual scope and status. Preserve the host stack and business rules. Do not deploy, use paid APIs or modify another project.

The Skill is available now as repository instructions. The broader integration design is **developer agent → AE Skill / read-only MCP toolkit → tailored product adaptation**. AE is not a replacement coding agent, and the local MCP toolkit is runnable after build; mutation authority stays with the developer host.

The intended interaction is one project request, one consolidated plan approval, then delivery. Your developer agent does the approved engineering and reports evidence or an exact blocker, rather than asking you to operate every command. New costs, credentials, deployment or expanded permissions still need the corresponding authorization. The installed recipe is deliberately narrow; generic assessment is useful outside it, but an unsupported project needs a reviewed tailored implementation, not a fake successful automatic adaptation.

### Or start in a terminal

From an existing checkout, with **Node 24, npm 11 and Git**:

```bash
npm ci --ignore-scripts
npm run check
```

No model key, account or database is needed for these local checks. Dependency download needs network access. Then follow the [copy-and-preview walkthrough](docs/getting-started.md): it keeps your source untouched and shows the exact patch before approval. There is no published npm install command in this preview.

## What works today

| Area | Current scope | Evidence / next step |
| --- | --- | --- |
| Adaptation | Skill, CLI, strict contracts, source-bound plan/approval, isolated patch, inspectable delivery bundle and guarded revert | [Try the fixture](docs/getting-started.md) · [Delivery contract](docs/delivery.md) |
| Runtime | One Agents JS loop, host authorization, bound approval and receipts; explicit memory or opt-in PostgreSQL/DBOS composition | [Runtime evidence](docs/RUNTIME_HANDOFF.md) · [Bounded persistence qualification](docs/PERSISTENT_RUNTIME_QUALIFICATION.md) |
| API | Hono loopback composition, server-owned fixture identity, strict requests and in-process idempotency | [API guide](apps/api/README.md) |
| Product surfaces | Embedded mount and standalone Console share components and the API contract | [Integration guide](docs/integrating.md) |
| MCP | Official SDK stdio server with launch-bound assess/plan/preview/verify/describe tools | [MCP setup](packages/mcp-server/README.md) |
| Model | Injectable model interface; independent file-IPC actor path labeled as simulation | [Qualification setup](docs/RUNTIME_HANDOFF.md#reproduction) |
| Not ready | Authenticated remote MCP, generic automatic recipes, production identity/operations, broad durability and load qualification, real-provider qualification and deployment | [Implementation plan](IMPLEMENTATION_PLAN.md) |

The fixed-fixture delivery milestone is not completion of all three AE milestones; see [remaining acceptance gates](docs/acceptance-status.md). Static patch verification, mocked UI tests, real HTTP tests and browser acceptance are different evidence. A passing unit suite does not turn an unrun gate green. The default in-memory fixture loses run/approval/operation state on restart; the opt-in persistent composition has a separate, bounded process-recovery qualification and requires the host receipt protocol. Do not deploy this fixture or put customer data into it.

## How the pieces fit

- **Adapt the product:** `skills/ae-adapt`, `packages/transformation` and `packages/cli` produce a reviewable change set rather than silently rewriting an app.
- **Govern the actions:** `packages/runtime-core`, `capabilities` and `policy` enforce the execution path. Model output and page context never grant authority.
- **Meet users in their product:** `packages/host-sdk` and `ui` mount the experience; `apps/console` offers a separate entry to the same backend.

AE is an independent product with a native TypeScript core. **Your host keeps its own technology stack.** Java, Python, Go, PHP, .NET and other hosts need separately implemented and qualified recipes/adapters; the current fixture is not a blanket support claim.

## Build with us

A useful contribution is a reproducible improvement: a new fixture, a failing permission/recovery test, a narrowly scoped recipe, or a clearer first-run experience. [Contributing](CONTRIBUTING.md) explains where to start and what evidence to include.

[Documentation index](docs/README.md) · [Troubleshooting and support](SUPPORT.md) · [Security boundaries](SECURITY.md)

## License and provenance

[MIT](LICENSE). AE preserves the EnterpriseAgentFramework attribution and license; see [NOTICE](NOTICE.md), [runtime provenance](packages/runtime-core/docs/PROVENANCE.md) and [Skill provenance](skills/ae-adapt/references/provenance.md). Third-party dependencies retain their own licenses. Repository presentation research is recorded [here](docs/research-repository-patterns.md); no upstream branding or demo assets are reused.
