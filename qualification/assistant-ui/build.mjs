import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=resolve('../..'),shared=resolve(process.env.AE_QUALIFIED_ROOT??root,'node_modules');
const {build}=await import(pathToFileURL(shared+'/vite/dist/node/index.js').href);
export const alias=[
 {find:/^@ae\/ui$/,replacement:resolve('generated/index.ts')},
 {find:'@ae/contracts/hash',replacement:root+'/packages/contracts/src/hash.ts'},
 {find:/^@ae\/(.*)$/,replacement:root+'/packages/$1/src/index.ts'},
 {find:'react/jsx-runtime',replacement:shared+'/react/jsx-runtime.js'},
 {find:'react/jsx-dev-runtime',replacement:shared+'/react/jsx-dev-runtime.js'},
 {find:'react-dom/client',replacement:shared+'/react-dom/client.js'},
 {find:'react-dom',replacement:shared+'/react-dom/index.js'},
 {find:'react',replacement:shared+'/react/index.js'},
 {find:'@radix-ui/react-tabs',replacement:shared+'/@radix-ui/react-tabs/dist/index.mjs'},
 {find:'zod',replacement:shared+'/zod/index.js'},
];
for(const kind of ['panel','floating']){
 let test=readFileSync(root+`/packages/ui/test/${kind}.test.tsx`,'utf8');
 test=test.replaceAll("'../src/index.js'","'./index.js'")
  .replaceAll("'../../host-sdk/src/index.js'","'../../../packages/host-sdk/src/index.js'")
  .replaceAll("'../src/configuration.js'","'../../../packages/ui/src/configuration.js'");
 // Composer count scopes the actual form, excluding react-textarea-autosize's
 // aria-hidden, tabIndex=-1 body-level measuring textarea. Other assertions unchanged.
 if(kind==='floating')test=test.replace("document.querySelectorAll('textarea').length,1","document.querySelectorAll('.ae-input textarea').length,1");
 writeFileSync(`generated/${kind}.test.tsx`,test);
 await build({configFile:false,logLevel:'warn',resolve:{alias},build:{ssr:true,outDir:'generated',emptyOutDir:false,lib:{entry:resolve(`generated/${kind}.test.tsx`),formats:['es'],fileName:()=>`${kind}.test.mjs`},rollupOptions:{external:id=>id==='jsdom'||id.startsWith('@assistant-ui/')||id.startsWith('node:')||/^react(?:\/|$)/.test(id)||/^react-dom(?:\/|$)/.test(id)}}});
}
await build({configFile:false,logLevel:'warn',resolve:{alias},build:{ssr:true,outDir:'generated',emptyOutDir:false,lib:{entry:resolve('src/store.test.tsx'),formats:['es'],fileName:()=>`store.test.mjs`},rollupOptions:{external:id=>id==='jsdom'||id.startsWith('@assistant-ui/')||id.startsWith('node:')||/^react(?:\/|$)/.test(id)||/^react-dom(?:\/|$)/.test(id)}}});
