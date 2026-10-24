import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Explicit opt-in, isolated database only; never discovers or reads host credentials.
const databaseUrl = process.argv[2];
if (!databaseUrl) throw new Error('Pass the isolated synthetic PostgreSQL URL explicitly');
const target = new URL(databaseUrl);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.pathname, '/ae_durability_qualification');
assert.equal(target.password, '');
const directory = mkdtempSync(join(tmpdir(), 'ae-dbos-qualification-'));
const prefix = randomUUID();
const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url));
async function run(mode, kind) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, mode, databaseUrl, directory, prefix, kind], {
      // Deliberately do not inherit application/provider/cloud credentials or DBOS overrides.
      env: { PATH: '/usr/bin:/bin', HOME: directory, TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '', killed = false;
    const deadline = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Timeout ${mode}/${kind}: ${output}`)); }, 40_000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (mode === 'crash' && output.includes('"event":"inflight"')) { killed = true; child.kill('SIGKILL'); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      clearTimeout(deadline);
      writeFileSync(join(directory, `${kind}-${mode}.log`), output);
      if (killed && signal === 'SIGKILL') return resolve({ killed: true });
      if (code !== 0) return reject(new Error(`${mode}/${kind} exit ${code}/${signal}: ${output}`));
      const events = output.split('\n').filter(line => line.startsWith('AE_QUALIFICATION ')).map(line => JSON.parse(line.slice(17)));
      resolve({ events });
    });
  });
}
const count = label => readFileSync(join(directory, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(x => x.label === label).length;
for (const kind of ['resume', 'unknown']) {
  assert.deepEqual(await run('crash', kind), { killed: true });
  const recovery = await run('recover', kind);
  assert.equal(recovery.events.find(x => x.event === 'recovered').status.status, 'SUCCESS');
  assert.deepEqual(recovery.events.find(x => x.event === 'duplicate').result, { kind, done: true });
  assert.equal(count(`${kind}:completed-step`), 1, 'Checkpointed step must not be repeated');
  assert.equal(count(`${kind}:attempt`), 2, 'Uncheckpointed step is attempted again');
  assert.equal(count(`${kind}:final-step`), 1, 'Duplicate workflow ID does not repeat completed work');
}
assert.equal(count('unknown:host-effect'), 1);
assert.equal(count('unknown:reconciled'), 1);
const cancellation = await run('cancel', 'cancel');
assert.equal(cancellation.events.find(x => x.event === 'cancelled').status.status, 'CANCELLED');
assert.equal(count('cancel:inflight-return'), 1, 'Cancellation does not undo or forcibly abort an in-flight step');
assert.equal(count('cancel:final-step'), 0, 'Cancellation prevents next step');
const report = { passed: true, prefix, directory, cases: ['SIGKILL/relaunch', 'completed-step replay suppression', 'same-workflow-ID deduplication', 'unfinished-step reattempt', 'host idempotency/reconciliation fixture', 'cooperative cancellation boundary'], scope: 'Real DBOS/PostgreSQL; synthetic steps, not AE runtime integration, not provider validation' };
writeFileSync(join(directory, 'result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
