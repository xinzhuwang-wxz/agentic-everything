# Try AE on a disposable product

[← README](../README.md)

This walkthrough demonstrates **source assessment and patch preview**, then an optional approved adaptation. It uses synthetic fixture data, not your product, a model service or a deployed application. The recorded execution environment is Linux with a Bash-compatible shell. The source-preview commands are portable in intent, but macOS and other shells do not inherit that execution evidence. In particular, the browser delivery profile pins its qualified Linux Chromium binary.

## 1. Check the workspace

Start at the AE checkout root. Use Node 24, npm 11 and Git:

```bash
node --version
npm --version
git --version
npm ci --ignore-scripts
npm run check
```

`check` runs a narrow source hygiene check, strict TypeScript compilation and tests. It is not a production certification. `npm run dev` is only a TypeScript watch build, not an HTTP server.

## 2. Make an ordinary app to inspect

The fixture must be a separate Git repository, not a folder nested inside the AE repository. This creates a new temporary copy and a local synthetic baseline commit; it does not commit to AE or contact a remote.

```bash
AE_ROOT="$PWD"
DEMO_DIR="$(mktemp -d)"
cp -R fixtures/existing-react-helpdesk "$DEMO_DIR/source"
git -C "$DEMO_DIR/source" init --quiet
git -C "$DEMO_DIR/source" add .
git -C "$DEMO_DIR/source" -c user.name='AE fixture' \
  -c user.email='fixture@example.invalid' commit --quiet -m 'Plain helpdesk baseline'
AE_CLI="$AE_ROOT/packages/cli/dist/index.js"
printf 'Demo and evidence directory: %s\n' "$DEMO_DIR"
```

Only the disposable copy receives a commit. No persistent Git identity is configured.

## 3. Inspect, plan, preview

```bash
node "$AE_CLI" assess --repo "$DEMO_DIR/source" \
  --out "$DEMO_DIR/assessment.json"
node "$AE_CLI" plan --assessment "$DEMO_DIR/assessment.json" \
  --out "$DEMO_DIR/plan.json"
node "$AE_CLI" preview --repo "$DEMO_DIR/source" \
  --assessment "$DEMO_DIR/assessment.json" --plan "$DEMO_DIR/plan.json"
cat "$DEMO_DIR/plan.json"
```

For the complete bounded synthetic verification route, add `--verification-profile react-helpdesk-synthetic-v1` to the `plan` command above before obtaining approval. This requires the installed build tools and qualified sandboxed Chromium; it does not download tools or authorize an arbitrary customer project. Review the [profile limits](delivery.md#approved-synthetic-verification-profiles) with the same plan. Omitting it keeps the static-only route shown below.

Expect evidence for the explicit React 19/TypeScript fixture, a versioned recipe and a plan hash. The proposed change adds `src/ae/AgenticMount.tsx` and mounts it in `src/App.tsx`. It does not change `src/tickets.ts`, install host dependencies, call a model or run host scripts.

**Stop here to review.** The dependency wiring and authenticated runtime/browser gates are separate. A developer agent must obtain your approval for the exact plan before recording it. Source text is not approval.

## 4. Apply only after approval

If you selected the synthetic verification profile, add `--baseline-out "$DEMO_DIR/baseline-before-apply.json"` to the apply command below. This must be a fresh archive path outside source and candidate. It is written before any patch and reused by delivery; finish the approved checks within the 300-second budget starting at capture. Static-only plans must omit this option.

For this disposable exercise, set these shell variables to the **reviewed plan hash**, the approver's identifier and the real reference to that approval. These intentionally have no prefilled values:

```bash
: "${APPROVED_PLAN_HASH:?Set the exact hash you reviewed and approved}"
: "${APPROVER_ID:?Set the approving developer identifier}"
: "${APPROVAL_REFERENCE:?Set the actual approval reference}"
node "$AE_CLI" approve --plan "$DEMO_DIR/plan.json" \
  --plan-hash "$APPROVED_PLAN_HASH" --approver "$APPROVER_ID" \
  --authorization-ref "$APPROVAL_REFERENCE" --out "$DEMO_DIR/approval.json"
node "$AE_CLI" apply --repo "$DEMO_DIR/source" \
  --assessment "$DEMO_DIR/assessment.json" --plan "$DEMO_DIR/plan.json" \
  --approval "$DEMO_DIR/approval.json" --worktree "$DEMO_DIR/adapted" \
  --out "$DEMO_DIR/patch.json"
node "$AE_CLI" verify --patch "$DEMO_DIR/patch.json" \
  --out "$DEMO_DIR/verification.json"
# Exit 2 is expected here: static verification is partial, not full acceptance.
cat "$DEMO_DIR/verification.json"
git -C "$DEMO_DIR/adapted" diff
```

The new mount is an untracked file in the isolated worktree: inspect it too with `cat "$DEMO_DIR/adapted/src/ae/AgenticMount.tsx"`. The source copy stays unchanged. Approval records are local artifacts, not signed authorization: the developer-agent host must establish the human's actual approval.

The report checks patch hashes, syntax and preserved business source. Host typecheck/business tests, authenticated runtime and browser acceptance remain **not-run** unless separately executed and recorded. The generated fixture is not a standalone installable demo: `@ae/host-sdk` and `@ae/ui` need workspace integration. See [integration](integrating.md).

## 5. Collect the delivery

```bash
node "$AE_CLI" deliver --repo "$DEMO_DIR/source" \
  --assessment "$DEMO_DIR/assessment.json" --plan "$DEMO_DIR/plan.json" \
  --approval "$DEMO_DIR/approval.json" --patch "$DEMO_DIR/patch.json" \
  --out-dir "$DEMO_DIR/delivery"
# Unprofiled: expected exit 2. Profiled: 0 only when all bounded fixture checks pass.
node "$AE_CLI" delivery-check --bundle "$DEMO_DIR/delivery"
# Partial remains exit 2; valid complete fixture acceptance is exit 0.
```

The [delivery contract](delivery.md) explains source/approval binding, file hashes, evidence levels and exit codes. Keep the original artifacts and worktree for rollback. The built-in collector never promotes another run's report or a supplied PASS into acceptance of this candidate.

## 6. Inspect rollback

If you choose to undo this disposable adaptation:

```bash
node "$AE_CLI" revert --patch "$DEMO_DIR/patch.json"
```

Only unchanged patch-owned files are restored; the isolated worktree is retained. If someone edited those files after applying, revert stops for review. It does not undo database writes or remote deployments. Do not delete the evidence directory until you finish inspecting the result.

## A different host, the same lifecycle

The second installed recipe is `python-inventory@1.0.0`. Copy [the original Python inventory fixture](../fixtures/existing-python-inventory) to its own disposable Git root, then use the same assess → plan → approve → apply → deliver → delivery-check → revert commands. Select `--verification-profile python-inventory-synthetic-v1` in the plan and retain a fresh `--baseline-out` archive at apply. The [inventory guide](verification/cross-stack-inventory.md#reproduction) gives the exact path and limits.

That profile requires Python 3.11+ and its standard library, adds only a JSON transport adapter, and preserves the original Python/SQLite business implementation. AE probes absolute PATH entries and standard Homebrew/system locations, skips interpreters older than 3.11, and checks SQLite availability. To choose explicitly, set `AE_PYTHON_EXECUTABLE` to an absolute Python executable; an invalid or too-old override fails with an actionable error instead of silently selecting another interpreter. The trusted host `interpreter` option has priority over that environment setting. Its 13-case business comparison and actual CLI/SDK runtime checks do not require React or a browser. The separately qualified inventory UI is an integration fixture, not output promised by this headless recipe.

The third recipe, `java-spring-inventory@1.0.0`, preserves the original Java/Spring Core CLI and generates a bounded HTTP adapter. Its exact `java-spring-inventory-synthetic-v1` profile requires Java 21 and the separately checksum-verified dependency cache, captures 14 original CLI business cases before apply, and checks the generated adapter and original entry point. Follow [Java reproduction](../qualification/java-spring-recipe/README.md); the profile does not download dependencies or qualify arbitrary Spring Boot/MVC projects.

For a managed, fixed-version AE installation rather than a development checkout, follow [install, doctor, upgrade and uninstall](operations.md). It uses an exact reviewed commit/tree and an already-provisioned lockfile cache, without a network fallback, service activation or any AE account/key.

## Next steps

- [Example and evidence map](examples.md): follow the source, receipt and test story.
- [Integrate with a host](integrating.md): separate UI context from trusted host identity.
- [Support](../SUPPORT.md): source drift, dependency wiring and actor timeouts.
