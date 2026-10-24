# Black-box behavior verification: bounded implementation

## Delivered

`@ae/verification` captures an original public adapter's JSON input, seeded fixture state, output, declared observable side effects and receipt. The create-only baseline stores the raw observations, per-case hashes and hashed manifest with source/code/environment/data/schema/adapter provenance, coverage, unknowns and exact normalization declarations. Reads revalidate hashes; in-memory archives are deeply frozen. Files use exclusive creation and read-only permissions. This is tamper detection with a trusted manifest hash, not signed provenance, WORM storage or protection against a privileged actor replacing both payload and hash.

The generic engine is not tied to helpdesk or pagination. `PublicBehaviorAdapter.execute(test, enabled)` must expose the relevant external behavior and reset each isolated case to its seed. The engine passes cloned inputs and immutable flags; it does not instrument undisclosed effects or create an OS/network sandbox. Only isolated seeded fixtures or safe recorded replay are accepted. Never point both runs at production, replay payments/outreach, or copy real customer data into fixtures. Inputs must already be synthetic or appropriately sanitized. There is no automatic redaction promise.

`compareBaseline` binds baseline, candidate-code and improvement-registry hashes and requires matching data/environment/schema/adapter versions. Original and candidate source versions are separately recorded. Raw candidate observations and hashes remain in the result. Default empty enabled configuration requires exact legacy parity except predeclared scalar nondeterminism. ON requires every expected changed value to occur and rejects any other changed value, including in unaffected cases or declared side effects/receipts. Arrays retain order. The first slice's allowed improvements are exact JSON value replacements; absent-value additions/deletions are detected but are not approvable via an `undefined` wildcard.

## Improvements and central review

`Improvement` records ID/version, business-behavior category, reason, evidence, impact, `defaultEnabled: false`, reversibility and exact case/path/before/after deltas. `BehaviorConfiguration` binds versions and contains only explicitly enabled IDs plus reviewer and approval references. These references are evidence pointers supplied by the trusted caller, not an approval issuer or permission bypass. Models cannot infer approval from a green test or auto-convert unexpected differences to accepted changes. Gather discovered business improvements for central review; retain the immutable reviewed registry/configuration as evidence. The engine neither asks users repeatedly nor implements a production switch dashboard.

Security, authorization and data-corruption findings are not acceptable compatibility switches. The schema accepts only business-behavior improvements. Declared adapter `safetyFindings` fail closed before baseline/candidate execution and require appropriate intervention. This does not automatically discover or correctly classify unsafe legacy behavior. A trusted reviewer must not relabel unsafe behavior as an ordinary business improvement.

Normalization is baseline-bound, exact-path and scalar-only, with a reason and evidence. Missing paths, duplicate paths, subtrees and overlap with approved deltas fail. The engine cannot infer whether a scalar is truly nondeterministic: independent review must never classify business, authorization, security or data-integrity values as discardable nondeterminism.

## Actual evidence

`tests/differential/evidence/baseline.json` is an actual generated synthetic capture, not a template. The four adjacent comparison files retain configuration, full improvement metadata, candidate observations and results:

- `off-parity.json`: PASS, including legacy exact-end pagination behavior.
- `on-approved.json`: PASS, only the predeclared final-page `hasMore` correction.
- `off-unexpected-fix.json`: FAIL, intentional negative control proving OFF cannot silently fix the legacy behavior.
- `on-unexpected-side-effect.json`: FAIL, intentional negative control proving ON cannot allow unrelated writes.

No actual customer defect was discovered. The pagination `>=` boundary defect is deliberately synthetic. The three cases cover first page, exact-end page and beyond-end empty page. They do not cover all inputs, concurrency, a real host, transport, real permissions, inaccessible or uninstrumented effects. Finite passing cases are never a proof of complete equivalence.

## Commands and observed results (2026-10-24)

No packages were installed; an isolated package overlay reused foundation's existing dependency tree.

- `npm run build && node --test dist/tests/differential/*.test.js`: 9 differential test groups passed initially; the final suite adds a tenth committed-evidence check.
- `npm run check`: lint, strict typecheck and all 59 tests passed, including the existing bounded local HTTP/host tests; no persistent server was started.
- `node dist/tests/differential/capture-demo.js tests/differential/evidence`: wrote the persisted baseline plus two passes and two expected negative-control failures.

For another capture, build and supply a fresh local directory to `capture-demo.js`; it refuses to overwrite an existing directory/archive. The committed evidence retains its original environment and source information and is not silently updated on each test run.

## Integration boundary

`toVerificationCheck(report)` maps the result to the existing transformation `VerificationReport.checks` shape, including case counts, baseline/configuration hashes and unknowns. A report is trusted harness output, not signed attestation. Integration must bind it to the actual applied worktree/candidate and its captured baseline. A standalone synthetic report must not certify a different host transformation. Without a real authorized adapter execution, report the black-box gate as `not-run`, not green based on unchanged source hashes. The transformation owner controls this hook; no transformation source was edited here.

## Remaining qualification

Customer-specific adapters, broader corpus discovery, replay sanitization, trustworthy effect instrumentation, real sandboxing, externally verifiable approvals, baseline retention/signing and production configuration governance remain separate work. No database migration, real customer data, paid model call, persistent credentials or production action was performed.
