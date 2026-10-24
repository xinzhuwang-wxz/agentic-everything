# Repository presentation patterns

Research date: 2026-10-24. Scope: official repository pages and source documents only. This is a presentation review, not a product comparison, install audit, demo execution or explanation of popularity. Moving `main` pages can change; GitHub directory rendering was incomplete, so no exhaustive tree inventory is claimed.

## DeerFlow

Its [README and root tree](https://github.com/bytedance/deer-flow) combine a short product definition, video/demo entry, language navigation, agent-oriented setup, a conventional quickstart and deeper architecture/features. The root separates backend, frontend, docs, examples, skills and tests. [Contributing](https://github.com/bytedance/deer-flow/blob/main/CONTRIBUTING.md) explains developer environments and verification; [security](https://github.com/bytedance/deer-flow/blob/main/SECURITY.md) has a reporting destination. Its [MIT license](https://github.com/bytedance/deer-flow/blob/main/LICENSE) names the rights holders. Demo links were observed, not exercised.

**AE decision:** make the first screen explain the outcome; place a visible try path before architecture; distinguish a coding-agent entry from terminal instructions; give contributors/security readers dedicated files. Use an original journey diagram now, not another project's video or branding. AE's current local fixture is the proof story, not an invented hosted demo.

## Agent-Reach

Its [README and root tree](https://github.com/Panniantong/Agent-Reach) lead with a practical user problem, a short agent-directed installation entry, concrete commands and a capability table with prerequisites/support levels. Management and troubleshooting are organized around user actions. The [install guide](https://github.com/Panniantong/Agent-Reach/blob/main/docs/install.md) is explicitly agent-readable and covers setup, updates and reporting. [Contributing](https://github.com/Panniantong/Agent-Reach/blob/main/CONTRIBUTING.md) describes a narrow extension contract and evidence for changes; [MIT licensing](https://github.com/Panniantong/Agent-Reach/blob/main/LICENSE) is explicit. Its community/contact links were observed, not joined.

**AE decision:** introduce AE through the developer agent people already use; explain the host problem before package names; publish a current-scope table; keep setup/troubleshooting near the first successful action. The extension unit for AE is a bounded recipe/host adapter with tests, not a platform channel. AE's own permission and security rules remain authoritative; no upstream installation instructions are adopted or executed.

## Implemented in this checkout

- `README.md`: promise → concrete before/after → agent prompt/terminal entry → scope → architecture → contribution/provenance.
- `docs/getting-started.md`: disposable fixture, exact CLI commands, explicit approval pause and guarded rollback.
- `docs/examples.md`: source-to-runtime evidence navigation instead of a marketing gallery.
- `docs/integrating.md`: separate development-time method from product-runtime composition; label actor setup and production gaps.
- `docs/README.zh-CN.md`: compact Chinese entry, not a second full manual to drift.
- `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`: useful local instructions without inventing a public repository or contact endpoint.
- `docs/assets/ae-journey.svg`: original, repository-local diagram with current/planned boundaries.

No third-party screenshots, illustrations, text blocks, badges or demo footage were copied. No installation or login was performed for either reference project. AE's presentation should grow with verified artifacts: record a real successful demo only after browser qualification; add hosted links only after publication is authorized and confirmed. Product readiness remains established by source/tests and explicit qualification, not repository decoration.
