import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=new URL('../../',import.meta.url),source=new URL('packages/ui/src/panel.tsx',root);
let panel=readFileSync(source,'utf8');
const original=panel;
if(createHash('sha256').update(original).digest('hex')!=='8764b67c78ee25017bc07dbbf3e8100fe5ee992feee5e5ef248c1fb20ac73bd1')throw Error('Frozen panel differs from R4 baseline; review before regenerating');
function replace(from,to){if(panel.split(from).length!==2)throw Error('Frozen seam does not match: '+from.slice(0,60));panel=panel.replace(from,to)}
replace("import { AIInput } from './reuse/ai-input.js';", "import { StorePresentation, StoreMessageText } from '../src/store.js';");
panel=panel.replaceAll("from './floating.js'","from '../../../packages/ui/src/floating.js'").replaceAll("from './configuration.js'","from '../../../packages/ui/src/configuration.js'").replaceAll("from './reuse/status-island.js'","from '../../../packages/ui/src/reuse/status-island.js'").replaceAll("from './types.js'","from '../../../packages/ui/src/types.js'");
replace('const assistantContent=<div className="ae-assistant-content">',`const assistantContent=<StorePresentation key={context.ticketId} run={run} lastInput={lastInput} input={input} onInputChange={setInput} busy={busy} disabled={!!unresolved||!connected} contextLabel={context.ticketId} onSend={text=>{const value=text.trim();if(!value||unresolved||!connected)return;setLastInput(value);setPendingInput(value);void perform(()=>client.start(value,{ticketId:context.ticketId}));setInput('')}}>`);
replace("{lastInput||'已恢复的执行'}",'<StoreMessageText index={0}/>');
replace('{run.message&&<p>{run.message}</p>}','{run.message&&<p><StoreMessageText index={1}/></p>}');
replace(`   <AIInput value={input} onChange={setInput} contextLabel={context.ticketId} busy={busy} disabled={!!unresolved||!connected} onSubmit={()=>{const value=input.trim();if(!value||unresolved||!connected)return;setLastInput(value);setPendingInput(value);void perform(()=>client.start(value,{ticketId:context.ticketId}));setInput('')}}/>\n  </div>;`,'  </StorePresentation>;');
mkdirSync(new URL('generated/',import.meta.url),{recursive:true});
writeFileSync(new URL('generated/panel.tsx',import.meta.url),panel);
writeFileSync(new URL('evidence/source.json',import.meta.url),JSON.stringify({baseline:'9268d98cb72bbc38deea474c9244b23e3de0a98a',panelSha256:createHash('sha256').update(original).digest('hex'),candidateSha256:createHash('sha256').update(panel).digest('hex'),preserved:'All original client calls, lifecycle effects, approval JSX, host callbacks, floating and configuration rendering. Only presentation/composer seams replaced.'},null,2));

writeFileSync(new URL('generated/index.ts',import.meta.url),"export * from './panel.js';\nexport * from '../../../packages/ui/src/configuration.js';\nexport * from '../../../packages/ui/src/floating.js';\n");
