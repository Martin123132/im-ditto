import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Manager} from './manager.mjs';
import {Setup} from './setup.mjs';
import {Creator} from './creator.mjs';
import {BridgeStatus} from './bridge-status.mjs';
import {safe,check,loadBundle} from './package.mjs';
import {atomicJson} from '../src/core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const eq=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function startHost({profile,port=8790,catalogue=path.resolve(here,'../im-catalogue'),clockDiscoveryFile}={}){
  profile=path.resolve(profile);await fs.mkdir(await safe(profile),{recursive:true});
  const lock=await safe(profile,'host.lock');
  try{const old=JSON.parse(await fs.readFile(lock,'utf8'));let alive=true;try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}check(!alive,'This profile is already owned by a process.');await fs.unlink(lock);}catch(e){if(e.code!=='ENOENT')throw e;}
  const instanceId=randomUUID(),ownerToken=randomBytes(32).toString('hex'),toolToken=randomBytes(32).toString('hex');
  await fs.writeFile(lock,JSON.stringify({pid:process.pid,instanceId}),{flag:'wx'});
  let manager,server,closing=false;
  try{
    manager=await new Manager(profile).init();
    const library=[];
    try{for(const name of (await fs.readdir(catalogue)).filter(x=>x.endsWith('.impack.json')).sort()){
      const filename=await safe(catalogue,name),b=await loadBundle(filename);library.push({filename,sha256:b.sha256,...b.manifest});
    }}catch(e){if(e.code!=='ENOENT')throw e;}
    const setup=await new Setup({profile,instanceId,manager,library,root:path.resolve(here,'..')}).init();
    const creator=await new Creator({profile,manager,root:path.resolve(here,'..')}).init();
    const clockStatus=new BridgeStatus({discoveryFile:clockDiscoveryFile});
    const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    async function body(req){let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;check(bytes<=1024*1024,'Request too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
    server=http.createServer(async(req,res)=>{
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      try{
        const origin='http://127.0.0.1:'+server.address().port;
        check(req.headers.host===new URL(origin).host,'Foreign Host rejected.');
        check(!req.headers.origin||req.headers.origin===origin,'Foreign Origin rejected.');
        check(req.headers['sec-fetch-site']!=='cross-site'||(req.method==='GET'&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document'),'Cross-site request rejected.');
        const route=new URL(req.url,origin).pathname;
        if(req.method==='GET'&&route==='/api/health')return send(res,200,{ok:true,app:'im-ditto',instanceId,pid:process.pid,version:'0.1.0-preview.8'});
        if(req.method==='GET'&&route==='/api/session')return send(res,200,{ownerToken,warning:'Trusted native packages run as your Windows user. This preview is not an OS sandbox.'});
        const owner=eq(req.headers['x-ditto-owner'],ownerToken),tool=eq(req.headers['x-ditto-tool'],toolToken);
        if(route.startsWith('/api/') && route!=='/api/health')check(owner||tool,'A local session is required.','AUTH_REQUIRED');
        if(route==='/api/bridge/clocks'){
          check(owner,'Reply-clock display belongs to the local owner.','OWNER_REQUIRED');
          if(req.method!=='GET')return send(res,405,{error:'Reply clocks are read-only in Ditto.'});
          return send(res,200,await clockStatus.read());
        }
        if(req.method==='GET'&&route==='/api/state')return send(res,200,{apps:await manager.list(),catalogue:library.map(({filename,...m})=>m),profile,instanceId,transport:'Existing PC Bridge connection; separate from this host',permissionsEnforcement:'trusted-native-not-os-sandbox'});
        if(route==='/api/creator'||route.startsWith('/api/creator/')){
          check(owner,'Creating and reviewing I’ms belongs to the local owner.','OWNER_REQUIRED');
          if(req.method==='GET'&&route==='/api/creator')return send(res,200,{drafts:await creator.list()});
          if(req.method==='POST'&&route==='/api/creator')return send(res,201,await creator.create(await body(req)));
          const action=/^\/api\/creator\/([a-f0-9]{32})\/(review|install)$/.exec(route);
          if(req.method==='POST'&&action){const b=await body(req);return send(res,200,action[2]==='review'?await creator.review(action[1]):await creator.install(action[1],b));}
          return send(res,404,{error:'Unknown creator action.'});
        }
        if(route==='/api/setup/verify'&&req.method==='POST'){
          check(tool,'Connection verification must arrive through the local tool interface.','OWNER_REQUIRED');
          return send(res,200,await setup.verify((await body(req)).code));
        }
        if(route.startsWith('/api/setup')){
          check(owner,'Setup choices belong to the local owner.','OWNER_REQUIRED');
          if(req.method==='GET'&&route==='/api/setup')return send(res,200,await setup.view());
          if(req.method==='POST'){
            const b=await body(req),action=route.slice('/api/setup/'.length);
            if(action==='select')return send(res,200,await setup.select(b));
            if(action==='check')return send(res,200,await setup.check());
            if(action==='prompt')return send(res,200,await setup.makePrompt());
            if(action==='finish')return send(res,200,await setup.finish());
            if(action==='reopen')return send(res,200,await setup.reopen());
          }
          return send(res,404,{error:'Unknown setup action.'});
        }
        let match=/^\/api\/apps\/([a-z][a-z0-9-]{2,49})\/instructions$/.exec(route);
        if(req.method==='GET'&&match)return send(res,200,{instructions:await manager.instructions(match[1])});
        match=/^\/api\/apps\/([a-z][a-z0-9-]{2,49})\/(start|stop|rollback|remove|call|doctor)$/.exec(route);
        if(req.method==='POST'&&match){
          const [_,id,action]=match,b=await body(req);
          // AI clients can operate an already-open app, but cannot install/start/administer it.
          check(owner||action==='call'||action==='doctor','App lifecycle requires the local owner.','OWNER_REQUIRED');
          if(action==='call')return send(res,200,await manager.call(id,b.args));
          if(action==='doctor'){const m=manager.registry.apps[id];check(m?.installed,'Not installed.');return send(res,200,await manager.dependencies(m));}
          return send(res,200,await manager[action](id));
        }
        if(req.method==='POST'&&route==='/api/install'){
          check(owner,'Installation requires the local owner.','OWNER_REQUIRED');const b=await body(req);
          const item=library.find(x=>x.sha256===b.sha256);check(item,'Only packages in this local catalogue can be installed from the dashboard.');
          return send(res,200,await manager.install(item.filename,b.trust));
        }
        if(req.method==='POST'&&route==='/api/stop'){
          check(owner,'Stopping the host requires the local owner.');send(res,202,{stopping:true});setImmediate(()=>void close());return;
        }
        const pages={'/':'index.html','/app.js':'app.js','/recipes.mjs':'recipes.mjs','/reply-clocks.mjs':'reply-clocks.mjs','/style.css':'style.css'};
        if(req.method==='GET'&&pages[route]){const file=path.join(here,'ui',pages[route]);res.writeHead(200,{'Content-Type':/\.m?js$/.test(route)?'text/javascript':route.endsWith('.css')?'text/css':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(await fs.readFile(file));return;}
        send(res,404,{error:'Not found.'});
      }catch(e){if(!res.headersSent)send(res,e.code==='AUTH_REQUIRED'||e.code==='OWNER_REQUIRED'?403:400,{error:e.message,code:e.code||'REQUEST_FAILED'});else res.destroy();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    const url='http://127.0.0.1:'+server.address().port;
    await atomicJson(path.join(profile,'connection.json'),{app:'im-ditto',pid:process.pid,instanceId,url,toolToken,profile});
    await fs.chmod(path.join(profile,'connection.json'),0o600);
    async function close(){
      if(closing)return;closing=true;await manager.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
      const found=JSON.parse(await fs.readFile(lock,'utf8'));if(found.instanceId===instanceId)await fs.unlink(lock);
    }
    return {url,instanceId,ownerToken,toolToken,manager,close,server};
  }catch(e){await manager?.close().catch(()=>{});server?.close();await fs.unlink(lock).catch(()=>{});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=(key,def)=>{const i=args.indexOf(key);return i<0?def:args[i+1];};
  const host=await startHost({profile:get('--profile',path.resolve(here,'../local-profile')),port:Number(get('--port','8790'))});
  console.log(JSON.stringify({ok:true,url:host.url,instanceId:host.instanceId}));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void host.close());
}
