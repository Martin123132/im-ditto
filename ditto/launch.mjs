import fs from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {openDashboard} from './browser.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const args=process.argv.slice(2);const opt=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const profile=path.resolve(opt('--profile',path.join(root,'local-profile'))),show=!args.includes('--no-open');
async function find(){try{const c=JSON.parse(await fs.readFile(path.join(profile,'connection.json'),'utf8'));const u=new URL(c.url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1')throw Error('Invalid local connection.');const h=await (await fetch(u.origin+'/api/health',{signal:AbortSignal.timeout(1500)})).json();if(h.app==='im-ditto'&&h.instanceId===c.instanceId&&h.pid===c.pid)return {url:u.origin,instanceId:h.instanceId};return null;}catch{return null;}}
let current=await find();
if(!current){
  await fs.mkdir(profile,{recursive:true});const log=openSync(path.join(profile,'host.log'),'a');
  // Let Windows select a free loopback port. A second preview must never collide
  // with or replace an already-running host belonging to another profile.
  const child=spawn(process.execPath,[path.join(here,'server.mjs'),'--profile',profile,'--port',opt('--port','0')],{cwd:root,detached:true,windowsHide:true,shell:false,stdio:['ignore',log,log]});
  closeSync(log);child.unref();const until=Date.now()+20000;
  while(!current&&Date.now()<until){await new Promise(r=>setTimeout(r,200));current=await find();}
  if(!current)throw Error('I’m-Ditto could not start. See '+path.join(profile,'host.log')+'. No existing app was stopped.');
}
if(show)await openDashboard(current.url);
console.log(JSON.stringify({ok:true,...current,profile}));
