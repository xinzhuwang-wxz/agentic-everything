# Bounded direct integration versus AE execution costs

## Scope

This closes the measured modification/time/rework/defect comparison in
IMPLEMENTATION_PLAN §15.2 for the two existing synthetic fixture hosts. It does
not add a release threshold or promise a speedup. Both paths reuse the same
existing SDK/runtime and make the same intended host changes:

- React helpdesk: mount the shared assistant in the original page and refresh
  authoritative host data after a successful run.
- Python inventory: add the shared capability JSON CLI adapter without rewriting
  the inventory transaction implementation.

The direct arm is a **scripted direct-integration/manual-recipe proxy**, not a
human study. Its frozen reviewed Git patches copy already-developed recipe
output. Neither this arm nor the AE arm measures discovering the integration,
authoring adapters, learning the SDK, human review, or earlier implementation
work. Historical developer-hours, token usage and infrastructure spend remain
unknown. No hours saved or defect-rate estimate is inferred from line counts.

## Reproduction

From a matching isolated checkout with its pinned dependencies already available:

```sh
NODE_OPTIONS=--max-old-space-size=640 npm run build
node --max-old-space-size=640 scripts/adaptation-costs/measure.mjs --output /absolute/new/evidence-directory
node scripts/adaptation-costs/check.mjs /absolute/new/evidence-directory
```

The measurement refuses to overwrite earlier evidence. The React profile needs
the existing explicitly qualified Chromium binary; an unavailable binary remains
a failure/not-run, never a claimed pass. There are no installations, paid models,
external network requests, company systems, deployment, or PostgreSQL in this
experiment. The existing fixture profiles retain their own 300-second bounds;
these are not new acceptance thresholds.

The frozen patches are under `scripts/adaptation-costs/direct-patches/`. The direct
route uses `git apply --check` and `git apply`, not the AE recipe engine. The AE
route calls the real `assessProject`, `proposePlan`, `approvePlan`,
`applyApprovedPlanWithBaseline`, `verifyAdaptation`, `createDelivery` and
`checkDelivery` APIs. The approval record is for this authorized synthetic
experiment, not an assertion that human review took its measured API-call time.

One immutable original baseline is archived before either host candidate is
modified. Both acceptance runs consume that exact archive, including its original
observations, and its byte hash is rechecked after rollback. The two candidates
must be byte-identical before running the common fixture profile. Each retains
the original business implementation and all unmodified files. Full lifecycle
chain, observed patches, baseline, before/after build, business differential,
runtime, surface and process-cleanup evidence are retained, not replaced by a
summary PASS.

## Accounting and interpretation

There is one pair per fixture, with React then Python. Within each pair AE
archives/applies first, direct applies second, direct verification runs before AE
delivery, and both paths then run repeat guards and exact rollback. The order is
fixed and not randomized. Shared-machine scheduling and warm caches affect wall
time. These are actual process/stage observations, not statistical performance
estimates.

- Source setup and measurement/instrumentation overhead are reported separately.
- AE archive-and-apply includes the common original capture and worktree guards.
  The direct arm reuses that archive as measurement infrastructure. Its stage sum
  is not an independently complete compliance workflow, so sums are not used to
  calculate a speedup.
- Both arms execute the same business/build/runtime/surface profile. AE delivery
  additionally packages approval/plan/patch/rollback evidence and validates its
  hash chain. Evidence bytes therefore have intentionally different scopes.
- Repeat checks are expected rejections, not defects. Existing denied/replay/error
  cases inside the common profiles are acceptance coverage, not implementation
  failures. Unexpected failing gates are recorded separately and a failed run is
  preserved rather than overwritten.
- Corrective source edits and retry counts refer only to the measured pair.
  Zero observed failures cannot prove zero defects in all inputs or compare
  historical rework.
- Baseline hashes and receipt checks establish consistency, not signatures,
  trusted timestamps, or an independent witness of execution.

## Recorded result

One paired trial per host passed on 2026-10-25 against AE implementation commit
`7313ce040a1527059119cd0363e7a571ab33a6ee`. Node was 24.19.0, Python 3.12.14,
and Git 2.52.0. The strictly compiled implementation was unchanged by this work.
The full process exited zero in **43.558 seconds**; measured script execution was
43.467 seconds, including 0.352 seconds of measurement/unclassified overhead.

| Measured quantity | React direct scripted | React AE | Python direct scripted | Python AE |
| --- | ---: | ---: | ---: | ---: |
| Host files changed | 2 | 2 | 1 | 1 |
| Lines added / deleted | +14 / -1 | +14 / -1 | +71 / -0 | +71 / -0 |
| Copy pristine host, ms | 1.825 | Included below | 1.519 | Included below |
| Patch check/apply, ms | 5.712 | Included below | 4.440 | Included below |
| Assess + plan + synthetic approval, ms | Not performed | 39.931 | Not performed | 11.790 |
| Archive original + isolated apply, ms | Shared archive | 253.362 | Shared archive | 632.602 |
| Static verify, ms | Not separately performed | 6.454 | Not separately performed | 3.206 |
| Common acceptance / AE delivery, ms | 9330.142 | 9166.925 | 11748.583 | 11743.968 |
| Evidence check / delivery-check, ms | 9.369 | 14.892 | 35.784 | 50.617 |
| Repeat guard, ms | 4.240 | 1.130 | 4.172 | 0.612 |
| Exact rollback, ms | 4.248 | 3.895 | 2.979 | 2.955 |
| Recorded arm-stage sum, ms | 9355.536 | 9486.589 | 11797.477 | 12445.750 |
| Unexpected defects observed | 0 | 0 | 0 | 0 |
| Corrective source edits / retries | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

AE's recorded arm-stage sum was **higher for both hosts**, not lower. The sums
include different baseline, guard and packaging work, and this single pair does
not establish a meaningful performance difference. Patch execution took
milliseconds; the shared acceptance machinery dominated the measured time.
Original-source setup took 16.236 ms for React and 13.990 ms for Python and is
outside both arm sums. The actual commands and individual API-stage timings are
retained in the raw receipt.

### Observed acceptance and preservation

- React: both arms passed all six common profile gates, including 10/10 original
  versus candidate business observations, original/candidate strict TypeScript
  and Vite builds, authenticated loopback runtime writes and real sandboxed
  Chromium journeys. All seven browser assertions passed, with no page errors or
  external requests. Each browser harness exited zero, without signal, timeout or
  forced cleanup, and confirmed its owned process group was closed.
- Python: both arms passed all six common profile gates, including 13/13 business
  observations; original and candidate AST compilation and 25/25 host unittests
  each; the shared simulated-model runtime; and seven real JSON CLI subprocesses
  covering read, mutation, exact replay and forbidden requests. Its synchronous
  children completed with no outstanding owned processes. No browser or Python
  static typechecker is claimed.
- AE delivery was `complete` and `delivery-check` valid for both hosts, including
  12 React / 10 Python total lifecycle-plus-execution checks. Direct evidence uses
  the same six business profile gates without pretending to have AE's additional
  lifecycle chain.
- Both candidate file trees were byte-identical before acceptance; their business
  implementation was unchanged. Repeat patch/preview attempts were rejected
  without changing files. Both rollback paths restored exact original bytes.
  Original source Git status stayed clean; both read-only original archives
  remained unchanged and were reused without recapture.

### Evidence and preparation overhead

React direct harness evidence contains 7 files / 51,886 bytes, while its AE
delivery contains 17 files / 97,711 bytes. Python has 7 files / 30,367 bytes versus
15 files / 80,279 bytes. The shared pre-apply archives are 9,674 and 12,693 bytes.
The extra AE bytes include plan, approval, patch, rollback and patch-owned source;
these are different assurance scopes, not waste inferred from file count.

The isolated strict build completed once in 6.831 seconds, outside the paired
measurement. A first timing-wrapper attempt failed before invoking the build
because `/usr/bin/time` is absent; that log was retained and Python subprocess
timing was used instead. This was tooling preparation rework, not a hidden failed
host trial. No implementation or fixture fixes and no paired-trial reruns were
needed. Maximum reported child RSS was 806,328 KiB for the build and 552,536 KiB
for measurement; these are not aggregate concurrent RSS or an OS memory limit.

Machine-readable summary: [adaptation-cost-evidence.json](adaptation-cost-evidence.json).
Complete portable receipt: [adaptation-cost-evidence.tar.gz](adaptation-cost-evidence.tar.gz).
The archive contains the raw receipt and all 102 hash-bound files, including both
original baselines and all four arm evidence sets, with no Git internals or
generated builds. To inspect independently:

```sh
mkdir /tmp/ae-cost-receipt
tar -xzf docs/verification/adaptation-cost-evidence.tar.gz -C /tmp/ae-cost-receipt
node scripts/adaptation-costs/check.mjs /tmp/ae-cost-receipt/evidence
```

The offline checker passed all 102 files. Independent copies with an altered
patch, missing original archive, and inconsistent zero-defect claim were all
rejected. Node syntax checks, repository hygiene and whitespace checks passed.
The full aggregate runtime suite was not rerun for these artifact-only changes;
the strict build and both exact existing fixture profiles actually ran.

**Conclusion:** §15.2 now has an actual, repeatable direct-scripted versus AE
receipt for modification scope, elapsed execution, observed rework/defects and
evidence overhead on both existing stacks. Its narrow method and unknown human,
historical engineering, token and infrastructure costs remain explicit. This is
neither a new human-study gate nor a claim that AE saves developer time.
