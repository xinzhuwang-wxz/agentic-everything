# Pinned upstream integrations

AE preserves each host's language, interface, identity and business data ownership. These recipes apply only to the exact reviewed upstream revision, not arbitrary applications in the same stack. Each final case is an independent repository with its original license and history.

| Host | Upstream revision | Integration | Authority and persistence |
| --- | --- | --- | --- |
| reveal.js 6.0.2 | `75dff6f515d2d08df0c32cf2b7328b89425c6f25` | `agentic/`: inspect slides and approve bounded plain-text changes without replacing the original deck/navigation | Local single-user authority, not IAM; SQLite overlay and durable operation receipts; pending in-memory approvals expire across restart |
| linkding 1.47.0 | `24b5ad6cc9bde497b5d1b1e86aed5a2fb7d25c2f` | Django-native assistant and AE runtime bridge: bookmark search and explicitly approved tag updates | Current authenticated user, host configuration and bookmark ownership; native atomic business write and durable receipt |
| Kanboard 1.2.56 | `e197e71af4ff9f371b931ab0338b2b41827e6394` | `plugins/AgenticEverything/`: read the selected task and approve assignee/status changes | Native project role, CSRF and current target eligibility under the SQLite write lock; durable host receipts |

## Verification boundaries

The reviewed profiles are `reveal-upstream-v1`, `linkding-upstream-v1` and `kanboard-upstream-v1`. Approval binds the exact upstream commit and recipe version. Each profile permits only its fixed temporary-worktree collector, loopback networking, zero paid-model cost, a 300-second total window and a 640 MiB Node heap. General command/network allowlists stay empty. Source manifests, candidate templates, evidence semantics and cleanup are checked separately.

The case collectors require their qualified local toolchains. In particular the Kanboard PHP/PHPUnit/Stopwatch hashes and browser paths describe the retained Linux qualification environment, not an automatic macOS qualification or a general PHP executor. Portable host setup is documented in each independent case repository. The public Linkding `.env.sample` is preserved only when its exact reviewed Git blob, regular-file mode and byte length match; real environment/credential files remain blocked.

Static verification reports execution gates as not-run until the authorized collector actually executes them. `deliver` and `delivery-check` establish complete status only for the exact named profile. Integrity hashes are not signatures and do not establish external approval authenticity.

Original/candidate behavior is compared on fixed real-host journeys with seeded local data. The Linkding profile runs 356 original local tests and a separate 20-test native security suite; the complete upstream suite with external URL dependencies is not qualified. Kanboard runs the scoped original/candidate 53 tests / 475 assertions; optional full-suite integrations are outside scope. Reveal preserves the original browser navigation and distribution; its independent original QUnit comparison retains the same four MathJax CDN failures rather than counting them as passes. Screenshots are retained evidence, not a claim of pixel-identical rendering.

All three reuse AE's `GovernedRuntime` and `ToolBroker`; none introduces a separate approval engine. Demonstration model behavior is explicitly deterministic. Real provider quality/cost, production identity/deployment, multiworker routing, arbitrary external effects and universal exactly-once behavior are not qualified by these cases.
