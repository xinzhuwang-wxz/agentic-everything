# Bounded multi-turn assistant-ui qualification

A small non-production adapter evaluates the actual bounded `ConversationView` contract against the parent qualification's pinned `@assistant-ui/react@0.15.31`. No new package manifest, dependency installation or model runtime is introduced. The decision is [retain the existing presentation base](../../../docs/verification/assistant-ui-bounded-comparison.md).

## Reproduce

Prerequisites: Node 24, the repository's existing exact dependencies, and the parent `qualification/assistant-ui` package's exact dependencies. The candidate must reuse the repository's React and React DOM instances. The parent's documented `link-dependencies.mjs` establishes that identity; these scripts only verify it and never modify dependency trees.

Run from the repository root:

```
node qualification/assistant-ui/bounded/typecheck.mjs
node qualification/assistant-ui/bounded/build.mjs
node --test --test-concurrency=1 --import ./qualification/assistant-ui/bounded/network-guard.mjs qualification/assistant-ui/bounded/generated/qualification.test.js
```

`AE_ASSISTANT_UI_DEPS=/absolute/path/to/existing/qualification/node_modules` may select another existing copy of the same pinned candidate. Without it, the default is the parent qualification's `node_modules`. Set the variable for both checking and building. Root development tools and React always come from the current repository's `node_modules`; the scripts fail rather than silently using a second React instance. All paths are resolved from script locations, not the shell's current directory. Fresh generated bundles, compiler configuration, dependency identity and network logs go under ignored `generated/`, not recorded evidence.

The build is a focused Vite SSR test bundle. It does not run the root build, browser, database or model API.

## Recorded evidence

The original scratch execution passed 12/12 tests, strict TypeScript checking and focused bundling, with zero guarded network attempts. Exact original small logs, dependency metadata, inspected backend contract and source hashes are preserved in `evidence/`. Their absolute paths identify the original execution location, not a requirement for reproduction. Empty final build/typecheck logs mean those successful commands emitted no output.

The source adapter/test differ from those original hashed files only by replacing the contract's absolute import with a repository-relative import. Build/check/guard scripts were made portable during preservation. `evidence/preservation.json` identifies the transformation and hashes. The copied evidence does not by itself claim these relocated scripts were rerun; fresh verification is recorded separately if performed.

Tests exercise actual library runtime/message/composer primitives. Snapshot authorization and intent-journal semantics remain AE-owned; this suite does not replace backend or final integrated UI tests.
