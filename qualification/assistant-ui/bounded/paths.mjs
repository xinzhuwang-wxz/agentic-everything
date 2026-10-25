// Resolve only the existing root and parent qualification packages; never install.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const here = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(here, '../../..');
export const shared = join(repositoryRoot, 'node_modules');
export const candidate = process.env.AE_ASSISTANT_UI_DEPS
  ? resolve(process.env.AE_ASSISTANT_UI_DEPS) : resolve(here, '../node_modules');
export const generated = join(here, 'generated');
export const rootRequire = createRequire(join(shared, 'bounded-qualification.cjs'));
export const candidateRequire = createRequire(join(candidate, 'bounded-qualification.cjs'));
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const expected = json(resolve(here, '../package.json')).dependencies['@assistant-ui/react'];
export const metadata = {
  reactVersion: json(join(shared, 'react/package.json')).version,
  assistantVersion: json(join(candidate, '@assistant-ui/react/package.json')).version,
  sameReact: realpathSync(join(candidate, 'react')) === realpathSync(join(shared, 'react')),
  sameReactDom: realpathSync(join(candidate, 'react-dom')) === realpathSync(join(shared, 'react-dom')),
};
if (metadata.assistantVersion !== expected) throw Error(`Expected parent-pinned assistant-ui ${expected}; got ${metadata.assistantVersion}`);
if (!metadata.sameReact || !metadata.sameReactDom) throw Error('Qualification must reuse the root React and React DOM instances. See README.md.');
mkdirSync(generated, { recursive: true });
