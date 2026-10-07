'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {Studio}=require('./store');
const {Renderer}=require('./render');
const C=require('./common');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.bmp':'image/bmp',
  '.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4','.ogg':'audio/ogg','.flac':'audio/flac','.aac':'audio/aac','.mp4':'video/mp4'};
function send(res,status,value) {
  if(res.headersSent || res.destroyed) return;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
function readBody(req,limit) {
  return new Promise((resolve,reject)=>{
    let length=0,finished=false;const chunks=[];
    req.on('data',chunk=>{
      if(finished) return;
      length+=chunk.length;
      if(length>limit) {finished=true;chunks.length=0;reject(new C.StudioError('Request exceeds its size limit.',413,'TOO_LARGE'));return;}
      chunks.push(chunk);
    });
    req.on('end',()=>{if(!finished){finished=true;resolve(Buffer.concat(chunks));}});
    req.on('error',e=>{if(!finished){finished=true;reject(e);}});
    req.on('aborted',()=>{if(!finished){finished=true;reject(new C.StudioError('Upload was interrupted.',400,'UPLOAD_ABORTED'));}});
  });
}
async function json(req) {
  const buffer=await readBody(req,1024*1024);
  try {
    const body=JSON.parse(buffer.toString('utf8')||'{}');
    C.check(body && typeof body==='object' && !Array.isArray(body),'JSON body must be an object.');
    return body;
  } catch(e) {if(e instanceof C.StudioError) throw e;throw new C.StudioError('Request body is not valid JSON.');}
}
function serveFile(req,res,file,downloadName) {
  const stat=fs.statSync(file);C.check(stat.isFile(),'This resource is not a file.',404,'NOT_FOUND');
  const headers={'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream',
    'Accept-Ranges':'bytes','Cache-Control':'no-cache','Content-Length':stat.size};
  if(downloadName) headers['Content-Disposition']='inline; filename="'+downloadName+'"';
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match || (!match[1] && !match[2])) {res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;}
    if(!match[1]) {const suffix=Number(match[2]);start=Math.max(0,stat.size-suffix);}
    else {start=Number(match[1]);if(match[2]) end=Number(match[2]);}
    if(start>end||start<0||start>=stat.size||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)) {
      res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;
    }
    end=Math.min(end,stat.size-1);status=206;
    headers['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;headers['Content-Length']=end-start+1;
  }
  res.writeHead(status,headers);
  if(req.method==='HEAD') {res.end();return;}
  const stream=fs.createReadStream(file,{start,end});
  stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
function openExplorer(args) {
  C.check(process.platform==='win32','Open in Explorer is available on Windows. Use the video link on this platform.',501,'WINDOWS_ONLY');
  return new Promise((resolve,reject)=>{
    const child=spawn('explorer.exe',args,{shell:false,windowsHide:false,stdio:'ignore'});
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve();});
  });
}
function acquireLock(studio) {
  const relative='data/server.lock',file=C.ownedPath(studio.root,relative);
  if(fs.existsSync(file)) {
    let old;
    try {old=JSON.parse(fs.readFileSync(file,'utf8'));}
    catch(e) {throw new C.StudioError('The server lock cannot be read; inspect data/server.lock before restarting.',409,'LOCK_INVALID');}
    let alive=false;
    if(Number.isInteger(old.pid)&&old.pid>0) {try{process.kill(old.pid,0);alive=true;}catch(e){if(e.code!=='ESRCH')alive=true;}}
    if(alive) {
      const error=new C.StudioError('A studio process already owns this storage folder.',409,'ALREADY_RUNNING');
      error.existing=old;throw error;
    }
    fs.unlinkSync(file);
  }
  const lock={pid:process.pid,id:crypto.randomUUID(),createdAt:C.now(),url:null,root:studio.root};
  const fd=fs.openSync(file,'wx');fs.writeFileSync(fd,JSON.stringify(lock,null,2));fs.closeSync(fd);
  return {
    update(url,instanceId){lock.url=url;lock.instanceId=instanceId;C.writeJSON(studio.root,relative,lock);},
    release(){
      if(fs.existsSync(file)) {
        try {if(JSON.parse(fs.readFileSync(file,'utf8')).id===lock.id) fs.unlinkSync(file);}
        catch(e) {}
      }
    }
  };
}
async function startServer({root=C.APP_ROOT,port=8787,quiet=false,open=false,instanceId=process.env.DITTO_INSTANCE_ID||crypto.randomUUID()}={}) {
  C.id(instanceId);
  C.check(Number.isInteger(port)&&port>=0&&port<=65535,'Port must be an integer between 0 and 65535.');
  const studio=new Studio(root),lock=acquireLock(studio);
  let server,renderer,closing=false;
  try {
    const runtime=await C.versions();
    renderer=new Renderer(studio);
    const token=crypto.randomBytes(32).toString('hex');
    const startedAt=C.now();
    let actualPort=port;
    server=http.createServer(async(req,res)=>{
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('X-Frame-Options','DENY');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      try {
        const hosts=['127.0.0.1:'+actualPort,'localhost:'+actualPort];
        C.check(hosts.includes(req.headers.host),'Only the local studio host is accepted.',403,'HOST_REJECTED');
        const origin=req.headers.origin;
        const documentNavigation=req.method==='GET' && req.headers['sec-fetch-mode']==='navigate' && req.headers['sec-fetch-dest']==='document';
        C.check(!origin || hosts.map(h=>'http://'+h).includes(origin),'This request came from another site.',403,'ORIGIN_REJECTED');
        C.check(req.headers['sec-fetch-site']!=='cross-site' || documentNavigation,'Cross-site requests are not accepted.',403,'ORIGIN_REJECTED');
        const raw=(req.url||'/').split('?')[0];
        C.check(!/%(?:2f|5c|00)/i.test(raw),'Encoded path separators are not accepted.');
        let decoded;
        try {decoded=decodeURIComponent(raw);}catch(e){throw new C.StudioError('Malformed URL encoding.');}
        C.check(!decoded.includes('\\') && !decoded.split('/').includes('..') && !decoded.includes('\0'),'Invalid resource path.');
        const url=new URL(req.url,'http://127.0.0.1:'+actualPort),pathname=url.pathname;
        if(!['GET','HEAD'].includes(req.method)) C.check(req.headers['x-studio-token']===token,'A current local studio token is required.',403,'TOKEN_REQUIRED');
        if(req.method==='GET' && pathname==='/api/health') {
          send(res,200,{ok:true,app:'im-ditto-studio',version:'1.0.0',root:studio.root,pid:process.pid,instanceId,startedAt,token,versions:runtime,activeProjectId:studio.session().activeProjectId});return;
        }
        if(req.method==='POST' && pathname==='/api/app/stop') {
          const body=await json(req);
          C.check(body.instanceId===instanceId,'The running app instance does not match the stop request.',409,'INSTANCE_MISMATCH');
          send(res,202,{ok:true,stopping:true,instanceId,pid:process.pid});
          setImmediate(()=>close().catch(e=>{console.error(JSON.stringify({error:e.message,code:'SHUTDOWN_FAILED'}));process.exitCode=1;}));
          return;
        }
        if(req.method==='GET' && pathname==='/api/projects') {send(res,200,studio.list());return;}
        if(req.method==='POST' && pathname==='/api/projects') {const b=await json(req);send(res,201,studio.create(b.name));return;}
        if(req.method==='POST' && pathname==='/api/session') {const b=await json(req);send(res,200,studio.select(b.projectId));return;}
        let match=/^\/api\/projects\/([^/]+)$/.exec(pathname);
        if(match && req.method==='GET') {send(res,200,studio.get(match[1]));return;}
        match=/^\/api\/projects\/([^/]+)\/edit$/.exec(pathname);
        if(match && req.method==='POST') {send(res,200,studio.edit(match[1],await json(req)));return;}
        match=/^\/api\/projects\/([^/]+)\/media$/.exec(pathname);
        if(match && req.method==='POST') {
          const kind=url.searchParams.get('kind'),name=url.searchParams.get('name');
          C.check(kind==='image'||kind==='audio','Media kind must be image or audio.');
          const revisionHeader=req.headers['x-project-revision'];
          const revision=revisionHeader===undefined?undefined:Number(revisionHeader);
          const bytes=await readBody(req,(kind==='image'?40:100)*1024*1024);
          send(res,201,await studio.import(match[1],name,kind,bytes,revision));return;
        }
        match=/^\/api\/projects\/([^/]+)\/media\/([^/]+)$/.exec(pathname);
        if(match && ['GET','HEAD'].includes(req.method)) {serveFile(req,res,studio.mediaPath(match[1],match[2]).file);return;}
        match=/^\/api\/projects\/([^/]+)\/render$/.exec(pathname);
        if(match && req.method==='POST') {const b=await json(req);send(res,202,renderer.start(match[1],b.revision));return;}
        if(pathname==='/api/renders' && req.method==='GET') {send(res,200,renderer.list(url.searchParams.get('projectId')||undefined));return;}
        match=/^\/api\/renders\/([^/]+)$/.exec(pathname);
        if(match && req.method==='GET') {send(res,200,renderer.get(match[1]));return;}
        match=/^\/api\/renders\/([^/]+)\/cancel$/.exec(pathname);
        if(match && req.method==='POST') {await json(req);send(res,200,renderer.cancel(match[1]));return;}
        match=/^\/api\/renders\/([^/]+)\/video$/.exec(pathname);
        if(match && ['GET','HEAD'].includes(req.method)) {serveFile(req,res,renderer.outputPath(match[1]),'im-ditto-'+match[1]+'.mp4');return;}
        match=/^\/api\/renders\/([^/]+)\/open$/.exec(pathname);
        if(match && req.method==='POST') {
          await json(req);const file=renderer.outputPath(match[1]);await openExplorer(['/select,',file]);send(res,200,{ok:true,outputFile:file});return;
        }
        const staticFiles={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js'};
        if(['GET','HEAD'].includes(req.method) && Object.hasOwn(staticFiles,pathname)) {
          const file=C.ownedPath(C.APP_ROOT,'public/'+staticFiles[pathname]);
          C.check(fs.existsSync(file),'The studio interface file is missing.',503,'UI_MISSING');
          serveFile(req,res,file);return;
        }
        if(pathname==='/favicon.ico') {res.writeHead(204);res.end();return;}
        throw new C.StudioError('Route not found.',404,'NOT_FOUND');
      } catch(e) {
        if(e.code==='ENOENT') send(res,404,{error:'Requested file does not exist.',code:'NOT_FOUND'});
        else send(res,e.status||500,{error:e.message||'Unexpected studio error.',code:e.code||'INTERNAL_ERROR'});
      }
    });
    server.requestTimeout=120000;server.headersTimeout=15000;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    actualPort=server.address().port;
    const url='http://127.0.0.1:'+actualPort;lock.update(url,instanceId);
    async function close() {
      if(closing) return;closing=true;
      const stopped=new Promise(resolve=>server.close(resolve));
      server.closeIdleConnections();
      await renderer.shutdown();
      server.closeAllConnections();
      await stopped;lock.release();
    }
    if(!quiet) console.log(JSON.stringify({event:'listening',app:'im-ditto-studio',url,root:studio.root,pid:process.pid,instanceId,versions:runtime}));
    if(open) await openExplorer([url]);
    return {server,studio,renderer,url,close};
  } catch(e) {
    if(renderer) await renderer.shutdown();
    if(server && server.listening) server.close();
    lock.release();throw e;
  }
}
async function main() {
  const args=process.argv.slice(2);
  C.check(args.every((a,i)=>a==='--open'||a==='--port'||(i>0&&args[i-1]==='--port')),'Usage: node src/server.js [--open] [--port 8787]');
  const index=args.indexOf('--port');
  const port=Number(index>=0?args[index+1]:(process.env.DITTO_PORT||8787));
  try {
    const app=await startServer({port,open:args.includes('--open')});
    const shutdown=()=>{app.close().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});};
    process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  } catch(e) {
    if(e.code==='ALREADY_RUNNING' && args.includes('--open') && e.existing && /^http:\/\/127\.0\.0\.1:\d+$/.test(e.existing.url||'')) {
      const r=await fetch(e.existing.url+'/api/health',{signal:AbortSignal.timeout(3000)});
      const health=await r.json();
      C.check(health.app==='im-ditto-studio' && health.root===C.APP_ROOT,'The occupied port is not this studio.');
      await openExplorer([e.existing.url]);console.log('Studio already running at '+e.existing.url);return;
    }
    throw e;
  }
}
if(require.main===module) main().catch(e=>{console.error(JSON.stringify({error:e.message,code:e.code||'STARTUP_FAILED'}));process.exitCode=1;});
module.exports={startServer};
