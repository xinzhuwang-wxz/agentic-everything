import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { here, shared, generated, rootRequire, candidateRequire, metadata } from './paths.mjs';
const { build } = await import(pathToFileURL(join(shared, 'vite/dist/node/index.js')).href);
const externals = {
  '@assistant-ui/react': candidateRequire.resolve('@assistant-ui/react'),
  react: rootRequire.resolve('react'),
  'react-dom/client': rootRequire.resolve('react-dom/client'),
  'react/jsx-runtime': rootRequire.resolve('react/jsx-runtime'),
  jsdom: rootRequire.resolve('jsdom'),
};
await build({ root: here, configFile: false, logLevel: 'warn',
  plugins: [{ name: 'existing-exact-deps', enforce: 'pre', resolveId(id) {
    if (externals[id]) return { id: externals[id], external: true };
  }}],
  resolve: { alias: [{ find: /^zod$/, replacement: join(shared, 'zod/index.js') }] },
  build: { ssr: true, outDir: generated, emptyOutDir: false,
    lib: { entry: join(here, 'qualification.test.tsx'), formats: ['es'], fileName: () => 'qualification.test.js' },
    rollupOptions: { external: id => id.startsWith('node:') } },
});
writeFileSync(join(generated, 'dependencies.json'), JSON.stringify(metadata, null, 2) + '\n');
