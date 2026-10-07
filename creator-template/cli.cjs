'use strict';
async function main(){
  const args=process.argv.slice(2),i=args.indexOf('--url');if(i<0)throw Error('Use --url or the host CLI.');
  const u=new URL(args[i+1]);args.splice(i,2);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password)throw Error('Loopback only.');
  const h=await (await fetch(u.origin+'/api/health')).json();
  if(args[0]==='help')return {commands:['inspect','set NAME NOTES','status']};if(args[0]==='status')return {ok:h.ok,app:h.app,pid:h.pid};
  const p=await (await fetch(u.origin+'/api/project')).json();if(args[0]==='inspect')return p;
  if(args[0]!=='set'||args.length!==3)throw Error('Use inspect or set NAME NOTES.');
  const r=await fetch(u.origin+'/api/project',{method:'POST',headers:{'Content-Type':'application/json','x-app-token':h.token},body:JSON.stringify({...p,name:args[1],notes:args[2]})});
  const b=await r.json();if(!r.ok)throw Error(b.error);return b;
}
main().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(JSON.stringify({error:e.message}));process.exitCode=1;});
