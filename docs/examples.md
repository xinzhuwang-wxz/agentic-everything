# One example, end to end

[← README](../README.md) · [Run the source walkthrough](getting-started.md)

## Existing React helpdesk

**Before:** a plain ticket page and tenant-scoped domain functions, with no AE imports or assistant. [Read the input](../fixtures/existing-react-helpdesk).

**Transformation:** the `react-helpdesk@1.0.0` recipe records source hashes and proposes a host mount. After exact-plan approval, it edits a separate Git worktree. [Read the recipe](../recipes/react-helpdesk/1.0.0/recipe.json) and [inspect its tests](../packages/transformation/test/transformation.test.ts).

**After, in the integrated runtime:** a user can request a ticket inspection or priority change. Reads use the existing business function. A write pauses for an action preview and confirmation, rechecks host authority and target version, then returns a receipt. The UI shows the server result; it does not decide permission.

### Evidence to inspect

| Question | Where to look | What it does not prove |
| --- | --- | --- |
| Did AE really modify a non-agentized input? | [Transformation tests](../packages/transformation/test/transformation.test.ts) | Arbitrary framework support |
| Are original business files preserved? | Hash/syntax checks in the transformation verifier and tests | Host business tests or browser acceptance |
| Can the model approve its own write? | [Policy tests](../tests/runtime/policy.test.ts), [SDK tests](../tests/runtime/sdk.test.ts) | Production identity integration |
| Does the runtime use the original business functions? | [Runtime handoff](RUNTIME_HANDOFF.md), [API composition](../apps/api/src/server.ts) | Durable or distributed execution |
| Is a real HTTP route exercised? | [HTTP tests](../apps/api/test/http.test.ts) | Live-provider quality or rendered browser QA |
| Do UI controls handle unsafe states? | [Mounted UI tests](../packages/ui/test/panel.test.tsx), [transport tests](../packages/host-sdk/test/transport.test.ts) | Pixel/browser qualification |

The independent-actor qualification recorded in the [runtime handoff](RUNTIME_HANDOFF.md) includes a read → approval pause → confirmed write → receipt sequence: synthetic ticket priority `low/v1` became `high/v2`, one mutation was observed, and repeated approval was rejected. A separate read-only actor run observed zero mutations. These are local simulation results, not customer usage or production-model benchmarks.

## Add the next example

Start with a small, ordinary host that does **not** already contain AE. Document its language/framework, identity boundary, business API, safe read and approval-requiring write. Add a reproducible before/after diff plus negative tests and rollback evidence. Do not advertise a new supported stack on the strength of a screenshot or imported component alone. See [contribution criteria](../CONTRIBUTING.md).
