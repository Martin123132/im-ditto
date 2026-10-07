import fs from 'node:fs/promises';
import path from 'node:path';
import {fork,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {BridgeCore,atomicJson} from '../src/core.mjs';
import {check,safe,loadBundle,unpack,verifyRelease,manifest} from './package.mjs';
const exec=promisify(execFile), here=path.dirname(fileURLToPath(import.meta.url));
export class Manager {
  constructor(profile){this.profile=path.resolve(profile);this.running=new Map();this.tail=Promise.resolve();this.calls=new Set();this.closing=false;}
  serial(f){const next=this.tail.then(f);this.tail=next.catch(()=>{});return next;}
  async init(){
    await fs.mkdir(await safe(this.profile),{recursive:true});
    this.registryFile=path.join(this.profile,'registry.json');
    try{this.registry=JSON.parse(await fs.readFile(this.registryFile,'utf8'));check(this.registry.version===1 && this.registry.apps && typeof this.registry.apps==='object','Invalid registry.');}
    catch(e){if(e.code!=='ENOENT')throw e;this.registry={version:1,apps:{}};await this.save();}
    // Check links before resolving Windows casing/8.3 aliases. The inherited
    // Bridge guard compares canonical paths exactly; do not weaken that guard.
    const bridgeData=await safe(this.profile,'bridge-core'),workspace=await safe(this.profile,'workspaces');
    await fs.mkdir(bridgeData,{recursive:true});await fs.mkdir(workspace,{recursive:true});
    const dataDir=await safe(await fs.realpath(bridgeData)),workspaceDir=await safe(await fs.realpath(workspace));
    // Reuse PC Bridge's durable receipt chain in a separate, never-connected profile.
    this.bridge=await new BridgeCore({dataDir,workspaceDir}).init();
    await this.bridge.setAccessMode('read_only');
    return this;
  }
  save(){return atomicJson(this.registryFile,this.registry);}
  release(digest){check(/^[a-f0-9]{64}$/.test(digest),'Invalid release identity.');return safe(path.join(this.profile,'releases'),digest);}
  async record(type,details){await this.bridge.serial(()=>this.bridge.receipt('ditto_'+type,details));}
  async list(){return Object.entries(this.registry.apps).map(([id,x])=>({id,...x,running:this.running.get(id)?.status||'stopped',url:this.running.get(id)?.url||null,pid:this.running.get(id)?.child?.pid||null}));}
  async install(filename,trust){return this.serial(async()=>{
    const b=await loadBundle(filename);check(trust===b.sha256,'Explicit owner trust of this exact package digest is required.','OWNER_TRUST_REQUIRED');
    const old=this.registry.apps[b.manifest.id];check(!this.running.has(b.manifest.id),'Stop the app before installing/updating.');
    if(old?.active===b.sha256 && old.installed)return old;
    if(old && old.active!==b.sha256)check(old.version!==b.manifest.version,'A changed release needs a different version.');
    await unpack(b,path.join(this.profile,'releases'));
    const entry={...b.manifest,active:b.sha256,previous:old?.active && old.active!==b.sha256 ? [old.active,...(old.previous||[])].slice(0,20) : old?.previous||[],installed:true,trustedAt:new Date().toISOString()};
    this.registry.apps[b.manifest.id]=entry;await this.save();await this.record('installed',{id:b.manifest.id,version:b.manifest.version,digest:b.sha256,permissions:b.manifest.permissions});return entry;
  });}
  async rollback(id){return this.serial(async()=>{
    const old=this.registry.apps[id];check(old?.installed && old.previous?.length,'No previous installed release.');check(!this.running.has(id),'Stop the app before rollback.');
    const digest=old.previous[0],b=await verifyRelease(await this.release(digest));
    check(b.manifest.id===id,'Rollback identity mismatch.');
    this.registry.apps[id]={...b.manifest,active:digest,previous:[old.active,...old.previous.slice(1)],installed:true,trustedAt:old.trustedAt};
    await this.save();await this.record('rollback',{id,digest});return this.registry.apps[id];
  });}
  async remove(id){return this.serial(async()=>{
    check(this.registry.apps[id]?.installed,'App is not installed.');await this.stopNow(id);
    this.registry.apps[id].installed=false;await this.save();await this.record('removed',{id,dataPreserved:true});return {id,removed:true,dataPreserved:true};
  });}
  async dependencies(m){
    const result={node:{ok:Number(process.versions.node.split('.')[0])>=22,version:process.version}};
    for(const dep of m.dependencies.filter(x=>x!=='node')){
      try{const r=await exec(dep,['-version'],{windowsHide:true,shell:false,timeout:5000,maxBuffer:65536});result[dep]={ok:true,version:r.stdout.split(/\r?\n/)[0]};}
      catch{result[dep]={ok:false,message:dep+' is required on PATH; nothing was downloaded or installed.'};}
    }return result;
  }
  async start(id){return this.serial(async()=>{
    check(!this.closing,'Host is closing.');
    if(this.running.has(id))return this.publicRun(id);
    const m=this.registry.apps[id];check(m?.installed,'App is not installed.');manifest(m);
    const release=await this.release(m.active),b=await verifyRelease(release);check(b.manifest.id===id,'Release identity mismatch.');
    const deps=await this.dependencies(m);check(Object.values(deps).every(v=>v.ok),'Missing dependency: '+Object.entries(deps).filter(([,v])=>!v.ok).map(([k])=>k).join(', '),'DEPENDENCY_MISSING');
    const dataRoot=await safe(this.profile,'workspaces/'+id);await fs.mkdir(dataRoot,{recursive:true});
    const instanceId=randomUUID();
    const child=fork(path.join(here,'child.mjs'),[release,dataRoot,instanceId],{cwd:release,silent:true,windowsHide:true,execArgv:[],env:{...process.env,IM_DITTO_HOSTED:'1'}});
    const r={child,instanceId,status:'starting',url:null,output:''};this.running.set(id,r);
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{r.output=(r.output+chunk.toString()).slice(-32768);});
    child.once('exit',()=>{if(this.running.get(id)===r)this.running.delete(id);});
    try{
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('App startup timed out.')),20000);
        const finish=(error)=>{clearTimeout(timer);error?reject(error):resolve();};
        child.once('error',finish);child.once('exit',code=>{if(r.status==='starting')finish(Error('App exited during startup: '+code+' '+r.output));});
        child.on('message',message=>{if(message.type==='error')finish(Error(message.error));if(message.type==='ready'){r.url=message.url;r.status='running';finish();}});
      });
      const url=new URL(r.url);check(url.protocol==='http:' && url.hostname==='127.0.0.1','Invalid app URL.');
      const health=await (await fetch(r.url+'/api/health',{signal:AbortSignal.timeout(5000)})).json();
      check(health.ok && health.instanceId===instanceId && health.pid===child.pid,'App health identity mismatch.');
      await this.record('started',{id,pid:child.pid,instanceId,digest:m.active});return this.publicRun(id);
    }catch(e){await this.stopNow(id);throw e;}
  });}
  publicRun(id){const r=this.running.get(id);return r?{id,status:r.status,url:r.url,pid:r.child.pid,instanceId:r.instanceId}:{id,status:'stopped'};}
  async stopNow(id){
    for(const call of this.calls)if(call.id===id)call.controller.abort();
    const r=this.running.get(id);if(!r)return {id,status:'stopped'};
    if(r.child.connected)r.child.send({type:'stop'});
    const exited=()=>r.child.exitCode!==null||r.child.signalCode!==null;
    await new Promise(resolve=>{if(exited())return resolve();const timer=setTimeout(resolve,8000);r.child.once('exit',()=>{clearTimeout(timer);resolve();});});
    if(!exited()){
      if(process.platform==='win32')await exec(path.join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/PID',String(r.child.pid),'/T','/F'],{windowsHide:true,shell:false,timeout:5000}).catch(()=>{});
      else r.child.kill('SIGKILL');
      if(!exited())await new Promise(resolve=>{const timer=setTimeout(resolve,2000);r.child.once('exit',()=>{clearTimeout(timer);resolve();});});
    }
    check(exited(),'App did not stop; refusing removal/update.','STOP_FAILED');
    this.running.delete(id);await this.record('stopped',{id,instanceId:r.instanceId});return {id,status:'stopped'};
  }
  stop(id){return this.serial(()=>this.stopNow(id));}
  async instructions(id){const m=this.registry.apps[id];check(m?.installed,'App is not installed.');const release=await this.release(m.active);await verifyRelease(release);return fs.readFile(await safe(release,m.instructions),'utf8');}
  async call(id,args){
    check(!this.closing,'Host is closing.');
    check(Array.isArray(args) && args.length<=80 && args.every(x=>typeof x==='string' && x.length<8192 && !x.includes('\0')),'Invalid command arguments.');
    check(!args.includes('--url') && !args.some(x=>x.startsWith('--url=')),'The host supplies the app URL.');
    const m=this.registry.apps[id],r=this.running.get(id);check(m?.installed && r?.status==='running','Open this I’m from the local dashboard first.','APP_STOPPED');
    const release=await this.release(m.active);await verifyRelease(release);
    const pending={id,controller:new AbortController()};this.calls.add(pending);
    try{const output=await exec(process.execPath,[await safe(release,m.cli),'--url',r.url,...args],{cwd:release,windowsHide:true,shell:false,timeout:120000,maxBuffer:1024*1024,signal:pending.controller.signal,env:{...process.env,IM_DITTO_DATA_ROOT:path.join(this.profile,'workspaces',id)}});await this.record('command',{id,argCount:args.length,ok:true});return {ok:true,stdout:output.stdout,stderr:output.stderr};}
    catch(e){await this.record('command',{id,argCount:args.length,ok:false});return {ok:false,stdout:e.stdout||'',stderr:e.stderr||e.message};}
    finally{this.calls.delete(pending);}
  }
  async close(){this.closing=true;for(const id of [...this.running.keys()])await this.stop(id);await this.bridge.pause({shutdown:true});}
}
