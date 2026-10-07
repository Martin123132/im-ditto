import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {hash,pack,verifyBundle,verifyRelease,relative,safe} from '../ditto/package.mjs';
import {Manager} from '../ditto/manager.mjs';
import {startHost} from '../ditto/server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const members=['im.json','package.json','entry.cjs','cli.cjs','index.html','app.js','AI_INSTRUCTIONS.md'];
async function fixture(){const dir=path.join(root,'acceptance','tests-'+randomUUID());await fs.mkdir(dir,{recursive:true});const source=path.join(root,'creator-template'),file=path.join(dir,'my-im.impack.json');const p=await pack(source,members,file);const bundle=JSON.parse(await fs.readFile(file,'utf8'));return {dir,file,p,bundle};}
function rehash(b){b.sha256=hash(JSON.stringify({format:b.format,manifest:b.manifest,files:b.files}));return b;}

test('manifest/path/integrity rejects traversal, collisions, corruption and missing entry',async t=>{
  const f=await fixture();assert.equal(verifyBundle(f.bundle).manifest.id,'my-im');
  for(const name of ['../x','a/../x','C:/file','/file','a\\b','NUL.txt','a.','a//b','file:ads','x\u0000y'])await t.test(name,()=>assert.throws(()=>relative(name)));
  await t.test('corrupted bytes',()=>{const b=structuredClone(f.bundle);b.files[0].content='YWJj';assert.throws(()=>verifyBundle(b),/hash\/size/);});
  await t.test('case collision',()=>{const b=structuredClone(f.bundle);b.files.push({...b.files[0],path:b.files[0].path.toUpperCase()});assert.throws(()=>verifyBundle(rehash(b)),/case-colliding/);});
  await t.test('reserved package record',()=>{const b=structuredClone(f.bundle);b.files.push({...b.files[0],path:'PACKAGE-RECORD.JSON'});assert.throws(()=>verifyBundle(rehash(b)),/Reserved/);});
  await t.test('file/directory collision',()=>{const b=structuredClone(f.bundle);b.files.push({...b.files[0],path:b.files[0].path+'/child.txt'});assert.throws(()=>verifyBundle(rehash(b)),/File\/directory/);});
  await t.test('missing entry',()=>{const b=structuredClone(f.bundle);b.files=b.files.filter(x=>x.path!==b.manifest.entry);assert.throws(()=>verifyBundle(rehash(b)),/absent/);});
  await t.test('symlink/junction ancestor',async()=>{const target=path.join(f.dir,'target'),link=path.join(f.dir,'link');await fs.mkdir(target);await fs.symlink(target,link,'junction');await assert.rejects(safe(link,'file.json'),/Linked/);});
});

test('clean install, shared command edit, restart, update, rollback, remove and reinstall preserve work',async t=>{
  const f=await fixture(),m=await new Manager(path.join(f.dir,'profile')).init();
  try{
    await t.test('owner trust is required',async()=>assert.rejects(m.install(f.file,'no'),/trust/));
    await m.install(f.file,f.p.sha256);let run=await m.start('my-im');assert.equal(run.status,'running');
    const result=await m.call('my-im',['set','Night workshop','Saved through the common host']);assert.equal(result.ok,true);const saved=JSON.parse(result.stdout);assert.equal(saved.revision,2);
    const browserRead=await (await fetch(run.url+'/api/project')).json();assert.deepEqual(browserRead,saved);
    await t.test('refuse update while running',async()=>assert.rejects(m.install(f.file,f.p.sha256),/Stop/));
    await t.test('refuse foreign URL override',async()=>assert.rejects(m.call('my-im',['--url','https://example.com']),/supplies/));
    await t.test('stale edit does not overwrite',async()=>{const health=await (await fetch(run.url+'/api/health')).json();const r=await fetch(run.url+'/api/project',{method:'POST',headers:{'x-app-token':health.token,'Content-Type':'application/json'},body:JSON.stringify({...saved,revision:1,notes:'Wrong'})});assert.equal(r.status,409);});
    await m.stop('my-im');run=await m.start('my-im');assert.deepEqual(await (await fetch(run.url+'/api/project')).json(),saved);await m.stop('my-im');
    const update=structuredClone(f.bundle);update.manifest.version='0.1.1';const idx=update.files.findIndex(x=>x.path==='index.html');const text=Buffer.from(update.files[idx].content,'base64').toString().replace('My I’m','My updated I’m');const bytes=Buffer.from(text);update.files[idx]={...update.files[idx],bytes:bytes.length,sha256:hash(bytes),content:bytes.toString('base64')};rehash(update);
    const updatedFile=path.join(f.dir,'update.impack.json');await fs.writeFile(updatedFile,JSON.stringify(update));await m.install(updatedFile,update.sha256);run=await m.start('my-im');assert.match(await (await fetch(run.url)).text(),/updated/);assert.deepEqual(await (await fetch(run.url+'/api/project')).json(),saved);await m.stop('my-im');
    await m.rollback('my-im');assert.equal(m.registry.apps['my-im'].version,'0.1.0');run=await m.start('my-im');assert.doesNotMatch(await (await fetch(run.url)).text(),/updated/);await m.stop('my-im');
    const data=await fs.readFile(path.join(f.dir,'profile/workspaces/my-im/project.json'),'utf8');await m.remove('my-im');assert.equal(await fs.readFile(path.join(f.dir,'profile/workspaces/my-im/project.json'),'utf8'),data);await assert.rejects(m.start('my-im'),/not installed/);
    await m.install(f.file,f.p.sha256);run=await m.start('my-im');assert.deepEqual(await (await fetch(run.url+'/api/project')).json(),saved);await m.stop('my-im');
    await t.test('tampered installed code fails before launch',async()=>{const release=await m.release(f.p.sha256);await fs.appendFile(path.join(release,'entry.cjs'),'\n// tampered');await assert.rejects(m.start('my-im'),/changed/);});
    const receipts=(await fs.readFile(path.join(f.dir,'profile/bridge-core/receipts.jsonl'),'utf8')).trim().split('\n');assert.ok(receipts.length>10);
  }finally{await m.close();}
});

test('production HTTP host distinguishes tool/owner, rejects foreign requests and closes children',async()=>{
  const f=await fixture();const catalogue=path.join(f.dir,'catalogue');await fs.mkdir(catalogue);await fs.copyFile(f.file,path.join(catalogue,'my-im.impack.json'));
  const host=await startHost({profile:path.join(f.dir,'host-profile'),port:0,catalogue});
  const request=(route,body,token=host.ownerToken,extra={})=>fetch(host.url+route,{method:body?'POST':'GET',headers:{[token===host.toolToken?'x-ditto-tool':'x-ditto-owner']:token,'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined});
  try{
    assert.equal((await request('/api/state',null,'bad')).status,403);
    assert.equal((await request('/api/state',null,host.toolToken)).status,200);
    assert.equal((await request('/api/install',{sha256:f.p.sha256,trust:f.p.sha256},host.toolToken)).status,403);
    assert.equal((await request('/api/state',null,host.ownerToken,{Origin:'https://evil.example'})).status,400);
    assert.equal((await request('/api/session',null,host.ownerToken,{'Sec-Fetch-Site':'cross-site'})).status,400);
    assert.equal((await request('/api/install',{sha256:f.p.sha256,trust:f.p.sha256})).status,200);
    assert.equal((await request('/api/apps/my-im/start',{},host.toolToken)).status,403);
    const started=await (await request('/api/apps/my-im/start',{})).json();assert.equal(started.status,'running');
    assert.equal((await request('/api/apps/my-im/call',{args:['set','Owner and AI','one workspace']},host.toolToken)).status,200);
    const r=await (await request('/api/apps/my-im/call',{args:['inspect']},host.toolToken)).json();assert.equal(JSON.parse(r.stdout).notes,'one workspace');
    assert.equal((await request('/api/apps/my-im/remove',{},host.toolToken)).status,403);
    await host.close();await assert.rejects(fetch(started.url+'/api/health',{signal:AbortSignal.timeout(2000)}));
  }finally{await host.close();}
});
