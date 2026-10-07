import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {atomicJson} from '../src/core.mjs';
import {check,safe} from './package.mjs';
import {bridgeReplyGuidance} from './bridge-guidance.mjs';

const quote=value=>"'"+value.replaceAll("'","''")+"'";
export class Setup {
  constructor({profile,instanceId,manager,library,root,now=Date.now}){
    Object.assign(this,{profile,instanceId,manager,library,root,now});this.tail=Promise.resolve();
  }
  async init(){
    this.filename=await safe(this.profile,'welcome.json');
    try{this.data=JSON.parse(await fs.readFile(this.filename,'utf8'));check(this.data.version===1,'Unsupported welcome record.');}
    catch(e){if(e.code!=='ENOENT')throw e;this.data={version:1,appId:null,route:'local',completedAt:null,checks:null,verification:null};}
    return this;
  }
  serial(fn){const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next;}
  save(){return atomicJson(this.filename,this.data);}
  async choices(){
    const all=new Map(this.library.map(m=>[m.id,m]));
    for(const app of await this.manager.list())if(app.installed)all.set(app.id,app);
    return [...all.values()];
  }
  async view(){
    const app=(await this.manager.list()).find(a=>a.id===this.data.appId&&a.installed);
    const v=this.data.verification;
    return {...this.data,verification:v?{...v,current:v.hostInstance===this.instanceId&&v.appId===this.data.appId&&v.appInstance===this.manager.running.get(this.data.appId)?.instanceId}:null,
      app:app||null,root:this.root,profile:this.profile,
      challengePending:!!this.challenge&&this.challenge.expiresAt>this.now(),
      connectionMeaning:'An authenticated local CLI command inspected this workspace. This is a point-in-time check, not proof of AI identity or continuous connectivity.'};
  }
  select({appId,route}){return this.serial(async()=>{
    check((await this.choices()).some(m=>m.id===appId),'Choose an available or installed I’m.');
    check(['local','bridge','codex','new-bridge'].includes(route),'Unknown connection choice.');
    if(appId!==this.data.appId){this.data.checks=null;this.data.verification=null;}
    if(appId!==this.data.appId||route!==this.data.route){this.challenge=null;this.data.verification=null;}
    Object.assign(this.data,{appId,route,completedAt:null});await this.save();return this.view();
  });}
  check(){return this.serial(async()=>{
    const m=(await this.choices()).find(x=>x.id===this.data.appId);check(m,'Choose an available or installed workspace first.');
    const dependencies=await this.manager.dependencies(m);
    this.data.checks={appId:m.id,checkedAt:new Date(this.now()).toISOString(),hostInstance:this.instanceId,dependencies,ok:Object.values(dependencies).every(x=>x.ok)};
    await this.save();return this.view();
  });}
  makePrompt(){return this.serial(async()=>{
    check(this.data.route!=='local','Choose an AI connection first.');
    check(this.manager.running.get(this.data.appId)?.status==='running','Start your chosen workspace first.');
    const code=randomBytes(16).toString('hex');
    this.challenge={code,appId:this.data.appId,expiresAt:this.now()+15*60*1000};
    const command='& '+quote(process.execPath)+' '+quote(path.join(this.root,'ditto/cli.mjs'))+' --profile '+quote(this.profile)+' verify '+quote(code);
    return {expiresAt:new Date(this.challenge.expiresAt).toISOString(),command,prompt:
      'Please check my I’m-Ditto connection using '+(this.data.route==='codex'?'this local coding session':'the PC Bridge already connected to this chat')+'.\n'+
      'The foundation is at '+this.root+'. Use only a workspace I have already authorized. If it is outside your access, stop and tell me; do not widen permissions.\n'+
      'Run this single finite PowerShell command. It confirms the host identity and performs a read-only inspection of my open '+this.data.appId+' workspace:\n\n'+command+'\n\n'+
      'Report the check result and workspace summary. Do not start servers, install anything, change settings, read credentials, or edit my work. No work is authorized beyond this connection check.'+
      (this.data.route==='codex'?'':'\n\n'+bridgeReplyGuidance)};
  });}
  verify(code){return this.serial(async()=>{
    const c=this.challenge;
    check(typeof code==='string'&&/^[a-f0-9]{32}$/.test(code)&&c?.code===code&&c.expiresAt>this.now(),'Connection check expired or does not match. Generate a fresh prompt in Welcome.');
    this.challenge=null; // A failed inspection also consumes this check; never silently retry app work.
    const run=this.manager.running.get(c.appId);check(run?.status==='running','Your selected workspace is no longer open.');
    const result=await this.manager.call(c.appId,['inspect']);check(result.ok,'Connection reached I’m-Ditto, but workspace inspection failed. '+result.stderr);
    this.data.verification={appId:c.appId,hostInstance:this.instanceId,appInstance:run.instanceId,verifiedAt:new Date(this.now()).toISOString(),method:'authenticated-cli-and-read-only-inspection'};
    await this.save();await this.manager.record('connection_checked',{appId:c.appId,hostInstance:this.instanceId,readOnly:true});
    return {ok:true,appId:c.appId,verifiedAt:this.data.verification.verifiedAt,readOnly:true,inspection:result.stdout,meaning:'Local CLI and workspace access checked; no new permission was granted.'};
  });}
  finish(){return this.serial(async()=>{
    const v=await this.view();check(v.app?.running==='running','Open your workspace before finishing setup.');
    check(v.route==='local'||v.verification?.current,'The AI connection has not been checked. Send the prompt, or choose “Just me for now”.');
    this.data.completedAt=new Date(this.now()).toISOString();await this.save();return this.view();
  });}
  reopen(){return this.serial(async()=>{this.data.completedAt=null;await this.save();return this.view();});}
}
