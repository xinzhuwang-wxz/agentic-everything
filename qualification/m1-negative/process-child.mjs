// Test-only fault child. Production accepts no child/command override.
import { createServer, connect } from 'node:net';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [mode, json] = process.argv.slice(2), input = JSON.parse(json);
const observation = { mode, pid: process.pid, startedAt: new Date().toISOString(), sigtermCount: 0 };
const save = () => writeFileSync(join(input.outputDirectory, 'fault-observation.json'), JSON.stringify(observation, null, 2));
const report = cleanup => writeFileSync(join(input.outputDirectory, 'report.json'), JSON.stringify({
  status: 'pass', checks: [{ name: 'synthetic-observation-before-terminal-fault', status: 'pass', expected: 'Test sentinel only, not product acceptance', actual: 'Observed before injected terminal fault', evidence: [] }], cleanup,
}));
save();
if (mode === 'timeout') {
  process.on('SIGTERM', () => { observation.sigtermCount++; save(); });
  setInterval(() => {}, 1000); // No report, real timeout + escalation must terminate this child.
} else if (mode === 'cleanup-hang') {
  const server = createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const socket = connect(server.address().port, '127.0.0.1');
  await new Promise(resolve => socket.once('connect', resolve));
  observation.openConnections = await new Promise(resolve => server.getConnections((error, count) => { if (error) throw error; resolve(count); }));
  observation.cleanupStartedAt = new Date().toISOString(); save();
  report({ status: 'pending', reason: 'Real server.close callback blocked by an open owned connection' });
  process.on('SIGTERM', () => { observation.sigtermCount++; save(); });
  // Deliberately do not destroy the owned socket. The real callback cannot resolve.
  await new Promise(resolve => server.close(() => { observation.cleanupCallbackReturned = true; save(); resolve(); }));
  throw Error('Injected open-connection cleanup unexpectedly completed');
} else if (mode === 'cleanup-failed') {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => server.close(resolve));
  const error = await new Promise(resolve => server.close(resolve));
  if (error?.code !== 'ERR_SERVER_NOT_RUNNING') throw Error('Expected real Node cleanup error');
  observation.cleanupError = error.code; observation.cleanupCompletedAt = new Date().toISOString(); save();
  report({ status: 'failed', errors: [error.code] }); // Exit 0 must not override failed cleanup.
} else throw Error('Unknown bounded test mode');
