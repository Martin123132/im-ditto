'use strict';
const {randomUUID} = require('node:crypto');
const {fail,id,idPattern,object,keys,integer,text,color,SafeRoot,digest} = require('./common.cjs');
const demo = require('./demo.cjs');
const {printKit} = require('./print.cjs');
const EDITABLE = ['name','tagline','players','minutes','rules','cards','board'];
const LIMITS = {projects:40,designs:40,copies:120,cardText:360,rules:20000,gridMin:3,gridMax:8};
function validate(input) {
  const p = structuredClone(object(input,'Project'));
  keys(p,['schemaVersion','id','revision','createdAt','updatedAt',...EDITABLE]);
  if (p.schemaVersion !== 1) fail('DATA_VERSION','Unsupported project data version.');
  p.id=id(p.id); integer(p.revision,1,1000000,'Revision');
  for (const key of ['createdAt','updatedAt']) if (typeof p[key] !== 'string' || !Number.isFinite(Date.parse(p[key]))) fail('INVALID_INPUT','Invalid timestamp.');
  p.name=text(p.name,80,'Game name',{empty:false});
  p.tagline=text(p.tagline,160,'Tagline');
  keys(p.players,['min','max']);
  integer(p.players.min,1,8,'Minimum players'); integer(p.players.max,p.players.min,8,'Maximum players');
  integer(p.minutes,1,360,'Duration');
  p.rules=text(p.rules,LIMITS.rules,'Rules',{multiline:true});
  if (!Array.isArray(p.cards) || p.cards.length>LIMITS.designs) fail('INVALID_INPUT','Use at most '+LIMITS.designs+' card designs.');
  const seen = new Set(); let total=0;
  for (const card of p.cards) {
    keys(card,['id','title','body','quantity','color','tag']);
    card.id=id(card.id);
    if (seen.has(card.id)) fail('DUPLICATE_ID','Card IDs must be unique.');
    seen.add(card.id);
    card.title=text(card.title,56,'Card title',{empty:false});
    card.body=text(card.body,LIMITS.cardText,'Card text',{multiline:true,lines:5});
    card.tag=text(card.tag,24,'Card label');
    card.color=color(card.color); integer(card.quantity,1,12,'Card quantity'); total+=card.quantity;
  }
  if(total>LIMITS.copies) fail('CARD_LIMIT','A kit may contain at most '+LIMITS.copies+' printed cards.');
  keys(p.board,['rows','cols','cells']);
  integer(p.board.rows,3,8,'Board rows');integer(p.board.cols,3,8,'Board columns');
  if(!Array.isArray(p.board.cells)||p.board.cells.length!==p.board.rows*p.board.cols) fail('INVALID_INPUT','The board must have exactly rows × columns spaces.');
  for(const cell of p.board.cells){
    keys(cell,['label','kind','color']);
    cell.label=text(cell.label,40,'Space label',{empty:false});
    if(!['path','home','landmark'].includes(cell.kind)) fail('INVALID_INPUT','Space type must be path, home or landmark.');
    cell.color=color(cell.color);
  }
  return p;
}
function summary(p) {return {id:p.id,name:p.name,tagline:p.tagline,revision:p.revision,updatedAt:p.updatedAt,players:p.players,minutes:p.minutes,cardDesigns:p.cards.length,cardCount:p.cards.reduce((n,c)=>n+c.quantity,0),board:{rows:p.board.rows,cols:p.board.cols}};}
class Store {
  constructor(dataRoot) {
    this.fs = new SafeRoot(dataRoot,{create:true});
    this.fs.directory('projects');this.fs.directory('exports');
    if(!this.fs.exists('workspace.json')){
      this.fs.writeJson(['workspace.json'],{schemaVersion:1,revision:1,activeProjectId:null});
      const existing=this.list();
      if(existing.length) this.select(existing[0].id,1);
      else this.create({template:'lantern-circuit'});
    }
    this.workspace();
  }
  list() {
    const names=this.fs.list('projects').filter(name=>/^[0-9a-f-]+\.json$/i.test(name)&&idPattern.test(name.slice(0,-5)));
    if(names.length>LIMITS.projects) fail('PROJECT_LIMIT','The saved workspace exceeds the project limit.',500);
    return names.map(name=>summary(this.get(name.slice(0,-5)))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
  }
  get(projectId) {const key=id(projectId); const p=validate(this.fs.json('projects',key+'.json'));if(p.id!==key)fail('INVALID_DATA','Saved project identity mismatch.',500);return p;}
  session() {
    const s=this.fs.json('workspace.json');keys(s,['schemaVersion','revision','activeProjectId']);
    if(s.schemaVersion!==1)fail('DATA_VERSION','Unsupported workspace version.',500);
    integer(s.revision,1,1000000,'Workspace revision');if(s.activeProjectId!==null)id(s.activeProjectId);return s;
  }
  workspace() {const s=this.session();return {projects:this.list(),activeProjectId:s.activeProjectId,sessionRevision:s.revision,project:s.activeProjectId?this.get(s.activeProjectId):null,limits:LIMITS};}
  select(projectId,revision) {
    const p=this.get(projectId);const s=this.session();this.expect(s,revision,'selection');
    if(s.activeProjectId===p.id)return this.workspace();
    this.fs.writeJson(['workspace.json'],{...s,revision:s.revision+1,activeProjectId:p.id});return this.workspace();
  }
  expect(p,revision,label='project') {
    integer(revision,1,1000000,'Expected revision');
    if(p.revision!==revision)fail('REVISION_CONFLICT','The '+label+' changed. Load its current revision before saving.',409,{expected:revision,current:p.revision});
  }
  create(input) {
    keys(input,['name','template']);
    if(this.list().length>=LIMITS.projects)fail('PROJECT_LIMIT','This workspace holds up to '+LIMITS.projects+' projects.');
    const kind=input.template||'blank';
    if(!['blank','lantern-circuit'].includes(kind))fail('INVALID_INPUT','Template must be blank or lantern-circuit.');
    if(input.name!==undefined)text(input.name,80,'Game name',{empty:false});
    const now=new Date().toISOString();
    const p=validate({schemaVersion:1,id:randomUUID(),revision:1,createdAt:now,updatedAt:now,...demo.template(input.name,kind==='lantern-circuit')});
    this.fs.writeJson(['projects',p.id+'.json'],p);
    const s=this.session();this.fs.writeJson(['workspace.json'],{...s,activeProjectId:p.id,revision:s.revision+1});return p;
  }
  update(projectId,input) {
    keys(input,['revision','changes']);keys(input.changes,EDITABLE);
    if(!Object.keys(input.changes).length)fail('INVALID_INPUT','At least one change is required.');
    const current=this.get(projectId);this.expect(current,input.revision);
    const next=validate({...current,...input.changes,revision:current.revision+1,updatedAt:new Date().toISOString()});
    this.fs.writeJson(['projects',current.id+'.json'],next);return next;
  }
  exports(projectId) {
    id(projectId);
    return this.fs.list('exports').filter(name=>/^[0-9a-f-]+\.meta\.json$/i.test(name)&&idPattern.test(name.slice(0,-10))).map(name=>this.exportInfo(name.slice(0,-10))).filter(x=>x.projectId===projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  exportInfo(exportId) {
    const key=id(exportId);const info=this.fs.json('exports',key+'.meta.json');
    if(info.id!==key||!['html','json'].includes(info.format)||info.filename!==key+'.'+info.format)fail('INVALID_DATA','Invalid saved export identity.',500);
    id(info.projectId);return info;
  }
  makeExport(projectId,input) {
    keys(input,['revision','format']);
    if(!['html','json'].includes(input.format))fail('INVALID_INPUT','Export format must be html or json.');
    const p=this.get(projectId);this.expect(p,input.revision);
    if(this.fs.list('exports').filter(n=>n.endsWith('.meta.json')).length>=200)fail('EXPORT_LIMIT','This workspace already contains 200 exports. Keep or archive existing exports before creating more.');
    const exportId=randomUUID(), createdAt=new Date().toISOString();
    const data=input.format==='html'?printKit(p):JSON.stringify(p,null,2)+'\n';
    const filename=exportId+'.'+input.format;
    const info={id:exportId,projectId:p.id,projectName:p.name,revision:p.revision,format:input.format,createdAt,filename,path:'exports/'+filename,bytes:Buffer.byteLength(data),sha256:digest(data),url:'/api/exports/'+exportId,downloadUrl:'/api/exports/'+exportId+'/download'};
    this.fs.write(['exports',filename],data);this.fs.writeJson(['exports',exportId+'.meta.json'],info);return info;
  }
  readExport(exportId) {const info=this.exportInfo(exportId);const data=this.fs.read('exports',info.filename);if(digest(data)!==info.sha256)fail('INVALID_DATA','The saved export differs from its recorded content.',409);return {info,data};}
}
module.exports={Store,validate,summary,LIMITS,EDITABLE};
