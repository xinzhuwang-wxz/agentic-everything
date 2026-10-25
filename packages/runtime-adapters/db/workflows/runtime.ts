import { randomUUID } from 'node:crypto';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { type AgentRelease, type ApprovalDecision, type JsonObject, type Principal, type ToolResult } from '@ae/contracts';
import { digest, PolicyError } from '@ae/policy';
import { verifyRelease, releasedCatalog } from '@ae/control-plane';
import { abortable, PersistentToolBroker, validateHostResult } from '../broker.js';
import { durableAuthority, type DurableHost } from '../host-boundary.js';
import { PersistentStore, type PersistentLedgerView, type StoredRun } from '../store.js';
import { boundedJson, inputState, resolveArguments, resolveBinding, validateDefinition, WorkflowCatalog, type WorkflowNode, type WorkflowRevision, type WorkflowState } from './definition.js';

interface Snapshot { schemaVersion: '1'; revision: WorkflowRevision; state: WorkflowState }
export interface WorkflowRunView extends Omit<PersistentLedgerView, 'modelMode'> {
  modelMode: 'deterministic-workflow';
  workflow: { workflowId: string; version: number; contentHash: string; cursor: string; completed: string[] };
}
export interface WorkflowRuntimeOptions {
  databaseUrl: string; host: DurableHost; catalog: WorkflowCatalog;
  maxElapsedMs?: number; fault?: (point: string) => Promise<void>;
}
interface Start { principal: Principal; workflowId: string; version: number; input: JsonObject; release?: AgentRelease }
interface Phase { runId: string; phase: string; start?: { principal: Principal; snapshot: Snapshot; release?: AgentRelease }; principal?: Principal; decision?: ApprovalDecision }
type ActionNode = Extract<WorkflowNode, { kind: 'read' | 'write' }>;

/** Finite declarative business program on DBOS. No model, second scheduler, code evaluation or parallelism. */
export class DeterministicWorkflowRuntime {
  readonly store: PersistentStore;
  readonly broker: PersistentToolBroker;
  private readonly workflow: (phase: Phase) => Promise<void>;
  private readonly aborts = new Map<string, AbortController>();
  constructor(private readonly options: WorkflowRuntimeOptions) {
    if (options.maxElapsedMs !== undefined && (!Number.isInteger(options.maxElapsedMs) || options.maxElapsedMs < 100 || options.maxElapsedMs > 240000)) throw new PolicyError('WORKFLOW_ELAPSED_BOUND_INVALID');
    this.store = new PersistentStore(options.databaseUrl, durableAuthority(options.host).policyVersion, 'ae-deterministic-v1');
    this.broker = new PersistentToolBroker(this.store, options.host, options.fault);
    this.workflow = DBOS.registerWorkflow(async (phase: Phase) => this.runPhase(phase), { name: 'ae-deterministic-phase-v1' });
  }
  async launch(): Promise<void> {
    await this.store.migrate();
    DBOS.setConfig({ name: 'ae-deterministic-runtime', applicationVersion: 'ae-deterministic-v1', executorID: 'ae-deterministic-worker', systemDatabaseUrl: this.options.databaseUrl, logLevel: 'warn', enableOTLP: false });
    await DBOS.launch();
  }
  async shutdown(): Promise<void> { await DBOS.shutdown(); await this.store.close(); }
  async start(input: Start): Promise<WorkflowRunView> {
    const revision = this.options.catalog.get(input.workflowId, input.version);
    this.checkRegistry(revision);
    await this.broker.current(input.principal);
    if (input.release) { verifyRelease(input.release); releasedCatalog(input.release, input.principal, []); }
    const snapshot: Snapshot = { schemaVersion: '1', revision, state: inputState(revision.definition, input.input) };
    const runId = randomUUID();
    await (await DBOS.startWorkflow(this.workflow, { workflowID: this.workflowId(runId, 'initial') })({ runId, phase: 'initial', start: { principal: structuredClone(input.principal), snapshot, ...(input.release ? { release: structuredClone(input.release) } : {}) } })).getResult();
    return this.get(runId, input.principal);
  }
  async get(runId: string, principal: Principal): Promise<WorkflowRunView> {
    const run = await this.store.load(runId, principal);
    await this.assertReadable(run, principal);
    const { revision, state } = this.snapshot(run);
    return { ...structuredClone(run.view), modelMode: 'deterministic-workflow', workflow: { workflowId: revision.definition.workflowId, version: revision.definition.version, contentHash: revision.contentHash, cursor: state.cursor, completed: [...state.completed] } };
  }
  async decide(runId: string, principal: Principal, decision: ApprovalDecision): Promise<WorkflowRunView> {
    await this.get(runId, principal);
    await this.store.validateDecision(runId, principal, decision);
    await (await DBOS.startWorkflow(this.workflow, { workflowID: this.workflowId(runId, decision.approvalId) })({ runId, phase: decision.approvalId, principal: structuredClone(principal), decision })).getResult();
    await this.store.decision(runId, principal, decision);
    return this.get(runId, principal);
  }
  async cancel(runId: string, principal: Principal): Promise<WorkflowRunView> {
    await this.get(runId, principal);
    const phase = await this.store.update(runId, async (run, client) => {
      if (['succeeded', 'failed', 'cancelled', 'rejected', 'manual-review'].includes(run.view.status)) return null;
      run.cancelled = true; delete run.view.approval;
      const pending = await client.query("SELECT id FROM ae_operations_v1 WHERE run_id=$1 AND (result IS NULL OR result->>'status'='outcome-unknown') AND prepared->>'write'='true'", [runId]);
      this.store.status(run, pending.rows.length || run.view.status === 'outcome-unknown' ? 'outcome-unknown' : 'cancelled');
      return run.phase;
    });
    this.aborts.get(runId)?.abort();
    if (phase) await DBOS.cancelWorkflow(this.workflowId(runId, phase));
    return this.get(runId, principal);
  }
  async reconcile(runId: string, principal: Principal): Promise<WorkflowRunView> {
    const run = await this.store.load(runId, principal); await this.assertReadable(run, principal);
    if (!['outcome-unknown', 'manual-review'].includes(run.view.status) || !run.pending?.write) throw new PolicyError('RUN_NOT_UNKNOWN');
    const { revision, state } = this.snapshot(run);
    const node = revision.definition.nodes.find(value => value.id === state.cursor);
    if (node?.kind !== 'write' || run.pending.request.invocationId !== this.callId(node)) throw new PolicyError('WORKFLOW_CHECKPOINT_INVALID');
    // Terminal write only: existing receipt reconciliation cannot skip a downstream business step.
    const operationId = run.pending.request.operationId;
    const result = this.broker.definitions[run.pending.request.capabilityId]?.capability.supportsOutcomeQuery
      ? validateHostResult(operationId, await this.options.host.query(await this.broker.current(principal), operationId))
      : { status: 'outcome-unknown' as const, operationId, message: 'Host outcome queries are unavailable. No write was retried.' };
    await this.broker.record(runId, operationId, result, true);
    return this.get(runId, principal);
  }
  private workflowId(runId: string, phase: string): string { return `ae-deterministic-v1:${runId}:${phase}`; }
  private callId(node: ActionNode): string { return `workflow-v1:${node.id}`; }
  private checkRegistry(revision: WorkflowRevision): void {
    for (const node of revision.definition.nodes) if (node.kind === 'read' || node.kind === 'write') {
      const registered = this.broker.definitions[node.capability.capabilityId]?.capability;
      if (!registered || registered.version !== node.capability.version || registered.bindingHash !== node.capability.bindingHash) throw new PolicyError('WORKFLOW_CAPABILITY_PIN_UNSUPPORTED');
      if (node.kind === 'read' ? registered.risk !== 'read' || registered.approvalRequired : registered.risk === 'read' || !registered.approvalRequired) throw new PolicyError('WORKFLOW_CAPABILITY_RISK_MISMATCH');
    }
  }
  private snapshot(run: StoredRun): Snapshot {
    if (run.view.modelMode !== 'deterministic-workflow' || !run.snapshot) throw new PolicyError('WORKFLOW_CHECKPOINT_INVALID');
    let snapshot: Snapshot;
    try { snapshot = JSON.parse(run.snapshot) as Snapshot; boundedJson(snapshot, 262144); } catch { throw new PolicyError('WORKFLOW_CHECKPOINT_INVALID'); }
    if (snapshot.schemaVersion !== '1' || !snapshot.revision || !snapshot.state) throw new PolicyError('WORKFLOW_CHECKPOINT_INVALID');
    const revision = validateDefinition(snapshot.revision.definition);
    if (revision.contentHash !== snapshot.revision.contentHash || run.input !== revision.contentHash) throw new PolicyError('WORKFLOW_DEFINITION_PIN_MISMATCH');
    const state = snapshot.state;
    if (!revision.definition.nodes.some(node => node.id === state.cursor) || !Array.isArray(state.completed) || new Set(state.completed).size !== state.completed.length || state.completed.length > 32 || !state.input || typeof state.input !== 'object' || Array.isArray(state.input) || !state.results || typeof state.results !== 'object' || Array.isArray(state.results)) throw new PolicyError('WORKFLOW_CHECKPOINT_INVALID');
    let cursor = revision.definition.entry;
    const reads = new Set<string>();
    for (const completed of state.completed) {
      const node = revision.definition.nodes.find(value => value.id === completed);
      if (!node || node.id !== cursor || node.kind === 'end') throw new PolicyError('WORKFLOW_CHECKPOINT_INVALID');
      if (node.kind === 'read') { reads.add(node.id); if (!Object.hasOwn(state.results, node.id)) throw new PolicyError('WORKFLOW_CHECKPOINT_INVALID'); }
      cursor = node.kind === 'branch' ? digest(resolveBinding(node.value, state)) === digest(node.equals) ? node.then : node.else : node.next;
    }
    if (cursor !== state.cursor || Object.keys(state.results).some(name => !reads.has(name))) throw new PolicyError('WORKFLOW_CHECKPOINT_INVALID');
    this.checkRegistry(revision);
    return snapshot;
  }
  private async assertReadable(run: StoredRun, principal: Principal): Promise<void> {
    this.snapshot(run);
    const current = await this.broker.current(principal);
    const operations = await this.store.pool.query('SELECT prepared FROM ae_operations_v1 WHERE run_id=$1', [run.view.runId]);
    for (const row of operations.rows) await this.broker.assertReadable(current, row.prepared.request);
    if (run.pending) await this.broker.assertReadable(current, run.pending.request);
  }
  private async live(runId: string, node?: ActionNode): Promise<StoredRun> {
    const run = await this.store.load(runId);
    await this.assertReadable(run, run.principal);
    if (run.cancelled || run.view.status === 'rejected') throw new PolicyError('CANCELLED');
    if (node) {
      const { revision } = this.snapshot(run); this.checkRegistry(revision);
      await this.broker.assertCapability(run, node.capability.capabilityId);
    }
    return run;
  }
  private async runPhase(phase: Phase): Promise<void> {
    const step = <T>(name: string, fn: () => Promise<T>) => DBOS.runStep(fn, { name, retriesAllowed: false });
    if (phase.start) await step('create-run', async () => {
      const { principal, snapshot, release } = phase.start!;
      const releaseId = release?.releaseId ?? `workflow-${snapshot.revision.contentHash}`;
      const run: StoredRun = { view: { runId: phase.runId, releaseId, status: 'queued', events: [], receipts: [], persistence: 'postgres-dbos', modelMode: 'deterministic-workflow' },
        principal, releaseId, ...(release ? { release } : {}), input: snapshot.revision.contentHash, snapshot: JSON.stringify(snapshot),
        pins: { sdk: '0.21.0', workflow: 'ae-deterministic-v1', policy: this.broker.policyVersion, capability: '1', ...(release ? { releaseHash: release.contentHash } : {}) }, cancelled: false, phase: 'initial' };
      await this.store.pool.query('INSERT INTO ae_runs_v1(id,body) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [phase.runId, JSON.stringify(run)]);
    });
    if (phase.decision) {
      const next = await step('trusted-decision', async () => { await this.broker.current(phase.principal!); return this.store.decision(phase.runId, phase.principal!, phase.decision!); });
      await this.options.fault?.('after-decision');
      if (!next) return;
    }
    const run = await step('load-workflow-checkpoint', () => this.store.load(phase.runId));
    if (run.cancelled) return;
    const snapshot = this.snapshot(run), definition = snapshot.revision.definition;
    let state = snapshot.state;
    const abort = new AbortController(); this.aborts.set(phase.runId, abort);
    const deadline = setTimeout(() => abort.abort(), Math.min(definition.maxElapsedMs, this.options.maxElapsedMs ?? 240_000));
    try {
      await this.live(phase.runId);
      await step('phase-running', () => this.store.update(phase.runId, async current => { if (!current.cancelled && current.view.status !== 'succeeded') this.store.status(current, 'running'); }));
      for (let transitions = 0; transitions < 32; transitions++) {
        await this.live(phase.runId);
        if (abort.signal.aborted) throw new PolicyError('CANCELLED');
        const node = definition.nodes.find(value => value.id === state.cursor)!;
        if (node.kind === 'end') {
          await step(`end:${node.id}`, () => this.store.update(phase.runId, async current => {
            if (current.cancelled || current.view.status === 'succeeded') return;
            this.store.status(current, 'succeeded'); current.view.message = node.message;
            this.store.event(current, 'assistant-message', { message: node.message });
          }));
          return;
        }
        const next = structuredClone(state);
        if (node.kind === 'branch') next.cursor = digest(resolveBinding(node.value, state)) === digest(node.equals) ? node.then : node.else;
        else {
          await this.live(phase.runId, node);
          const args = resolveArguments(node, state);
          if (node.kind === 'write' && !phase.decision) {
            await step(`approval:${node.id}`, async () => {
              const live = await this.live(phase.runId, node);
              const prepared = await this.broker.prepare(live.principal, phase.runId, this.callId(node), node.capability.capabilityId, args);
              const approval = this.broker.approval(live.principal, prepared, live.releaseId);
              await this.store.update(phase.runId, async (current, client) => {
                if (current.cancelled) return;
                if (current.view.status === 'awaiting-approval' && current.pending?.request.invocationId === this.callId(node)) return;
                current.pending = prepared; current.view.approval = approval;
                await client.query('INSERT INTO ae_approvals_v1(id,run_id,view,state) VALUES($1,$2,$3,$4)', [approval.binding.approvalId, phase.runId, JSON.stringify(approval), 'pending']);
                this.store.event(current, 'approval-required', { approvalId: approval.binding.approvalId, expectedHash: approval.expectedHash, preview: approval.preview });
                this.store.status(current, 'awaiting-approval');
              });
            });
            await this.options.fault?.('after-approval-checkpoint');
            return;
          }
          if (node.kind === 'write' && (phase.decision?.decision !== 'approve' || run.pending?.request.invocationId !== this.callId(node))) throw new PolicyError('WORKFLOW_APPROVAL_MISMATCH');
          const attempts = node.kind === 'read' ? node.retry.maxAttempts : 1;
          let result: ToolResult | undefined;
          for (let attempt = 1; attempt <= attempts; attempt++) {
            await this.live(phase.runId, node);
            const outcome = await step(`tool:${node.id}:${attempt}`, async () => {
              try {
                const live = await this.live(phase.runId, node);
                const execution = this.broker.execute(live, node.capability.capabilityId, args, this.callId(node), phase.decision?.approvalId, abort.signal);
                return { ok: true as const, result: node.kind === 'read' ? await abortable(execution, abort.signal) : await execution };
              } catch (error) {
                return { ok: false as const, code: error instanceof PolicyError ? error.code : 'WORKFLOW_READ_TECHNICAL_FAILURE', retryable: node.kind === 'read' && !(error instanceof PolicyError) && !abort.signal.aborted };
              }
            });
            if (outcome.ok) { result = outcome.result; break; }
            if (!outcome.retryable || attempt === attempts) throw new PolicyError(outcome.code);
            await step(`retry:${node.id}:${attempt}`, () => this.store.update(phase.runId, async current => {
              if (!current.view.events.some(event => event.payload.workflowNodeId === node.id && event.payload.retryAttempt === attempt + 1)) this.store.event(current, 'run-status', { status: current.view.status, workflowNodeId: node.id, retryAttempt: attempt + 1 });
            }));
            await this.options.fault?.('before-read-retry');
            if (node.kind === 'read') await DBOS.sleepms(node.retry.delayMs);
          }
          if (!result || result.status !== 'succeeded') throw new PolicyError(result?.status === 'outcome-unknown' ? 'OUTCOME_UNKNOWN' : result && 'code' in result ? result.code : 'WORKFLOW_RESULT_MISSING');
          await this.options.fault?.('after-tool-checkpoint');
          // This is deliberately outside cached DBOS tool results, before branching or exposure.
          await this.live(phase.runId, node);
          boundedJson(result.data, 131072);
          if (node.kind === 'read') next.results[node.id] = result.data;
          next.cursor = node.next;
        }
        next.completed.push(node.id);
        boundedJson(next, 196608);
        state = await step(`transition:${node.id}`, () => this.store.update(phase.runId, async current => {
          const saved = this.snapshot(current);
          if (saved.state.completed.includes(node.id)) return saved.state;
          if (saved.state.cursor !== node.id) throw new PolicyError('WORKFLOW_CURSOR_CONFLICT');
          saved.state = next; boundedJson(saved, 262144); current.snapshot = JSON.stringify(saved);
          this.store.event(current, 'run-status', { status: current.view.status, workflowNodeId: node.id, nextNodeId: next.cursor });
          return next;
        }));
        await this.options.fault?.('after-transition-checkpoint');
      }
      throw new PolicyError('WORKFLOW_TRANSITION_LIMIT');
    } catch (error) {
      // Current authority failures may happen between replayed steps; do not change DBOS step positions.
      await this.store.update(phase.runId, async (current, client) => {
        if (current.view.status === 'succeeded') return;
        const unresolved = await client.query("SELECT id FROM ae_operations_v1 WHERE run_id=$1 AND (result IS NULL OR result->>'status'='outcome-unknown') AND prepared->>'write'='true'", [phase.runId]);
        this.store.status(current, unresolved.rows.length || current.view.status === 'outcome-unknown' ? 'outcome-unknown' : current.cancelled || abort.signal.aborted ? 'cancelled' : 'failed');
        current.view.message = error instanceof PolicyError ? error.code : 'Workflow stopped safely. Inspect adapter compatibility before recovery.';
      });
    } finally { clearTimeout(deadline); this.aborts.delete(phase.runId); }
  }
}
