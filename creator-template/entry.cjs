'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
exports.start=async({dataRoot,packageRoot,port=0,instanceId})=>{
  await fs.mkdir(dataRoot,{recursive:true});
  const data=path.join(dataRoot,'project.json');
  const linked=async p=>{try{if((await fs.lstat(p)).isSymbolicLink())throw Error('Linked storage refused.');}catch(e){if(e.code!=='ENOENT')throw e;}};
  await linked(dataRoot);await linked(data);
  let project;try{project=JSON.parse(await fs.readFile(data,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;project={revision:1,name:'My first workspace',notes:''};}
  const token=crypto.randomBytes(32).toString('hex');let actualPort,saveTail=Promise.resolve();
  const write=async p=>{await linked(data);const temp=path.join(dataRoot,'save-'+crypto.randomUUID()+'.tmp');await fs.writeFile(temp,JSON.stringify(p),{flag:'wx'});await fs.rename(temp,data);};
  const server=http.createServer(async(req,res)=>{
    const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");res.setHeader('X-Content-Type-Options','nosniff');
    try{
      const origin='http://127.0.0.1:'+actualPort;
      if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'&&req.headers['sec-fetch-mode']!=='navigate')throw Error('Foreign request refused.');
      if(req.method==='GET'&&req.url==='/api/health')return send(200,{ok:true,app:'my-im',token,pid:process.pid,instanceId});
      if(req.method==='GET'&&req.url==='/api/project')return send(200,project);
      if(req.method==='POST'&&req.url==='/api/project'){
        if(req.headers['x-app-token']!==token)throw Error('Current token required.');
        let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error('Payload too large.');chunks.push(chunk);}
        const p=JSON.parse(Buffer.concat(chunks).toString());
        if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100||typeof p.notes!=='string'||p.notes.length>10000)throw Error('Invalid project.');
        const task=saveTail.catch(()=>{}).then(async()=>{
          if(p.revision!==project.revision)return send(409,{error:'Project changed. Inspect and retry.'});
          const next={revision:project.revision+1,name:p.name,notes:p.notes};await write(next);project=next;send(200,next);
        });saveTail=task;await task;return;
      }
      const pages={'/':'index.html','/app.js':'app.js'};
      if(req.method==='GET'&&pages[req.url]){res.writeHead(200,{'Content-Type':req.url.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'});res.end(await fs.readFile(path.join(packageRoot,pages[req.url])));return;}
      send(404,{error:'Not found.'});
    }catch(e){send(400,{error:e.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});actualPort=server.address().port;
  return {url:'http://127.0.0.1:'+actualPort,close:async()=>{await saveTail.catch(()=>{});return new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}};
};
