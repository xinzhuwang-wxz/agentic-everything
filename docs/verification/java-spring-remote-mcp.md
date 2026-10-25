# Java/Spring Core adapter and authenticated remote MCP

## Qualified scope

On 2026-10-25 the bounded Java/Spring Core fixture passed real Java compilation,
official Agents SDK read/approval/write execution, current host authorization,
host idempotency, an actual HTTP response drop after commit, Java-process restart
and receipt reconciliation. The business source hash stayed unchanged. Its final
stock was 7 from an initial 12, version 3, with exactly two business mutations.
The restarted host observed **zero write requests** during reconciliation.

Spring Framework 6.2.19 actually creates and manages the business and identity
beans. JDK 21 provides only the HTTP transport and compiler. This is **Spring Core
host adapter contract qualification**, not Spring Boot/MVC qualification and not
an automatic Java transformation recipe. It preserves the Java business service
and uses AE's shared TypeScript host/broker/runtime boundary rather than a separate
Java AE implementation. The Python lifecycle remains the separately qualified
second-stack transformation, not evidence imported from this fixture.

The existing `asDurableHost`/`PersistentToolBroker` composition matches the memory
broker's catalog and prepared request. That is a durable-interface planning
contract test, **not Java-specific PostgreSQL or DBOS execution**. The agent model
is visibly simulated; there are no provider API calls or real-account credentials.

## Authenticated remote MCP subset

Actual official SDK 2.4 client/server traffic initializes, lists and calls a
read-only Java host capability over loopback HTTP. The qualified wire subset is
**2025-11-25 stateless Streamable HTTP**, served by the SDK's built-in legacy
stateless handler. It is not a custom JSON-RPC implementation. The same SDK handler
also supports its modern era, but that era is not claimed by these client tests.

The trusted server composition selects a fixed endpoint and supplies an ephemeral
token-to-identity resolver. Every request refreshes identity and host rights;
every actual call checks the current capability/resource authority again. Model
arguments do not carry identity, credentials, destination, or approvals. Only
read-risk capabilities are registered; effects remain in AE's approval flow.

The official client uses the explicit origin-bound fetch policy. It sends a token
only to the exact configured endpoint, rejects all redirects including same-origin
redirects, strips cookie/proxy credentials, does not perform OAuth discovery, and
preserves cancellation signals. HTTPS endpoints are structurally allowed but TLS,
OAuth, a production IdP, credential persistence/rotation, deployment and remote
network operation beyond loopback are not qualified.

Two focused real-HTTP tests passed with no skips. They cover wrong tokens, removed
tokens, removed MCP and host scopes, denied foreign resources, unavailable writes,
extra arguments, wrong endpoint/Host/Origin, both same-origin and cross-origin
redirect rejection, zero requests at the redirect target, and pre-aborted requests.
The joined Java harness additionally verifies that MCP is using the actual Java
business host rather than a TypeScript lookalike.

## Execution evidence and reproduction

Commands actually executed successfully on the final source:

```sh
npm run build
node --test dist/packages/mcp-server/test/remote.test.js
node qualification/java-spring/prepare.mjs
node qualification/java-spring/qualify.mjs
npm run lint
```

The [sanitized receipt](java-spring-remote-evidence.json) records the bounded
assertions and source/dependency digests. The [reproduction instructions](../../qualification/java-spring/README.md)
describe the separately pinned eleven official Maven Central artifacts. Root
integration still owns aggregate verification against the assembled release.

Earlier development failures were corrected and rerun: strict TypeScript required
JSON-value parsing at the dynamic SDK callback; the first HTTP attempt intentionally
configured a modern-only server but the selected SDK transport negotiated the
legacy era; a fixture role had to match the existing host's editor/viewer contract;
Java traps SIGTERM and exits 143; current scope revocation is surfaced by the
runtime as capability exclusion before execution. These failed attempts are not
counted as passed evidence. The final harness uses an actual HTTP socket loss,
not the earlier broker-only loss injector.

## Remaining limitations

- No production auth, persistent real credentials, public server, new fee, or
  provider inference was requested or used.
- Fixture file replacement proves process-restart recovery, not power-loss/fsync,
  multihost database transactions or a production database SLA.
- Cancellation is qualified before mutation dispatch and for an already aborted
  remote request. Cancelling an in-flight committed write cannot undo it; this
  fixture's safe path is unknown-outcome reconciliation, not rollback by retry.
- No Java AST recipe, Spring MVC routing, Spring Security configuration, Boot
  packaging or arbitrary enterprise-host compatibility is implied.
- The fixture is not an external-project showcase and does not expand M2 or
  redefine AE's whole-product acceptance.
