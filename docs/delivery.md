# Inspectable adaptation delivery

AE is consumed by your existing developer agent. Give that agent your project and goal, review one consolidated source-bound plan, and receive the approved changes with evidence and a rollback path. The commands below are for the agent, not extra user approval steps.

## Produce and check a bundle

After assess → plan → human approval → apply, use the exact artifacts from that run:

```sh
node packages/cli/dist/index.js deliver \
  --repo /absolute/original/source \
  --assessment /workspace/assessment.json --plan /workspace/plan.json \
  --approval /workspace/approval.json --patch /workspace/patch.json \
  --out-dir /workspace/new-delivery
node packages/cli/dist/index.js delivery-check --bundle /workspace/new-delivery
```

Use a fresh output directory outside both original and adapted repositories. Creation refuses overwrite, source drift, mismatched authorization and unsafe paths. Keep the artifact inputs private: an approval reference can identify the developer host's actual conversation and must not be published indiscriminately.

The manifest binds the base commit, assessment, exact plan, approval scope, versioned recipe, applied changes and current source fingerprints. The bundle carries hashed artifact bytes and bounded patch/rollback material. It does not copy a whole repository or unrelated customer files. `delivery-check` validates the bundle's integrity and internal binding; it is not proof that the current host still matches it after further edits. Rerun delivery against the source and candidate for that observation.

A hash detects changes relative to the manifest. It is not a signature, a trusted timestamp or proof of the approver's identity. A privileged writer who replaces both content and hashes is outside this local trust model. The developer host must establish approval independently.

## Status and process exit code

- 0: all checks reported by a command pass. Assessment, planning and applying successfully do not imply product acceptance.
- 1: failed checks, invalid binding, unsafe inputs or malformed arguments. Inspect the report/error; do not continue as if successful.
- 2: partial verification or delivery, with required gates not-run/blocked. The artifact can still be inspected and delivered with those limitations.

Without a verification profile in the approved plan, `deliver` is a static evidence collector. The optional fixed synthetic profile can establish complete acceptance only for its named fixture and bounded gates, never for every AE feature or an arbitrary customer host. A valid partial bundle remains exit 2 when checked. `verify` also returns 2 for unrun required gates. Shell automation should explicitly handle 2, not blanket-ignore errors with `|| true`.

## Evidence levels, not a single green badge

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Fresh static verification | Patch bytes, TS/TSX syntax and retained business source for this adaptation | Host build, behavior, authentication, browser usability |
| Source-bound baseline/differential harness | Captured public observations for seeded cases and candidate hashes, with exact permitted differences | All inputs, unseen effects or production safety |
| Runtime/HTTP qualification | Actual exercised host authority, approval and receipt paths in the named fixture/environment | Real provider quality, all adapters or deployment readiness |
| Browser acceptance | Observed interactions with the tested UI/server/candidate | Another commit, host, browser or customer project |
| Historical qualification report | Bounded AE component capability at its recorded version | Acceptance of this newly transformed project |

No `--report`, `--passed` or arbitrary JSON import turns a gate green. Unprofiled delivery does not run user scripts, load an arbitrary adapter or call services. Profiled delivery runs only the fixed, reviewed synthetic harness after checking exact fixture/source hashes. Existing behavior integration (`verifyAdaptationWithBehavior`) executes a reviewed adapter, binds baseline/candidate/configuration hashes and retains raw observations; it requires independently authorized isolation and a truthful connection to the candidate. It is not an import-a-PASS API.

Unprofiled recipe approval excludes source execution, dependency installation, deployment and paid model calls. The versioned synthetic verification profile permits only its enumerated fixture checks, bounded temporary workspace and loopback services; it does not authorize general source execution. A developer's consolidated project plan must explicitly cover any actual harness execution and its environment before running it. Do not rewrite an approval after it was accepted, or copy a different run's green evidence into this bundle. Where execution is unavailable, deliver the exact not-run gate and the smallest remaining requirement.

## One approved synthetic verification profile

For an exact disposable copy of the included fixture, the developer agent can request a new plan with:

```sh
node packages/cli/dist/index.js plan --assessment /workspace/assessment.json \
  --verification-profile react-helpdesk-synthetic-v1 --out /workspace/plan.json
```

The profile is part of the displayed plan hash and the subsequent approval. It covers the fixed baseline/differential, host-build, runtime/HTTP and real-browser checks, synthetic data only, a 300-second execution cap, a 640 MiB compilation heap cap, no paid calls and no external network. Loopback HTTP is explicitly permitted. Exact fixture bytes and recipe outputs must match before execution; a similarly shaped customer project does not qualify.

Use the same approve/apply/deliver commands afterward. No second development approval is needed for these already approved checks. Old plans without the profile remain static; never retrofit permission into an old approval. The harness uses already installed dependencies and an explicitly qualified sandboxed Chromium, never downloads tools. Missing prerequisites or unrun gates remain partial; observed failures remain failed. Evidence distinguishes deterministic simulated model behavior from real model quality.

## Available qualification and its scope

- [Source-bound behavior integration test](../packages/transformation/test/behavior.test.ts): actual original/generated synthetic business module, seeded read/write/stale-version cases.
- [Behavior archive and negative controls](handoff/behavior-verification.md): retained observations and deliberately failing controls, not external customer examples.
- [Persistent runtime](PERSISTENT_RUNTIME_QUALIFICATION.md) and [runtime handoff](RUNTIME_HANDOFF.md): opt-in local PostgreSQL/DBOS and runtime evidence, separate from default memory mode.
- [Floating browser journey](FLOATING_UI_VERIFICATION.md) and [behavior management journey](verification/behavior-improvements.md): bounded UI evidence; follow the exact versions and limitations in each report.

These sources are evidence references, not imported approval or PASS assertions. The three planned external open-source adaptations have not been performed and are not represented by synthetic fixtures.

## Rollback and unsupported projects

`ae revert --patch patch.json` restores only patch-owned files whose post-apply hashes still match. Retain the original applied artifact and its worktree. A portable bundle does not relocate the worktree or authorize writes to a new path. Source rollback does not undo data changes, deployments or external effects.

Generic assessment can identify manifests and source evidence outside the installed recipe. No installed recipe means no automatic apply. The developer agent can prepare a tailored implementation and test plan using the host's own stack and permissions. Until that integration is actually supported by AE's recipe/verifier, deliver its real diff and proof separately, label unsupported/not-run gates and do not fake a built-in success. See the [Skill](../skills/ae-adapt/SKILL.md).
