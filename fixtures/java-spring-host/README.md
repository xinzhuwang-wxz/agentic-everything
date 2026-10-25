# Java/Spring Core host contract fixture

This small, fictional stock-reservation service qualifies the Java/Spring **host
adapter contract**, not a Spring Boot/MVC deployment or automatic Java recipe.
It is not one of the three external-project showcases.

`Inventory.java` is ordinary Java business code. It owns stock, optimistic resource
versions, the operation-key ledger and its JSON state file. It does not import AE,
an agent SDK, MCP, or a workflow engine. `AeHost.java` is the explicit integration
seam. Spring Framework's real `GenericApplicationContext` constructs and manages
the business and current-identity beans; JDK `HttpServer` supplies the transport.
The qualification checks both the Spring version and that the invoked business
service is an actual managed bean. A JDK HTTP server alone is not counted as Spring.

AE remains TypeScript. `JavaSpringInventoryHost` implements the existing
`TrustedCapabilityHost`, so the same official Agents SDK runtime, approval ledger,
capability schemas and outcome-query rules govern the Java service. The existing
`asDurableHost` bridge remains the only durable adapter; there is no Java copy of
AE's scheduler, agent loop, or approval logic.

The host's bearer-to-principal map is fictional, ephemeral and supplied over stdin
by the qualification harness. A token is bound to one tenant/application/subject.
Claimed rights are intersected with current host rights, then checked again inside
the serialized host dispatch boundary. Tokens are not accepted in tool arguments,
saved to disk, printed, or reused for a real account. `/_fixture` is a separate,
harness-only control route with a different ephemeral token for fault injection
and scope changes. It is never a capability or MCP tool.

The business state and receipt are written together using an atomic file replace.
The fixture proves graceful Java-process restart recovery and actual lost-HTTP-
response reconciliation, not database transactions, multiple-writer access,
fsync/power-loss guarantees or production availability. Never expose this fixture
publicly or use its synthetic identity directory as production authentication.

See [reproduction and dependency provenance](../../qualification/java-spring/README.md)
and the [recorded qualification](../../docs/verification/java-spring-remote-mcp.md).
