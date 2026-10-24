# Trusted release snapshots

GovernedRuntime.start accepts an optional server-selected `release: AgentRelease` plus its matching `releaseId`.
A browser must never provide a release object or choose authority through configuration JSON. Release hash verification
proves content integrity, not publication provenance; API composition obtains it from the trusted control-plane store.

The runtime clones and verifies the snapshot, binds tenant/application, uses configured name/instructions, and bounds
turns/elapsed time by the tighter deployment/release setting. The agent SDK still owns the only loop. In-memory runs
without a release retain the explicit legacy fixture path, not a claim of production configuration persistence.

Every model request intersects its tool list with the pinned capability IDs, exact versions/binding hashes, and the
current broker catalog. The same check runs before tool invocation, approval creation and approval resume. The host
continues to authorize ordinary business actions independently. Publishing a write tool does not give a viewer write
rights; a read-only release cannot execute a forged model write call. Current registry disablement, binding drift or
revoked authenticated permissions take precedence over a previously pinned release.

Publishing a new configuration affects new runs. An existing paused run continues using its cloned original snapshot
and bound release ID, unless current host permissions or capability availability revoke the action. Caller mutations
of the original release object after start do not change the run. The runtime does not query a mutable active release
pointer during resume.

Focused checks: strict aggregate build and 13 official SDK/release tests passed. Covered read-only tool filtering,
forged writes, viewer permissions, hash/ID/tenant/application/version/binding tampering, new-publication isolation,
caller-snapshot mutation, revoked permissions, registry changes while awaiting approval or model output, turn bounds,
and the existing confirmed-write/reject/cancel/unknown-outcome lifecycle. One concurrent aggregate build was OS-killed;
rerunning with NODE_OPTIONS=--max-old-space-size=512 completed successfully.
