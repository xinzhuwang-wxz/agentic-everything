// Reuse the approved checkout's React identity and test tools, without copying them.
import { rmSync, symlinkSync, realpathSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root=process.env.AE_QUALIFIED_ROOT;
if(!root)throw Error('Set AE_QUALIFIED_ROOT to the already-qualified checkout');
for(const name of ['react','react-dom','jsdom']){
 const target=resolve(root,'node_modules',name),local=resolve('node_modules',name);
 if(!existsSync(target))throw Error('Missing existing approved dependency: '+target);
 if(existsSync(local)&&realpathSync(local)===realpathSync(target))continue;
 rmSync(local,{recursive:true,force:true});symlinkSync(target,local,'dir');
}
