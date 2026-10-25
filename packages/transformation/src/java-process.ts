import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Principal } from '@ae/contracts';
import { aeRoot, hash } from './inventory-baseline.js';

export const javaAlice: Principal = { tenantId: 'tenant-a', applicationId: 'java-inventory', subjectId: 'alice', roles: ['operator'], scopes: ['inventory:read', 'inventory:reserve'] };
export const javaBob: Principal = { ...javaAlice, subjectId: 'bob', roles: ['viewer'], scopes: ['inventory:read'] };
export const javaMallory: Principal = { ...javaAlice, tenantId: 'tenant-b', subjectId: 'mallory' };
const principals = [javaAlice, javaBob, javaMallory];
export function javaBudget(deadlineAt: number, maximum = 15_000): number {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw Error('Java verification total budget exhausted');
  return Math.min(remaining, maximum);
}
export function javaCommand(args: string[], input: string | undefined, deadlineAt: number, maximum = 15_000): string {
  const child = spawnSync('/usr/bin/java', args, { input, encoding: 'utf8', timeout: javaBudget(deadlineAt, maximum), killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  if (child.error || child.status !== 0 || child.signal || Date.now() > deadlineAt) throw Error('Reviewed Java process failed: ' + (child.error?.message ?? child.stderr));
  return child.stdout;
}
export function javaVersion(): string {
  const child = spawnSync('/usr/bin/java', ['--version'], { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  if (child.error || child.status !== 0 || child.signal || !/^openjdk 21\./.test(child.stdout)) throw Error('Reviewed Java 21 required');
  return child.stdout.trim();
}
export function javaDependencies(): { classpath: string; lockHash: string } {
  const root = join(aeRoot(), 'qualification/java-spring'), bytes = readFileSync(join(root, 'dependencies.lock.json'));
  if (hash(bytes) !== '98e5d670207fdd2c5846afa693a1d7bec5ad96f6e96f236660ea48b1a2b1a60b') throw Error('Reviewed Java dependency lock drift');
  const lock = JSON.parse(bytes.toString()) as { artifacts: { artifact: string; version: string; sha256: string }[] };
  const jars = lock.artifacts.map(artifact => {
    const path = join(root, '.cache', artifact.artifact + '-' + artifact.version + '.jar');
    if (!existsSync(path)) throw Error('Verified Java dependency cache missing; run the separately authorized official Java preparation first');
    if (!lstatSync(path).isFile() || hash(readFileSync(path)) !== artifact.sha256) throw Error('Java dependency checksum mismatch');
    return path;
  });
  return { classpath: jars.join(':'), lockHash: hash(bytes) };
}
export function compileJava(root: string, classes: string, paths: string[], deadlineAt: number) {
  javaVersion();
  const dependencies = javaDependencies(), compiler = join(aeRoot(), 'qualification/java-spring/Compile.java');
  if (hash(readFileSync(compiler)) !== '5dda7696d8a2f21a91c924f1752a987582771574bf85a3da021552aa40d7c3df') throw Error('Reviewed Java compiler helper drift');
  mkdirSync(classes, { recursive: true });
  javaCommand(['-Xmx256m', '--add-modules', 'jdk.compiler', compiler, '-proc:none', '-Xlint:all', '-source', '21', '-target', '21', '-cp', dependencies.classpath, '-d', classes, ...paths.map(path => join(root, path))], undefined, deadlineAt, 60_000);
  return { exitCode: 0, compilationExitCode: 0, language: 'java', compiler: 'jdk.compiler-21-no-annotation-processors', dependencyLockHash: dependencies.lockHash, files: paths.sort().map(path => ({ path, sha256: hash(readFileSync(join(root, path))) })) };
}
export interface JavaCommand { subject: string; operation: string; arguments: Record<string, unknown>; operationId?: string; }
export function originalJavaBatch(classes: string, database: string, commands: JavaCommand[], deadlineAt: number): { results: Record<string, any>[]; springVersion: string; managedInventory: boolean; mutationCount: number } {
  const value = JSON.parse(javaCommand(['-Xmx128m', '-cp', classes + ':' + javaDependencies().classpath, 'InventoryCli', database], JSON.stringify(commands), deadlineAt));
  assert.equal(value.springVersion, '6.2.19'); assert.equal(value.managedInventory, true); assert.equal(value.results.length, commands.length);
  return value;
}
export async function launchJava(classes: string, database: string, deadlineAt: number) {
  const tokens = new Map(principals.map(p => [p.subjectId, randomBytes(32).toString('base64url')]));
  const identities = Object.fromEntries(principals.map(p => [tokens.get(p.subjectId)!, p]));
  const adminToken = randomBytes(32).toString('base64url');
  const process: ChildProcessWithoutNullStreams = spawn('/usr/bin/java', ['-Xmx128m', '--add-modules', 'jdk.httpserver', '-cp', classes + ':' + javaDependencies().classpath, 'AeHost', database], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  let closed = false, stderr = '';
  process.once('exit', () => { closed = true; });
  process.stderr.on('data', bytes => { stderr = (stderr + String(bytes)).slice(-4000); });
  const lifetime = setTimeout(() => process.kill('SIGKILL'), javaBudget(deadlineAt, 300_000));
  const lines = createInterface({ input: process.stdout });
  let endpoint: URL | undefined;
  const stop = async () => {
    clearTimeout(lifetime); lines.close();
    if (!closed) {
      const closing = once(process, 'exit'); process.kill('SIGTERM');
      const timer = setTimeout(() => process.kill('SIGKILL'), 5000);
      try { const [code, signal] = await closing; assert.ok(signal === 'SIGTERM' || code === 143 || code === 0, 'Owned Java process required forced termination'); } finally { clearTimeout(timer); }
    }
    if (endpoint) await assert.rejects(fetch(endpoint, { signal: AbortSignal.timeout(500) }));
  };
  try {
    process.stdin.end(JSON.stringify({ identities, adminToken, port: 0 }));
    const ready: { port: number; springVersion: string; context: string; managedInventory: boolean } = await new Promise((resolveReady, reject) => {
      const timer = setTimeout(() => { process.kill('SIGKILL'); reject(Error('Java startup budget exceeded')); }, javaBudget(deadlineAt));
      lines.once('line', line => { clearTimeout(timer); try { resolveReady(JSON.parse(line)); } catch (error) { reject(error); } });
      process.once('exit', () => { clearTimeout(timer); reject(Error('Java exited before readiness: ' + stderr)); });
      process.once('error', error => { clearTimeout(timer); reject(error); });
    });
    assert.equal(ready.springVersion, '6.2.19'); assert.equal(ready.context, 'org.springframework.context.support.GenericApplicationContext'); assert.equal(ready.managedInventory, true);
    assert.ok(Number.isInteger(ready.port) && ready.port > 0 && ready.port <= 65535);
    endpoint = new URL('http://127.0.0.1:' + ready.port + '/ae');
    const post = async (path: string, bearer: string, body: unknown) => {
      const response = await fetch(new URL(path, endpoint), { method: 'POST', redirect: 'error', headers: { authorization: 'Bearer ' + bearer, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(javaBudget(deadlineAt, 5000)) });
      assert.ok([200, 403, 409].includes(response.status)); return await response.json() as Record<string, any>;
    };
    return { endpoint, ready, tokens, identities, stop,
      control: (body: unknown = {}) => post('/_fixture', adminToken, body),
      async invoke(command: JavaCommand): Promise<Record<string, any>> {
        const principal = principals.find(p => p.subjectId === command.subject); if (!principal) throw Error('Unknown reviewed Java subject');
        const response = await post('/ae', tokens.get(principal.subjectId)!, { operation: command.operation, principal, arguments: command.arguments, ...(command.operationId ? { operationId: command.operationId } : {}) });
        return response.error ? { error: response.error } : response.result;
      },
    };
  } catch (error) { await stop(); throw error; }
}
