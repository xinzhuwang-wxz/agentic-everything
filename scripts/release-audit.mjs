// Official npm SBOM + locked metadata + actually installed license text. No network or publication.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const out=resolve(process.argv[2]??'');
if(!process.argv[2]||existsSync(out))throw new Error('Pass a new evidence directory outside the checkout');
const root=process.cwd();if(out===root||out.startsWith(root+'/'))throw new Error('Evidence must be outside source');
mkdirSync(out);
const lock=JSON.parse(readFileSync('package-lock.json','utf8')),problems=[],packages=[];
for(const [path,entry] of Object.entries(lock.packages)){
  if(!path.startsWith('node_modules/')||entry.link)continue;
  if(!entry.version||!entry.integrity||!/^sha(256|384|512)-/.test(entry.integrity)||!/^https:\/\/registry\.npmjs\.org\//.test(entry.resolved??''))problems.push({path,issue:'unfixed-or-nonofficial-package'});
  const local=join(root,path),installed=existsSync(join(local,'package.json'));
  let name=path.slice(path.lastIndexOf('node_modules/')+13),license=entry.license,files=[];
  if(installed){const pkg=JSON.parse(readFileSync(join(local,'package.json'),'utf8'));name=pkg.name;license=pkg.license??license;if(pkg.version!==entry.version)problems.push({path,issue:'installed-version-drift'});
    files=readdirSync(local).filter(n=>/^(licen[cs]e|copying|notice|third[-_]party[-_]licen[cs]e)([._-].*)?$/i.test(n)).filter(n=>lstatSync(join(local,n)).isFile());
    files=files.map(file=>`${path}/${file}`);
    if(!files.length&&['pg-types','pgpass'].includes(name)&&/Permission (?:is hereby granted|to use)/.test(readFileSync(join(local,'README.md'),'utf8')))files=[`${path}/README.md`];
    if(!files.length&&name.startsWith('@rolldown/binding-')&&JSON.parse(readFileSync('node_modules/rolldown/package.json','utf8')).version===entry.version)files=['node_modules/rolldown/LICENSE','node_modules/rolldown/THIRD-PARTY-LICENSE'];
    if(!files.length&&name==='saxes'&&entry.version==='6.0.0'&&existsSync('licenses/saxes-6.0.0-LICENSE.txt'))files=['licenses/saxes-6.0.0-LICENSE.txt'];
    if(!files.length)problems.push({path,issue:'installed-license-text-missing'});
  }
  if(!license)problems.push({path,issue:'license-metadata-missing'});
  packages.push({path,name,version:entry.version,license:license??'UNKNOWN',installed,optional:Boolean(entry.optional),integrity:entry.integrity,source:entry.resolved,licenseFiles:files});
}
const sbom=execFileSync('npm',['sbom','--package-lock-only','--sbom-format','cyclonedx','--sbom-type','application'],{encoding:'utf8',maxBuffer:32*1024*1024});
JSON.parse(sbom);writeFileSync(join(out,'sbom.cyclonedx.json'),sbom);
let notices='Agentic Everything dependency license texts\nGenerated from the installed fixed lockfile. Uninstalled optional platform packages are listed in the SBOM, not redistributed here.\n';
for(const p of packages.filter(p=>p.installed).sort((a,b)=>a.path.localeCompare(b.path))){notices+=`\n${'='.repeat(72)}\n${p.name}@${p.version} | ${p.license}\nSource: ${p.source}\n`;for(const file of p.licenseFiles)notices+=`\n--- ${file} ---\n${readFileSync(join(root,file),'utf8')}\n`;}
writeFileSync(join(out,'THIRD_PARTY_LICENSES.txt'),notices);
const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),secretFindings=[];
for(const path of paths){if(!/\.(ts|tsx|mjs|json|md|ya?ml|sh|properties|xml|java|py)$/.test(path))continue;const text=readFileSync(path,'utf8');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bsk_live_[A-Za-z0-9]{20,}\b/.test(text))secretFindings.push(path);}
const report={status:problems.length||secretFindings.length?'review-required':'pass',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),lockSha256:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),sbomSha256:createHash('sha256').update(sbom).digest('hex'),packageCount:packages.length,installedCount:packages.filter(p=>p.installed).length,packages,problems,secretFindings,securityScope:'Narrow source secret heuristic and dependency metadata, not vulnerability or production security certification',vulnerabilityAudit:'Run npm audit --package-lock-only --json separately against the official registry; an unavailable registry is not pass'};
writeFileSync(join(out,'release-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,packageCount:report.packageCount,installedCount:report.installedCount,problems,secretFindings,out},null,2));
process.exitCode=problems.length||secretFindings.length?2:0;
