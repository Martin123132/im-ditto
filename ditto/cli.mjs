#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {check} from './package.mjs';
const args=process.argv.slice(2),index=args.indexOf('--profile');
let profile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../local-profile');
if(index>=0){profile=path.resolve(args[index+1]);args.splice(index,2);}
async function main(){
  if(!args.length||['help','--help','-h'].includes(args[0]))return {usage:['node ditto/cli.mjs list','node ditto/cli.mjs instructions APP_ID','node ditto/cli.mjs doctor APP_ID','node ditto/cli.mjs call APP_ID -- ...APP_ARGS','node ditto/cli.mjs verify CODE'],setup:'Launch I’m-Ditto locally once. Welcome gives you an exact connection-check prompt. No API key is used here.'};
  const info=JSON.parse(await fs.readFile(path.join(profile,'connection.json'),'utf8')),u=new URL(info.url);
  check(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&!u.username&&!u.password,'Invalid local host record.');
  const health=await (await fetch(u.origin+'/api/health',{signal:AbortSignal.timeout(3000)})).json();
  check(health.app==='im-ditto'&&health.pid===info.pid&&health.instanceId===info.instanceId,'Wrong or replaced host instance. Reopen the dashboard.');
  const [cmd,id]=args;let route,body;
  if(cmd==='list')route='/api/state';
  else if(cmd==='verify'){route='/api/setup/verify';body={code:id};}
  else {check(/^[a-z][a-z0-9-]{2,49}$/.test(id),'Invalid app id.');route='/api/apps/'+id+'/'+cmd;if(cmd==='call')body={args:args.slice(args[2]==='--'?3:2)};else if(cmd==='doctor')body={};else check(cmd==='instructions','Unsupported host command.');}
  const response=await fetch(u.origin+route,{method:body?'POST':'GET',headers:{'x-ditto-tool':info.toolToken,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(125000)});
  const result=await response.json();check(response.ok,result.error||'Host request failed.');if(result.ok===false)process.exitCode=1;
  return result;
}
main().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(JSON.stringify({ok:false,error:e.message,code:e.code||'COMMAND_FAILED'}));process.exitCode=1;});
