// Explicit candidate builder. Never installs, restarts or reads live profiles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function readArchive(filename){
  const bytes=fs.readFileSync(filename),base=8+bytes.readUInt32LE(4),header=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12))),files=new Map();
  function walk(tree,prefix=''){for(const [name,item] of Object.entries(tree.files||{})){
    assert.ok(name!=='.'&&name!=='..'&&!/[\\/:]/.test(name));const key=prefix+name;
    if(item.files)walk(item,key+'/');else{assert.ok(!item.link&&!item.unpacked);const begin=base+Number(item.offset),end=begin+item.size;assert.ok(Number.isSafeInteger(begin)&&Number.isSafeInteger(end)&&begin>=base&&end<=bytes.length);files.set(key,bytes.subarray(begin,end));}
  }}walk(header);return {bytes,base,header,files};
}
export function patchDesktop(source){
  const substitutions=[
    ["import { workSessionsFor } from '../src/work-sessions.mjs';","import { workSessionsFor } from '../src/work-sessions.mjs';\nimport { startClockDisplay } from '../src/ditto-clock-display.mjs';"],
    ['const workSessions=workSessionsFor(core);await workSessions.ready;','const workSessions=workSessionsFor(core);await workSessions.ready;\n  const dittoClockDisplay=await startClockDisplay({workSessions,dataDir,isProtected:()=>core.chaffProtected.latched}).catch(()=>null);'],
    ['.then(()=>chaffControl?.close()).finally(','.then(()=>chaffControl?.close()).then(()=>dittoClockDisplay?.close()).finally('],
    ['quitting=true;await stopLocal();vault.close();win.destroy();app.quit();','quitting=true;await dittoClockDisplay?.close();await stopLocal();vault.close();win.destroy();app.quit();'],
  ];
  assert.ok(!source.includes('dittoClockDisplay'),'Display feed already installed');
  for(const [before,after] of substitutions){assert.equal(source.split(before).length,2,'Bridge desktop contract changed; review before building');source=source.replace(before,after);}
  return source;
}
export function build({installed,expected,out,moduleFile}){
  assert.match(expected,/^[a-f0-9]{64}$/);assert.ok(!fs.existsSync(out),'Use a new candidate folder');
  const original=readArchive(installed);assert.equal(sha(original.bytes),expected,'Installed Bridge changed');
  const changes=new Map([
    ['desktop/main.mjs',Buffer.from(patchDesktop(original.files.get('desktop/main.mjs').toString()))],
    ['src/ditto-clock-display.mjs',fs.readFileSync(moduleFile)],
  ]);
  assert.ok(!original.files.has('src/ditto-clock-display.mjs'));
  const header=structuredClone(original.header),payload=original.bytes.subarray(original.base);let offset=payload.length;
  for(const [key,bytes] of changes){const parts=key.split('/'),name=parts.pop();let dir=header;for(const part of parts)dir=dir.files[part];const blockSize=4194304,blocks=[];for(let i=0;i<bytes.length;i+=blockSize)blocks.push(sha(bytes.subarray(i,i+blockSize)));dir.files[name]={size:bytes.length,offset:String(offset),integrity:{algorithm:'SHA256',hash:sha(bytes),blockSize,blocks}};offset+=bytes.length;}
  const json=Buffer.from(JSON.stringify(header)),padded=Math.ceil((4+json.length)/4)*4,h=Buffer.alloc(4+padded);h.writeUInt32LE(padded);h.writeUInt32LE(json.length,4);json.copy(h,8);
  const prefix=Buffer.alloc(8);prefix.writeUInt32LE(4);prefix.writeUInt32LE(h.length,4);
  fs.mkdirSync(out,{recursive:true});const archive=path.join(out,'app.asar');fs.writeFileSync(archive,Buffer.concat([prefix,h,payload,...changes.values()]),{flag:'wx'});
  const result=readArchive(archive);let preserved=0;
  for(const [key,bytes] of original.files)if(!changes.has(key)){assert.ok(result.files.get(key).equals(bytes),key);preserved++;}
  // Disposable extracted source is for isolated smoke/transport checks only.
  for(const [key,bytes] of result.files){const file=path.join(out,'app',key);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}
  const report={installed_sha256:expected,candidate_sha256:sha(result.bytes),preserved_members:preserved,total_members:result.files.size,changed:[...changes].map(([file,bytes])=>({file,sha256:sha(bytes)})),installed_modified:false};
  fs.writeFileSync(path.join(out,'BUILD_RESULT.json'),JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [installed,expected,out]=process.argv.slice(2);assert.ok(installed&&expected&&out,'Usage: node tools/build-bridge-clock.mjs INSTALLED_ASAR EXPECTED_SHA NEW_OUTPUT');
  console.log(JSON.stringify(build({installed:path.resolve(installed),expected,out:path.resolve(out),moduleFile:fileURLToPath(new URL('../integrations/pc-bridge/clock-display.mjs',import.meta.url))}),null,2));
}
