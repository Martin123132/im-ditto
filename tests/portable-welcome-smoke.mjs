import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),root=path.resolve(process.argv[2]),profile=await fs.mkdtemp(path.join(os.tmpdir(),'ditto-portable-welcome-'));
const runtime=path.join(root,'runtime/node.exe');
// Deliberately exclude global Node and FFmpeg directories. This is not a clean OS.
const env={...process.env};for(const k of Object.keys(env))if(k.toLowerCase()==='path')delete env[k];env.PATH=path.join(process.env.SystemRoot,'System32');
const args=[path.join(root,'ditto/launch.mjs'),'--profile',profile,'--no-open'];
let url,owner;
try{
  const first=JSON.parse((await exec(runtime,args,{env,windowsHide:true,timeout:25000})).stdout);url=first.url;
  const second=JSON.parse((await exec(runtime,args,{env,windowsHide:true,timeout:5000})).stdout);assert.equal(second.instanceId,first.instanceId);assert.equal(second.url,url);
  owner=(await (await fetch(url+'/api/session')).json()).ownerToken;
  const req=async(route,body)=>{const r=await fetch(url+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-ditto-owner':owner},body:body?JSON.stringify(body):undefined});const b=await r.json();assert.equal(r.ok,true,b.error);return b;};
  assert.equal((await req('/api/state')).apps.length,0);assert.equal((await req('/api/setup')).completedAt,null);
  await req('/api/setup/select',{appId:'im-studio',route:'local'});const missing=await req('/api/setup/check',{});assert.equal(missing.checks.dependencies.ffmpeg.ok,false);assert.equal(missing.checks.dependencies.ffprobe.ok,false);
  await req('/api/setup/select',{appId:'im-board-games',route:'local'});assert.equal((await req('/api/setup/check',{})).checks.ok,true);
  const catalogue=(await req('/api/state')).catalogue,m=catalogue.find(x=>x.id==='im-board-games');await req('/api/install',{sha256:m.sha256,trust:m.sha256});await req('/api/apps/im-board-games/start',{});
  const cli=async(...more)=>JSON.parse((await exec(runtime,[path.join(root,'ditto/cli.mjs'),'--profile',profile,...more],{env,windowsHide:true,timeout:15000})).stdout);
  const inspect=await cli('call','im-board-games','--','inspect');assert.equal(inspect.ok,true);const game=JSON.parse(inspect.stdout);assert.equal(game.name,'Lantern Circuit');
  assert.ok((await req('/api/setup/finish',{})).completedAt);
  // Exercise the connection-check command and the guide's first useful output
  // without making a provider call or touching an existing owner's workspace.
  await req('/api/setup/select',{appId:'im-board-games',route:'codex'});
  const prompt=await req('/api/setup/prompt',{}),code=/verify '([a-f0-9]{32})'/.exec(prompt.command)?.[1];assert.ok(code);
  assert.equal((await cli('verify',code)).ok,true);assert.equal((await req('/api/setup')).verification.current,true);
  assert.ok((await req('/api/setup/finish',{})).completedAt);
  const app=async(...args)=>{const result=await cli('call','im-board-games','--',...args);assert.equal(result.ok,true,result.stderr);return JSON.parse(result.stdout);};
  await app('create','--name','Guided preview first output','--template','lantern-circuit');
  const edited=await app('card','add','--title','Lantern shortcut','--body','Move one orthogonal step.','--quantity','1');
  const html=await app('export','--format','html'),json=await app('export','--format','json');
  const print=await (await fetch(html.url)).text();assert.match(print,/Lantern shortcut/);assert.match(print,/@page\{size:A4 portrait/);
  assert.deepEqual(await (await fetch(json.url)).json(),edited);
  await req('/api/apps/im-board-games/stop',{});await req('/api/apps/im-board-games/start',{});
  assert.deepEqual(await app('inspect'),edited);assert.equal((await req('/api/setup')).verification.current,false);
  const draft=await req('/api/creator',{name:'Portable creator fixture',brief:'Test only: package the supplied notes starter to exercise the creator lifecycle.'});
  assert.match(draft.command,/runtime[\\/]node\.exe/);
  await exec(runtime,[path.join(root,'ditto/build.mjs'),'pack',draft.source,draft.output],{env,windowsHide:true,timeout:15000});
  const reviewed=await req('/api/creator/'+draft.id+'/review',{});assert.equal(reviewed.files.length,9);
  for(const notice of ['LICENSE-DITTO-STARTER.txt','NOTICE-DITTO-STARTER.md']){
    assert.ok(reviewed.files.some(file=>file.path===notice));
    assert.equal(await fs.readFile(path.join(draft.source,notice),'utf8'),await fs.readFile(path.join(root,'creator-template',notice),'utf8'));
  }
  await req('/api/creator/'+draft.id+'/install',{sha256:reviewed.sha256,trust:reviewed.sha256});
  await req('/api/setup/select',{appId:draft.appId,route:'codex'});assert.equal((await req('/api/setup/check',{})).checks.ok,true);
  await req('/api/apps/'+draft.appId+'/start',{});
  const creatorPrompt=await req('/api/setup/prompt',{}),creatorCode=/verify '([a-f0-9]{32})'/.exec(creatorPrompt.command)?.[1];
  assert.equal((await cli('verify',creatorCode)).ok,true);
  assert.equal((await req('/api/creator')).drafts[0].status,'installed');
  const savedResult=await cli('call',draft.appId,'--','set','Portable saved work','Keep this through the update');assert.equal(savedResult.ok,true);
  const savedProject=JSON.parse(savedResult.stdout);
  await req('/api/apps/'+draft.appId+'/stop',{});
  const manifestPath=path.join(draft.source,'im.json'),manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));manifest.version='0.1.1';
  await fs.writeFile(manifestPath,JSON.stringify(manifest));
  await exec(runtime,[path.join(root,'ditto/build.mjs'),'pack',draft.source,draft.output],{env,windowsHide:true,timeout:15000});
  const update=await req('/api/creator/'+draft.id+'/review',{});assert.notEqual(update.sha256,reviewed.sha256);
  await req('/api/creator/'+draft.id+'/install',{sha256:update.sha256,trust:update.sha256});
  await req('/api/apps/'+draft.appId+'/start',{});
  const afterUpdate=await cli('call',draft.appId,'--','inspect');assert.equal(afterUpdate.ok,true);assert.deepEqual(JSON.parse(afterUpdate.stdout),savedProject);
  await req('/api/apps/'+draft.appId+'/stop',{});await req('/api/apps/'+draft.appId+'/rollback',{});await req('/api/apps/'+draft.appId+'/start',{});
  const afterRollback=await cli('call',draft.appId,'--','inspect');assert.equal(afterRollback.ok,true);assert.deepEqual(JSON.parse(afterRollback.stdout),savedProject);
  console.log(JSON.stringify({creatorFixtureOnly:true,customImplementationClaim:false,creatorPackageReviewInstall:true,starterNoticesPreserved:true,customAppSetupAndCliConnection:true,updateAndRollbackPreserveSavedWork:true}));
  console.log(JSON.stringify({ok:true,profile,runtime,nodeOnPath:false,ffmpegOnPath:false,cleanOS:false,initialApps:0,repeatedLaunchSameHost:true,missingStudioPrerequisitesReported:true,boardInstallStartInspect:true,localOnlySetupComplete:true,finiteCliConnectionCheck:true,providerCalls:0,firstCardAndHtmlJsonExports:true,restartPreservesWork:true,restartInvalidatesConnectionCheck:true,html:html.path,json:json.path,game:game.name}));
}finally{if(url&&owner)await fetch(url+'/api/stop',{method:'POST',headers:{'Content-Type':'application/json','x-ditto-owner':owner},body:'{}'}).catch(()=>{});}
