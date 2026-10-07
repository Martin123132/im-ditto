import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Creator} from '../ditto/creator.mjs';
import {Manager} from '../ditto/manager.mjs';
import {loadBundle,verifyRelease} from '../ditto/package.mjs';

const exec=promisify(execFile),root=path.resolve(import.meta.dirname,'..');
const notices=['LICENSE-DITTO-STARTER.txt','NOTICE-DITTO-STARTER.md'];
const read=file=>fs.readFile(file,'utf8');
async function assertNotices(bundle){
  for(const name of notices){
    const member=bundle.files.find(file=>file.path===name);assert.ok(member,name+' is packaged');
    assert.equal(Buffer.from(member.content,'base64').toString('utf8'),await read(path.join(root,'creator-template',name)));
  }
}
async function packageSource(source,out){
  await exec(process.execPath,[path.join(root,'ditto/build.mjs'),'pack',source,out],{windowsHide:true,timeout:15000});
  const bundle=await loadBundle(out);await assertNotices(bundle);return bundle;
}

test('dashboard starter notices survive packaging, install, update and rollback without licensing creator additions',{timeout:30000},async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ditto-licence-dashboard-'));
  const manager=await new Manager(profile).init();
  try{
    const creator=await new Creator({profile,root,manager}).init();
    const draft=await creator.create({name:'Licence lifecycle fixture',brief:'Mechanical packaging fixture, not an AI-built application.'});
    assert.match(draft.prompt,/Keep LICENSE-DITTO-STARTER/);
    assert.match(draft.prompt,/not your entire finished app/);
    // A creator can choose different terms for additions; do not rewrite them.
    const ownTerms='Fixture creator additions remain separately licensed.\n';
    await fs.writeFile(path.join(draft.source,'APP_LICENSE.md'),ownTerms);
    assert.equal(JSON.parse(await read(path.join(draft.source,'package.json'))).license,undefined);
    const first=await packageSource(draft.source,draft.output);
    assert.equal(first.files.length,10);
    const review=await creator.review(draft.id);
    await creator.install(draft.id,{sha256:review.sha256,trust:review.sha256});
    await assertNotices(await verifyRelease(await manager.release(first.sha256)));
    const manifestPath=path.join(draft.source,'im.json');
    const manifest=JSON.parse(await read(manifestPath));manifest.version='0.1.1';
    await fs.writeFile(manifestPath,JSON.stringify(manifest));
    const updated=await packageSource(draft.source,draft.output);
    assert.notEqual(updated.sha256,first.sha256);
    const newReview=await creator.review(draft.id);
    await creator.install(draft.id,{sha256:newReview.sha256,trust:newReview.sha256});
    const active=await manager.release(updated.sha256);
    await assertNotices(await verifyRelease(active));
    assert.equal(await read(path.join(active,'APP_LICENSE.md')),ownTerms);
    await manager.rollback(draft.appId);
    assert.equal(manager.registry.apps[draft.appId].active,first.sha256);
    await assertNotices(await verifyRelease(await manager.release(first.sha256)));
  }finally{await manager.close();}
});

test('manual starter copy includes MIT notices without copying the Core licence',{timeout:20000},async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ditto-licence-manual-'));
  const source=path.join(temp,'source'),output=path.join(temp,'manual.impack.json');
  await fs.cp(path.join(root,'creator-template'),source,{recursive:true});
  const bundle=await packageSource(source,output);
  assert.ok(bundle.files.some(file=>file.path==='README.md'));
  assert.ok(!bundle.files.some(file=>file.path.includes('Im-Ditto-Core')));
  assert.match(await read(path.join(source,notices[0])),/^MIT License/);
  assert.match(await read(path.join(source,notices[1])),/not automatically to every addition/);
  assert.equal(JSON.parse(await read(path.join(source,'package.json'))).license,undefined);
});
