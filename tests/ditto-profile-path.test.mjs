import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startHost} from '../ditto/server.mjs';

test('Windows profile casing is canonicalised for the receipt core without accepting junctions', {skip:process.platform!=='win32'}, async t=>{
  const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'ditto-profile-case-')));
  let host;
  t.after(async()=>{
    if(host)await host.close();
    assert(path.basename(parent).startsWith('ditto-profile-case-'));
    assert.equal(path.dirname(parent).toLowerCase(),(await fs.realpath(os.tmpdir())).toLowerCase());
    await fs.rm(parent,{recursive:true,force:true});
  });
  const profile=path.join(parent.toUpperCase(),'MiXeD-profile');
  host=await startHost({profile,port:0});
  assert.equal((await (await fetch(host.url+'/api/health')).json()).ok,true);
  const workspace=await fs.realpath(path.join(profile,'workspaces'));
  assert.equal(host.manager.bridge.project().root,workspace);
  const projectId=host.manager.bridge.project().id;
  await host.close();host=null;
  host=await startHost({profile:await fs.realpath(profile),port:0});
  assert.equal(host.manager.bridge.project().id,projectId);
  await host.close();host=null;
  const target=path.join(parent,'real-folder'),link=path.join(parent,'linked-folder');
  await fs.mkdir(target);await fs.symlink(target,link,'junction');
  await assert.rejects(startHost({profile:path.join(link,'profile'),port:0}),/Linked paths/);
  assert.deepEqual(await fs.readdir(target),[]);
});
