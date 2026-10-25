# Java/Spring Core transformation lifecycle qualification

This opt-in test closes the bounded Java recipe gate. It is not a Spring Boot/MVC
support claim or an arbitrary Java application source executor.

## Reproduce

Use Node 24, the exact AE npm lock, Java 21 with jdk.compiler and jdk.httpserver,
and the eleven checksum-matching jars in qualification/java-spring/.cache.
Dependencies are the same pinned Spring Core 6.2.19, Jackson 2.20.1/2.20 and
Micrometer 1.15.12 jars as the already-qualified Java host adapter. The existing
qualification/java-spring/prepare.mjs --download-only can prepare that cache from
its official Maven Central URLs when dependency retrieval is authorized. The
recipe itself never downloads dependencies, installs packages or runs Maven.

From the AE root:

```sh
npm run build
node --test dist/packages/transformation/test/java.test.js
node qualification/java-spring-recipe/qualify.mjs
```

The eight ordinary tests are static/lightweight and need no Java or jars. The
opt-in qualification executes the actual CLI commands assess → plan → preview →
approve → apply → verify → deliver → delivery-check → revert. The authorization
profile is java-spring-inventory-synthetic-v1. It permits only exact source bytes,
a temporary Git worktree, fixed compiler/CLI commands, localhost HTTP and a
five-minute total budget with no external services or paid model calls. The JDK
compiler heap is bounded at 256 MiB; host JVMs are 128 MiB, one at a time. The
source-launch compiler uses -proc:none and an explicit checksum-verified classpath.

It creates a fresh ordinary fixtures/existing-java-spring-inventory repository.
That source includes Inventory.java, its original InventoryCli.java entry point,
pom.xml and README.md. It has no AE integration. The recipe adds only
agentic/AeHost.java, byte-for-byte the separately qualified adapter, and does not
modify original Java business code, CLI, manifest, host database or permissions.
AE's existing JavaSpringInventoryHost, capability contracts, ToolBroker and
GovernedRuntime remain the only runtime and approval boundary.

## What is observed

Before any patch, the original Spring-managed CLI is compiled and executed for
fourteen fixed business cases. Its immutable BaselineArchive is bound to the
source commit, exact bytes, plan, approval, collector, Java/dependency provenance,
seed and case inventory. The generated candidate is then compiled and the same
cases run through its authenticated loopback adapter with the same reset state.
A shared ComparisonReport compares outputs and effects with improvements OFF.

Coverage includes read, stock reservation, overstock, stale version, tenant and
viewer denials, zero/overflow quantities, unexpected arguments, exact repeated
operation, argument conflict, receipt lookup, missing receipt and cross-tenant
receipt isolation. This is stock/order semantics, not copied ticket assertions.
Quantities, order IDs, versions, tenant/resource identity, mutation count and
receipt-key identity are never normalized.

Inventory generates random receipt UUIDs. Two exact scalar normalization paths
are declared in advance: receipt.generatedId and receipt.observedId. The raw IDs
are retained there, checked for UUID syntax, required to be equal when a receipt
is returned, and replay must return the identical receipt. Missing or additional
receipt values fail the fixed golden check, even though the generic comparator
normalizes these fields. No business subtree is removed to force parity.

The generated host is exercised through the existing official Agents SDK runtime
with an explicitly simulated model: read-before-proposal, zero preapproval writes,
approved mutation, duplicate approval rejection, exact host replay, least-rights
catalog, tenant/token/argument checks, host rights revoked before execution, real
HTTP response loss after commit and reconciliation without redispatch.
The unchanged original CLI then runs on the candidate, persists one reservation,
and reopens the state in a second process with exact receipt replay and denials.
Finally revert removes only the generated adapter; original sources remain equal.

Eight negative delivery evidence mutations must be rejected, including source
hash changes, incomplete cases, fabricated provenance, omitted mutations,
removed runtime assertions, unfinished process claims and changed replay IDs.
The normal tests cover approval absence, drift, dirty scope, idempotent refusal,
rollback edit preservation, unsupported frameworks, conflicting recipes and
symlink rejection. Static-only delivery stays partial and never claims execution.

## Artifacts and limits

The opt-in script writes .runtime/evidence.json and a complete immutable delivery
bundle under .runtime/delivery-<timestamp>. These generated/private paths are
ignored by Git. A small sanitized committed result may be recorded separately.
Toolchain hashes are integrity and provenance bindings, not signatures or proof
that an untrusted party really ran the process. Delivery verification checks the
recorded observations and claims against fixed semantics and current trusted code.

Only the declared Spring Core/JDK HTTP fixture is qualified. Arbitrary Spring
projects, Boot/MVC, real IAM/OAuth/TLS, Java-specific PostgreSQL/DBOS execution,
real model inference, power-loss or multi-writer file durability are not. The
separate Java/MCP qualification owns authenticated remote MCP interoperability
and its host-restart experiment; this recipe reuses that adapter but does not
claim to rerun a new Java-specific database or protocol matrix.

## Reuse record

The existing qualified Java adapter and business service are reused without
modification, as are the shared transformation lifecycle, BaselineArchive and
ComparisonReport, official Agents SDK 0.21.0, host capability boundary, Spring
GenericApplicationContext, Jackson JSON and the installed JDK compiler. Exact
pins/licenses are recorded in ../java-spring/dependencies.lock.json and its
README. No additional dependency or competing runtime is introduced. Custom
code is limited to the previously absent additive recipe, the original ordinary
CLI fixture, profile binding and executable finite acceptance harness.
