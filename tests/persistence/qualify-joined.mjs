// One joined acceptance sequence, not an aggregation of independent component PASS reports.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ticketCapabilities, syntheticTitleCatalog } from '@ae/capabilities';
import { checkedBehaviorCatalog } from '@ae/control-plane';
import { prepareJoinedBrowser } from '../browser/joined-persistence.mjs';

export async function qualifyJoined({ directory, host, Worker, admin, origin, observe }) {
  const prefix = randomUUID();
  const selection = enabled => ({ baselineHash: syntheticTitleCatalog.baselineHash,
    candidateCodeHash: syntheticTitleCatalog.candidateCodeHash, registryHash: syntheticTitleCatalog.registryHash,
    enabled: enabled ? [{ id: 'synthetic-ticket-title-trim', version: '1' }] : [] });
  const all = ticketCapabilities.map(c => c.capabilityId), reads = ['read_ticket', 'read_ticket_members'];
  const config = (name, capabilityIds, behavior) => ({ name, instructions: `JOINED_${name}_PIN`, capabilityIds,
    bounds: { maxTurns: 6, maxElapsedMs: 20000 }, ...(behavior ? { behavior } : {}) });
  const report = { status: 'pending', scope: 'Joined synthetic persistent HTTP + published releases + member/assignee + browser fault sequence',
    provider: 'Deterministic simulated provider; no paid model or provider-quality claim', cases: [], releases: {}, browser: null };
  const save = () => writeFileSync(join(directory, 'joined-summary.json'), JSON.stringify(report, null, 2) + '\n');
  let worker, browserFixture;
  const casePass = (name, detail) => { report.cases.push({ name, status: 'pass', observedAt: new Date().toISOString(), ...detail }); save(); observe('joined-case-pass', { name, ...detail }); };
  try {
    // Build the actual lifecycle-generated fixture before starting DBOS/Chromium.
    browserFixture = await prepareJoinedBrowser({ directory, apiOrigin: origin });
    const request = async (path, body, key) => {
      const response = await fetch(origin + path, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
        headers: { origin: browserFixture.uiOrigin, 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) } });
      return { status: response.status, body: await response.json() };
    };
    const post = async (path, body, key) => { const r = await request(path, body, key); assert(r.status >= 200 && r.status < 300, JSON.stringify(r)); return r.body; };
    const get = async path => { const r = await request(path); assert.equal(r.status, 200, JSON.stringify(r)); return r.body; };
    const publish = async configuration => { const d = await post('/api/configuration/drafts', { configuration }); return post(`/api/configuration/drafts/${d.draftId}/publish`, { expectedRevision: d.revision }); };
    const decision = run => ({ approvalId: run.approval.binding.approvalId, expectedHash: run.approval.expectedHash, decision: 'approve' });
    const inspect = async (principal, ticketId) => { const state = await host.inspect(principal, ticketId); return { ticket: state.ticket, mutationCount: state.mutationCount,
      writeDispatches: state.calls.filter(c => c.kind === 'write' && c.target_id === ticketId).length }; };
    const fixture = async (name, principal = admin) => {
      const ticketId = name === 'browser' ? 'ticket-1' : `joined-${name}-${prefix}`;
      await host.pool.query("INSERT INTO qualification_host.tickets(tenant_id,application_id,id,title,priority,version) VALUES($1,$2,$3,'  Printer offline  ','low',1)", [principal.tenantId, principal.applicationId, ticketId]);
      const members = await host.seedMembers(principal, ticketId);
      return { principal, ticketId, members, body: { input: `qualification-ticket:${ticketId} assignment-member:${members.active}`, context: { ticketId } } };
    };
    const start = (f, key) => post('/api/runs', f.body, `joined-${key}-${prefix}`);
    const assertPending = async (run, f, release) => {
      assert.equal(run.status, 'awaiting-approval'); assert.equal(run.releaseId, release.releaseId);
      assert.equal(run.approval.binding.releaseId, release.releaseId); assert.equal(run.approval.binding.capabilityId, 'change_ticket_assignee');
      assert.equal(run.approval.binding.targetId, f.ticketId);
      const memberReceipt = run.receipts.find(r => r.data?.members);
      assert.deepEqual(memberReceipt.data.members.map(m => m.id), [f.members.active]);
      assert.deepEqual(await inspect(f.principal, f.ticketId), { ticket: { id: f.ticketId, tenantId: f.principal.tenantId, title: '  Printer offline  ', priority: 'low', version: 1 }, mutationCount: 0, writeDispatches: 0 });
    };
    const titleReceipt = run => run.receipts.find(r => typeof r.data?.title === 'string');
    const boot = async () => { worker = new Worker('', browserFixture.uiOrigin); await worker.ready(); };
    const restart = async () => { const killed = await worker.kill(); await boot(); return { killed, restartedPid: worker.child.pid }; };
    await boot();
    const old = await fixture('old'), cap = await fixture('cap-revoked'), fresh = await fixture('fresh');
    const revokedPrincipal = { ...admin, subjectId: `joined-revoked-${prefix}` };
    await host.seed(revokedPrincipal, `permission-seed-${prefix}`);
    const permission = await fixture('permission-revoked', revokedPrincipal);
    const releaseA = await publish(config('A_OFF', all)); report.releases.A = releaseA;
    assert.equal(releaseA.configuration.behavior, undefined, 'Omission must retain default compatibility behavior');
    const oldRun = await start(old, 'old'), capRun = await start(cap, 'cap');
    await assertPending(oldRun, old, releaseA); await assertPending(capRun, cap, releaseA);
    assert.equal(titleReceipt(oldRun).data.title, '  Printer offline  ');
    await worker.request('session', revokedPrincipal);
    const permissionRun = await start(permission, 'permission'); await assertPending(permissionRun, permission, releaseA);
    await worker.request('session', admin);
    const releaseB = await publish(config('B_READONLY_ON', reads, selection(true))); report.releases.B = releaseB;
    const restartA = await restart();
    const restored = await start(old, 'old'); assert.equal(restored.runId, oldRun.runId); assert.deepEqual(restored.approval, oldRun.approval);
    assert.equal((await get('/api/meta')).releaseId, releaseB.releaseId);
    const done = await post(`/api/runs/${oldRun.runId}/approval`, decision(restored)); assert.equal(done.status, 'succeeded');
    assert.equal(done.releaseId, releaseA.releaseId); assert.equal(titleReceipt(done).data.title, '  Printer offline  ');
    assert.deepEqual((await host.pool.query('SELECT body FROM ae_runs_v1 WHERE id=$1', [done.runId])).rows[0].body.release, releaseA);
    await post(`/api/runs/${oldRun.runId}/approval`, decision(restored)); await start(old, 'old');
    const oldState = await inspect(admin, old.ticketId); assert.equal(oldState.mutationCount, 1); assert.equal(oldState.writeDispatches, 1); assert.equal(oldState.ticket.assigneeId, old.members.active);
    casePass('A member/assignee approval survives B publication and SIGKILL; duplicates do not redispatch', { runId: done.runId, releaseId: done.releaseId, restart: restartA, ...oldState });
    const newRun = await start(fresh, 'fresh'); assert.equal(newRun.status, 'succeeded'); assert.equal(newRun.releaseId, releaseB.releaseId); assert.equal(newRun.approval, undefined);
    const catalogs = (await host.pool.query('SELECT tools FROM qualification_http.catalogs WHERE run_id=$1', [newRun.runId])).rows;
    assert(catalogs.length > 0); for (const row of catalogs) assert.deepEqual(row.tools, reads);
    const projected = titleReceipt(newRun).data; const current = (await get(`/api/tickets/${fresh.ticketId}`)).ticket;
    const raw = (await inspect(admin, fresh.ticketId)).ticket;
    assert.deepEqual(projected, { ...raw, title: 'Printer offline' }); assert.deepEqual(current, projected);
    assert.equal((await inspect(admin, fresh.ticketId)).writeDispatches, 0);
    casePass('New B run uses ON projection and read/member-only tools, with no approval or write', { runId: newRun.runId, releaseId: newRun.releaseId, catalogs, raw, projected });
    await host.pool.query('INSERT INTO qualification_http.disabled VALUES($1,$2)', [admin.subjectId, 'change_ticket_assignee']);
    const capabilityDenied = await post(`/api/runs/${capRun.runId}/approval`, decision(capRun)); assert.equal(capabilityDenied.status, 'failed'); assert.match(capabilityDenied.message, /CAPABILITY_NOT_ALLOWED/);
    const capState = await inspect(admin, cap.ticketId); assert.equal(capState.writeDispatches, 0); assert.equal(capState.mutationCount, 0);
    await host.pool.query('DELETE FROM qualification_http.disabled WHERE subject_id=$1', [admin.subjectId]);
    await host.revokeWrite(revokedPrincipal); await worker.request('session', revokedPrincipal);
    const permissionDenied = await post(`/api/runs/${permissionRun.runId}/approval`, decision(permissionRun)); assert.equal(permissionDenied.status, 'failed'); assert.match(permissionDenied.message, /ROLE_DENIED|SCOPE_DENIED/);
    const permissionState = await inspect(revokedPrincipal, permission.ticketId); assert.equal(permissionState.writeDispatches, 0); assert.equal(permissionState.mutationCount, 0);
    await worker.request('session', admin);
    casePass('Live capability disablement and live host permission revocation separately deny old A approvals', { capability: { runId: capRun.runId, message: capabilityDenied.message, ...capState }, permission: { runId: permissionRun.runId, message: permissionDenied.message, ...permissionState } });
    for (const category of ['security', 'authorization', 'corruption']) assert.throws(() => checkedBehaviorCatalog({ ...syntheticTitleCatalog, improvements: syntheticTitleCatalog.improvements.map(i => ({ ...i, category })) }), /INVALID_BEHAVIOR_CATALOG/);
    const forged = await request('/api/configuration/drafts', { configuration: config('FORGED', all, { ...selection(true), enabled: [{ id: 'authorization-bypass', version: '1' }] }) });
    assert.equal(forged.status, 403); assert.equal((await get('/api/meta')).releaseId, releaseB.releaseId);
    casePass('Unsafe improvement categories and unregistered behavior selection fail closed', { rejectedCategories: ['security', 'authorization', 'corruption'], invalidSelectionStatus: forged.status });
    const releaseC = await publish(config('C_FULL_ON', all, selection(true))); report.releases.C = releaseC;
    const uiFixture = await fixture('browser');
    report.browser = await browserFixture.run({ fixture: uiFixture, releaseC, get, post, request, decision, inspect: () => inspect(admin, uiFixture.ticketId),
      assertPending: run => assertPending(run, uiFixture, releaseC),
      rollbackAndRestart: async () => {
        const releaseD = await publish(releaseA.configuration);
        assert.deepEqual(releaseD.configuration, releaseA.configuration);
        assert.notEqual(releaseD.releaseId, releaseA.releaseId);
        report.releases.D = releaseD; const restartC = await restart();
        assert.equal((await get('/api/meta')).releaseId, releaseD.releaseId);
        return { releaseD, restart: restartC };
      } });
    casePass('Rendered pending assignee refresh/disconnect/cancel and ON approval across OFF rollback/restart', report.browser);
    const rollbackFresh = await fixture('rollback-fresh');
    const afterRollback = await start(rollbackFresh, 'after-rollback');
    await assertPending(afterRollback, rollbackFresh, report.releases.D);
    assert.equal(titleReceipt(afterRollback).data.title, '  Printer offline  ');
    assert.equal((await post(`/api/runs/${afterRollback.runId}/cancel`, {})).status, 'cancelled');
    casePass('New run after rollback binds D OFF with full member/assignee flow; cancellation leaves zero dispatch', { runId: afterRollback.runId, releaseId: afterRollback.releaseId, ...(await inspect(admin, rollbackFresh.ticketId)) });
    const state = await get('/api/configuration');
    for (const release of Object.values(report.releases)) assert.deepEqual(state.releases.find(r => r.releaseId === release.releaseId), release);
    await worker.shutdown(); worker = undefined;
    await browserFixture.close(); browserFixture = undefined;
    report.status = 'pass'; report.completedAt = new Date().toISOString();
    report.cleanup = { workerExit: 0, browserAndUi: 'closed', postgres: 'owned outer runner must still stop cluster' }; save();
    observe('joined-acceptance-pass', { cases: report.cases.length, evidence: join(directory, 'joined-summary.json') });
  } catch (error) {
    report.status = 'fail'; report.failure = String(error); save(); throw error;
  } finally {
    if (worker && !worker.dead) await worker.kill();
    await browserFixture?.close();
  }
}
