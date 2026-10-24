// Deliberately small repository hygiene checker, not a claim of ESLint coverage.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n');
let failures = 0;
for (const path of new Set(paths)) {
  if (!/\.(ts|tsx|mjs)$/.test(path) || path.startsWith('upstream/')) continue;
  const text = await readFile(path, 'utf8');
  if (/\bdebugger\s*;/.test(text) || /\r/.test(text) || /[ \t]+$/m.test(text)) {
    console.error(`Hygiene violation: ${path}`); failures++;
  }
}
process.exitCode = failures ? 1 : 0;
