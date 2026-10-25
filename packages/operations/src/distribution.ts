import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AE_COMPATIBILITY } from './migrations.js';
const receiptName='.ae-installation.json';
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
interface Entry {path:string;type:'file'|'directory'|'link';hash?:string;target?:string}
interface Receipt {format:'ae-source-install-v1';version:string;commit:string;tree:string;sourceHash:string;lockHash:string;schema:number;node:string;npm:string;files:Entry[]}
function safePath(value:string,mustExist=false):string{
  const path=resolve(value);
  if(path===sep||path===process.env.HOME)throw new Error('UNSAFE_INSTALL_PATH');
  let parent=path;
  while(true){if(existsSync(parent)&&lstatSync(parent).isSymbolicLink())throw new Error('SYMLINK_PATH_DENIED');if(dirname(parent)===parent)break;parent=dirname(parent);}
  if(mustExist&&(!existsSync(path)||realpathSync(path)!==path))throw new Error('INSTALLATION_NOT_FOUND');
  return path;
}
function within(root:string,path:string):boolean{const part=relative(root,path);return part!==''&&!part.startsWith(`..${sep}`)&&part!=='..'&&!isAbsolute(part);}
function git(source:string,args:string[]):string{return execFileSync('git',['-C',source,...args],{encoding:'utf8',maxBuffer:32*1024*1024}).trim();}
function inventory(root:string,path=root):Entry[]{
  const result:Entry[]=[];
  for(const name of readdirSync(path).sort()){
    const file=join(path,name),rel=relative(root,file);if(rel===receiptName)continue;
    const stat=lstatSync(file);
    if(stat.isSymbolicLink()){const target=readlinkSync(file);if(!within(root,resolve(dirname(file),target)))throw new Error('INSTALL_SYMLINK_ESCAPE');result.push({path:rel,type:'link',target});}
    else if(stat.isDirectory()){result.push({path:rel,type:'directory'});result.push(...inventory(root,file));}
    else if(stat.isFile())result.push({path:rel,type:'file',hash:hash(readFileSync(file))});
    else throw new Error('UNSUPPORTED_INSTALL_FILE');
  }
  return result;
}
function load(root:string):Receipt{
  const path=join(root,receiptName);if(lstatSync(path).isSymbolicLink())throw new Error('INSTALL_RECEIPT_SYMLINK');
  const r=JSON.parse(readFileSync(path,'utf8')) as Receipt;
  if(r.format!=='ae-source-install-v1'||!Array.isArray(r.files)||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(r.commit)||!r.files.every(e=>typeof e.path==='string'&&within(root,resolve(root,e.path))))throw new Error('INVALID_INSTALL_RECEIPT');
  return r;
}
export function doctorInstallation(directory:string){
  const root=safePath(directory,true),receipt=load(root),actual=inventory(root);
  const unchanged=JSON.stringify(actual)===JSON.stringify(receipt.files);
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  return {status:unchanged?'ready':'modified',version:pkg.version,commit:receipt.commit,tree:receipt.tree,sourceHash:receipt.sourceHash,lockHash:receipt.lockHash,node:process.versions.node,nodeCompatible:Number(process.versions.node.split('.')[0])===24,schema:receipt.schema,inspectorCompatibility:AE_COMPATIBILITY,integrity:unchanged,productionQualified:false};
}
/** Explicit local source installation. No floating branch, network, global install, host patch or service start. */
export function installFixedSource(input:{source:string;commit:string;tree:string;destination:string;cache:string;previous?:string}){
  const source=safePath(input.source,true),destination=safePath(input.destination),cache=realpathSync(input.cache);
  if(!/^[a-f0-9]{40}$/.test(input.commit)||!/^[a-f0-9]{40}$/.test(input.tree))throw new Error('FULL_SOURCE_PIN_REQUIRED');
  if(existsSync(destination)||within(source,destination)||within(destination,source))throw new Error('INSTALL_DESTINATION_MUST_BE_NEW_AND_SEPARATE');
  if(git(source,['rev-parse','--show-toplevel'])!==source||git(source,['status','--porcelain','--untracked-files=all']))throw new Error('SOURCE_MUST_BE_CLEAN_GIT_ROOT');
  if(git(source,['rev-parse',`${input.commit}^{commit}`])!==input.commit||git(source,['rev-parse',`${input.commit}^{tree}`])!==input.tree)throw new Error('SOURCE_PIN_MISMATCH');
  if(input.previous){const previous=doctorInstallation(input.previous);if(!previous.integrity)throw new Error('UPGRADE_PREVIOUS_MODIFIED');}
  // Refuse installing into an existing host repository, even if the final directory does not exist.
  try{execFileSync('git',['-C',dirname(destination),'rev-parse','--show-toplevel'],{stdio:'pipe'});throw new Error('INSTALL_INSIDE_HOST_DENIED');}catch(error){if(error instanceof Error&&error.message==='INSTALL_INSIDE_HOST_DENIED')throw error;}
  const listing=execFileSync('git',['-C',source,'ls-tree','-rz','--full-tree',input.commit],{encoding:'utf8',maxBuffer:32*1024*1024}).split('\0').filter(Boolean);
  const files=listing.map(line=>{const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);if(!match||!within(destination,resolve(destination,match[3]!))||match[3]!.includes('\\'))throw new Error('UNSAFE_SOURCE_TREE_ENTRY');return {mode:match[1]!,oid:match[2]!,path:match[3]!};});
  if(files.length>10000||!files.some(f=>f.path==='package-lock.json'))throw new Error('UNSUPPORTED_SOURCE_DISTRIBUTION');
  mkdirSync(destination,{recursive:false});
  // Failures retain the owned directory for inspection; never erase a partially installed tree automatically.
  for(const f of files){const target=join(destination,f.path);mkdirSync(dirname(target),{recursive:true});const bytes=execFileSync('git',['-C',source,'cat-file','blob',f.oid],{maxBuffer:32*1024*1024});writeFileSync(target,bytes,{flag:'wx'});if(f.mode==='100755')chmodSync(target,0o755);}
  const pkg=JSON.parse(readFileSync(join(destination,'package.json'),'utf8'));
  if(Number(process.versions.node.split('.')[0])!==24)throw new Error('NODE_24_REQUIRED');
  const npm=execFileSync('npm',['--version'],{encoding:'utf8'}).trim();if(!/^11\./.test(npm))throw new Error('NPM_11_REQUIRED');
  const env={PATH:process.env.PATH??'/usr/bin:/bin',HOME:destination,TZ:'UTC',npm_config_cache:cache,npm_config_offline:'true',NODE_OPTIONS:'--max-old-space-size=640'};
  execFileSync('npm',['ci','--ignore-scripts','--offline','--no-audit','--no-fund'],{cwd:destination,env,stdio:'pipe',timeout:180000,maxBuffer:8*1024*1024});
  execFileSync('npm',['run','build'],{cwd:destination,env,stdio:'pipe',timeout:180000,maxBuffer:8*1024*1024});
  const schemaSource=join(destination,'packages/operations/src/migrations.ts');
  const schema=existsSync(schemaSource)?Number(/export const AE_SCHEMA_VERSION = (\d+);/.exec(readFileSync(schemaSource,'utf8'))?.[1]):0;
  if(!Number.isInteger(schema))throw new Error('INSTALLED_SCHEMA_VERSION_UNRECOGNIZED');
  const receipt:Receipt={format:'ae-source-install-v1',version:pkg.version,commit:input.commit,tree:input.tree,sourceHash:hash(JSON.stringify(files)),lockHash:hash(readFileSync(join(destination,'package-lock.json'))),schema,node:process.versions.node,npm,files:inventory(destination)};
  writeFileSync(join(destination,receiptName),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return {destination,...doctorInstallation(destination),...(input.previous?{previousRetained:resolve(input.previous),activation:'not-changed'}:{})};
}
/** Only a verified installation can be removed. Any user addition or modification fails closed. */
export function uninstallFixedSource(directory:string,expectedCommit:string){
  const root=safePath(directory,true),receipt=load(root);
  if(receipt.commit!==expectedCommit)throw new Error('UNINSTALL_COMMIT_MISMATCH');
  if(!doctorInstallation(root).integrity)throw new Error('UNINSTALL_MODIFIED_INSTALLATION');
  rmSync(root,{recursive:true});return {removed:root,commit:receipt.commit,hostData:'untouched',database:'untouched'};
}
