import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureBaseline, compareBaseline, improvementRegistryHash, writeBaseline } from '@ae/verification';
import { candidate, cases, fixture, improvement, provenance } from './synthetic.js';
// Explicit local synthetic capture. Use a fresh destination: evidence is never overwritten.
const destination = process.argv[2];
if (!destination) throw new Error('Supply a fresh local evidence directory');
mkdirSync(destination, { recursive: false });
const baseline = await captureBaseline({ adapter: fixture(), cases, provenance, normalization: [{ path: ['receipt', 'timestamp'], kind: 'nondeterministic', reason: 'Synthetic clock label only', evidence: 'tests/differential/synthetic.ts' }], coverage: { scope: 'Three synthetic pagination cases; response, declared effects and receipt', unknowns: ['No customer host tested', 'No real transport, concurrency, authorization or hidden effects tested', 'Finite inputs do not establish complete equivalence'] } });
writeBaseline(join(destination, 'baseline.json'), baseline);
for (const [name, enabled, adapter] of [['off-parity', false, fixture({ clock: 'after' })], ['on-approved', true, fixture({ clock: 'after' })], ['off-unexpected-fix', false, fixture({ forceFix: true })], ['on-unexpected-side-effect', true, fixture({ extraEffect: true })]] as const) {
  const configuration = { baselineHash: baseline.hash, candidateCodeHash: candidate.codeHash, registryHash: improvementRegistryHash([improvement]), enabled: enabled ? [{ id: improvement.id, version: improvement.version, approvalRef: 'synthetic-fixture-review-only', reviewer: 'fixture-test-author' }] : [] };
  const report = await compareBaseline({ baseline, adapter, provenance: candidate, configuration, improvements: [improvement] });
  writeFileSync(join(destination, name + '.json'), JSON.stringify({ configuration, improvements: [improvement], report }, null, 2) + '\n', { flag: 'wx' });
  console.log(name + ': ' + (report.passed ? 'PASS' : 'FAIL (expected negative control)'));
}
