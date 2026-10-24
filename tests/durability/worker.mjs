// Synthetic durability fixture only. Does not import AE policy/runtime or call a model.
import { DBOS } from '@dbos-inc/dbos-sdk';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const [mode, databaseUrl, directory, prefix] = process.argv.slice(2);
const emit = (event, detail = {}) => console.log('AE_QUALIFICATION ' + JSON.stringify({ event, ...detail }));
const record = label => appendFileSync(`${directory}/events.jsonl`, JSON.stringify({ label }) + '\n');
const workflow = DBOS.registerWorkflow(async function syntheticWorkflow(kind) {
  await DBOS.runStep(async () => { record(`${kind}:completed-step`); return 'recorded'; }, { name: 'completed-step' });
  await DBOS.runStep(async () => {
    record(`${kind}:attempt`);
    if (kind === 'unknown') {
      // Simulates a separate idempotent host. Ledger is NOT a durable execution engine.
      const receipt = `${directory}/host-receipt`;
      if (!existsSync(receipt)) { writeFileSync(receipt, 'synthetic-effect'); record('unknown:host-effect'); }
      else { if (readFileSync(receipt, 'utf8') !== 'synthetic-effect') throw new Error('Receipt mismatch'); record('unknown:reconciled'); }
    }
    emit('inflight', { kind });
    if (mode === 'crash') await delay(60_000);
    if (kind === 'cancel') await delay(700);
    record(`${kind}:inflight-return`);
    return 'receipt';
  }, { name: 'external-fixture', retriesAllowed: false });
  await DBOS.runStep(async () => { record(`${kind}:final-step`); }, { name: 'final-step' });
  return { kind, done: true };
}, { name: 'ae-synthetic-qualification' });
DBOS.setConfig({ name: 'ae-durability-qualification', applicationVersion: 'qualification-v1', executorID: 'ae-qualification-worker', systemDatabaseUrl: databaseUrl, logLevel: 'warn', enableOTLP: false });
await DBOS.launch();
const kind = process.argv[6];
const id = `${prefix}-${kind}`;
try {
  if (mode === 'crash') {
    const handle = await DBOS.startWorkflow(workflow, { workflowID: id })(kind);
    await handle.getResult();
  } else if (mode === 'recover') {
    const handle = DBOS.retrieveWorkflow(id);
    const result = await handle.getResult();
    emit('recovered', { result, status: await handle.getStatus() });
    const duplicate = await DBOS.startWorkflow(workflow, { workflowID: id })(kind);
    emit('duplicate', { result: await duplicate.getResult() });
  } else if (mode === 'cancel') {
    const handle = await DBOS.startWorkflow(workflow, { workflowID: id })(kind);
    // Wait until the durable step's external fixture has actually started.
    for (let i = 0; i < 100; i++) {
      if (existsSync(`${directory}/events.jsonl`) && readFileSync(`${directory}/events.jsonl`, 'utf8').includes('cancel:attempt')) break;
      await delay(20);
    }
    await DBOS.cancelWorkflow(id);
    await delay(900);
    emit('cancelled', { status: await handle.getStatus() });
  }
} finally { await DBOS.shutdown(); }
