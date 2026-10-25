import { build } from 'vite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),output=resolve(process.argv[2]??'/tmp/ae-conversation-ui-browser');mkdirSync(output,{recursive:true});
const mode=process.argv[3]??'browser';if(!['browser','correlation'].includes(mode))throw Error('Unknown qualification mode');
const alias=[];for(const dir of readdirSync(root+'/packages')){let p;try{p=JSON.parse(readFileSync(`${root}/packages/${dir}/package.json`,'utf8'))}catch{continue}for(const [key,value]of Object.entries(p.exports??{})){const source=typeof value==='object'?value.types:undefined;if(source)alias.push({find:p.name+(key==='.'?'':key.slice(1)),replacement:resolve(root,'packages',dir,source)})}}alias.sort((a,b)=>b.find.length-a.find.length);
await build({root,configFile:false,logLevel:'warn',resolve:{alias},ssr:{noExternal:[/^@ae\//]},build:{ssr:resolve(root,`qualification/conversation-ui/${mode}.mjs`),outDir:output,emptyOutDir:false,minify:false,rollupOptions:{external:id=>!id.startsWith('@ae/')&&!id.startsWith('.')&&!id.startsWith('/'),output:{entryFileNames:`${mode}.mjs`}}}});
