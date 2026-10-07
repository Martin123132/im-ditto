import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {atomicJson} from '../src/core.mjs';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const fail = (message, code='INVALID_INPUT') => Object.assign(new Error(message), {code});
export function check(value, message, code) { if (!value) throw fail(message, code); }
export function relative(value) {
  check(typeof value==='string' && value.length<=200 && value.length>0, 'Invalid package path.');
  check(!/[\\:\x00-\x1f<>"|?*]/.test(value) && !value.startsWith('/'), 'Only portable relative package paths are allowed.');
  const parts=value.split('/');
  check(parts.every(p=>p && p!=='.' && p!=='..' && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)), 'Unsafe package path.');
  return value;
}
export async function safe(root, name='') {
  root=path.resolve(root);
  const full=name ? path.join(root, relative(name)) : root;
  // Walk from the volume root, including ancestors: junctions must not redirect writes.
  let at=path.parse(full).root;
  for (const part of full.slice(at.length).split(path.sep).filter(Boolean)) {
    at=path.join(at,part);
    try {check(!(await fs.lstat(at)).isSymbolicLink(), 'Linked paths are not supported.', 'LINK_REJECTED');}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return full;
}
export function manifest(m) {
  check(m && m.apiVersion===1 && m.dataVersion===1, 'Unsupported app or data version.');
  check(/^[a-z][a-z0-9-]{2,49}$/.test(m.id), 'Invalid I’m identifier.');
  check(/^\d+\.\d+\.\d+$/.test(m.version), 'Version must be x.y.z.');
  for(const key of ['name','description'])check(typeof m[key]==='string' && m[key].length>0 && m[key].length<=500, 'Missing '+key+'.');
  for(const key of ['entry','cli','instructions'])relative(m[key]);
  check(m.entry.endsWith('.cjs') && /\.(cjs|js)$/.test(m.cli) && m.instructions.endsWith('.md'), 'Invalid entry, CLI or instructions.');
  check(Array.isArray(m.permissions) && m.permissions.length<=20 && m.permissions.every(p=>typeof p==='string' && p.length<=100), 'Permissions must be explicit descriptions.');
  check(Array.isArray(m.dependencies) && m.dependencies.includes('node') && m.dependencies.every(d=>['node','ffmpeg','ffprobe'].includes(d)), 'Unsupported dependency.');
  return m;
}
export function verifyBundle(bundle) {
  check(bundle?.format==='im-package-v1', 'Unsupported package format.');
  manifest(bundle.manifest);
  check(Array.isArray(bundle.files) && bundle.files.length>0 && bundle.files.length<=500, 'Invalid package file count.');
  const seen=new Set();let total=0;
  for(const f of bundle.files) {
    const name=relative(f.path), lower=name.toLowerCase();
    check(lower!=='package-record.json' && !lower.startsWith('package-record.json/'), 'Reserved host package record.');
    check(!seen.has(lower), 'Duplicate or case-colliding package file.');seen.add(lower);
    check(typeof f.content==='string' && f.content.length<=8*1024*1024, 'Package member is too large.');
    const data=Buffer.from(f.content,'base64');
    check(data.toString('base64')===f.content && f.bytes===data.length && f.sha256===hash(data), 'Package member hash/size mismatch.', 'INTEGRITY_FAILED');
    total+=data.length;check(total<=24*1024*1024, 'Package exceeds 24 MiB.');
  }
  for(const name of seen){const parts=name.split('/');parts.pop();while(parts.length){check(!seen.has(parts.join('/')), 'File/directory package collision.');parts.pop();}}
  for(const name of [bundle.manifest.entry,bundle.manifest.cli,bundle.manifest.instructions])check(bundle.files.some(f=>f.path===name), 'Declared file is absent: '+name);
  const body={format:bundle.format,manifest:bundle.manifest,files:bundle.files};
  check(bundle.sha256===hash(JSON.stringify(body)), 'Package identity mismatch.', 'INTEGRITY_FAILED');
  return bundle;
}
export async function pack(root, names, output) {
  const m=manifest(JSON.parse(await fs.readFile(await safe(root,'im.json'),'utf8')));
  const files=[];
  for(const name of [...new Set(names)].sort()) {
    const filename=await safe(root,name),stat=await fs.stat(filename);
    check(stat.isFile() && stat.size<=6*1024*1024,'Invalid package member.');
    const data=await fs.readFile(filename);
    files.push({path:name,bytes:data.length,sha256:hash(data),content:data.toString('base64')});
  }
  const body={format:'im-package-v1',manifest:m,files};const bundle={...body,sha256:hash(JSON.stringify(body))};verifyBundle(bundle);
  await fs.mkdir(path.dirname(output),{recursive:true});await atomicJson(output,bundle);return {path:output,id:m.id,version:m.version,sha256:bundle.sha256,files:files.length};
}
export async function loadBundle(filename) {
  const stat=await fs.stat(filename);check(stat.size<=36*1024*1024, 'Package file exceeds limit.');
  return verifyBundle(JSON.parse(await fs.readFile(filename,'utf8')));
}
export async function unpack(bundle, releases) {
  verifyBundle(bundle);await fs.mkdir(await safe(releases),{recursive:true});
  const dest=await safe(releases,bundle.sha256);
  try {await fs.stat(dest);await verifyRelease(dest,bundle);return dest;}catch(e){if(e.code!=='ENOENT')throw e;}
  const stage=await safe(releases,'stage-'+randomUUID());await fs.mkdir(stage);
  try {
    for(const f of bundle.files){const filename=await safe(stage,f.path);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,Buffer.from(f.content,'base64'),{flag:'wx'});}
    await atomicJson(path.join(stage,'package-record.json'),bundle);
    await fs.rename(stage,dest);
  } catch(e) { // Keep a failed stage for diagnosis; never erase arbitrary paths.
    throw e;
  }
  return dest;
}
export async function verifyRelease(root,bundle=null) {
  bundle=verifyBundle(bundle||JSON.parse(await fs.readFile(await safe(root,'package-record.json'),'utf8')));
  const expected=new Set(bundle.files.map(f=>f.path));expected.add('package-record.json');
  async function visit(dir,prefix='') {
    for(const item of await fs.readdir(dir,{withFileTypes:true})){
      const name=prefix+item.name;await safe(root,name);
      if(item.isDirectory())await visit(path.join(dir,item.name),name+'/');
      else check(item.isFile() && expected.has(name),'Unexpected release member: '+name,'INTEGRITY_FAILED');
    }
  }
  await visit(root);
  for(const f of bundle.files)check(hash(await fs.readFile(await safe(root,f.path)))===f.sha256,'Installed file changed: '+f.path,'INTEGRITY_FAILED');
  return bundle;
}
