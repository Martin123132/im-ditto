#!/usr/bin/env node
'use strict';
const {randomUUID}=require('node:crypto');
const {fail,Fault,keys,integer,object}=require('./src/common.cjs');
const HELP={
app:'im-board-games',version:'0.1.0',usage:'node cli.cjs --url http://127.0.0.1:PORT COMMAND',
commands:{
help:'Show this JSON command reference. Does not need a running app.',
status:'Read the host-launched app identity; excludes the mutation token.',
projects:'List saved projects, active selection and session revision.',
create:'--name NAME [--template blank|lantern-circuit]. Creates and selects a new saved project.',
inspect:'[--project ID]. Read a saved project; defaults to the shared active selection.',
select:'PROJECT_ID. Change shared selection using its current session revision.',
update:'[--project ID] [--revision N] --json JSON_OBJECT. Change name, tagline, players, minutes, rules, cards or board.',
'card add':'--title TEXT [--body TEXT] [--quantity N] [--color #RRGGBB] [--tag TEXT]',
'card update':'CARD_ID [--title TEXT] [--body TEXT] [--quantity N] [--color #RRGGBB] [--tag TEXT]',
'card move':'CARD_ID --to POSITION (one-based)',
'card remove':'CARD_ID',
board:'--rows N --cols N. Resize to 3–8 rows/columns, preserving overlapping cells.',
cell:'INDEX [--label TEXT] [--kind path|home|landmark] [--color #RRGGBB]. INDEX is one-based.',
export:'[--project ID] [--revision N] --format html|json. Save a snapshot beneath app data and return its download URL.',
exports:'[--project ID]. List existing saved exports.'
},
notes:['The CLI never starts a server. The host supplies --url.','Commands return JSON; errors use stderr and a nonzero exit code.','Project edits fetch the current revision unless --revision is specified. A stale revision is rejected.','No shell commands, arbitrary filesystem paths, plugins or network URLs are accepted.']
};
function parse(argv){
  const args=[],options={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];
    if(token.startsWith('--')){
      const eq=token.indexOf('='),key=token.slice(2,eq<0?undefined:eq);
      if(Object.hasOwn(options,key))fail('CLI_ARGUMENT','Duplicate option: --'+key);
      if(key==='help'){options.help=true;continue;}
      let value=eq<0?argv[++i]:token.slice(eq+1);
      if(value===undefined||value.startsWith('--'))fail('CLI_ARGUMENT','Missing value for --'+key);
      options[key]=value;
    }else args.push(token);
  }
  return {args,options};
}
class Client {
  constructor(url){
    let u;try{u=new URL(url);}catch{fail('URL_REQUIRED','Pass the local URL supplied by the host with --url.');}
    if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)fail('INVALID_URL','Use the host URL: http://127.0.0.1:PORT.');
    this.url=u.origin;this.token=null;
  }
  async request(route,method='GET',body){
    let response;
    try{response=await fetch(this.url+route,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:body===undefined?{}:{'Content-Type':'application/json','X-Studio-Token':this.token},body:body===undefined?undefined:JSON.stringify(body)});}
    catch{throw new Fault('APP_UNAVAILABLE','The host-launched app is not reachable at '+this.url+'. Start or open it through the host.',503);}
    let result;try{result=await response.json();}catch{throw new Fault('INVALID_RESPONSE','The local app returned an invalid response.',502);}
    if(!response.ok)throw new Fault(result.error?.code||'REQUEST_FAILED',result.error?.message||'The request failed.',response.status,result.error?.details);
    return result;
  }
  async connect(){
    const h=await this.request('/api/health');
    if(h.app!=='im-board-games'||!h.ok||typeof h.token!=='string')fail('WRONG_APP','The URL is not an I’m-Board-Games application.',409);
    this.token=h.token;this.health={...h};delete this.health.token;return this;
  }
  async project(projectId){
    let key=projectId;if(!key)key=(await this.request('/api/projects')).activeProjectId;
    if(!key)fail('NO_PROJECT','Create or select a project first.');
    return this.request('/api/projects/'+encodeURIComponent(key));
  }
  async update(p,changes,revision){return this.request('/api/projects/'+p.id+'/update','POST',{revision:revision===undefined?p.revision:Number(revision),changes});}
}
function resized(board,rows,cols){
  integer(rows,3,8,'Rows');integer(cols,3,8,'Columns');
  return {rows,cols,cells:Array.from({length:rows*cols},(_,i)=>{
    const r=Math.floor(i/cols),c=i%cols;
    return r<board.rows&&c<board.cols?structuredClone(board.cells[r*board.cols+c]):{label:'Space '+(i+1),kind:'path',color:'#ede9df'};
  })};
}
async function run(argv){
  const {args,options:o}=parse(argv);
  const command=args.shift()||'help';
  if(command==='help'||o.help)return HELP;
  const allowed={status:[],projects:[],create:['name','template'],inspect:['project'],select:[],update:['project','revision','json'],card:['project','revision','title','body','quantity','color','tag','to'],board:['project','revision','rows','cols'],cell:['project','revision','label','kind','color'],export:['project','revision','format'],exports:['project']};
  if(!Object.hasOwn(allowed,command))fail('CLI_COMMAND','Unknown command. Run help for the supported commands.');
  keys(o,['url',...allowed[command]]);
  const client=await new Client(o.url).connect();
  if(command==='status'){if(args.length)fail('CLI_ARGUMENT','status takes no positional arguments.');return client.health;}
  if(command==='projects'){if(args.length)fail('CLI_ARGUMENT','projects takes no positional arguments.');return client.request('/api/projects');}
  if(command==='create'){if(args.length)fail('CLI_ARGUMENT','Use --name for the game name.');return client.request('/api/projects','POST',{...(o.name!==undefined?{name:o.name}:{}),template:o.template||'blank'});}
  if(command==='select'){
    if(args.length!==1)fail('CLI_ARGUMENT','select requires one project ID.');
    const w=await client.request('/api/projects');return client.request('/api/session','POST',{projectId:args[0],revision:w.sessionRevision});
  }
  const p=await client.project(o.project);
  if(command==='inspect'){if(args.length)fail('CLI_ARGUMENT','Use --project ID.');return p;}
  if(command==='exports'){if(args.length)fail('CLI_ARGUMENT','Use --project ID.');return client.request('/api/projects/'+p.id+'/exports');}
  if(command==='export'){
    if(args.length)fail('CLI_ARGUMENT','Use --format html or --format json.');
    return client.request('/api/projects/'+p.id+'/exports','POST',{revision:o.revision===undefined?p.revision:Number(o.revision),format:o.format});
  }
  let changes;
  if(command==='update'){
    if(args.length||o.json===undefined)fail('CLI_ARGUMENT','update requires --json with one changes object.');
    try{changes=JSON.parse(o.json);}catch{fail('INVALID_JSON','--json must contain valid JSON.');}object(changes,'Changes');
  }
  if(command==='card'){
    const action=args.shift();let cards=structuredClone(p.cards);
    const fields={};for(const key of ['title','body','color','tag'])if(o[key]!==undefined)fields[key]=o[key];
    if(o.quantity!==undefined)fields.quantity=Number(o.quantity);
    if(action==='add'){
      if(args.length)fail('CLI_ARGUMENT','Use --title to name a card.');
      cards.push({id:randomUUID(),title:'New card',body:'',quantity:1,color:'#c4eadb',tag:'Game card',...fields});
    }else{
      if(args.length!==1)fail('CLI_ARGUMENT','This card command requires one card ID.');
      const at=cards.findIndex(c=>c.id===args[0]);if(at<0)fail('NOT_FOUND','That card is not in the selected project.',404);
      if(action==='update'){if(!Object.keys(fields).length)fail('CLI_ARGUMENT','Choose at least one card field to update.');cards[at]={...cards[at],...fields};}
      else if(action==='remove')cards.splice(at,1);
      else if(action==='move'){const to=Number(o.to);integer(to,1,cards.length,'Position');const [c]=cards.splice(at,1);cards.splice(to-1,0,c);}
      else fail('CLI_COMMAND','Card action must be add, update, move or remove.');
    }
    changes={cards};
  }
  if(command==='board'){if(args.length)fail('CLI_ARGUMENT','Use --rows and --cols.');changes={board:resized(p.board,Number(o.rows),Number(o.cols))};}
  if(command==='cell'){
    if(args.length!==1)fail('CLI_ARGUMENT','cell requires one one-based space index.');
    const at=Number(args[0]);integer(at,1,p.board.cells.length,'Space');
    const fields={};for(const key of ['label','kind','color'])if(o[key]!==undefined)fields[key]=o[key];
    if(!Object.keys(fields).length)fail('CLI_ARGUMENT','Choose a label, kind or colour.');
    const board=structuredClone(p.board);board.cells[at-1]={...board.cells[at-1],...fields};changes={board};
  }
  return client.update(p,changes,o.revision);
}
if(require.main===module)run(process.argv.slice(2)).then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{
  process.stderr.write(JSON.stringify({error:{code:error.code||'CLI_ERROR',message:error.message,...(error.details?{details:error.details}:{})}},null,2)+'\n');process.exitCode=1;
});
module.exports={run,Client,parse,resized,HELP};
