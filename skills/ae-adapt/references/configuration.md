# Local configuration integration and limits

The repository currently exposes the `ModelProvider` port in `packages/contracts/src/runtime.ts`; the runtime accepts a host-provided implementation. There is no built-in credential store, provider settings form, or deployed AE configuration website. The existing simulated/file model adapter is not a real-key validator. Do not treat an environment variable's presence as a valid account or contact a paid provider for this preflight.

A trusted host with its own secure provider configuration can import `ConfigurationPreflight` from `@ae/transformation` and inject `checkStatus(kind)`, returning only `missing`, `invalid`, `configured`, or `unverified`. The adapter must check current status at each call, keep all credential material inside the trusted host, and return `unverified` when current validity cannot be established. Never pass secret values or raw provider errors through this callback. `configured` means the host's validator reports current usable configuration; it is not AE's live provider qualification.

```ts
import { ConfigurationPreflight } from '@ae/transformation';

const preflight = new ConfigurationPreflight({
  checkStatus: kind => trustedHost.readCurrentCredentialStatus(kind),
});
const report = await preflight.check({ taskId, mode: 'self_hosted', step: 'model' });
// Only a separately authorized pending step can be resumed:
await preflight.continueTask({ taskId, mode: 'self_hosted', step: 'model' },
  originalTaskId => trustedHost.resumeAuthorizedPendingStep(originalTaskId));
```

`trustedHost` above represents your existing host integration, not an AE shipped credential-management API. The helper does not persist tasks, schedule retries, prevent duplicate callback calls, or authorize execution. Keep the existing task ledger/idempotency and approvals. It rechecks status immediately before invoking the continuation with the same task ID. Never use a new task ID or replay completed effects to evade a blocked step.

For embedded MCP, `createAeMcpServer({ allowedRepoRoot, configuration: { checkStatus }, configurationMode: 'self_hosted' })` uses the same service. The default CLI and stdio launch do not load custom checker code or secret files; their model preflight remains unverified until a trusted host integration is supplied. All existing tools are static; they still work without any key.

Only after a configuration entry is actually deployed and its ownership verified may an operator inject `verifiedConfigurationUrl: { url, verified: true }` into the service/MCP launch options. It is never an MCP tool argument. HTTPS is required; userinfo, query strings, and fragments are rejected. The default is null. A supplied URL is an operator attestation, not a network verification performed by AE.

No keys are read/generated/stored here. No new AE account is needed for self-hosting. `hosted` is a future explicit mode with a separate `ae_hosted_service` check, not a claim of a deployed service. Real provider authentication, paid calls, quality, and cost qualification remain **not run**.
