import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {safe} from './package.mjs';

export const defaultClockDiscovery=()=>path.join(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'),'PC Bridge','ditto-clock-display.json');
const hex=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9-]{36}$/;
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const phases=new Set(['working','wrap_up','checkpoint_due','report_due','yielded','awaiting_message','disabled']);
const requireValue=(ok)=>{if(!ok)throw Error('Invalid display feed');};
export function sanitizeClockFeed(data,discovery,now=Date.now()) {
  requireValue(data?.protocol==='ditto-reply-clocks-v1'&&data.instance===discovery.instance&&data.pid===discovery.pid);
  requireValue(date(data.server_time)&&Math.abs(now-Date.parse(data.server_time))<15000);
  requireValue(typeof data.enabled==='boolean'&&typeof data.protected==='boolean'&&Array.isArray(data.sessions)&&data.sessions.length<=64);
  requireValue(Array.isArray(data.timing_minutes)&&data.timing_minutes.length===3&&data.timing_minutes.every((n,i,a)=>Number.isFinite(n)&&n>0&&n<=1440&&(!i||n>a[i-1])));
  const seen=new Set();
  const sessions=data.sessions.map(row=>{
    requireValue(hex.test(row.display_id)&&!seen.has(row.display_id));seen.add(row.display_id);
    requireValue(Number.isSafeInteger(row.period)&&row.period>0&&phases.has(row.phase)&&date(row.last_seen_at));
    const marked=row.reply_id!==null;
    requireValue(marked?(hex.test(row.reply_id)&&date(row.started_at)&&date(row.deadline_at)&&Date.parse(row.deadline_at)>Date.parse(row.started_at)&&Number.isSafeInteger(row.remaining_seconds)&&row.remaining_seconds>=0&&row.remaining_seconds<=86400):row.started_at===null&&row.deadline_at===null&&row.remaining_seconds===null);
    requireValue(marked?row.turn_identity_source==='agent_or_owner_declared':row.turn_identity_source==='not_received');
    requireValue(!row.checkpoint||(date(row.checkpoint.at)&&Number.isSafeInteger(row.checkpoint.period)&&row.checkpoint.period>0&&row.checkpoint.period<=row.period));
    return {display_id:row.display_id,reply_id:row.reply_id,period:row.period,phase:row.phase,
      started_at:row.started_at,deadline_at:row.deadline_at,remaining_seconds:row.remaining_seconds,last_seen_at:row.last_seen_at,
      checkpoint:row.checkpoint?{at:row.checkpoint.at,period:row.checkpoint.period}:null,turn_identity_source:row.turn_identity_source};
  });
  requireValue(!data.protected||sessions.length===0);
  return {status:data.protected?'protected':!data.enabled?'disabled':sessions.length?'connected':'waiting',
    instance:data.instance,server_time:data.server_time,timing_minutes:data.timing_minutes,sessions};
}

export class BridgeStatus {
  constructor({discoveryFile=defaultClockDiscovery(),now=Date.now}={}){this.discoveryFile=discoveryFile;this.now=now;}
  async read(){
    try {
      const filename=await safe(path.dirname(this.discoveryFile),path.basename(this.discoveryFile));
      const stat=await fs.stat(filename);requireValue(stat.isFile()&&stat.size<=4096);
      const d=JSON.parse(await fs.readFile(filename,'utf8'));
      requireValue(d.protocol==='ditto-reply-clocks-v1'&&uuid.test(d.instance)&&Number.isSafeInteger(d.pid)&&d.pid>0&&Number.isSafeInteger(d.port)&&d.port>0&&d.port<65536&&hex.test(d.token));
      const response=await fetch(`http://127.0.0.1:${d.port}/v1/reply-clocks`,{headers:{Authorization:'Bearer '+d.token},redirect:'error',signal:AbortSignal.timeout(1500)});
      requireValue(response.ok);let bytes=0;const chunks=[];
      for await(const chunk of response.body){bytes+=chunk.length;requireValue(bytes<=128*1024);chunks.push(chunk);}
      return sanitizeClockFeed(JSON.parse(Buffer.concat(chunks).toString('utf8')),d,this.now());
    }catch(error){
      // Never expose credentials, arbitrary responses, paths or old countdowns.
      return {status:error.code==='ENOENT'?'unavailable':'disconnected',sessions:[],message:error.code==='ENOENT'?
        'Reply clocks need a compatible running PC Bridge. You can still create and use your I’ms.':
        'Bridge clock status is unavailable. Your I’ms are still usable; no access or timer was changed.'};
    }
  }
}
