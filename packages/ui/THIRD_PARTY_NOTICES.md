# Kokonut UI free components

Copyright © 2025 kokonutUI. MIT. Full license: `vendor/kokonut/LICENSE`.

Immutable upstream commit: [590ded728c3414f871607a5d0662f9e70941d054](https://github.com/kokonut-labs/kokonutui/tree/590ded728c3414f871607a5d0662f9e70941d054).

- `components/kokonutui/ai-input-search.tsx`: source header author @kokonutui; adapted framed composer/field focus convenience and controlled textarea layout in `src/reuse/ai-input.tsx`.
- `hooks/use-auto-resize-textarea.ts`: unchanged hook body in `src/reuse/use-auto-resize-textarea.ts`.
- `components/kokonutui/status-island.tsx`: source header author @dorianbaffier; adapted disclosure, outside-pointer handling, Escape/focus handoff in `src/reuse/status-island.tsx`.

Pristine audited originals are retained as text in `vendor/kokonut`; SHA-256 manifest is exercised by a test. No CreatorDiscovery application code, data or styling was reused. Free repository only, not Kokonut Pro. No React Bits source incorporated.

Changes: removed all fabricated demo tasks/results, model/tool menus, attachment UI, timers, auto-dismiss, percentages and Motion/Tailwind dependencies. The runtime retains sole authority for status and approval. AE uses local scoped CSS and native SVG, controlled props, full run-status distinctions, Chinese IME-safe Ctrl/Command-Enter submission, and reduced-motion rules. Approval never moves or disappears based on animation or island dismissal. Both source packages and the console public output retain the complete MIT license. Radix/React dependency licenses remain part of those installed packages; this notice does not replace them.
