# AE transformation first slice

## Implemented and checked

The non-agentized `fixtures/existing-react-helpdesk` is a plain React 19/TypeScript ticket page. The deterministic `@ae/transformation` package and `@ae/cli` share the foundation's strict assessment, plan, approval, patch and verification contracts. The compiler API checks an explicit JSX mount and exported domain functions. This is bounded evidence-based assessment, not AI semantic comprehension.

`npm run check` passed locally: source hygiene, strict typecheck, all 15 tests (6 foundation + 9 transformation). Tests observe actual source files, dirty-user-file preservation, isolate/apply/restore, stale approvals, output drift, unsupported framework, symlinks, malicious README, configured Git filters and tracked secret checkout exclusion. Git shell arguments are never derived from a model command. No repository scripts, dependency lifecycles, network fetches or paid model calls execute.

## API composition for the root integration

1. Copy the baseline fixture into a fresh temporary directory and initialize a local Git commit. `assessProject` requires an exact repository root, not a nested folder inside AE.
2. `assessment = assessProject(root)`; `plan = proposePlan(assessment)`; show `previewPatch(root, plan, assessment)` and `digest(plan)`.
3. After developer-host approval: `approval = approvePlan(plan, {approverId, authorizationRef})`.
4. `applied = applyApprovedPlan({sourceRoot: root, destination: siblingDirectory, assessment, plan, approval})`.
5. `verifyAdaptation(applied)` inspects static files; `revertAdaptation(applied)` restores original patch-owned files and retains the worktree.

The public local approval-record API does not validate that a reference identifies an actual user: the existing developer-agent host is the trust boundary, not a remote transformation service. Do not expose it unauthenticated on the runtime server. The exact plan and source hash evidence are checked; local artifacts are not cryptographically signed. On repeated apply the existing destination is rejected, so no duplicate import/mount is written. Verify or revert with the original artifact.

## Integration outputs

The patch inserts `<HelpdeskAgenticMount />` inside App's existing main and creates `src/ae/AgenticMount.tsx`, importing `AgenticMount` from `@ae/host-sdk` and styles from `@ae/ui/styles.css`. Props are `apiBase="/api"`, `ticketId="ticket-1"`. No browser credential, tenant authority or role is injected. Workspace resolution must supply these packages for the integrated demo; arbitrary customer installs are not silently modified or executed. The recipe does not change dependencies or lockfiles.

The baseline domain exports `readTicket(tenantId,ticketId)` and `changePriority(tenantId,ticketId,priority,expectedVersion)`. Ticket: `{id,tenantId,title,priority:'low'|'high',version}`. Records: ticket-1/tenant-a, ticket-2/tenant-b. Wrap these through the runtime worker's independent host authorization/idempotency port. The tiny fixture is not a production identity provider.

## Honest remaining gates

The static verification report deliberately leaves host typecheck/business tests, authenticated runtime and browser acceptance NOT RUN. Root integration must perform these against the generated tree and server, including original ticket rendering and runtime mutation/readback. Standalone fixture dependency installation, an arbitrary framework, database migration, real model quality, deployment and browser production identity are not supported by this recipe. No MCP transport is implemented yet; the CLI and direct API are executable.

CLI commands and the staged evidence/approval workflow are documented in `skills/ae-adapt/SKILL.md`. EAF proof-readiness/task concepts are attributed with the upstream MIT license, while AE method and code are independently authored. No upstream installer/prompt is executed.

## Runnable original host and refresh (integration revision)

The baseline now has `index.html`, `src/main.tsx`, `src/api.ts`, and Vite development/build entrypoints. Before adaptation it renders its ordinary HTTP ticket read from `/api/tickets/:id`, with loading/error/manual refresh. Domain mutations remain server-owned; the browser no longer creates a second in-memory ticket store. The generated mount passes a successful-run callback into the existing `refreshTicket` hook, re-reading the authoritative host endpoint rather than copying the model's result into business state. The unchanged host API/browser entry files are hash-bound assessment evidence. A trusted fixture test builds both original and transformed hosts with Vite; static customer verification still never runs project commands.

To run the generated tree with existing AE workspace dependencies, provide its reviewed workspace package resolution (for example a test-only node_modules link to the built workspace), start the existing loopback API and simulated actor, and run Vite with the generated root. Its proxy targets 127.0.0.1:4310 with changeOrigin enabled. The original fixture runs against the same server read endpoint before adaptation. Browser acceptance/readback is a separate root integration gate.

## Generic product boundary

Core assessment identity is now `project-*`, and bounded generic manifest observations cover JS/Node, Python, Java/Maven, Go and Rust without executing code or claiming semantic comprehension. The first recipe's ticket filenames, exported symbols, JSX structure, patch code and business goals live explicitly in `packages/transformation/src/recipes/react-helpdesk.ts`. No matching recipe yields L0 inspection and a request for tailored developer review, not a judgment that the software is un-agentizable. `existing-python-inventory` verifies this cross-domain boundary with unchanged source; it is not falsely labeled as an implemented Python integration.

## Bound optional business comparison

`expectedBaselineCodeHash(assessment, plan)` fingerprints assessed files and absent planned outputs; `adaptationCodeHash(root, assessment, plan)` fingerprints the actual candidate files. The optional async `verifyAdaptationWithBehavior(applied, {assessment,plan,baseline,adapter,provenance,configuration,improvements})` returns `{verification,differential}`. It binds the archived baseline to source commit/hash, binds the candidate configuration/hash to the actual worktree and recipe plan, rejects static drift, and then executes `compareBaseline` through a reviewed isolated/replay adapter. It does not promote an unattached generic report. Without this explicit harness call, business differential remains NOT RUN.

The committed test runs the actual original/generated ticket module public functions against the same reset seed, archives the baseline read-only, and writes full candidate observations/differences. Scenarios cover query, priority mutation and stale-version rejection. Canonical observations include business output, effects and version receipt; assistant wording and UI/protocol metadata are separate acceptance surfaces, not silently normalized away. This is finite domain-function evidence, not HTTP authorization, browser proof or full semantic equivalence. The developer host still must review that an adapter honestly executes the stated source in isolation: hashes cannot attest arbitrary harness code.
