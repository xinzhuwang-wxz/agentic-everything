import { readdir, readFile, mkdir, cp } from 'node:fs/promises';
for (const entry of await readdir('packages', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const path = `packages/${entry.name}`;
  try { await readFile(`${path}/package.json`); } catch { continue; }
  try {
    await mkdir(`${path}/dist`, { recursive: true });
    await cp(`dist/${path}/src`, `${path}/dist`, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
