import { ConfigurationRequestSchema, ConfigurationReportSchema, CredentialStateSchema, type ConfigurationRequest, type ConfigurationReport, type CredentialKind, type CredentialState } from '@ae/contracts';

/** Trusted operator adapter. Check current status without returning credentials or provider error text. */
export type ConfigurationStatusChecker = (kind: CredentialKind) => Promise<CredentialState> | CredentialState;
export interface ConfigurationOptions {
  checkStatus?: ConfigurationStatusChecker;
  /** Operator-attested deployed configuration entry, never model/tool arguments. */
  verifiedConfigurationUrl?: { url: string; verified: true };
}
const instructions = 'No AE configuration website or credential-entry UI is deployed in this distribution. Do not paste keys into agent chat, CLI arguments, MCP inputs, task artifacts, or logs. Self-hosted integration uses the existing ModelProvider port (@ae/contracts) supplied by your trusted host; ask its operator to configure the provider in its own secure configuration flow and connect a current status checker. An AE cloud account is not required for self-hosted mode. Hosted-service credentials are separate and only relevant to an explicitly selected future hosted deployment. After configuration, recheck the same taskId and continue its original pending step. No real provider qualification has been run.';
function verifiedUrl(options: ConfigurationOptions): string | null {
  const entry = options.verifiedConfigurationUrl;
  if (!entry || entry.verified !== true) return null;
  try {
    const url = new URL(entry.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
/** One service for CLI, Skill and MCP. Never reads secrets, calls providers, or writes configuration. */
export class ConfigurationPreflight {
  constructor(private readonly options: ConfigurationOptions = {}) {}
  async check(input: ConfigurationRequest): Promise<ConfigurationReport> {
    // Do not expose schema exceptions containing caller input.
    const parsed = ConfigurationRequestSchema.safeParse(input);
    if (!parsed.success) throw new Error('Invalid configuration preflight request');
    const request = parsed.data;
    const kinds: CredentialKind[] = request.step === 'read_only' ? [] : request.mode === 'self_hosted' ? ['model_provider'] : ['model_provider', 'ae_hosted_service'];
    const checks: ConfigurationReport['checks'] = [];
    for (const kind of kinds) {
      let state: CredentialState = 'unverified';
      try {
        const result = CredentialStateSchema.safeParse(await this.options.checkStatus?.(kind));
        if (result.success) state = result.data;
      } catch { /* Never expose a provider error, response, or credential. */ }
      checks.push({ kind, state, reason: state === 'configured' ? 'verified' : state === 'unverified' ? 'verification_unavailable' : state });
    }
    const ready = checks.every(check => check.state === 'configured');
    return ConfigurationReportSchema.parse({ schemaVersion: '1', ...request,
      status: ready ? 'ready' : 'needs_configuration', checks,
      configuration: ready ? null : { url: verifiedUrl(this.options), instructions },
      resume: { taskId: request.taskId, action: 'recheck_same_task' }, providerQualification: 'not-run',
    });
  }
  /** Rechecks now, then resumes the caller-owned pending task; does not create a task or grant authority. */
  async continueTask<T>(request: ConfigurationRequest, resume: (taskId: string) => Promise<T>): Promise<{ preflight: ConfigurationReport; result?: T }> {
    const preflight = await this.check(request);
    if (preflight.status !== 'ready') return { preflight };
    return { preflight, result: await resume(preflight.taskId) };
  }
}
