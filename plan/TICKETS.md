# AE implementation status

User-approved implementation continues across the three milestones in [the plan](../IMPLEMENTATION_PLAN.md). The fixed synthetic delivery profile is qualified; AE as a whole has not passed its milestone exit/release gates. No external-project case, website, AE account or AE service-key flow is part of this work.

| Ticket | Scope | Current state / evidence |
|---|---|---|
| AE-FOUNDATION | TS workspace, strict contracts, schema export and checks | Implemented; latest terminal-fix qualification passed 142 tests. [Delivery qualification](../docs/verification/delivery-qualification.md). |
| AE-TRANSFORM | Assessment, plan approval, isolated recipe and guarded revert | Qualified for the exact React/TypeScript helpdesk fixture. Generic manifest assessment is available; other stacks require tailored work. Pre-apply baseline archival remains an explicit milestone gap. [Current workflow](../skills/ae-adapt/SKILL.md). |
| AE-RUNTIME | Governed model/tool execution, approval and receipt recovery | Implemented memory path and opt-in PostgreSQL/DBOS path with bounded real-process qualification. Not production-qualified. [Runtime](../docs/RUNTIME_HANDOFF.md), [persistent adapter](../packages/runtime-adapters/db/README.md). |
| AE-SURFACE | Host management entry and floating assistant | Implemented and exercised through real synthetic browser journeys, including retained approval, host refresh, keyboard, touch and narrow layout. [Browser qualification](../docs/FLOATING_UI_VERIFICATION.md). |
| AE-MODEL-ACTOR | Independent dynamic actor behind the model port | Two bounded independent-actor scenarios qualified; deterministic simulation used by the repeatable delivery profile. Neither is real-provider quality/cost evidence. [Actor evidence](../docs/RUNTIME_HANDOFF.md#reproduction). |
| AE-CONTROL-BEHAVIOR | Immutable releases and default-OFF behavior choices | Implemented with bounded runtime, PostgreSQL and UI qualification. ON/OFF acceptance is separate from the fixed delivery profile. [Evidence](../docs/verification/behavior-improvements.md). |
| AE-MCP | Developer-agent toolkit | Read-only official SDK stdio integration qualified; authenticated remote MCP is not qualified. [Contract](../packages/mcp-server/README.md). |
| AE-DELIVERY | Same-run source/plan/approval/patch/evidence bundle | Qualified only for `react-helpdesk-synthetic-v1`; observed process exit/cleanup is mandatory. Unprofiled or missing-tool paths remain partial. [Contract](../docs/delivery.md). |
| AE-M1-EXIT | Whole first-milestone acceptance | Open: pre-apply baseline archival, remaining planned business coverage and final combined behavior/recovery/rollback acceptance. Component passes do not close this row. |
| AE-M2-CROSS-STACK | Repeatable second-stack adaptation and developer beta | Not qualified: second non-React/non-TS lifecycle, Java/Spring and remote MCP contract, installation/upgrade/uninstall evidence. |
| AE-M3-RELEASE | Operational release candidate | Not release-qualified: clean installation, upgrade/backup recovery, lifecycle/security/license/SBOM and applicable extension qualifications. |
| AE-EXTERNAL-CASES | Three distinct real open-source adaptations | Deferred until AE acceptance under plan §20.4. No selection, download, repository creation or publication started. |

See [acceptance status and remaining gates](../docs/acceptance-status.md). Status is tied to the named evidence scope, not a blanket claim that every planned feature works.
