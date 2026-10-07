import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startHost} from '../ditto/server.mjs';
import {Creator} from '../ditto/creator.mjs';
import {pack} from '../ditto/package.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const members=['im.json','package.json','entry.cjs','cli.cjs','index.html','app.js','AI_INSTRUCTIONS.md','LICENSE-DITTO-STARTER.txt','NOTICE-DITTO-STARTER.md'];
async function fixture(){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),"ditto-creator-owner's-"));
  const host=await startHost({profile,port:0});
  const req=async(route,body,tool=false)=>{const response=await fetch(host.url+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',[tool?'x-ditto-tool':'x-ditto-owner']:tool?host.toolToken:host.ownerToken},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  return {host,profile,req};
}
test('creator owner flow: separate starter, exact-byte review, deliberate install, shared app state and restart',{timeout:30000},async()=>{
  const f=await fixture();let restarted;
  try{
    assert.equal((await f.req('/api/creator',undefined,true)).status,403);
    assert.equal((await f.req('/api/creator',{name:'No',brief:'Tool cannot create this.'},true)).status,403);
    const created=await f.req('/api/creator',{name:'Reading room',brief:'Keep a shared list of reading notes and export them.'});
    assert.equal(created.status,201);const d=created.body;assert.equal(d.status,'awaiting-build');
    assert.match(d.command,/owner''s/);assert.ok(d.source.startsWith(f.profile+path.sep));
    assert.doesNotMatch(d.prompt,/ownerToken|toolToken/);assert.match(d.prompt,/unchanged starter/);
    assert.equal(JSON.parse(await fs.readFile(d.briefFile,'utf8')).job,d.brief);
    assert.equal(JSON.parse(await fs.readFile(path.join(d.source,'im.json'),'utf8')).id,d.appId);
    assert.equal((await f.host.manager.list()).length,0);
    assert.equal((await f.req('/api/setup/select',{appId:d.appId,route:'codex'})).status,400);
    assert.equal((await f.req('/api/creator/'+d.id+'/review',{})).status,400);
    const saved=await new Creator({profile:f.profile,root,manager:f.host.manager}).init();assert.equal((await saved.list())[0].id,d.id);
    // Deliberately package the known starter as a mechanical lifecycle fixture.
    // This is not presented as an AI-generated reading-room implementation.
    await pack(d.source,members,d.output);
    assert.equal((await f.req('/api/creator/'+d.id+'/install',{sha256:'x',trust:'x'})).status,400);
    const reviewed=await f.req('/api/creator/'+d.id+'/review',{});assert.equal(reviewed.status,200);const old=reviewed.body.sha256;
    assert.equal(reviewed.body.report,null);assert.equal(reviewed.body.files.length,9);assert.equal((await f.host.manager.list()).length,0);
    assert.equal((await f.req('/api/creator/'+d.id+'/review',{},true)).status,403);
    assert.equal((await f.req('/api/creator/'+d.id+'/install',{sha256:old,trust:old},true)).status,403);
    assert.equal((await f.req('/api/creator/'+d.id+'/install',{sha256:old,trust:'wrong'})).status,400);
    await fs.appendFile(path.join(d.source,'cli.cjs'),'\n// fixture changed after review\n');await pack(d.source,members,d.output);
    const changed=await f.req('/api/creator/'+d.id+'/install',{sha256:old,trust:old});assert.equal(changed.status,400);assert.match(changed.body.error,/changed since review/);
    const final=await f.req('/api/creator/'+d.id+'/review',{}),sha=final.body.sha256;assert.notEqual(sha,old);
    assert.equal((await f.req('/api/creator/'+d.id+'/install',{sha256:sha,trust:sha})).status,200);
    assert.notEqual((await f.host.manager.list())[0].running,'running');
    await f.host.manager.start(d.appId);const set=await f.host.manager.call(d.appId,['set','First test','Same saved work']);assert.equal(set.ok,true);
    assert.equal((await f.req('/api/setup/select',{appId:d.appId,route:'codex'})).status,200);
    assert.equal((await f.req('/api/setup/check',{})).body.checks.ok,true);
    const prompt=(await f.req('/api/setup/prompt',{})).body;assert.ok(prompt.prompt.includes(d.appId));
    const code=prompt.command.match(/verify '([a-f0-9]{32})'/)[1];
    assert.equal((await f.req('/api/setup/verify',{code},true)).body.ok,true);
    assert.equal((await f.req('/api/setup/finish',{})).status,200);
    const edited=JSON.parse(set.stdout);await f.host.manager.stop(d.appId);await f.host.manager.start(d.appId);
    assert.deepEqual(JSON.parse((await f.host.manager.call(d.appId,['inspect'])).stdout),edited);
    await f.host.close();restarted=await startHost({profile:f.profile,port:0});
    const listing=await fetch(restarted.url+'/api/creator',{headers:{'x-ditto-owner':restarted.ownerToken}});assert.equal((await listing.json()).drafts[0].status,'installed');
  }finally{await f.host.close();await restarted?.close();}
});
test('creator rejects invalid fields, unknown ids, linked output and another app identity',{timeout:15000},async()=>{
  const f=await fixture();
  try{
    for(const input of [null,[],{name:{},brief:'Valid length description'},{name:'a',brief:'too short'},{name:'Fine',brief:'Build a notes app.',path:'../elsewhere'},{name:'x'.repeat(81),brief:'Valid description'},{name:'Fine',brief:'x'.repeat(4001)}])assert.equal((await f.req('/api/creator',input)).status,400);
    assert.equal((await f.req('/api/creator/'+('0'.repeat(32))+'/review',{})).status,400);
    const d=(await f.req('/api/creator',{name:'Safe name',brief:'A simple notes workspace for testing.'})).body;
    const mf=path.join(d.source,'im.json'),m=JSON.parse(await fs.readFile(mf,'utf8'));await fs.writeFile(mf,JSON.stringify({...m,id:'im-studio'}));await pack(d.source,members,d.output);
    assert.match((await f.req('/api/creator/'+d.id+'/review',{})).body.error,/identifier does not match/);
    await fs.writeFile(mf,JSON.stringify(m));await pack(d.source,members,d.output);
    await fs.writeFile(d.report,'<script>not authority</script>');assert.equal((await f.req('/api/creator/'+d.id+'/review',{})).body.report,'<script>not authority</script>');
    const update=path.join(path.dirname(d.report),'UPDATE_REPORT.md');
    assert.equal((await f.req('/api/creator/'+d.id+'/review',{})).body.updateReport,null);
    await fs.writeFile(update,'Update report: <script>also not authority</script>');
    const both=(await f.req('/api/creator/'+d.id+'/review',{})).body;
    assert.equal(both.report,'<script>not authority</script>');
    assert.equal(both.updateReport,'Update report: <script>also not authority</script>');
    assert.match(both.warning,/may describe an earlier version/);
    await fs.writeFile(update,'x'.repeat(65537));assert.equal((await f.req('/api/creator/'+d.id+'/review',{})).status,400);
    await fs.rename(update,update+'.oversized');
    await fs.symlink(path.dirname(d.report),update,'junction');
    assert.equal((await f.req('/api/creator/'+d.id+'/review',{})).status,400);
    const other=(await f.req('/api/creator',{name:'Other draft',brief:'Another isolated notes workspace.'})).body;
    const outputDir=path.dirname(other.output);await fs.rename(outputDir,outputDir+'-original');await fs.symlink(path.dirname(d.output),outputDir,'junction');
    const linked=await f.req('/api/creator/'+other.id+'/review',{});assert.equal(linked.status,400);assert.match(linked.body.error,/Linked/);
  }finally{await f.host.close();}
});
