# Release evidence map

The [core acceptance record](../acceptance-status.md) is the authoritative current
status. Its validated code is `942493175df0e183bc1e1d990db1a359671da50a`;
documentation-only updates do not change the qualified executable inputs.

## Evidence ownership

- Exact-source macOS clean/strict build, 325/325 tests and eight distribution
  cases close the assembled release gate. The source tree and receipt hash are
  recorded in the acceptance record.
- Real PostgreSQL operations, retention and workflow receipts at `ec84e21` cover
  inputs unchanged in the accepted source. Runtime/API/control-plane/extensions
  and corresponding integration harnesses have no diff over that interval.
- [Delivery](delivery-qualification.md), [joined release](joined-release-qualification.md),
  [conversation](conversation-ui.md), [inventory](cross-stack-inventory.md),
  [generic host UI](generic-host-ui.md), [Java recipe](java-spring-recipe.md),
  [remote MCP](java-spring-remote-mcp.md), [provider contract](second-provider-contract.md)
  and [extension](../../qualification/extensions/README.md) reports preserve their
  exact fixture/platform limits. A retained component receipt is not an assertion
  that every platform was rerun on the release date.
- Current supply-chain records are in
  `qualification/release-operations/current-release/`. Lock SHA-256:
  `762d169e68e916a31eefbf749a8a8173f1e78065b559e03931ea4dc0b80c22fd`.
  All manifest artifact hashes were verified against the accepted checkout.
- The cost comparison records scripted measured work, not human productivity.
  Optional knowledge and real mobile/provider/production claims remain excluded.

Release qualification requires a clean strict build; component or transpile-only checks do not substitute for it.
