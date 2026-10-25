# Bounded extension qualification

Scope: approved §15.3 automation, A2A declared subset, and mobile/miniprogram contract experiment. Base source: `a87fb89`. Date: 2026-10-25 UTC. Execution is local cloud fixture only, never the user's computer or a production service.

- BuildVerified: pass with `NODE_OPTIONS=--max-old-space-size=640 npm run build` (Node 24.19.0 / TypeScript 5.9.3).
- ContractVerified: pass, `NODE_OPTIONS=--max-old-space-size=384 node --test dist/packages/extensions/test/extensions.test.js`, 9/9 tests.
- RuntimeConnected and RecoveryAccepted for the declared local subset: pass, `bash tests/extensions/run-postgres.sh /tmp/ae-durability-pg/root/usr/lib/postgresql/17/bin 55519`. See `local-postgres.json` for actual assertions/versions.
- Mobile/miniprogram real target and platform deployment: not-run, explicitly unverified.
- Paid or real model qualification: not-run. The fixture model is simulated.
- Public/production deployment and real recurring automations: not-run, not authorized by this gate.
- Full combined release candidate regression is recorded in [core acceptance](../../docs/acceptance-status.md); focused extension checks do not substitute for it.

Reused pins: DBOS 5.3.0 (existing MIT dependency), official `@a2a-js/sdk` 1.3.0 (Apache-2.0, A2A protocol 1.0). SDK npm integrity observed: `sha512-OpK4nygUnLKlpTFZlM2IrYu7f3c/B7c4u4Z14+vgMq24lEINTVCxH/BqZx+GL92rNf7CoBL5oTP5UhNsl75yyg==`. SDK was installed in an isolated temporary dependency tree with lifecycle scripts disabled.

Protocol assertions distinguish the official client fallback from explicit streaming requests: streaming=false permits a non-streaming SendMessage fallback, while an explicit streaming wire request is rejected. The runtime repeats live resource-authorization reads during polling/recovery; qualification independently checks one governed operation, one tool receipt, two checkpointed model responses and zero mutations rather than equating all host reads with execution.

The local test command stops its DBOS workers, HTTP listener and PostgreSQL cluster even on failure. No schedule persists outside the disposable stopped cluster. Runtime logs remain in the printed private temporary evidence folder; only the compact synthetic summary is committed here.

Evidence scope: the revocation case checks a fresh replayed dispatch and an A2A read after current rights change. The separate crash/restart case checks durable recovery without that rights change. The evidence does not claim a combined second crash after revocation.
