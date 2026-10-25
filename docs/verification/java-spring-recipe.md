# Java/Spring Core recipe lifecycle qualification

Observed 2026-10-25 in the owned cloud worktree, implementation `d2db94b`.
The original M2 Java recipe gap is closed for the declared exact synthetic
Java 21 / Spring Core 6.2.19 stock-reservation fixture. It is not general Spring
Boot/MVC or arbitrary Java source-transformation qualification.

## Actual result

- Strict TypeScript build passed. Twelve focused tests passed, none skipped:
  eight new Java recipe/static/CLI/official-MCP tests plus four existing MCP
  protocol tests. Source hygiene and diff whitespace checks passed.
- Installed `java-spring-inventory@1.0.0` produced `agentic/AeHost.java` through
  the existing public CLI lifecycle: assess, plan, preview, approve, apply,
  verify, deliver, delivery-check, revert. The static verify intentionally
  returned exit 2 with execution gates not-run; explicit-profile deliver then
  completed all ten static/runtime/delivery gates and its bundle checked valid.
- The ordinary original repository had no AE adapter. Its real Spring-managed
  CLI black-box baseline was executed and archived before apply. All fourteen
  original-CLI versus generated-authenticated-adapter cases passed the shared
  comparison contract with improvements OFF. Original business source, CLI,
  manifest and README remained byte-identical.
- The single existing official Agents SDK runtime and existing Java host
  boundary passed fifteen assertions, including no preapproval write, current
  host revocation, exact host replay, real HTTP response loss after commit and
  receipt reconciliation without another write. The model was explicitly
  simulated. Final stock was seven, version three, after exactly two mutations.
- The unchanged CLI on the candidate preserved its business entry point,
  persisted a reservation, replayed the identical receipt in a fresh process,
  and denied viewer/cross-tenant operations. Revert removed the generated
  adapter without changing original files.
- Eight forged evidence variants were rejected. All owned Java/HTTP processes
  exited, ports were checked closed and temporary fixture state was removed.
  A final process inspection found no leftover owned Java fixture process.
- The end-to-end qualification took 43.6 seconds. The full repository suite
  was not run in this focused window; aggregate acceptance remains the root
  integration check rather than an implied pass here.

The first pre-apply attempt stopped at compilation: this installed Java 21
runtime includes `jdk.compiler` but lacks the `ct.sym` release table needed by
`--release`. The harness now verifies Java 21 and uses `-source 21 -target 21`
with `-proc:none`. The same compiler and eleven verified jars were reused, no
software was installed, and the complete rerun passed.

## Boundaries and evidence

[Machine-readable sanitized result](java-spring-recipe-evidence.json) records
commands, pins, case counts, assertions, source implementation commit, baseline
hash and delivery-manifest hash. [Reproduction](../../qualification/java-spring-recipe/README.md)
contains the fixed profile, observation/normalization contract, negative matrix,
upstream reuse/license record and artifact layout. Full bundles stay in the
ignored qualification output rather than source control.

This adds an actual installed transformation recipe, not only a catalog label or
manually preconnected adapter. Official MCP clients can plan, preview and
statically verify this recipe through the existing read-only toolkit; the MCP
surface cannot approve, apply or grant the execution profile. The recipe emits
byte-for-byte the independently qualified Java adapter and reuses the existing
host capability/runtime architecture, rather than adding a per-language agent
loop or moving Java business logic to TypeScript.

The qualified surface remains Spring Core IoC and JDK loopback HTTP with a
fictional local identity directory and single-writer atomic JSON persistence.
Production IAM/OAuth/TLS, Spring Boot/MVC, arbitrary application layouts,
Java-specific PostgreSQL/DBOS, real provider inference, power-loss durability and
production deployment remain outside this declared fixture. Authenticated
remote MCP interoperability and the earlier Java host-restart experiment retain
their separate existing qualification; this run does not invent new claims for
either.
