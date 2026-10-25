# Reproduce Java/Spring and authenticated remote MCP qualification

Requirements: AE's exact npm lock, Node 24, Java 21 with `jdk.compiler` and
`jdk.httpserver`, and access to official Maven Central on the first preparation.
`javac` and Maven executables are not required: the installed JDK source launcher
runs `Compile.java`, which invokes the official compiler module. No software is
installed globally and no lifecycle script is enabled.

From the AE root:

```sh
npm ci --ignore-scripts
npm run build
node qualification/java-spring/prepare.mjs
node --test dist/packages/mcp-server/test/remote.test.js
node qualification/java-spring/qualify.mjs
```

`prepare.mjs` downloads only the exact Maven Central URLs in
`dependencies.lock.json`, denies redirects, verifies every pinned SHA-256 before
loading any jar, and compiles the two fixture sources. Subsequent runs can use the
verified cache without network. `--download-only` prepares artifacts without a
compiler process. The fixture-local dependency lock does not change AE's npm lock
or add a Java runtime requirement to normal AE installations.

The harness starts one loopback Java server with a 256 MiB heap, uses freshly
generated in-memory fixture tokens, then exercises read → proposal → approval →
write through the official Agents SDK and the shared trusted-host boundary. Its
180-second budget is bounded further by each host RPC's timeout. It restarts only
its own Java process and verifies the port is closed on cleanup. The final receipt
is written to ignored `evidence.json`; no tokens or customer data are recorded.

The HTTP fault is real: the fixture commits the stock adjustment and operation
receipt, then closes the socket before sending an HTTP response. AE must enter
`outcome-unknown`, not blindly retry. After Java restarts, receipt reconciliation
must return success with two total business mutations and zero new write dispatches
in the restarted host. Missing receipts remain unknown.

The same Java host is then exposed through the official MCP 2.4 SDK's stateless
Streamable HTTP adapter. The official client initializes, lists, and invokes the
read capability over real loopback HTTP. Current host scope revocation and token
revocation deny subsequent requests on that already connected client.

This is an explicit opt-in qualification, not an npm-test skip disguised as a pass.
Normal TypeScript tests include the lightweight remote HTTP security tests but do
not download jars or launch Java. Java-specific PostgreSQL/DBOS execution, Spring
Boot/MVC, production OAuth/IAM/TLS, arbitrary Java source transformation, provider
inference and mid-dispatch write cancellation are **not qualified** here. The
existing durable adapter's catalog/planning/approval contract is checked, with
database execution explicitly not claimed.

## Upstream reuse and provenance

- Spring Framework **6.2.19**, Apache-2.0: actual Spring IoC runtime, not a
  dependency-only assertion. [Official GenericApplicationContext API](https://docs.spring.io/spring-framework/docs/6.2.19/javadoc-api/org/springframework/context/support/GenericApplicationContext.html).
- Micrometer observation/commons **1.15.12**, Apache-2.0: the versions declared by
  Spring Context 6.2.19's published POM. No metrics exporter or paid service.
- Jackson core/databind **2.20.1**, annotations **2.20**, Apache-2.0: mature JSON
  parsing/serialization instead of a bespoke Java JSON protocol implementation.
- Official MCP client/server **2.4.0**, already in AE's npm lock: SDK handler,
  transport, validation and framing are reused. [Official SDK](https://github.com/modelcontextprotocol/typescript-sdk).
- Official Agents SDK **0.21.0** and the existing durable-host bridge: no second
  agent loop, scheduler or duplicated per-language approval implementation.

All eleven jar coordinates, official URLs and content hashes are in the fixture
lock. Initial retrieval compared Maven Central's published SHA-1 with each jar and
pinned a SHA-256 for reproducible later verification. That is artifact integrity
evidence, not a vulnerability scan or signed provenance attestation. No third-party
jar is committed. Redistribution must retain each upstream license/notice,
including Jackson's third-party notices; installed cached jars retain those
embedded files. Spring's official POMs identify its Apache-2.0 license.

The custom code is only the narrow business adapter, current-authority checks,
endpoint/credential policy and executable acceptance harness. HTTP/MCP framing,
JSON parsing, Spring lifecycle and agent orchestration use the mature components.
