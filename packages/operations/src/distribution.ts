import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, openSync, readSync, closeSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AE_COMPATIBILITY } from './migrations.js';
const receiptName='.ae-installation.json';
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
interface Entry {path:string;type:'file'|'directory'|'link';mode:number;hash?:string;target?:string}
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
// Reuse the transformation preflight policy: read Git objects/configuration without hooks or fsmonitor.
function safeGit(source:string,args:string[]):string[]{return ['--no-optional-locks','-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',source,...args];}
function git(source:string,args:string[]):string{return execFileSync('git',safeGit(source,args),{encoding:'utf8',timeout:15000,maxBuffer:32*1024*1024}).trim();}
function inventory(root:string):Entry[]{
  const result:Entry[]=[],buffer=Buffer.allocUnsafe(64*1024);
  // Hash every byte without retaining dependency-sized Buffers before the next child compiler.
  function fileHash(file:string):string{
    const digest=createHash('sha256'),fd=openSync(file,'r');
    try{let bytes:number;while((bytes=readSync(fd,buffer,0,buffer.length,null))!==0)digest.update(buffer.subarray(0,bytes));}
    finally{closeSync(fd);}
    return digest.digest('hex');
  }
  function visit(path:string):void{
    for(const name of readdirSync(path).sort()){
      const file=join(path,name),rel=relative(root,file);if(rel===receiptName)continue;
      const stat=lstatSync(file);
      if(stat.isSymbolicLink()){const target=readlinkSync(file);if(!within(root,resolve(dirname(file),target)))throw new Error('INSTALL_SYMLINK_ESCAPE');result.push({path:rel,type:'link',mode:stat.mode&0o777,target});}
      else if(stat.isDirectory()){result.push({path:rel,type:'directory',mode:stat.mode&0o777});visit(file);}
      else if(stat.isFile())result.push({path:rel,type:'file',mode:stat.mode&0o777,hash:fileHash(file)});
      else throw new Error('UNSUPPORTED_INSTALL_FILE');
    }
  }
  visit(root);return result;
}
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function keys(value:Record<string,unknown>,expected:string[]):boolean{return Object.keys(value).sort().join(',')===[...expected].sort().join(',');}
function installedSchema(root:string):number{
  const source=join(root,'packages/operations/src/migrations.ts');
  const schema=existsSync(source)?Number(/export const AE_SCHEMA_VERSION = (\d+);/.exec(readFileSync(source,'utf8'))?.[1]):0;
  if(!Number.isSafeInteger(schema)||schema<0)throw new Error('INSTALLED_SCHEMA_VERSION_UNRECOGNIZED');
  return schema;
}
function load(root:string):Receipt{
  const path=join(root,receiptName),stat=lstatSync(path);
  if(stat.isSymbolicLink())throw new Error('INSTALL_RECEIPT_SYMLINK');
  if(!stat.isFile()||stat.size>32*1024*1024)throw new Error('INVALID_INSTALL_RECEIPT');
  let r:unknown;try{r=JSON.parse(readFileSync(path,'utf8'));}catch{throw new Error('INVALID_INSTALL_RECEIPT');}
  const sha256=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  const oid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
  const version=(v:unknown)=>typeof v==='string'&&/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v);
  if(!record(r)||!keys(r,['format','version','commit','tree','sourceHash','lockHash','schema','node','npm','files'])||r.format!=='ae-source-install-v1'||!version(r.version)||!oid(r.commit)||!oid(r.tree)||!sha256(r.sourceHash)||!sha256(r.lockHash)||!Number.isSafeInteger(r.schema)||Number(r.schema)<0||!version(r.node)||!String(r.node).startsWith('24.')||!version(r.npm)||!String(r.npm).startsWith('11.')||!Array.isArray(r.files)||!r.files.length||r.files.length>100000)throw new Error('INVALID_INSTALL_RECEIPT');
  const seen=new Set<string>();
  for(const e of r.files){
    if(!record(e)||typeof e.path!=='string'||!e.path||e.path.includes('\\')||e.path.includes('\0')||e.path===receiptName||!within(root,resolve(root,e.path))||relative(root,resolve(root,e.path))!==e.path||seen.has(e.path)||!Number.isInteger(e.mode)||Number(e.mode)<0||Number(e.mode)>0o777)throw new Error('INVALID_INSTALL_RECEIPT');
    seen.add(e.path);
    const valid=e.type==='file'?keys(e,['path','type','mode','hash'])&&sha256(e.hash):e.type==='directory'?keys(e,['path','type','mode']):e.type==='link'?keys(e,['path','type','mode','target'])&&typeof e.target==='string'&&e.target.length>0&&!e.target.includes('\0')&&within(root,resolve(dirname(join(root,e.path)),e.target)):false;
    if(!valid)throw new Error('INVALID_INSTALL_RECEIPT');
  }
  return r as unknown as Receipt;
}
export function doctorInstallation(directory:string){
  const root=safePath(directory,true),receipt=load(root),actual=inventory(root);
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  const schema=installedSchema(root);
  const metadataConsistent=receipt.version===pkg.version&&receipt.lockHash===hash(readFileSync(join(root,'package-lock.json')))&&receipt.schema===schema;
  const unchanged=metadataConsistent&&JSON.stringify(actual)===JSON.stringify(receipt.files);
  // The receipt is editable local state, not a signature or independent publisher authentication.
  return {status:unchanged?'ready':'modified',version:pkg.version,commit:receipt.commit,tree:receipt.tree,sourceHash:receipt.sourceHash,lockHash:receipt.lockHash,node:process.versions.node,nodeCompatible:Number(process.versions.node.split('.')[0])===24,schema,inspectorCompatibility:AE_COMPATIBILITY,metadataConsistent,integrity:unchanged,productionQualified:false};
}
function inspectPreviousInstallation(directory:string):unknown{
  // The fixed doctor runs to completion in a short-lived process, releasing receipt/inventory
  // allocations before npm/build. Paths are arguments, never interpolated code or shell text.
  const code="const { doctorInstallation } = await import(process.argv[1]); process.stdout.write(JSON.stringify(doctorInstallation(process.argv[2])));";
  return JSON.parse(execFileSync(process.execPath,['--max-old-space-size=256','--input-type=module','--eval',code,import.meta.url,directory],{
    encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:64*1024,
    env:{PATH:process.env.PATH??'/usr/bin:/bin',...(process.env.HOME===undefined?{}:{HOME:process.env.HOME}),TZ:'UTC'},
  }));
}
/** Explicit local source installation. No floating branch, network, global install, host patch or service start. */
export function installFixedSource(input:{source:string;commit:string;tree:string;destination:string;cache:string;previous?:string}){
  const source=safePath(input.source,true),destination=safePath(input.destination),cache=realpathSync(input.cache);
  if(!/^[a-f0-9]{40}$/.test(input.commit)||!/^[a-f0-9]{40}$/.test(input.tree))throw new Error('FULL_SOURCE_PIN_REQUIRED');
  if(existsSync(destination)||within(source,destination)||within(destination,source))throw new Error('INSTALL_DESTINATION_MUST_BE_NEW_AND_SEPARATE');
  // Inspect configured filter names before status can invoke a clean/process helper. No config values are emitted.
  if(git(source,['config','--name-only','--list']).split('\n').some(name=>/^filter\./i.test(name)))throw new Error('SOURCE_GIT_FILTERS_REQUIRE_REVIEW');
  if(git(source,['rev-parse','--show-toplevel'])!==source||git(source,['status','--porcelain','--untracked-files=all']))throw new Error('SOURCE_MUST_BE_CLEAN_GIT_ROOT');
  if(git(source,['rev-parse',`${input.commit}^{commit}`])!==input.commit||git(source,['rev-parse',`${input.commit}^{tree}`])!==input.tree)throw new Error('SOURCE_PIN_MISMATCH');
  if(input.previous){const previous=inspectPreviousInstallation(input.previous);if(!record(previous)||previous.integrity!==true)throw new Error('UPGRADE_PREVIOUS_MODIFIED');}
  // Refuse installing into an existing host repository, even if the final directory does not exist.
  try{execFileSync('git',safeGit(dirname(destination),['rev-parse','--show-toplevel']),{stdio:'pipe',timeout:15000});throw new Error('INSTALL_INSIDE_HOST_DENIED');}catch(error){if(error instanceof Error&&error.message==='INSTALL_INSIDE_HOST_DENIED')throw error;}
  const listing=execFileSync('git',safeGit(source,['ls-tree','-rz','--full-tree',input.commit]),{encoding:'utf8',timeout:15000,maxBuffer:32*1024*1024}).split('\0').filter(Boolean);
  const files=listing.map(line=>{const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);if(!match||!within(destination,resolve(destination,match[3]!))||match[3]!.includes('\\'))throw new Error('UNSAFE_SOURCE_TREE_ENTRY');return {mode:match[1]!,oid:match[2]!,path:match[3]!};});
  if(files.length>10000||!files.some(f=>f.path==='package-lock.json'))throw new Error('UNSUPPORTED_SOURCE_DISTRIBUTION');
  mkdirSync(destination,{recursive:false});
  // Failures retain the owned directory for inspection; never erase a partially installed tree automatically.
  for(const f of files){const target=join(destination,f.path);mkdirSync(dirname(target),{recursive:true});const bytes=execFileSync('git',safeGit(source,['cat-file','blob',f.oid]),{timeout:15000,maxBuffer:32*1024*1024});writeFileSync(target,bytes,{flag:'wx'});if(f.mode==='100755')chmodSync(target,0o755);}
  const pkg=JSON.parse(readFileSync(join(destination,'package.json'),'utf8'));
  if(Number(process.versions.node.split('.')[0])!==24)throw new Error('NODE_24_REQUIRED');
  const npm=execFileSync('npm',['--version'],{encoding:'utf8'}).trim();if(!/^11\./.test(npm))throw new Error('NPM_11_REQUIRED');
  const env={PATH:process.env.PATH??'/usr/bin:/bin',HOME:destination,TZ:'UTC',npm_config_cache:cache,npm_config_offline:'true',NODE_OPTIONS:'--max-old-space-size=640'};
  execFileSync('npm',['ci','--ignore-scripts','--offline','--no-audit','--no-fund'],{cwd:destination,env,stdio:'pipe',timeout:180000,maxBuffer:8*1024*1024});
  execFileSync('npm',['run','build'],{cwd:destination,env,stdio:'pipe',timeout:180000,maxBuffer:8*1024*1024});
  const schema=installedSchema(destination);
  const receipt:Receipt={format:'ae-source-install-v1',version:pkg.version,commit:input.commit,tree:input.tree,sourceHash:hash(JSON.stringify(files)),lockHash:hash(readFileSync(join(destination,'package-lock.json'))),schema,node:process.versions.node,npm,files:inventory(destination)};
  writeFileSync(join(destination,receiptName),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return {destination,...doctorInstallation(destination),...(input.previous?{previousRetained:resolve(input.previous),activation:'not-changed'}:{})};
}
/** Only a locally unchanged installation can be removed. The editable receipt is not an authenticity boundary. */
export function uninstallFixedSource(directory:string,expectedCommit:string){
  const root=safePath(directory,true),receipt=load(root);
  if(receipt.commit!==expectedCommit)throw new Error('UNINSTALL_COMMIT_MISMATCH');
  if(!doctorInstallation(root).integrity)throw new Error('UNINSTALL_MODIFIED_INSTALLATION');
  rmSync(root,{recursive:true});return {removed:root,commit:receipt.commit,hostData:'untouched',database:'untouched'};
}
