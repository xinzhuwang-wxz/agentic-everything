import { rmSync } from 'node:fs';
// Only remove this repository's reproducible compiler output, never sources or QA evidence.
rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
