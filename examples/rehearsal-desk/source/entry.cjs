'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const M=require('./model.cjs');
const MAX_BODY=1024*1024;
async function noLinks(target){const full=path.resolve(target),root=path.parse(full).root;let current=root;for(const part of full.slice(root.length).split(path.sep).filter(Boolean)){current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw new M.AppError('LINKED_STORAGE','Linked storage is not supported.',400);}catch(e){if(e.code!=='ENOENT')throw e;}}}
function inside(parent,child){const r=path.relative(parent,child);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));}
exports.start=async({dataRoot,packageRoot,port=0,instanceId})=>{
  if(typeof dataRoot!=='string'||!path.isAbsolute(dataRoot)||typeof packageRoot!=='string'||!path.isAbsolute(packageRoot))throw new M.AppError('INVALID_ROOT','Absolute packageRoot and dataRoot are required.',400);
  M.integer(port,'Port',0,65535);if(typeof instanceId!=='string'||!instanceId||instanceId.length>200)throw new M.AppError('INVALID_INSTANCE','The host must provide an instanceId.',400);
  dataRoot=path.resolve(dataRoot);packageRoot=path.resolve(packageRoot);if(inside(packageRoot,dataRoot)||inside(dataRoot,packageRoot))throw new M.AppError('OVERLAPPING_ROOTS','Package and user-data directories must be separate.',400);
  await noLinks(dataRoot);await noLinks(packageRoot);await fs.mkdir(dataRoot,{recursive:true});
  const exportsRoot=path.join(dataRoot,'exports');await noLinks(exportsRoot);await fs.mkdir(exportsRoot,{recursive:true});
  const data=path.join(dataRoot,'project.json');
  async function guard(file){if(!inside(dataRoot,file))throw new M.AppError('BAD_PATH','Storage path outside app data.',400);await noLinks(file);}
  async function read(file,max=MAX_BODY){await guard(file);const stat=await fs.stat(file);if(!stat.isFile()||stat.size>max)throw new M.AppError('STORAGE_INVALID','Stored file exceeds its bounds or is not a file.',500);return fs.readFile(file,'utf8');}
  async function atomic(file,content){await guard(file);const temp=path.join(path.dirname(file),'.save-'+crypto.randomUUID()+'.tmp');try{await fs.writeFile(temp,content,{flag:'wx'});await guard(file);await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
  let project;try{project=M.load(JSON.parse(await read(data)));}catch(e){if(e.code!=='ENOENT')throw e;project=M.initial();await atomic(data,JSON.stringify(project,null,2)+'\n');}
  let tail=Promise.resolve(),closing=false,closed=false,actualPort;
  const token=crypto.randomBytes(32).toString('hex');
  const queue=fn=>{if(closing)throw new M.AppError('CLOSING','The app is closing.',503);const task=tail.catch(()=>{}).then(fn);tail=task;return task;};
  const checkRevision=revision=>{M.integer(revision,'Revision',1,Number.MAX_SAFE_INTEGER-1);if(revision!==project.revision){const e=new M.AppError('REVISION_CONFLICT','Saved work changed. Inspect the latest revision before editing or exporting.',409);e.currentRevision=project.revision;throw e;}};
  const save=async next=>{await atomic(data,JSON.stringify(next,null,2)+'\n');project=next;return structuredClone(next);};
  async function body(req){if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw new M.AppError('CONTENT_TYPE','Use application/json.',415);if(Number(req.headers['content-length'])>MAX_BODY)throw new M.AppError('PAYLOAD_TOO_LARGE','Payload exceeds 1 MiB.',413);const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>MAX_BODY)throw new M.AppError('PAYLOAD_TOO_LARGE','Payload exceeds 1 MiB.',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new M.AppError('BAD_JSON','Body is not valid JSON.',400);}}
  function authenticate(req){const supplied=req.headers['x-app-token'];if(typeof supplied!=='string'||supplied.length!==token.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))throw new M.AppError('UNAUTHORIZED','Current app authentication is required.',401);}
  async function exportList(){await guard(exportsRoot);const names=(await fs.readdir(exportsRoot)).filter(n=>/^[a-f0-9-]{36}\.meta\.json$/.test(n));if(names.length>1000)throw new M.AppError('EXPORT_LIMIT','The export history exceeds 1000 snapshots.',422);const values=[];for(const n of names){const meta=JSON.parse(await read(path.join(exportsRoot,n),8192));M.id(meta.id);if(n!==meta.id+'.meta.json'||!['html','json'].includes(meta.format)||meta.filename!==meta.id+'.'+meta.format||typeof meta.sha256!=='string'||!/^[a-f0-9]{64}$/.test(meta.sha256))throw new M.AppError('STORAGE_INVALID','Export metadata is invalid.',500);values.push(meta);}return values.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  const exportRecord=async(format)=>{if(!['html','json'].includes(format))M.fail('Export format must be html or json.');if((await exportList()).length>=1000)M.fail('Export limit reached (1000 snapshots).','EXPORT_LIMIT');const content=M.exportContent(project,format),id=crypto.randomUUID(),filename=id+'.'+format;const meta={id,format,filename,revision:project.revision,name:project.name,createdAt:new Date().toISOString(),bytes:Buffer.byteLength(content),sha256:crypto.createHash('sha256').update(content).digest('hex'),path:'exports/'+filename,url:'/api/exports/'+id,downloadUrl:'/api/exports/'+id+'/download'};const output=path.join(exportsRoot,filename);await atomic(output,content);try{await atomic(path.join(exportsRoot,id+'.meta.json'),JSON.stringify(meta,null,2)+'\n');}catch(e){await fs.unlink(output);throw e;}return meta;};
  const server=http.createServer(async(req,res)=>{
    const send=(code,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    try{
      if(closing)throw new M.AppError('CLOSING','The app is closing.',503);
      const origin='http://127.0.0.1:'+actualPort;
      if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin)||(req.headers['sec-fetch-site']==='cross-site'&&(req.url!=='/'||req.headers['sec-fetch-mode']!=='navigate')))throw new M.AppError('FOREIGN_REQUEST','Foreign request refused.',403);
      if(req.method==='GET'&&req.url==='/api/health')return send(200,{ok:true,app:M.APP_ID,name:'My rehearsal desk',version:'0.1.1',pid:process.pid,instanceId,token});
      if(req.method==='GET'&&req.url==='/api/project')return send(200,project);
      if(req.method==='GET'&&req.url==='/api/plan')return send(200,M.plan(project));
      if(req.method==='GET'&&req.url==='/api/exports')return send(200,{exports:await exportList()});
      if(req.method==='POST'&&['/api/project','/api/action','/api/export'].includes(req.url)){
        authenticate(req);const b=await body(req);
        const result=await queue(async()=>{if(!b||typeof b!=='object'||Array.isArray(b))M.fail('Body must be an object.');checkRevision(b.revision);
          if(req.url==='/api/project'){const next=M.project(b);next.revision=project.revision+1;return save(M.project(next));}
          if(req.url==='/api/action')return save(M.apply(project,b));
          M.keys(b,['revision','format'],'export');return exportRecord(b.format);
        });return send(req.url==='/api/export'?201:200,result);
      }
      const match=/^\/api\/exports\/([a-f0-9-]{36})(\/download)?$/.exec(req.url);
      if(req.method==='GET'&&match){M.id(match[1]);const meta=(await exportList()).find(e=>e.id===match[1]);if(!meta)throw new M.AppError('NOT_FOUND','Export not found.',404);const content=await read(path.join(exportsRoot,meta.filename),4*MAX_BODY);if(crypto.createHash('sha256').update(content).digest('hex')!==meta.sha256)throw new M.AppError('EXPORT_INTEGRITY','The saved export does not match its checksum.',409);res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");res.writeHead(200,{'Content-Type':meta.format==='html'?'text/html; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':(match[2]?'attachment':'inline')+'; filename="rehearsal-plan-r'+meta.revision+'.'+meta.format+'"'});res.end(content);return;}
      const pages={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
      if(req.method==='GET'&&Object.hasOwn(pages,req.url)){const [file,mime]=pages[req.url],target=path.join(packageRoot,file);await noLinks(target);const content=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime});res.end(content);return;}
      send(404,{error:{code:'NOT_FOUND',message:'Not found.'}});
    }catch(e){const known=e instanceof M.AppError;send(known?e.status:500,{error:{code:known?e.code:'STORAGE_ERROR',message:known?e.message:'Could not read or save local app data. Your last saved state was not replaced.',...(e.currentRevision?{currentRevision:e.currentRevision}:{})}});}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});actualPort=server.address().port;
  let closePromise;
  return {url:'http://127.0.0.1:'+actualPort,close:()=>{if(closePromise)return closePromise;closing=true;closePromise=(async()=>{await tail.catch(()=>{});if(closed)return;await new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();});closed=true;})();return closePromise;}};
};
