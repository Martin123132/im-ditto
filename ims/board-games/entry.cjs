'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Fault,fail,integer,text,SafeRoot} = require('./src/common.cjs');
const {Store} = require('./src/store.cjs');
const BODY_LIMIT = 512 * 1024;

function jsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) fail('CONTENT_TYPE','Use application/json for this operation.',415);
  const length=req.headers['content-length'];
  if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>BODY_LIMIT)){req.resume();fail('BODY_TOO_LARGE','JSON requests are limited to 512 KiB.',413);}
  return new Promise((resolve,reject)=>{
    let size=0,settled=false;const chunks=[];
    const rejectOnce=e=>{if(!settled){settled=true;reject(e);}};
    req.on('data',chunk=>{size+=chunk.length;if(size>BODY_LIMIT){rejectOnce(new Fault('BODY_TOO_LARGE','JSON requests are limited to 512 KiB.',413));return;}if(!settled)chunks.push(chunk);});
    req.on('error',rejectOnce);
    req.on('end',()=>{if(settled)return;settled=true;try{resolve(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));}catch{reject(new Fault('INVALID_JSON','Send one valid JSON object.'));}});
  });
}
function acquire(data,instanceId) {
  const filename='runtime-lock.json',nonce=crypto.randomUUID();
  if(data.exists(filename)){
    const previous=data.json(filename);
    if(!Number.isInteger(previous.pid)||typeof previous.nonce!=='string')fail('INVALID_LOCK','The app ownership record is invalid.',409);
    let alive=true;try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    if(alive)fail('DATA_IN_USE','This data directory already belongs to a running app instance.',409);
    data.unlink(filename);
  }
  const fd=fs.openSync(data.at(filename),'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,instanceId,nonce,startedAt:new Date().toISOString()}));}finally{fs.closeSync(fd);}
  return ()=>{if(data.exists(filename)){const record=data.json(filename);if(record.nonce===nonce&&record.pid===process.pid)data.unlink(filename);}};
}
async function start({dataRoot,packageRoot,port=0,instanceId}={}) {
  integer(port,0,65535,'Port');
  if(typeof dataRoot!=='string'||typeof packageRoot!=='string')fail('INVALID_ROOT','The host must provide dataRoot and packageRoot.');
  if(path.resolve(dataRoot)===path.resolve(packageRoot))fail('INVALID_ROOT','Data and package roots must be separate.');
  const data=new SafeRoot(dataRoot,{create:true}),pkg=new SafeRoot(packageRoot);
  const identity=instanceId===undefined?crypto.randomUUID():text(instanceId,128,'Instance ID',{empty:false});
  const release=acquire(data,identity);
  let server,store,url,closing=false,closePromise;
  const token=crypto.randomBytes(32).toString('base64url');
  const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8']};
  try{
    store=new Store(dataRoot);
    server=http.createServer(async(req,res)=>{
      try {
        res.setHeader('X-Content-Type-Options','nosniff');
        res.setHeader('Referrer-Policy','no-referrer');
        res.setHeader('Cache-Control','no-store');
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' http://127.0.0.1:* http://localhost:*");
        if(closing)fail('APP_CLOSING','The host is closing this application.',503);
        if(req.headers.host!==new URL(url).host)fail('HOST_REJECTED','Use the local URL returned by the host.',403);
        if(req.headers.origin&&req.headers.origin!==url)fail('ORIGIN_REJECTED','This request came from a different origin.',403);
        const navigation=req.method==='GET'&&req.headers['sec-fetch-mode']==='navigate'&&['document','iframe'].includes(req.headers['sec-fetch-dest']);
        if(req.headers['sec-fetch-site']==='cross-site'&&!navigation)fail('ORIGIN_REJECTED','Cross-site requests are not allowed.',403);
        if(!req.url.startsWith('/')||req.url.startsWith('//')||/%(?:2f|5c|00|2e)/i.test(req.url)||req.url.includes('\\'))fail('INVALID_PATH','Invalid request path.');
        if(req.url.split('?')[0].split('/').some(x=>x==='.'||x==='..'))fail('INVALID_PATH','Invalid request path.');
        const parsed=new URL(req.url,url);
        if(parsed.search)fail('INVALID_PATH','This route does not accept a query string.');
        const route=parsed.pathname;
        if(req.method==='GET'&&route==='/favicon.ico'){res.writeHead(204);return res.end();}
        if(route.split('/').includes('..')||route.split('/').includes('.'))fail('INVALID_PATH','Invalid request path.');
        if(!['GET','POST'].includes(req.method))fail('METHOD_NOT_ALLOWED','Use a documented GET or POST operation.',405);
        if(req.method==='POST'){
          const supplied=req.headers['x-studio-token'];
          if(typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(token)||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))fail('TOKEN_REQUIRED','A valid local mutation token is required.',403);
        }
        const send=(value,status=200)=>{const body=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});res.end(body);};
        const info=x=>({...x,url:url+x.url,downloadUrl:url+x.downloadUrl});
        if(req.method==='GET'&&route==='/api/health')return send({ok:true,app:'im-board-games',pid:process.pid,instanceId:identity,token});
        if(req.method==='GET'&&route==='/api/workspace')return send(store.workspace());
        if(route==='/api/projects'){
          if(req.method==='GET'){const s=store.session();return send({projects:store.list(),activeProjectId:s.activeProjectId,sessionRevision:s.revision});}
          return send(store.create(await jsonBody(req)),201);
        }
        if(route==='/api/session'&&req.method==='POST'){
          const b=await jsonBody(req);require('./src/common.cjs').keys(b,['projectId','revision']);return send(store.select(b.projectId,b.revision));
        }
        let m=route.match(/^\/api\/projects\/([^/]+)$/);
        if(m&&req.method==='GET')return send(store.get(m[1]));
        m=route.match(/^\/api\/projects\/([^/]+)\/update$/);
        if(m&&req.method==='POST')return send(store.update(m[1],await jsonBody(req)));
        m=route.match(/^\/api\/projects\/([^/]+)\/exports$/);
        if(m){if(req.method==='GET')return send({exports:store.exports(m[1]).map(info)});return send(info(store.makeExport(m[1],await jsonBody(req))),201);}
        m=route.match(/^\/api\/exports\/([^/]+)(\/download)?$/);
        if(m&&req.method==='GET'){
          const {info:meta,data:bytes}=store.readExport(m[1]);
          const name=String(meta.projectName).replace(/[^a-zA-Z0-9-]+/g,'-').slice(0,50)||'game';
          res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
          res.writeHead(200,{'Content-Type':meta.format==='html'?'text/html; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':(m[2]?'attachment':'inline')+'; filename="'+name+'-v'+meta.revision+'.'+meta.format+'"','Content-Length':bytes.length});return res.end(bytes);
        }
        if(req.method==='GET'&&Object.hasOwn(staticFiles,route)){
          const [file,type]=staticFiles[route];const bytes=pkg.read('public',file);
          res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length});return res.end(bytes);
        }
        fail('NOT_FOUND','That route was not found.',404);
      } catch(error) {
        if(res.headersSent){res.end();return;}
        const status=error instanceof Fault?error.status:500;
        const body=JSON.stringify({error:{code:error instanceof Fault?error.code:'INTERNAL_ERROR',message:error instanceof Fault?error.message:'The app could not complete this operation.',...(error instanceof Fault&&error.details?{details:error.details}:{})}});
        res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});res.end(body);
      }
    });
    server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=1000;server.maxHeadersCount=40;
    server.on('clientError',(_e,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
    url='http://127.0.0.1:'+server.address().port;
    const close=()=>{
      if(closePromise)return closePromise;closing=true;
      closePromise=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>server.closeAllConnections(),2000);timer.unref();
        server.close(error=>{clearTimeout(timer);try{release();}catch(e){reject(e);return;}if(error)reject(error);else resolve();});
        server.closeIdleConnections();
      });return closePromise;
    };
    return {url,close};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));release();throw error;}
}
module.exports={start};
