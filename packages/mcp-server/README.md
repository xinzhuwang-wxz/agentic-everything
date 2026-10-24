# AE MCP developer toolkit

A real Model Context Protocol stdio server for an existing developer agent, backed by the same `@ae/transformation` methods and `@ae/contracts` used by the Skill/CLI. It is not another coding agent, runtime, or transformation pipeline. The external developer agent owns coding execution and user interaction.

## Run in an explicitly authorized development checkout

Use Node 24 and the repository's pinned dependencies:

```sh
npm ci --ignore-scripts
npm run build
AE_MCP_REPO_ROOT=/absolute/canonical/development/repository \
  node /absolute/path/to/agentic-everything/packages/mcp-server/dist/stdio.js
```

Configure an MCP host's stdio entry with `command: node`, that absolute script path as its sole `args` element, and `AE_MCP_REPO_ROOT` in its launch environment. The executable also exists at `dist/packages/mcp-server/src/stdio.js` after the root build. A workspace bin is declared as `ae-mcp`; this private workspace is not claimed to be published on npm.

The operator must explicitly authorize the checkout and configure the environment outside model tool arguments. Never point this server at production, a home directory, credentials, or a repository containing customer secrets. It does not discover projects or request expanding filesystem permissions. A client-provided roots list does not add authority. No HTTP port, account, key generation, network fetch, model provider, or paid call is involved. Protocol output alone goes to stdout; startup failures go to stderr without source or environment data.

## Tools

- `ae_describe {}`: actual support and safety boundaries.
- `ae_assess {}`: bounded static source assessment, including unknowns.
- `ae_plan {"recipeId":"react-helpdesk"}`: fresh assessment, proposed plan, canonical plan hash.
- `ae_preview {"recipeId":"react-helpdesk","planHash":"<returned hash>"}`: patch text without writes; rejects source/plan drift.
- `ae_verify {"patch":<PatchArtifact without worktree>,"businessHash":"<original business hash>"}`: shared static verifier against only the configured root. Copy the patch's fields but remove `worktree`; it is never accepted from a tool caller. Only the two registered recipe-owned paths in their canonical order are accepted.

All tools are read-only. Unknown arguments, arbitrary paths, worktree arguments, unknown recipes, and model-supplied `approval: true` are rejected. Source reads are limited and bounded by the shared transformation core. Symbolic links in source paths and root ancestry are rejected. The server rechecks its root at every filesystem operation. Do not concurrently replace checkout files while it runs: filesystem permissions and operator isolation, not MCP, are the security boundary against hostile local processes.

Verification checks hashes and TSX parseability, not authenticated provenance. Caller-supplied hashes are expectations, never authorization. Host typecheck, business tests, black-box business differential, authenticated runtime, and browser acceptance remain explicitly `not-run`. Static verification never claims that a behavioral differential was executed. A clean static result is not production readiness or a signed attestation.

`react-helpdesk@1.0.0` is the first qualified automatic recipe, not a domain or software-category boundary. AE targets source-to-agentic adaptation across software types. Unknown layouts receive an honest assessment; existing developer agents must research and implement custom adaptations separately rather than claim an unsupported recipe is automatic.

## Mutation boundary

There is deliberately no `approvePlan`, `ae_apply`, or `ae_revert` MCP tool. A model-callable boolean or generated approval record cannot create user authority. The trusted launch-scope/approved-artifact mutation integration is not implemented. Use the existing Skill/CLI workflow for separately authorized plan approval, isolated apply, verification and revert. Approval and destination must be established outside this read-only MCP surface; loading this server does not authorize writes, dependency installation, execution of customer code, deployment, or publication.

## Qualification and tests

```sh
npm run build
node --test dist/packages/mcp-server/test/protocol.test.js
```

Tests spawn the actual stdio process and use the official SDK Client for initialize, tools/list, and tools/call against temporary fictional Git repositories. They cover strict schema errors, unavailable mutation tools, unknown recipes, root/path and symlink rejection, plan drift, successful static checks, unapplied-patch failure, and explicit not-run checks. No live provider or customer repository is involved.

SDK qualification on 2026-10-24: `npm view @modelcontextprotocol/server version engines dependencies --json` and the equivalent client query returned **2.4.0**, Node >=20 and Zod ^4.2.0. Both are pinned to 2.4.0, matching AE's Node 24/Zod 4.6.7. The official SDK's current v2 line splits server and client packages; old v1 import paths are not used. Package metadata identifies Apache-2.0 licensing; upstream copyright and license files remain in installed distributions.

Official sources:
- https://github.com/modelcontextprotocol/typescript-sdk
- https://ts.sdk.modelcontextprotocol.io/v2/
- https://www.npmjs.com/package/@modelcontextprotocol/server
- https://www.npmjs.com/package/@modelcontextprotocol/client
