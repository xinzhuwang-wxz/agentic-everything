# Existing Spring Core inventory CLI

An ordinary fictional Java 21 / Spring Core 6.2.19 stock reservation application,
without AE, MCP, an agent SDK or generated integration. Inventory.java owns stock,
optimistic versions and atomic-file operation receipts. InventoryCli.java is the
original JSON batch CLI: it starts a real Spring GenericApplicationContext and
invokes the managed Inventory bean. A batch has subject, operation, arguments and
optional operationId fields. Local synthetic subjects are alice (operator), bob
(viewer) and mallory (another tenant); this is not production authentication.

Compile with the project's declared Spring and Jackson dependencies. The AE
qualification uses already verified jars from qualification/java-spring instead
of running Maven or downloading dependencies. Invoke InventoryCli with an owned
state-file path and supply a JSON array of commands on stdin. Read and reserve
operations preserve the existing business language, state and receipt ownership.
No AE adapter exists until the reviewed recipe adds agentic/AeHost.java.

This intentionally bounded CLI fixture does not represent Spring Boot or MVC,
real IAM, a database transaction, power-loss safety or concurrent multi-writer
persistence. Neither original nor transformed source is intended for production.
