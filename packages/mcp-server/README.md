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
- `ae_plan {"recipeId":"react-helpdesk"}` (or `"python-inventory"`): fresh assessment, proposed plan, canonical plan hash.
- `ae_preview {"recipeId":"react-helpdesk","planHash":"<returned hash>"}`: patch text without writes; rejects source/plan drift.
- `ae_verify {"patch":<PatchArtifact without worktree>,"businessHash":"<original business hash>"}`: shared static verifier against only the configured root. Copy the patch's fields but remove `worktree`; it is never accepted from a tool caller. Only the selected installed recipe’s output paths in canonical order are accepted; the recipe must match the configured host.

All tools are read-only. Unknown arguments, arbitrary paths, worktree arguments, unknown recipes, and model-supplied `approval: true` are rejected. Source reads are limited and bounded by the shared transformation core. Symbolic links in source paths and root ancestry are rejected. The server rechecks its root at every filesystem operation. Do not concurrently replace checkout files while it runs: filesystem permissions and operator isolation, not MCP, are the security boundary against hostile local processes.

Verification checks hashes and TSX parseability or exact generated Python template bytes, not authenticated provenance. Caller-supplied hashes are expectations, never authorization. Host typecheck/compilation, business tests, black-box business differential, authenticated runtime, and the applicable browser or CLI acceptance remain explicitly `not-run`. Static verification never claims that a behavioral differential was executed. A clean static result is not production readiness or a signed attestation.

The installed bounded recipes are `react-helpdesk@1.1.0`, `python-inventory@1.0.0`, `java-spring-inventory@1.0.0`, `reveal-local@1.0.0`, `linkding-django@1.0.4` and `kanboard-upstream@1.0.4`. Description, planning, preview and verification obtain their current revisions and output paths from the same installed registry. A request naming another host’s recipe is rejected, not silently substituted. These fixtures are not domain or software-category boundaries. AE targets source-to-agentic adaptation across software types. Unknown layouts receive an honest assessment; existing developer agents must research and implement custom adaptations separately rather than claim an unsupported recipe is automatic.

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

## Separate authenticated host HTTP adapter

`createAuthenticatedHostMcp` composes a reviewed `TrustedCapabilityHost` with the
same official SDK's stateless HTTP handler. It does not change the filesystem-only
stdio tools above. Server composition supplies one exact `/mcp` endpoint and a
current token-to-principal resolver; model arguments supply neither. Only readable
host capabilities are exposed, with live identity/scope/resource checks on each
request and invocation. No write/approval endpoint is added to MCP.

For an official SDK client, pass `createOriginBoundMcpFetch(endpoint, tokenResolver)`
as its transport's fetch. This bounded policy denies all redirects and any other
origin/path before sending a bearer token. No OAuth discovery or persisted token
store is provided. Use production identity only through a separately reviewed
host-owned resolver, never this qualification's synthetic identity map.

Actual loopback tests qualify the 2025-11-25 stateless Streamable HTTP subset using
official client/server 2.4.0, including a real Java/Spring Core business read.
[Security, recovery evidence and exact exclusions](../../docs/verification/java-spring-remote-mcp.md).
The remote adapter is not public deployment or OAuth/IAM qualification.
