import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { captureBaseline, verifyArchive } from '@ae/verification';
import { ObservationSchema, type BaselineArchive, type Observation, type ProjectAssessment, type Provenance } from '@ae/contracts';
import { javaSpringRecipe } from './recipes/java-spring-inventory.js';
import { hash, treeHash } from './inventory-baseline.js';
import { compileJava, originalJavaBatch, launchJava, javaVersion, javaDependencies, type JavaCommand } from './java-process.js';

export const javaProfile = 'java-spring-inventory-synthetic-v1' as const;
export const javaHashes: Readonly<Record<string, string>> = Object.freeze({
  "README.md": "2682c1a82b8f0e8eff311af6eafcbfdbdc86576b3ca3e0fe3e010e89b679495f",
  "pom.xml": "0b2b2b7a19f5e1dfdfaff60a0c6877fb4eb5b3b8d724a1017faf741008c5fbae",
  "InventoryCli.java": "9403e0881cf1bd1b0d978fd22465924dfbbcab79d5d4f4dfc580156791b604b8",
  "Inventory.java": "44092c24a852837459a9ab9a23c93b2539dac4e9b7e54f38d2b3bfd400ecb28d"
});
export function matchesJavaAssessment(assessment: ProjectAssessment): boolean {
  return assessment.evidence.length === javaSpringRecipe.inputs.length && javaSpringRecipe.inputs.every(path => assessment.evidence.find(item => item.path === path)?.sha256 === javaHashes[path]);
}
export function inspectJava(root: string): Record<string, string> {
  if (realpathSync(root) !== resolve(root)) throw Error('Java fixture root must not traverse symlinks');
  const allowed = new Set([...javaSpringRecipe.inputs, ...javaSpringRecipe.outputs]), files: Record<string, string> = {}; let visited = 0;
  const walk = (relative: string): void => {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (!relative && name === '.git') continue;
      const path = relative ? relative + '/' + name : name;
      if (++visited > 16 || (!allowed.has(path) && ![...allowed].some(item => item.startsWith(path + '/')))) throw Error('Unapproved Java fixture path: ' + path);
      const stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) throw Error('Java fixture symlink denied');
      if (stat.isDirectory()) { if (allowed.has(path)) throw Error('Expected Java file'); walk(path); }
      else if (stat.isFile() && stat.size <= 256 * 1024) files[path] = hash(readFileSync(join(root, path)));
      else throw Error('Nonregular or oversized Java file');
    }
  };
  walk(''); return files;
}
function git(root: string, args: string[]): string { return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 }).trim(); }
export function inspectJavaOriginal(root: string): string {
  if (treeHash(inspectJava(root)) !== treeHash(javaHashes)) throw Error('Original is not the exact reviewed Java fixture');
  if (git(root, ['rev-parse', '--show-toplevel']) !== realpathSync(root)) throw Error('Original Java must be an exact Git root');
  if (git(root, ['config', '--list']).split('\n').some(line => /^filter\./i.test(line))) throw Error('Configured Git filters require separate execution review');
  if (git(root, ['status', '--porcelain', '--untracked-files=all'])) throw Error('Original Java must be clean');
  const commit = git(root, ['rev-parse', 'HEAD']);
  const entries = git(root, ['ls-tree', '-rz', '--full-tree', 'HEAD']).split('\0').filter(Boolean);
  if (entries.length !== javaSpringRecipe.inputs.length) throw Error('Committed Java fixture tree differs');
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match || !javaSpringRecipe.inputs.includes(match[3]!)) throw Error('Committed Java path differs');
    const bytes = readFileSync(join(root, match[3]!));
    const blob = createHash(commit.length === 64 ? 'sha256' : 'sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    if (blob !== match[2]) throw Error('Committed Java content differs');
  }
  return commit;
}
export function assertTrustedJavaDelivery(input: { sourceRoot: string; candidateRoot: string }) {
  inspectJavaOriginal(input.sourceRoot);
  const sourceFiles = inspectJava(input.sourceRoot), expected = { ...sourceFiles };
  for (const change of javaSpringRecipe.preview(path => existsSync(join(input.sourceRoot, path)) ? readFileSync(join(input.sourceRoot, path), 'utf8') : null)) expected[change.path] = hash(change.after);
  const candidateFiles = inspectJava(input.candidateRoot);
  if (treeHash(candidateFiles) !== treeHash(expected)) throw Error('Candidate is not the exact reviewed Java recipe output');
  return { sourceFiles, candidateFiles, sourceTreeHash: treeHash(sourceFiles), candidateTreeHash: treeHash(candidateFiles) };
}

export const javaCaseIds = ['read', 'reserve', 'overstock', 'stale', 'cross-tenant', 'viewer-write', 'invalid-quantity', 'overflow-quantity', 'extra-argument', 'idempotent-replay', 'operation-conflict', 'receipt-query', 'missing-receipt', 'cross-tenant-receipt'];
const seed = 'java-atomic-file-stock-v1';
const coverage = { scope: 'Exact existing Java/Spring Core CLI versus generated authenticated adapter: stock quantities, orders, optimistic versions, receipt/idempotency, input validation, viewer and tenant isolation', unknowns: ['Synthetic identities and single-writer atomic JSON file only. Not Spring Boot/MVC, production IAM/TLS, database transactions, crash/power-loss safety, arbitrary Java source, real provider inference or all possible business inputs.'] };
export const javaNormalization: BaselineArchive['manifest']['normalization'] = ['generatedId', 'observedId'].map(field => ({ path: ['receipt', field], reason: 'Inventory allocates a random UUID for each committed receipt; exact replay and persisted/returned identity equality are separately checked.', evidence: 'Unchanged Inventory.java UUID.randomUUID(); original/candidate collectors retain raw IDs and require UUID syntax, replay equality and the same persisted receipt.', kind: 'nondeterministic' }));
export function javaProvenance(sourceVersion: string, codeHash = treeHash(javaHashes)): Provenance {
  const version = javaVersion(), dependencyLockHash = javaDependencies().lockHash;
  return { sourceVersion, codeHash, environment: version.split('\n')[0] + '; real Spring Core 6.2.19; exact isolated synthetic inventory; no external model', environmentHash: hash(JSON.stringify({ version, dependencyLockHash })), dataHash: hash(seed), schemaVersion: '1', adapterVersion: 'trusted-java-spring-delivery-v1' };
}
const read: JavaCommand = { subject: 'alice', operation: 'read_stock', arguments: { sku: 'desk-01' } };
function reservation(overrides: Record<string, unknown> = {}, subject = 'alice'): JavaCommand { return { subject, operation: 'reserve_stock', arguments: { sku: 'desk-01', orderId: 'order-1', quantity: 3, expectedVersion: 1, ...overrides }, operationId: 'op-1' }; }
export function javaCaseCommands(id: string): JavaCommand[] {
  if (!javaCaseIds.includes(id)) throw Error('Unknown reviewed Java case');
  const query: JavaCommand = { subject: 'alice', operation: 'query_operation', arguments: {}, operationId: 'op-1' };
  const actions: Record<string, JavaCommand[]> = {
    read: [read], reserve: [reservation()], overstock: [reservation({ quantity: 13 })], stale: [reservation({ expectedVersion: 2 })],
    'cross-tenant': [{ ...read, subject: 'mallory' }], 'viewer-write': [reservation({}, 'bob')],
    'invalid-quantity': [reservation({ quantity: 0 })], 'overflow-quantity': [reservation({ quantity: 2147483648 })],
    'extra-argument': [reservation({ tenantId: 'tenant-b' })], 'idempotent-replay': [reservation(), reservation()],
    'operation-conflict': [reservation(), reservation({ orderId: 'order-2' })], 'receipt-query': [reservation(), query],
    'missing-receipt': [query], 'cross-tenant-receipt': [reservation(), { ...query, subject: 'mallory' }],
  };
  return [read, ...actions[id]!, read];
}
function observation(id: string, results: Record<string, any>[], database: string): Observation {
  assert.equal(results.length, javaCaseCommands(id).length);
  const before = results[0]!, after = results.at(-1)!, raw = structuredClone(results.at(-2)!);
  const state = existsSync(database) ? JSON.parse(readFileSync(database, 'utf8')) : { mutationCount: 0, operations: {} };
  const entries = Object.entries(state.operations) as [string, { result: Record<string, any> }][];
  assert.ok(entries.length <= 1, 'Unexpected Java ledger effects');
  const persistedId = entries[0]?.[1].result.receiptId ?? null, observedId = raw.receiptId ?? null;
  if (persistedId !== null) assert.match(persistedId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  if (observedId !== null) assert.equal(observedId, persistedId, 'Returned receipt must equal the persisted receipt');
  const replayEqual = id !== 'idempotent-replay' || JSON.stringify(results[1]) === JSON.stringify(results[2]);
  assert.equal(replayEqual, true, 'Replay changed the original receipt');
  if (Object.hasOwn(raw, 'receiptId')) delete raw.receiptId; // Preserved without alteration in receipt.observedId, with an exact declared normalization path.
  if (entries.length) assert.deepEqual(entries[0]![1].result.data.stock, after);
  return ObservationSchema.parse({ output: raw, sideEffects: JSON.stringify(before) === JSON.stringify(after) ? [] : [after], receipt: { beforeVersion: before.version, afterVersion: after.version, mutationCount: state.mutationCount, receiptKey: entries[0]?.[0] ?? null, generatedId: persistedId, observedId, replayEqual } });
}
/** The fixture build is already byte-verified by capture/delivery. No caller source or shell commands are accepted. */
export async function executeJavaCase(classes: string, id: string, viaAdapter: boolean, deadlineAt: number): Promise<Observation> {
  const work = mkdtempSync(join(tmpdir(), 'ae-java-case-')), database = join(work, 'stock.json');
  try {
    const commands = javaCaseCommands(id);
    if (!viaAdapter) return observation(id, originalJavaBatch(classes, database, commands, deadlineAt).results, database);
    const server = await launchJava(classes, database, deadlineAt);
    try { const results = []; for (const command of commands) results.push(await server.invoke(command)); return observation(id, results, database); }
    finally { await server.stop(); }
  } finally { rmSync(work, { recursive: true, force: true }); }
}
export function expectedJavaObservation(id: string): Observation {
  if (!javaCaseIds.includes(id)) throw Error('Unknown reviewed Java case');
  const stock = { sku: 'desk-01', tenantId: 'tenant-a', available: 12, version: 1 }, changed = { ...stock, available: 9, version: 2 };
  const mutated = ['reserve', 'idempotent-replay', 'operation-conflict', 'receipt-query', 'cross-tenant-receipt'].includes(id);
  const success = ['reserve', 'idempotent-replay', 'receipt-query'].includes(id);
  const errors: Record<string, string> = { overstock: 'INSUFFICIENT_STOCK', stale: 'RESOURCE_VERSION_CONFLICT', 'cross-tenant': 'RESOURCE_DENIED', 'viewer-write': 'AUTHORITY_DENIED', 'invalid-quantity': 'INVALID_INPUT', 'overflow-quantity': 'INVALID_INPUT', 'extra-argument': 'INVALID_INPUT', 'operation-conflict': 'OPERATION_CONFLICT' };
  return { output: id === 'read' ? stock : success ? { status: 'succeeded', operationId: 'op-1', data: { stock: changed, orderId: 'order-1', quantity: 3 } } : ['missing-receipt', 'cross-tenant-receipt'].includes(id) ? { status: 'outcome-unknown', operationId: 'op-1', message: 'No authoritative host receipt; do not retry.' } : { error: errors[id]! }, sideEffects: mutated ? [changed] : [], receipt: { beforeVersion: 1, afterVersion: mutated ? 2 : 1, mutationCount: mutated ? 1 : 0, receiptKey: mutated ? '["tenant-a","java-inventory","alice","op-1"]' : null, generatedId: mutated ? '<uuid>' : null, observedId: success ? '<uuid>' : null, replayEqual: true } };
}
export function assertJavaObservation(id: string, value: Observation): void {
  const observed = structuredClone(ObservationSchema.parse(value));
  const receipt = observed.receipt as Record<string, any>, expected = expectedJavaObservation(id), expectedReceipt = expected.receipt as Record<string, any>;
  for (const field of ['generatedId', 'observedId']) {
    if (expectedReceipt[field] === null) assert.equal(receipt[field], null);
    else { assert.match(receipt[field], /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/); receipt[field] = '<uuid>'; }
  }
  const original = value.receipt as Record<string, any>; if (original.observedId !== null) assert.equal(original.observedId, original.generatedId);
  assert.deepEqual(observed, expected);
}
function testCase(id: string) { return { id, input: { commands: javaCaseCommands(id) } as any, seed: { fixture: seed }, covers: [id] }; }
export async function assertJavaBaseline(value: unknown, binding: { sourceRoot?: string; sourceVersion?: string } = {}): Promise<BaselineArchive> {
  const archive = verifyArchive(value), sourceVersion = binding.sourceRoot ? inspectJavaOriginal(binding.sourceRoot) : binding.sourceVersion ?? archive.manifest.provenance.sourceVersion;
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(sourceVersion) || binding.sourceVersion !== undefined && sourceVersion !== binding.sourceVersion) throw Error('Java baseline source binding mismatch');
  assert.deepEqual(archive.manifest.provenance, javaProvenance(sourceVersion)); assert.equal(archive.manifest.safety, 'isolated-seeded-fixture');
  assert.deepEqual(archive.manifest.normalization, javaNormalization); assert.deepEqual(archive.manifest.coverage, coverage); assert.deepEqual(archive.manifest.cases.map(item => item.test.id), javaCaseIds);
  for (const item of archive.manifest.cases) { assert.deepEqual(item.test, testCase(item.test.id)); assertJavaObservation(item.test.id, item.observation); }
  return archive;
}
export async function captureJavaBaseline(input: { sourceRoot: string; deadlineAt?: number }): Promise<BaselineArchive> {
  const sourceVersion = inspectJavaOriginal(input.sourceRoot), deadlineAt = input.deadlineAt ?? Date.now() + 120_000, work = mkdtempSync(join(tmpdir(), 'ae-java-baseline-'));
  try {
    compileJava(input.sourceRoot, work, javaSpringRecipe.inputs.filter(path => path.endsWith('.java')), deadlineAt);
    const archive = await captureBaseline({ adapter: { safety: 'isolated-seeded-fixture', async execute(test) { if (inspectJavaOriginal(input.sourceRoot) !== sourceVersion) throw Error('Original Java source drift'); return executeJavaCase(work, test.id, false, deadlineAt); } }, cases: javaCaseIds.map(testCase), provenance: javaProvenance(sourceVersion), normalization: javaNormalization, coverage });
    return assertJavaBaseline(archive, { sourceRoot: input.sourceRoot, sourceVersion });
  } finally { rmSync(work, { recursive: true, force: true }); }
}
