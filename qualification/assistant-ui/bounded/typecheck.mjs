import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { here, repositoryRoot, shared, candidate, generated } from './paths.mjs';
const tsconfig = join(generated, 'tsconfig.json');
writeFileSync(tsconfig, JSON.stringify({
  extends: join(repositoryRoot, 'tsconfig.json'),
  compilerOptions: {
    noEmit: true, declaration: false, rootDir: repositoryRoot,
    typeRoots: [join(shared, '@types')], types: ['node', 'react', 'react-dom'],
    paths: {
      '@assistant-ui/react': [join(candidate, '@assistant-ui/react/dist/index.d.ts')],
      react: [join(shared, '@types/react/index.d.ts')],
      'react/*': [join(shared, '@types/react/*.d.ts')],
      'react-dom/*': [join(shared, '@types/react-dom/*.d.ts')],
      jsdom: [join(shared, '@types/jsdom/index.d.ts')],
    },
  },
  include: [join(here, 'adapter.tsx'), join(here, 'qualification.test.tsx')],
}, null, 2) + '\n');
const result = spawnSync(process.execPath, [join(shared, 'typescript/bin/tsc'), '-p', tsconfig], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
