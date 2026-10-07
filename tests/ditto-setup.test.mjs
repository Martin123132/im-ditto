import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Setup} from '../ditto/setup.mjs';
import {startHost} from '../ditto/server.mjs';
const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function fixture(){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ditto-welcome-'));
  const manager={running:new Map(),apps:[],calls:[],records:[],async list(){return this.apps;},async dependencies(){return {node:{ok:true,version:process.version},ffmpeg:{ok:false}};},async call(id,args){this.calls.push({id,args});return {ok:true,stdout:'{"revision":1}'};},async record(...args){this.records.push(args);}};
  const options={profile,root:"C:\\Owner's work\\Ditto",instanceId:'host-1',manager,library:[{id:'im-studio'},{id:'im-board-games'}]};
  const setup=await new Setup(options).init();
  return {profile,manager,options,setup,open(id='im-studio'){manager.apps=[{id,installed:true,running:'running',url:'http://127.0.0.1:12345'}];manager.running.set(id,{status:'running',instanceId:'app-1'});}};
}
test('welcome persists choices, reports missing prerequisites and allows local-only completion',async()=>{
  const f=await fixture(),s=f.setup;
  assert.equal((await s.view()).appId,null);assert.equal((await s.view()).completedAt,null);
  await assert.rejects(s.select({appId:'unknown',route:'local'}),/available or installed/);
  await assert.rejects(s.select({appId:'im-studio',route:'unknown'}),/connection/);
  await s.select({appId:'im-studio',route:'local'});
  assert.equal((await s.check()).checks.ok,false);
  await assert.rejects(s.finish(),/Open/);
  f.open();await assert.rejects(s.makePrompt(),/AI connection/);await s.finish();
  const next=await new Setup(f.options).init();assert.ok((await next.view()).completedAt);assert.equal((await next.view()).checks.dependencies.ffmpeg.ok,false);
  await next.reopen();assert.equal((await next.view()).completedAt,null);assert.equal(f.manager.calls.length,0);
});
test('copying instructions is not verification; check is expiring, one-use, read-only and session-bound',async()=>{
  const f=await fixture(),s=f.setup;f.open();await s.select({appId:'im-studio',route:'bridge'});
  const p=await s.makePrompt();assert.match(p.command,/Owner''s work/);assert.doesNotMatch(p.prompt,/toolToken|ownerToken/);
  assert.equal((await s.view()).verification,null);await assert.rejects(s.finish(),/not been checked/);
  const code=s.challenge.code;
  await assert.rejects(s.verify('0'.repeat(32)),/expired or does not match/);
  assert.equal((await s.verify(code)).ok,true);assert.deepEqual(f.manager.calls,[{id:'im-studio',args:['inspect']}]);
  assert.equal((await s.view()).verification.current,true);await assert.rejects(s.verify(code),/expired or does not match/);
  await s.finish();f.manager.running.get('im-studio').instanceId='app-2';assert.equal((await s.view()).verification.current,false);
  const restarted=await new Setup({...f.options,instanceId:'host-2'}).init();assert.equal((await restarted.view()).verification.current,false);
  await s.makePrompt();const expired=s.challenge.code;s.now=()=>s.challenge.expiresAt+1;await assert.rejects(s.verify(expired),/expired/);
});
test('changing app or connection invalidates pending checks; failed inspections never show success',async()=>{
  const f=await fixture(),s=f.setup;f.open();await s.select({appId:'im-studio',route:'bridge'});await s.makePrompt();let code=s.challenge.code;
  await s.select({appId:'im-studio',route:'codex'});await assert.rejects(s.verify(code),/expired/);
  await s.makePrompt();code=s.challenge.code;f.manager.call=async()=>({ok:false,stderr:'test error'});await assert.rejects(s.verify(code),/inspection failed/);assert.equal((await s.view()).verification,null);
  await s.makePrompt();code=s.challenge.code;await s.select({appId:'im-board-games',route:'codex'});await assert.rejects(s.verify(code),/expired/);
});
test('production welcome route installs and verifies through real CLI; tool cannot self-onboard',async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ditto-welcome-live-'));const h=await startHost({profile,port:0});
  const req=(url,body,tool=false)=>fetch(h.url+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',[tool?'x-ditto-tool':'x-ditto-owner']:tool?h.toolToken:h.ownerToken},body:body?JSON.stringify(body):undefined});
  try{
    assert.equal((await req('/api/setup/select',{appId:'im-board-games',route:'bridge'},true)).status,403);
    await req('/api/setup/select',{appId:'im-board-games',route:'bridge'});
    assert.equal((await (await req('/api/setup/check',{})).json()).checks.ok,true);
    const state=await (await req('/api/state')).json(),pkg=state.catalogue.find(m=>m.id==='im-board-games');
    assert.ok(pkg);await req('/api/install',{sha256:pkg.sha256,trust:pkg.sha256});await req('/api/apps/im-board-games/start',{});
    const p=await (await req('/api/setup/prompt',{})).json(),code=/verify '([a-f0-9]{32})'/.exec(p.command)[1];
    assert.equal((await req('/api/setup/verify',{code})).status,403);
    const result=JSON.parse((await exec(process.execPath,[path.join(root,'ditto/cli.mjs'),'--profile',profile,'verify',code],{windowsHide:true,timeout:20000})).stdout);
    assert.equal(result.ok,true);assert.match(result.inspection,/Lantern/);assert.equal((await (await req('/api/setup')).json()).verification.current,true);
    assert.equal((await req('/api/setup/finish',{})).status,200);
    assert.equal((await req('/api/setup/prompt',{},true)).status,403);
    assert.equal((await req('/api/setup/finish',{},true)).status,403);
    const page=await (await fetch(h.url)).text();assert.match(page,/Three I’ms/);assert.match(page,/personal Bridge stays separate/);
  }finally{await h.close();}
});
