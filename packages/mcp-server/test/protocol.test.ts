import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { assessProject, proposePlan, digest, sha256 } from '@ae/transformation';
import { createAeMcpServer } from '../src/index.js';

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), 'ae-mcp-')); const root = join(parent, 'source');
  cpSync(resolve('fixtures/existing-react-helpdesk'), root, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' });
  git('init'); git('config', 'user.name', 'Fictional MCP fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('add', '.'); git('commit', '-m', 'Fictional source');
  return { parent, root, git };
}
async function connect(root: string) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/packages/mcp-server/src/stdio.js')], env: { PATH: process.env.PATH ?? '', AE_MCP_REPO_ROOT: root }, stderr: 'pipe' });
  const client = new Client({ name: 'fictional-existing-developer-agent', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}
function data(result: unknown): any {
  const value = result as { content: { type: string; text: string }[]; isError?: boolean };
  assert.notEqual(value.isError, true); return JSON.parse(value.content[0]!.text);
}

test('official SDK client initializes stdio, lists and calls all read-only toolkit tools', async () => {
  const f = fixture(); const { client } = await connect(f.root);
  try {
    assert.equal(client.getServerVersion()?.name, 'agentic-everything');
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(t => t.name).sort(), ['ae_assess', 'ae_describe', 'ae_plan', 'ae_preview', 'ae_verify']);
    assert.ok(tools.every(t => t.annotations?.readOnlyHint === true));
    const before = f.git('status', '--porcelain');
    const description = data(await client.callTool({ name: 'ae_describe', arguments: {} }));
    assert.equal(description.mode, 'read-only');
    const assessment = data(await client.callTool({ name: 'ae_assess', arguments: {} }));
    assert.deepEqual(assessment, assessProject(f.root));
    const planned = data(await client.callTool({ name: 'ae_plan', arguments: { recipeId: 'react-helpdesk' } }));
    assert.deepEqual(planned.plan, proposePlan(assessment)); assert.equal(planned.planHash, digest(planned.plan));
    assert.deepEqual({ id: description.recipes[0].id, version: description.recipes[0].version }, planned.plan.recipes[0], 'MCP description and actual plan use the same installed recipe revision');
    const preview = data(await client.callTool({ name: 'ae_preview', arguments: { recipeId: 'react-helpdesk', planHash: planned.planHash } }));
    assert.equal(preview.changes.length, 2); assert.match(preview.changes[0].after, /HelpdeskAgenticMount/);
    const patch = { schemaVersion: '1', planHash: planned.planHash, baseCommit: assessment.baseCommit, recipe: planned.plan.recipes[0], appliedAt: new Date().toISOString(), changes: preview.changes.map((c: {path: string; before: string | null; after: string}) => ({ path: c.path, beforeHash: c.before === null ? null : sha256(c.before), afterHash: sha256(c.after) })) };
    const verify = data(await client.callTool({ name: 'ae_verify', arguments: { patch, businessHash: sha256(readFileSync(join(f.root, 'src/tickets.ts'), 'utf8')) } }));
    assert.ok(verify.checks.some((c: {status: string}) => c.status === 'fail'), 'Unapplied preview must not verify as applied');
    assert.ok(verify.checks.some((c: {name: string; status: string}) => c.name === 'host-business-tests' && c.status === 'not-run'));
    assert.equal(f.git('status', '--porcelain'), before);
    // Protocol/schema and authority negatives travel through the actual SDK transport.
    for (const request of [
      { name: 'ae_assess', arguments: { repoRoot: '/etc' } },
      { name: 'ae_assess', arguments: { path: '../outside' } },
      { name: 'ae_plan', arguments: { recipeId: 'unknown-recipe' } },
      { name: 'ae_plan', arguments: { recipeId: 'react-helpdesk', approval: true } },
      { name: 'ae_preview', arguments: { recipeId: 'react-helpdesk', planHash: 'invalid' } },
      { name: 'ae_verify', arguments: { patch: { ...patch, worktree: '/etc' }, businessHash: '0'.repeat(64) } },
      { name: 'ae_verify', arguments: { patch: { ...patch, recipe: { ...patch.recipe, version: '0.0.0-stale' } }, businessHash: '0'.repeat(64) } },
      { name: 'ae_verify', arguments: { patch: { ...patch, recipe: { ...patch.recipe, version: '1.0.0' } }, businessHash: '0'.repeat(64) } },
      { name: 'ae_verify', arguments: { patch: { ...patch, recipe: { ...patch.recipe, id: 'unknown-recipe' } }, businessHash: '0'.repeat(64) } },
      { name: 'ae_verify', arguments: { patch: { ...patch, changes: [{ ...patch.changes[0], path: '../outside' }] }, businessHash: '0'.repeat(64) } },
      { name: 'ae_verify', arguments: { patch: { ...patch, changes: [{ ...patch.changes[0], path: '.env' }, patch.changes[1]] }, businessHash: '0'.repeat(64) } },
      { name: 'approvePlan', arguments: { approval: true } },
      { name: 'ae_apply', arguments: {} },
      { name: 'ae_revert', arguments: {} },
    ]) {
      let rejected = false;
      try { const result = await client.callTool(request); rejected = result.isError === true; }
      catch (error) { assert.match(String(error), /MCP|tool|argument|schema|method|Invalid/i); rejected = true; }
      assert.equal(rejected, true, JSON.stringify(request));
    }
    // The fixture harness, not an MCP tool, materializes the reviewed preview.
    mkdirSync(join(f.root, 'src/ae'));
    for (const change of preview.changes) writeFileSync(join(f.root, change.path), change.after);
    const appliedReport = data(await client.callTool({ name: 'ae_verify', arguments: { patch, businessHash: sha256(readFileSync(join(f.root, 'src/tickets.ts'), 'utf8')) } }));
    assert.equal(appliedReport.checks.filter((c: {status: string}) => c.status === 'fail').length, 0);
    for (const name of ['host-typecheck', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'browser-acceptance']) {
      const check = appliedReport.checks.find((c: {name: string; status: string}) => c.name === name);
      assert.ok(check, `Static verification must disclose the ${name} gate`);
      assert.equal(check.status, 'not-run', `${name} cannot pass without observed execution evidence`);
    }
    writeFileSync(join(f.root, 'src/App.tsx'), '// changed\n' + readFileSync(join(f.root, 'src/App.tsx'), 'utf8'));
    assert.equal((await client.callTool({ name: 'ae_preview', arguments: { recipeId: 'react-helpdesk', planHash: planned.planHash } })).isError, true);
  } finally { await client.close(); rmSync(f.parent, { recursive: true, force: true }); }
});

test('configured root boundaries and source symlinks are enforced, including after startup', async () => {
  const f = fixture();
  try {
    assert.throws(() => createAeMcpServer({ allowedRepoRoot: '/' }));
    assert.throws(() => createAeMcpServer({ allowedRepoRoot: 'relative' }));
    assert.throws(() => createAeMcpServer({ allowedRepoRoot: join(f.root, 'src') }));
    const alias = join(f.parent, 'alias'); symlinkSync(f.root, alias);
    assert.throws(() => createAeMcpServer({ allowedRepoRoot: alias }));
    const { client } = await connect(f.root);
    try {
      const outside = join(f.parent, 'outside'); writeFileSync(outside, 'FICTIONAL_SECRET_DO_NOT_RETURN');
      unlinkSync(join(f.root, 'src/tickets.ts')); symlinkSync(outside, join(f.root, 'src/tickets.ts'));
      const rejected = await client.callTool({ name: 'ae_assess', arguments: {} });
      assert.equal(rejected.isError, true); assert.equal(JSON.stringify(rejected).includes('FICTIONAL_SECRET'), false);
    } finally { await client.close(); }
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});

test('stdio launch fails closed without operator scope', () => {
  assert.throws(() => execFileSync(process.execPath, [resolve('dist/packages/mcp-server/src/stdio.js')], { env: { PATH: process.env.PATH ?? '' }, stdio: 'pipe', timeout: 5000 }), /startup rejected/);
});
