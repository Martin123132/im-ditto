import {pathToFileURL} from 'node:url';
import {verifyRelease,safe} from './package.mjs';
const [release,dataRoot,instanceId]=process.argv.slice(2);
process.env.IM_DITTO_DATA_ROOT=dataRoot;
let app,closing=false;
async function close(){if(closing)return;closing=true;try{await app?.close();}finally{process.disconnect?.();}}
process.on('message',m=>{if(m?.type==='stop')void close();});
process.on('disconnect',()=>void close());
process.on('SIGTERM',()=>void close());
try {
  const bundle=await verifyRelease(release);
  const module=await import(pathToFileURL(await safe(release,bundle.manifest.entry)).href);
  app=await (module.start||module.default?.start)({dataRoot,packageRoot:release,port:0,instanceId});
  const url=new URL(app.url);
  if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || url.pathname!=='/' || url.username || url.password || url.search || url.hash)throw Error('App must return an IPv4 loopback URL.');
  if(closing){await app.close();process.disconnect?.();}else process.send?.({type:'ready',url:url.origin,pid:process.pid,instanceId});
} catch(e){process.send?.({type:'error',error:e.message});process.exitCode=1;await close();}
