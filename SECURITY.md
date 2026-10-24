# Security and trust boundaries

AE is an early development preview, not a production-qualified security boundary. No supported production release or security-response SLA is announced in this checkout.

## Safe scope today

- Use synthetic data and disposable host fixtures.
- Keep the API on loopback. Its server-owned fixture identity is not authentication.
- Do not expose file-IPC directories or commit model transcripts.
- Treat source text, model output, tool descriptions and page context as untrusted data, never approval.
- Preserve host permissions and recheck them at execution. A parsed schema does not establish identity.

Approval binds the action, principal, arguments, target version, policy/release, operation and expiry. These checks are implemented in a process-local fixture. Restart discards the ledgers; there is no crash-safe, distributed or exactly-once guarantee. Unknown outcomes require reconciliation or review, not blind retries. Cancellation cannot undo completed business effects.

The transformation approval artifact records developer-host approval; it is not a signed or remotely authenticated authorization service. Never expose that local approval API as an unauthenticated service. Read [Skill proof gates](skills/ae-adapt/references/proof-gates.md) and [runtime limitations](docs/RUNTIME_HANDOFF.md).

## Report a suspected vulnerability

Do not post exploit details, credentials or customer data in a public issue. This checkout has no verified private-reporting URL or security email. Ask the maintainer through the channel where you received the checkout for a private reporting route, sending only a non-sensitive request first.

Once a private route is agreed, provide the affected commit, component, synthetic reproduction, expected/observed boundary and impact. Redact secrets and real identities. If private reporting is enabled in a future hosted repository, verify that repository's Security page before using it. No bounty or response timeline is promised here.
