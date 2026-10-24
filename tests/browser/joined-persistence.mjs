// The existing transformed synthetic host, connected to the SAME persistent HTTP worker.
// No alternative UI, mock API, paid model, production account or external request.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { assertFixtureBrowser, hashFixtureBrowser } from '../../packages/transformation/dist/fixture-harness.js';

export async function prepareJoinedBrowser({ directory, apiOrigin }) {
  const root = resolve('.'), work = join(directory, 'joined-browser'), source = join(work, 'original'), destination = join(work, 'adapted');
  const browserExecutable = process.env.AE_BROWSER_EXECUTABLE;
  assertFixtureBrowser(browserExecutable);
  mkdirSync(work, { recursive: true }); cpSync(join(root, 'fixtures/existing-react-helpdesk'), source, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { stdio: 'pipe' });
  git('init'); git('config', 'user.name', 'AE fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('add', '.'); git('commit', '-m', 'Synthetic original host');
  execFileSync(process.execPath, ['--input-type=module', '-e', `import { assessProject, proposePlan, approvePlan, applyApprovedPlan } from './packages/transformation/dist/index.js';
const sourceRoot=${JSON.stringify(source)},destination=${JSON.stringify(destination)};
const assessment=assessProject(sourceRoot),plan=proposePlan(assessment),approval=approvePlan(plan,{approverId:'fixture-test',authorizationRef:'user-approved-local-synthetic-tests'});
applyApprovedPlan({sourceRoot,destination,assessment,plan,approval});`], { cwd: root, stdio: 'pipe', timeout: 30000 });
  const alias = [
    { find: /^react\/jsx-dev-runtime$/, replacement: join(root, 'node_modules/react/jsx-dev-runtime.js') },
    { find: /^react\/jsx-runtime$/, replacement: join(root, 'node_modules/react/jsx-runtime.js') },
    { find: /^react$/, replacement: join(root, 'node_modules/react/index.js') },
    { find: /^react-dom\/client$/, replacement: join(root, 'node_modules/react-dom/client.js') },
    { find: /^react-dom$/, replacement: join(root, 'node_modules/react-dom/index.js') },
    { find: '@ae/host-sdk', replacement: join(root, 'packages/host-sdk/src/index.ts') },
    { find: '@ae/ui/styles.css', replacement: join(root, 'packages/ui/src/styles.css') },
    { find: '@ae/ui', replacement: join(root, 'packages/ui/src/index.ts') },
  ];
  const aliasSource = alias.map(a => `{find:${a.find instanceof RegExp ? a.find.toString() : JSON.stringify(a.find)},replacement:${JSON.stringify(a.replacement)}}`).join(',');
  execFileSync(process.execPath, ['--max-old-space-size=640', '--input-type=module', '-e', `import {build} from 'vite';await build({configFile:false,root:${JSON.stringify(destination)},cacheDir:${JSON.stringify(join(work, 'vite-cache'))},logLevel:'error',resolve:{alias:[${aliasSource}]},build:{outDir:${JSON.stringify(join(work, 'site'))}}});`], { cwd: root, stdio: 'pipe', timeout: 90000 });
  const uiOrigin = 'http://127.0.0.1:5199';
  let vite, browser;
  const close = async () => {
    if (browser) { await browser.close(); browser = undefined; }
    if (vite) { await new Promise((resolve, reject) => vite.httpServer.close(error => error ? reject(error) : resolve())); vite = undefined; }
  };
  return { uiOrigin, close, async run({ fixture, releaseC, get, post, request, decision, inspect, assertPending, rollbackAndRestart }) {
    const evidence = { status: 'pending', model: 'deterministic simulated provider', source, destination, browserExecutable,
      browserHash: hashFixtureBrowser(browserExecutable), sandbox: true, errors: [], externalRequests: [], checks: [] };
    const save = () => writeFileSync(join(work, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    try {
      vite = await preview({ configFile: false, root: destination, build: { outDir: join(work, 'site') }, preview: { host: '127.0.0.1', port: 5199, strictPort: true, proxy: { '/api': { target: apiOrigin, changeOrigin: true } } } });
      browser = await chromium.launch({ executablePath: browserExecutable, headless: true, chromiumSandbox: true,
        args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] });
      evidence.chromiumVersion = browser.version();
      const open = async () => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        await context.route('**/*', async route => { const url = new URL(route.request().url()); if (![uiOrigin, apiOrigin].includes(url.origin)) { evidence.externalRequests.push(url.href); return route.abort(); } return route.continue(); });
        const page = await context.newPage(); page.on('pageerror', error => evidence.errors.push(String(error)));
        await page.goto(uiOrigin); await page.getByTestId('host-assignee').filter({ hasText: 'Unassigned' }).waitFor();
        await page.locator('.ae-floating-launcher').click();
        const dialog = page.getByRole('dialog', { name: '业务助手对话' });
        return { context, page, dialog };
      };
      const start = async ({ page, dialog }, suffix) => {
        await dialog.getByRole('textbox').fill(fixture.body.input + ' ' + suffix);
        const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/runs' && r.request().method() === 'POST');
        await dialog.getByRole('button', { name: '发送', exact: true }).click();
        const run = await (await response).json();
        await dialog.getByRole('button', { name: '确认并执行', exact: true }).waitFor();
        await assertPending(run); assert.equal(run.releaseId, releaseC.releaseId);
        return run;
      };
      const reload = async ({ page, dialog }) => {
        await page.reload(); await page.locator('.ae-floating-launcher').click();
        await dialog.getByRole('button', { name: '确认并执行', exact: true }).waitFor();
      };
      const cancelledPage = await open(); const pending = await start(cancelledPage, 'cancel-case');
      await reload(cancelledPage);
      assert.deepEqual((await get(`/api/runs/${pending.runId}`)).approval, pending.approval);
      await cancelledPage.page.screenshot({ path: join(work, 'assignee-refreshed-pending.png'), fullPage: true });
      evidence.checks.push('Refresh restores same persistent member/assignee approval, not a new run');
      await cancelledPage.context.setOffline(true);
      await cancelledPage.dialog.getByRole('button', { name: '刷新状态', exact: true }).click();
      await cancelledPage.dialog.getByRole('alert').filter({ hasText: '状态未确认' }).waitFor();
      await cancelledPage.dialog.getByRole('alert').scrollIntoViewIfNeeded();
      const offline = await get(`/api/runs/${pending.runId}`); assert.equal(offline.status, 'awaiting-approval'); assert.deepEqual(offline.approval, pending.approval);
      assert.equal((await inspect()).writeDispatches, 0);
      await cancelledPage.page.screenshot({ path: join(work, 'assignee-disconnected-pending.png'), fullPage: true });
      await cancelledPage.context.setOffline(false);
      await cancelledPage.dialog.getByRole('button', { name: '刷新状态', exact: true }).click();
      await cancelledPage.dialog.getByRole('alert').waitFor({ state: 'detached' });
      assert.deepEqual((await get(`/api/runs/${pending.runId}`)).approval, pending.approval);
      evidence.checks.push('Actual browser offline request fails visibly; reconnect refresh preserves the exact pending binding and zero dispatch');
      await cancelledPage.dialog.getByRole('button', { name: '取消任务', exact: true }).click();
      await cancelledPage.dialog.getByText('已取消', { exact: true }).first().waitFor();
      const cancelled = await get(`/api/runs/${pending.runId}`); assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.approval, undefined);
      const stale = await request(`/api/runs/${pending.runId}/approval`, decision(pending)); assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'RUN_NOT_AWAITING_THIS_APPROVAL');
      assert.equal((await inspect()).writeDispatches, 0); assert.equal((await inspect()).mutationCount, 0);
      await cancelledPage.page.reload(); await cancelledPage.page.locator('.ae-floating-launcher').click();
      await cancelledPage.dialog.getByText('已取消', { exact: true }).first().waitFor();
      assert.equal(await cancelledPage.dialog.getByRole('button', { name: '确认并执行', exact: true }).count(), 0);
      await cancelledPage.page.screenshot({ path: join(work, 'assignee-cancelled.png'), fullPage: true });
      evidence.cancel = { runId: pending.runId, binding: pending.approval, offlineStatus: offline.status, status: cancelled.status, staleApprovalHttpStatus: stale.status, staleApprovalCode: stale.body.error.code, ...(await inspect()) };
      await cancelledPage.context.close();
      const approvedPage = await open(); const onPending = await start(approvedPage, 'rollback-case');
      assert.equal(onPending.receipts.find(r => r.data?.title).data.title, 'Printer offline');
      const rollback = await rollbackAndRestart();
      assert.equal((await get(`/api/runs/${pending.runId}`)).status, 'cancelled', 'Cancellation must persist through the same process restart');
      await reload(approvedPage);
      const restored = await get(`/api/runs/${onPending.runId}`); assert.deepEqual(restored.approval, onPending.approval); assert.equal(restored.releaseId, releaseC.releaseId);
      assert.equal((await get(`/api/tickets/${fixture.ticketId}`)).ticket.title, '  Printer offline  ');
      await approvedPage.page.screenshot({ path: join(work, 'assignee-old-on-after-off-rollback.png'), fullPage: true });
      await approvedPage.dialog.getByRole('button', { name: '确认并执行', exact: true }).click();
      await approvedPage.page.getByTestId('host-assignee').filter({ hasText: fixture.members.active }).waitFor();
      assert.equal(await approvedPage.page.getByTestId('host-version').innerText(), '2');
      assert.equal(await approvedPage.dialog.getByRole('button', { name: '确认并执行', exact: true }).count(), 0);
      const done = await get(`/api/runs/${onPending.runId}`); assert.equal(done.status, 'succeeded'); assert.equal(done.releaseId, releaseC.releaseId);
      assert.equal(done.receipts.find(r => r.data?.title).data.title, 'Printer offline');
      await post(`/api/runs/${onPending.runId}/approval`, decision(onPending));
      const final = await inspect(); assert.equal(final.writeDispatches, 1); assert.equal(final.mutationCount, 1); assert.equal(final.ticket.assigneeId, fixture.members.active); assert.equal(final.ticket.title, '  Printer offline  ');
      const ordinary = (await get(`/api/tickets/${fixture.ticketId}`)).ticket; assert.deepEqual(ordinary, final.ticket);
      await approvedPage.page.screenshot({ path: join(work, 'assignee-approved-after-off-rollback.png'), fullPage: true });
      evidence.approve = { runId: done.runId, oldReleaseId: releaseC.releaseId, activeReleaseId: rollback.releaseD.releaseId, restart: rollback.restart, oldTitleReceipt: done.receipts.find(r => r.data?.title), ordinary, ...final };
      await approvedPage.context.close();
      evidence.checks.push('Cancel persists and stale confirmation causes zero dispatch, including across restart');
      evidence.checks.push('ON assignee approval survives OFF rollback and SIGKILL; explicit UI approval writes exactly once; old receipt stays ON and ordinary current reads stay OFF without undoing assignment');
      assert.deepEqual(evidence.errors, []); assert.deepEqual(evidence.externalRequests, []);
      evidence.status = 'pass'; evidence.completedAt = new Date().toISOString(); save(); return evidence;
    } catch (error) { evidence.status = 'fail'; evidence.failure = String(error); save(); throw error; }
  } };
}
