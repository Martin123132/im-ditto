import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {startClockDisplay} from '../integrations/pc-bridge/clock-display.mjs';
import {BridgeStatus,sanitizeClockFeed} from '../ditto/bridge-status.mjs';
import {clockText} from '../ditto/ui/reply-clocks.mjs';
import {startHost} from '../ditto/server.mjs';
const stamp='2026-10-06T12:00:00.000Z',now=Date.parse(stamp);
function sample(){return {enabled:true,timing_minutes:[20,23,25],sessions:[{work_session_id:'1'.repeat(32),work_turn_id:'reply-test-1',period:1,phase:'working',started_at:stamp,deadline_at:new Date(now+1500000).toISOString(),remaining_seconds:1500,last_seen_at:stamp,turn_identity_source:'agent_or_owner_declared',checkpoint:{at:stamp,period:1,agent_reported_not_independently_verified:{completed:'PRIVATE NOTE'},observed_tool_receipts:[{path:'PRIVATE PATH'}]},label:'PRIVATE LABEL',instruction:'PRIVATE INSTRUCTION'}]};}
async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ditto-clock-test-'));let protectedMode=false,reads=0;
  const snapshot=sample(),manager={ready:Promise.resolve(),snapshot(){reads++;return structuredClone(snapshot);}};
  const feed=await startClockDisplay({workSessions:manager,dataDir:dir,now:()=>now,isProtected:()=>protectedMode});
  const beforeCleanup=[];
  t.after(async()=>{for(const close of beforeCleanup)await close();await feed.close();await fs.rm(dir,{recursive:true,force:true});});
  const discoveryFile=path.join(dir,'ditto-clock-display.json'),d=JSON.parse(await fs.readFile(discoveryFile,'utf8'));
  const client=new BridgeStatus({discoveryFile,now:()=>now});
  const request=(options={})=>fetch(`http://127.0.0.1:${d.port}/v1/reply-clocks`,{headers:{Authorization:'Bearer '+d.token,...options.headers},...options});
  return {dir,feed,d,client,snapshot,request,beforeCleanup,get reads(){return reads;},protect(){protectedMode=true;}};
}
test('live read-only feed strips tokens, notes, paths, labels and instructions; polling never changes state',async t=>{
  const f=await fixture(t),before=JSON.stringify(f.snapshot);
  const a=await f.client.read(),b=await f.client.read();assert.equal(a.status,'connected');assert.deepEqual(a,b);assert.equal(JSON.stringify(f.snapshot),before);assert.equal(f.reads,2);
  assert.doesNotMatch(JSON.stringify(a),/PRIVATE|reply-test-1|11111111111111111111111111111111|token|instruction/);
  assert.equal(a.sessions[0].checkpoint.period,1);assert.equal(a.sessions[0].remaining_seconds,1500);
});
test('feed rejects missing/wrong credentials, browser origins, writes, controls and alternate routes',async t=>{
  const f=await fixture(t);
  for(const options of [{headers:{}},{headers:{Authorization:'Bearer wrong'}},{headers:{Authorization:'Bearer '+f.d.token,Origin:'http://127.0.0.1'}},{method:'POST',body:'{}'}])assert.equal((await f.request(options)).status,403);
  assert.equal((await fetch(`http://127.0.0.1:${f.d.port}/v1/resume`,{headers:{Authorization:'Bearer '+f.d.token}})).status,403);
  assert.equal(f.reads,0);
});
test('protected mode hides every clock; feed outage never leaves an old countdown',async t=>{
  const f=await fixture(t);f.protect();assert.deepEqual((await f.client.read()).sessions,[]);assert.equal((await f.client.read()).status,'protected');assert.equal(f.reads,0);
  await f.feed.close();assert.equal((await f.client.read()).status,'unavailable');
});
test('strict consumer refuses stale times, wrong instance, duplicate sessions and malformed values',async t=>{
  const f=await fixture(t),data=await (await f.request()).json();
  const mutations=[d=>d.server_time=new Date(now-16000).toISOString(),d=>d.instance='wrong',d=>d.sessions.push({...d.sessions[0]}),d=>d.sessions[0].remaining_seconds=-1,d=>d.sessions[0].phase='pretend_done',d=>d.sessions[0].reply_id='bad',d=>d.sessions[0].checkpoint.period=99,d=>d.timing_minutes=[25,23,20],d=>{d.protected=true;}];
  for(const mutate of mutations){const copy=structuredClone(data);mutate(copy);assert.throws(()=>sanitizeClockFeed(copy,f.d,now));}
  const extra=structuredClone(data);extra.sessions[0].secret='PRIVATE';assert.doesNotMatch(JSON.stringify(sanitizeClockFeed(extra,f.d,now)),/PRIVATE/);
});
test('missing, oversized, linked or malformed discovery is harmless and never changes source files',async t=>{
  const f=await fixture(t),file=path.join(f.dir,'other.json'),c=new BridgeStatus({discoveryFile:file});
  assert.equal((await c.read()).status,'unavailable');
  for(const contents of ['not json','x'.repeat(5000),JSON.stringify({...f.d,port:0})]){await fs.writeFile(file,contents);assert.equal((await c.read()).status,'disconnected');assert.equal(await fs.readFile(file,'utf8'),contents);}
  const linked=path.join(f.dir,'linked');await fs.symlink(f.dir,linked,'junction');assert.equal((await new BridgeStatus({discoveryFile:path.join(linked,'ditto-clock-display.json')}).read()).status,'disconnected');await fs.unlink(linked);
});
test('Ditto endpoint is owner-only and read-only; ordinary host remains usable without feed',async t=>{
  const f=await fixture(t),profile=path.join(f.dir,'host');const host=await startHost({profile,port:0,clockDiscoveryFile:path.join(f.dir,'ditto-clock-display.json')});f.beforeCleanup.push(()=>host.close());
  const request=(headers={},method='GET')=>fetch(host.url+'/api/bridge/clocks',{headers,method});
  assert.equal((await request()).status,403);assert.equal((await request({'x-ditto-tool':host.toolToken})).status,403);
  assert.equal((await request({'x-ditto-owner':host.ownerToken},'POST')).status,405);
  assert.equal((await request({'x-ditto-owner':host.ownerToken,Origin:'https://not-local.invalid'})).status,400);
  const actual=await (await request({'x-ditto-owner':host.ownerToken})).json();
  // Fixture deliberately uses a historical timestamp: stale, not a fake current clock.
  assert.equal(actual.status,'disconnected');
  await f.feed.close();assert.equal((await (await request({'x-ditto-owner':host.ownerToken})).json()).status,'unavailable');
  assert.equal((await fetch(host.url+'/api/state',{headers:{'x-ditto-owner':host.ownerToken}})).status,200);
});
test('clock wording handles finish, advisory, outage and disabled states without claiming AI progress',()=>{
  const feed={status:'connected'},row=sample().sessions[0];assert.equal(clockText(feed,row),'This reply · 25 min left');
  assert.equal(clockText(feed,{...row,phase:'yielded'}),'Reply finished');
  assert.match(clockText(feed,{...row,phase:'awaiting_message'}),/advisory/);
  assert.match(clockText({status:'disconnected'}),/unavailable/);assert.match(clockText({status:'disabled'},row),/off/);
});
test('production Bridge manager: two chats, two replies, warnings, early finish, stale finish and restart', {skip:!process.env.DITTO_TEST_BRIDGE_SESSIONS},async t=>{
  const {WorkSessions}=await import(pathToFileURL(process.env.DITTO_TEST_BRIDGE_SESSIONS));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ditto-real-clock-'));let clock=now;
  const manager=new WorkSessions({dataDir:dir,clock:()=>clock});await manager.ready;
  const client={id:'test',provider:'openai',transport:'test'},meta={'openai/session':'chat-one'},meta2={'openai/session':'chat-two'};
  const id=await manager.touch(client,meta,undefined,{turnId:'reply-0001'});
  const id2=await manager.touch(client,meta2,undefined,{turnId:'reply-0002'});
  const feed=await startClockDisplay({workSessions:manager,dataDir:dir,now:()=>clock});
  t.after(async()=>{await feed.close();await fs.rm(dir,{recursive:true,force:true});});
  const consumer=new BridgeStatus({discoveryFile:path.join(dir,'ditto-clock-display.json'),now:()=>clock});
  const original=manager.status(id).deadline_at;const bytes=await fs.readFile(path.join(dir,'work-sessions/state.json'),'utf8');
  for(let i=0;i<3;i++)assert.equal((await consumer.read()).sessions.length,2);
  assert.equal(await fs.readFile(path.join(dir,'work-sessions/state.json'),'utf8'),bytes);
  clock+=60000;await manager.touch(client,meta,undefined,{turnId:'reply-0001'});assert.equal(manager.status(id).deadline_at,original);
  await manager.touch(client,meta,undefined,{turnId:'reply-0003'});assert.notEqual(manager.status(id).deadline_at,original);assert.equal(manager.status(id2).deadline_at,original);
  const period=manager.status(id).period;await manager.operate(id,{action:'finish',period});await manager.operate(id,{action:'finish',period});
  assert.ok((await consumer.read()).sessions.some(r=>r.phase==='yielded'));
  await manager.touch(client,meta,undefined,{turnId:'reply-0004'});
  await assert.rejects(manager.touch(client,meta,undefined,{turnId:'reply-0003',existingTurn:true}),/STALE/);
  await assert.rejects(manager.operate(id,{action:'finish',period}),/Stale/);assert.equal(manager.status(id).phase,'working');
  clock+=20*60000;assert.equal(manager.status(id).phase,'wrap_up');clock+=3*60000;assert.equal(manager.status(id).phase,'checkpoint_due');clock+=2*60000;assert.equal(manager.status(id).phase,'report_due');
  assert.doesNotThrow(()=>manager.check(id,'bridge_write_file',undefined));assert.throws(()=>manager.check(id,'bridge_write_file','reply-0004'),/WORK_PERIOD_FINISHED/);
  const restarted=new WorkSessions({dataDir:dir,clock:()=>clock});await restarted.ready;assert.equal(restarted.status(id).deadline_at,manager.status(id).deadline_at);
});
