import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve('qualification/java-spring');
const lock = JSON.parse(await readFile(join(root, 'dependencies.lock.json'), 'utf8'));
const cache = join(root, '.cache'), classes = join(root, 'classes');
await mkdir(cache, { recursive: true }); await mkdir(classes, { recursive: true });
const jars = [];
for (const artifact of lock.artifacts) {
  const url = new URL(artifact.url);
  const expected = `https://repo.maven.apache.org/maven2/${artifact.group.replaceAll('.', '/')}/${artifact.artifact}/${artifact.version}/${artifact.artifact}-${artifact.version}.jar`;
  if (url.href !== expected || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw Error('Unrecognized fixture artifact');
  const path = join(cache, `${artifact.artifact}-${artifact.version}.jar`);
  let bytes;
  try { if (!(await lstat(path)).isFile()) throw Error('Nonregular artifact'); bytes = await readFile(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok || response.url !== url.href) throw Error('Official registry artifact unavailable');
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw Error(`Artifact checksum mismatch: ${artifact.artifact}`);
  try { await stat(path); } catch { await writeFile(path, bytes, { flag: 'wx' }); }
  jars.push(path);
}
if (!process.argv.includes('--download-only')) {
  const source = resolve('fixtures/java-spring-host');
  const result = spawnSync('java', ['--add-modules', 'jdk.compiler', join(root, 'Compile.java'), '-Xlint:all', '-cp', jars.join(':'), '-d', classes, join(source, 'Inventory.java'), join(source, 'AeHost.java')], { stdio: 'inherit', timeout: 60_000 });
  if (result.error || result.status !== 0 || result.signal) throw Error('Java fixture compilation failed or timed out');
}
console.log(JSON.stringify({ artifacts: jars.length, verified: true, compiled: !process.argv.includes('--download-only') }));
