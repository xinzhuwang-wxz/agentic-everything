import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { captureBaseline, verifyArchive } from '@ae/verification';
import { qualifiedPython } from '@ae/capabilities';
import { ObservationSchema, type BaselineArchive, type Observation, type ProjectAssessment, type Provenance } from '@ae/contracts';
import { inventoryRecipe } from './recipes/python-inventory.js';

export const inventoryProfile = 'python-inventory-synthetic-v1' as const;
export const inventoryHashes: Readonly<Record<string, string>> = Object.freeze({
  'README.md': '6aa756d742b44b8b6106f0c54c48910703b4efcc4930d87fe3d66e99eab85ee2', 'pyproject.toml': '14607bb7f5a29e77eca03c064a8e4a29ba88d385b21ffc3b5563abbc5fe6797e', 'inventory.py': '895c5d262caefa1a5e45c5a58bebf17f2b94031983eecbfb196df6f70dd4eff9', 'test_inventory.py': 'ab05244cbfefb0904096e69b9c2b3cc9c184d1f222380fe076b24f07adbf4b19',
});
export const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const treeHash = (files: Readonly<Record<string, string>>): string => hash(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
export function aeRoot(): string {
  let root = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 7; i++, root = dirname(root)) if (existsSync(join(root, 'package-lock.json')) && existsSync(join(root, 'fixtures/existing-python-inventory'))) return root;
  throw Error('Trusted AE checkout unavailable');
}
export function matchesInventoryAssessment(assessment: ProjectAssessment): boolean {
  return assessment.evidence.length === inventoryRecipe.inputs.length && inventoryRecipe.inputs.every(path => assessment.evidence.find(item => item.path === path)?.sha256 === inventoryHashes[path]);
}
export function inspectInventory(root: string): Record<string, string> {
  if (realpathSync(root) !== resolve(root)) throw Error('Inventory fixture root must not traverse symlinks');
  const allowed = new Set([...inventoryRecipe.inputs, ...inventoryRecipe.outputs]), files: Record<string, string> = {}; let visited = 0;
  const walk = (relative: string): void => {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (!relative && name === '.git') continue;
      const path = relative ? relative + '/' + name : name;
      if (++visited > 16 || (!allowed.has(path) && ![...allowed].some(item => item.startsWith(path + '/')))) throw Error('Unapproved inventory fixture path: ' + path);
      const stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) throw Error('Inventory fixture symlink denied');
      if (stat.isDirectory()) { if (allowed.has(path)) throw Error('Expected inventory file'); walk(path); }
      else if (stat.isFile() && stat.size <= 256 * 1024) files[path] = hash(readFileSync(join(root, path)));
      else throw Error('Nonregular or oversized inventory file');
    }
  };
  walk(''); return files;
}
function git(root: string, args: string[]): string { return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 }).trim(); }
export function inspectInventoryOriginal(root: string): string {
  if (treeHash(inspectInventory(root)) !== treeHash(inventoryHashes)) throw Error('Original is not the exact reviewed inventory fixture');
  if (git(root, ['rev-parse', '--show-toplevel']) !== realpathSync(root)) throw Error('Original inventory must be an exact Git root');
  if (git(root, ['config', '--list']).split('\n').some(line => /^filter\./i.test(line))) throw Error('Configured Git filters require separate execution review');
  if (git(root, ['status', '--porcelain', '--untracked-files=all'])) throw Error('Original inventory must be clean');
  const commit = git(root, ['rev-parse', 'HEAD']);
  const entries = git(root, ['ls-tree', '-rz', '--full-tree', 'HEAD']).split('\0').filter(Boolean);
  if (entries.length !== inventoryRecipe.inputs.length) throw Error('Committed inventory fixture tree differs');
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match || !inventoryRecipe.inputs.includes(match[3]!)) throw Error('Committed inventory path differs');
    const bytes = readFileSync(join(root, match[3]!));
    const blob = createHash(commit.length === 64 ? 'sha256' : 'sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    if (blob !== match[2]) throw Error('Committed inventory content differs');
  }
  return commit;
}
export function assertTrustedInventoryDelivery(input: { sourceRoot: string; candidateRoot: string }) {
  inspectInventoryOriginal(input.sourceRoot);
  const sourceFiles = inspectInventory(input.sourceRoot), expected = { ...sourceFiles };
  for (const change of inventoryRecipe.preview(path => existsSync(join(input.sourceRoot, path)) ? readFileSync(join(input.sourceRoot, path), 'utf8') : null)) expected[change.path] = hash(change.after);
  const candidateFiles = inspectInventory(input.candidateRoot);
  if (treeHash(candidateFiles) !== treeHash(expected)) throw Error('Candidate is not the exact reviewed inventory recipe output');
  return { sourceFiles, candidateFiles, sourceTreeHash: treeHash(sourceFiles), candidateTreeHash: treeHash(candidateFiles) };
}
export function python(script: string, args: string[], input?: string, deadlineAt = Number.POSITIVE_INFINITY): string {
  if (deadlineAt <= Date.now()) throw Error('Inventory verification total budget exhausted');
  const interpreter = qualifiedPython(undefined, deadlineAt);
  const remaining = deadlineAt - Date.now(); if (remaining <= 0) throw Error('Inventory verification total budget exhausted');
  const child = spawnSync(interpreter, ['-I', '-B', '-c', 'import os; os.setsid()\n' + script, ...args], { input, encoding: 'utf8', timeout: Math.min(5000, remaining), killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1' } });
  let remainingGroup = false; if (child.pid) { try { process.kill(-child.pid, 0); remainingGroup = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
  if (remainingGroup) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  if (child.error || child.status !== 0 || child.signal !== null || Date.now() > deadlineAt || remainingGroup) throw Error('Inventory Python process did not finish cleanly: ' + (child.error?.message ?? child.stderr ?? child.signal));
  return child.stdout;
}
const seed = 'inventory-sqlite-v1';
export const inventoryCaseIds = ['list', 'read', 'reserve', 'overstock', 'stale', 'cross-tenant', 'viewer-write', 'invalid-quantity', 'idempotent-replay', 'operation-conflict', 'receipt-query', 'missing-receipt', 'current-rights-revoked'];
const coverage = { scope: 'Exact synthetic Python stock list/read/reservation, atomic receipt replay and current-rights isolation', unknowns: ['Synthetic local SQLite and fixture identities only; not production authentication, concurrency at production scale, browser UI or arbitrary Python projects.'] };
export function inventoryProvenance(sourceVersion: string, codeHash = treeHash(inventoryHashes)): Provenance {
  const version = python('import sys; assert sys.version_info >= (3,11); print(sys.version.split()[0])', []).trim();
  return { sourceVersion, codeHash, environment: 'Python ' + version + '; isolated exact synthetic SQLite inventory; no external model', environmentHash: hash(JSON.stringify({ python: version, lockfile: hash(readFileSync(join(aeRoot(), 'package-lock.json'))) })), dataHash: hash(seed), schemaVersion: '1', adapterVersion: 'trusted-inventory-delivery-v1' };
}
const COLLECTOR = `import json, sys
sys.path.insert(0, sys.argv[1])
from inventory import Inventory, InventoryError
host = Inventory(sys.argv[2])
if len(sys.argv) > 4 and sys.argv[4] == "adapter":
    import importlib.util
    spec = importlib.util.spec_from_file_location("reviewed_adapter", sys.argv[1] + "/agentic/ae_adapter.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    original = host
    class Adapter:
        def call(self, principal, operation, arguments, operation_id=None):
            request = {"id":"case", "operation":operation, "principal":principal, "arguments":arguments}
            if operation_id is not None: request["operationId"] = operation_id
            return module.dispatch(request, sys.argv[2])
        def list_stock(self, principal): return self.call(principal,"list_stock",{})
        def read_stock(self, principal, sku): return self.call(principal,"read_stock",{"sku":sku})
        def reserve_stock(self, principal, sku, order, quantity, version, operation): return self.call(principal,"reserve_stock",{"sku":sku,"orderId":order,"quantity":quantity,"expectedVersion":version},operation)
        def query_operation(self, principal, operation): return self.call(principal,"query_operation",{},operation)
        def set_principal_rights(self, principal, roles, scopes): return original.set_principal_rights(principal,roles,scopes)
    host = Adapter()
alice = {"tenantId":"tenant-a","applicationId":"inventory-fixture","subjectId":"alice","roles":["operator"],"scopes":["inventory:read","inventory:reserve"]}
bob = {**alice,"subjectId":"bob","roles":["viewer"],"scopes":["inventory:read"]}
case = sys.argv[3]
before = host.read_stock(alice,"desk-01")
def reserve(quantity=3,version=1,order="order-1",principal=alice):
    return host.reserve_stock(principal,"desk-01",order,quantity,version,"op-1")
try:
    if case == "list": output = host.list_stock(alice)
    elif case == "read": output = before
    elif case == "reserve": output = reserve()
    elif case == "overstock": output = reserve(13)
    elif case == "stale": output = reserve(version=2)
    elif case == "cross-tenant": output = host.read_stock(alice,"desk-02")
    elif case == "viewer-write": output = reserve(principal=bob)
    elif case == "invalid-quantity": output = reserve(0)
    elif case == "idempotent-replay":
        reserve()
        output = reserve()
    elif case == "operation-conflict":
        reserve()
        output = reserve(order="order-2")
    elif case == "receipt-query":
        reserve()
        output = host.query_operation(alice,"op-1")
    elif case == "missing-receipt": output = host.query_operation(alice,"op-1")
    elif case == "current-rights-revoked":
        host.set_principal_rights(alice,["viewer"],["inventory:read"])
        output = reserve()
    else: raise ValueError("Unknown reviewed case")
except InventoryError as error:
    output = {"error":error.code}
after = host.read_stock(alice,"desk-01") if case != "current-rights-revoked" else host.read_stock({**alice,"roles":["viewer"]},"desk-01")
print(json.dumps({"output":output,"sideEffects":[] if before==after else [after],"receipt":{"beforeVersion":before["version"],"afterVersion":after["version"]}},sort_keys=True))
`;
export function executeInventoryCase(root: string, id: string, viaAdapter = false, deadlineAt = Number.POSITIVE_INFINITY): Observation {
  if (!inventoryCaseIds.includes(id)) throw Error('Unknown reviewed inventory case');
  const work = mkdtempSync(join(tmpdir(), 'ae-inventory-case-'));
  try { return ObservationSchema.parse(JSON.parse(python(COLLECTOR, [root, join(work, 'inventory.sqlite'), id, viaAdapter ? 'adapter' : 'original'], undefined, deadlineAt))); }
  finally { rmSync(work, { recursive: true, force: true }); }
}
export function expectedInventoryObservation(id: string): Observation {
  const stock = { sku: 'desk-01', tenantId: 'tenant-a', available: 12, version: 1 }, changed = { ...stock, available: 9, version: 2 };
  const succeeded = { status: 'succeeded', operationId: 'op-1', receiptId: 'receipt-op-1', data: { stock: changed, orderId: 'order-1', quantity: 3 } };
  const mutated = ['reserve', 'idempotent-replay', 'operation-conflict', 'receipt-query'].includes(id);
  const errors: Record<string, string> = { overstock: 'insufficient_stock', stale: 'stale_version', 'cross-tenant': 'access_denied', 'viewer-write': 'access_denied', 'invalid-quantity': 'invalid_input', 'operation-conflict': 'operation_conflict', 'current-rights-revoked': 'access_denied' };
  const output = id === 'list' ? [stock] : id === 'read' ? stock : ['reserve', 'idempotent-replay', 'receipt-query'].includes(id) ? succeeded : id === 'missing-receipt' ? { status: 'outcome-unknown', operationId: 'op-1', message: 'No host receipt found' } : { error: errors[id]! };
  return { output, sideEffects: mutated ? [changed] : [], receipt: { beforeVersion: 1, afterVersion: mutated ? 2 : 1 } };
}
function testCase(id: string) { return { id, input: { operation: id }, seed: { fixture: seed }, covers: [id] }; }
const canonical = (value: unknown): string => value && typeof value === 'object' ? Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}' : JSON.stringify(value);
export async function assertInventoryBaseline(value: unknown, binding: { sourceRoot?: string; sourceVersion?: string } = {}): Promise<BaselineArchive> {
  const archive = verifyArchive(value);
  const sourceVersion = binding.sourceRoot ? inspectInventoryOriginal(binding.sourceRoot) : binding.sourceVersion ?? archive.manifest.provenance.sourceVersion;
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(sourceVersion) || binding.sourceVersion !== undefined && binding.sourceVersion !== sourceVersion) throw Error('Inventory baseline source binding mismatch');
  if (canonical(archive.manifest.provenance) !== canonical(inventoryProvenance(sourceVersion))) throw Error('Inventory baseline provenance mismatch');
  if (archive.manifest.safety !== 'isolated-seeded-fixture' || archive.manifest.normalization.length || canonical(archive.manifest.coverage) !== canonical(coverage) || canonical(archive.manifest.cases.map(c => c.test.id)) !== canonical(inventoryCaseIds)) throw Error('Inventory baseline fixed suite drift');
  for (const item of archive.manifest.cases) if (canonical(item.test) !== canonical(testCase(item.test.id)) || canonical(item.observation) !== canonical(expectedInventoryObservation(item.test.id))) throw Error('Inventory baseline semantic mismatch: ' + item.test.id);
  return archive;
}
export async function captureInventoryBaseline(input: { sourceRoot: string; deadlineAt?: number }): Promise<BaselineArchive> {
  const sourceVersion = inspectInventoryOriginal(input.sourceRoot);
  const archive = await captureBaseline({ adapter: { safety: 'isolated-seeded-fixture', async execute(test) { if (inspectInventoryOriginal(input.sourceRoot) !== sourceVersion) throw Error('Original inventory drift during capture'); return executeInventoryCase(input.sourceRoot, test.id, false, input.deadlineAt); } }, cases: inventoryCaseIds.map(testCase), provenance: inventoryProvenance(sourceVersion), normalization: [], coverage });
  return assertInventoryBaseline(archive, { sourceRoot: input.sourceRoot, sourceVersion });
}
