# Bounded extension qualification

Scope: approved §15.3 automation, A2A declared subset, and mobile/miniprogram contract experiment. Base source: `a87fb89`. Date: 2026-10-25 UTC. Execution is local cloud fixture only, never the user's computer or a production service.

- BuildVerified: pass with `NODE_OPTIONS=--max-old-space-size=640 npm run build` (Node 24.19.0 / TypeScript 5.9.3).
- ContractVerified: pass, `NODE_OPTIONS=--max-old-space-size=384 node --test dist/packages/extensions/test/extensions.test.js`, 9/9 tests.
- RuntimeConnected and RecoveryAccepted for the declared local subset: pass, `bash tests/extensions/run-postgres.sh /tmp/ae-durability-pg/root/usr/lib/postgresql/17/bin 55519`. See `local-postgres.json` for actual assertions/versions.
- Mobile/miniprogram real target and platform deployment: not-run, explicitly unverified.
- Paid or real model qualification: not-run. The fixture model is simulated.
- Public/production deployment and real recurring automations: not-run, not authorized by this gate.
- Full combined release candidate regression: the integration owner reruns it after combining this package and the approved dependency/lock update; focused extension checks are not a combined release pass.

Reused pins: DBOS 5.3.0 (existing MIT dependency), official `@a2a-js/sdk` 1.3.0 (Apache-2.0, A2A protocol 1.0). SDK npm integrity observed: `sha512-OpK4nygUnLKlpTFZlM2IrYu7f3c/B7c4u4Z14+vgMq24lEINTVCxH/BqZx+GL92rNf7CoBL5oTP5UhNsl75yyg==`. SDK was installed in an isolated temporary dependency tree with lifecycle scripts disabled. The shared root lock/dependencies were not changed by this workstream.

Observed corrections retained for audit:

1. Default build exited 137; a 384 MiB retry hit V8 heap exhaustion. A single bounded 640 MiB build passed. This is not recorded as a source or test pass for either failed attempt.
2. The official client's streaming convenience method intentionally falls back to non-streaming `SendMessage` when the card advertises streaming=false. The test now verifies that fallback and separately verifies rejection of an explicit streaming wire request.
3. An initial PG assertion equated every synthetic host read with an execution. The runtime intentionally repeats live resource authorization reads on polling/recovery. The corrected assertion independently checks one persisted governed operation, one tool receipt, two checkpointed model responses, and zero mutations. The successful report retains the actual live-read count rather than hiding it.

The local test command stops its DBOS workers, HTTP listener and PostgreSQL cluster even on failure. No schedule persists outside the disposable stopped cluster. Runtime logs remain in the printed private temporary evidence folder; only the compact synthetic summary is committed here.
