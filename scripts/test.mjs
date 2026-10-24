import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files = [];
async function scan(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const next = `${path}/${entry.name}`;
    if (entry.isDirectory()) await scan(next);
    else if (/\.test\.js$/.test(entry.name)) files.push(next);
  }
}
await scan('dist');
if (files.length === 0) throw new Error('No compiled tests found');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.sort()], { stdio: 'inherit' });
process.exit(result.status ?? 1);
