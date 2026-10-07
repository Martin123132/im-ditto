import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Manager} from '../ditto/manager.mjs';
import {loadBundle,verifyRelease,hash} from '../ditto/package.mjs';
const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('packaged Studio: pristine profile, real render, cancellation, preserved data and immutable release', {timeout:90000},async()=>{
  const dir=path.join(root,'acceptance','studio-'+randomUUID()),m=await new Manager(dir).init();
  const file=path.join(root,'im-catalogue/im-studio-0.1.0.impack.json'),bundle=await loadBundle(file);
  const call=async args=>{const r=await m.call('im-studio',args);assert.equal(r.ok,true,r.stderr);return JSON.parse(r.stdout);};
  try{
    await m.install(file,bundle.sha256);let run=await m.start('im-studio');
    let p=await call(['inspect']);assert.equal(p.name,'Neon Atlas');assert.equal(p.shots.length,5);assert.equal(p.assets.length,6);
    const originalId=p.id;
    await call(['create','--name','Hosted render acceptance']);p=await call(['inspect']);
    const image=path.join(await m.release(bundle.sha256),'demo-assets/03-orbit.png');
    p=await call(['import',image,'--kind','image']);
    p=await call(['shot','add',p.assets[0].id,'--duration','1','--caption','Shared core works']);
    let render=await call(['render','start']);render=await call(['render','wait',render.id,'--timeout','30']);assert.equal(render.status,'completed');
    const output=path.join(dir,'workspaces/im-studio/outputs',render.id+'.mp4');
    const {stdout}=await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{windowsHide:true,timeout:15000});const media=JSON.parse(stdout);assert.equal(media.streams[0].codec_name,'h264');assert.equal(Number(media.format.duration),1);
    await exec('ffmpeg',['-v','error','-i',output,'-f','null','-'],{windowsHide:true,timeout:15000});
    p=await call(['shot','edit',p.shots[0].id,'--duration','60']);const long=await call(['render','start']);const cancelled=await call(['render','cancel',long.id]);assert.ok(['cancelled','cancelling'].includes(cancelled.status));
    await m.stop('im-studio');run=await m.start('im-studio');p=await call(['inspect']);assert.equal(p.name,'Hosted render acceptance');assert.equal(p.shots[0].caption,'Shared core works');
    await call(['select',originalId]);assert.equal((await call(['inspect'])).name,'Neon Atlas');
    await verifyRelease(await m.release(bundle.sha256));
    await m.stop('im-studio');
    // A distinct test-only documentation release, not a pretend product update.
    const update=structuredClone(bundle);update.manifest.version='0.1.1';
    const im=update.files.find(f=>f.path==='im.json'),imBytes=Buffer.from(JSON.stringify(update.manifest));Object.assign(im,{bytes:imBytes.length,sha256:hash(imBytes),content:imBytes.toString('base64')});
    const instructions=update.files.find(f=>f.path===update.manifest.instructions),bytes=Buffer.concat([Buffer.from(instructions.content,'base64'),Buffer.from('\nTest-only documentation release: owner work is preserved.\n')]);
    Object.assign(instructions,{bytes:bytes.length,sha256:hash(bytes),content:bytes.toString('base64')});update.sha256=hash(JSON.stringify({format:update.format,manifest:update.manifest,files:update.files}));
    const updatePath=path.join(dir,'test-update.impack.json');await fs.writeFile(updatePath,JSON.stringify(update));await m.install(updatePath,update.sha256);
    assert.match(await m.instructions('im-studio'),/Test-only documentation release/);await m.start('im-studio');assert.equal((await call(['inspect'])).id,originalId);await m.stop('im-studio');
    await m.rollback('im-studio');assert.equal(m.registry.apps['im-studio'].version,'0.1.0');assert.doesNotMatch(await m.instructions('im-studio'),/Test-only documentation release/);
    await m.remove('im-studio');await m.install(file,bundle.sha256);await m.start('im-studio');assert.equal((await call(['inspect'])).id,originalId);assert.ok((await fs.stat(output)).size>0);
    await fs.writeFile(path.join(dir,'RESULT.json'),JSON.stringify({ok:true,profile:dir,bundle:bundle.sha256,render:render.id,output,duration:1,width:media.streams[0].width,height:media.streams[0].height,originalReferenceUntouched:true,cancellation:true,immutableRelease:true,updateRollbackRemoveReinstall:true},null,2));
  }finally{await m.close();}
});
