'use strict';
(() => {
const $=selector=>document.querySelector(selector);
const e=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const COLORS=['#c4eadb','#f5d596','#d8d2f2','#f3b6a3','#c3dce9','#ede9df'];
const S={token:null,workspace:null,p:null,tab:'overview',cardId:null,cell:12,dirty:false,remote:null,busy:false,exports:[],offline:false};
let toastTimer;
function toast(message,error=false){clearTimeout(toastTimer);const el=$('#toast');el.textContent=message;el.className='toast'+(error?' error':'');el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,error?7000:4000);}
async function api(route,body){
  const response=await fetch(route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Studio-Token':S.token},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const value=await response.json();
  if(!response.ok){const error=new Error(value.error?.message||'The request failed.');error.code=value.error?.code;throw error;}return value;
}
function status(){
  const el=$('#save-indicator');el.className='save-indicator'+(S.offline?' offline':S.dirty?' dirty':'');
  el.querySelector('span').textContent=S.offline?'Connection lost':S.busy?'Saving…':S.dirty?'Unsaved changes':S.p?'Saved · v'+S.p.revision:'Connecting…';
  $('#revision-footer').textContent=S.p?'Saved revision '+S.p.revision+' · '+new Date(S.p.updatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Local workshop';
  $('#sync-banner').hidden=!S.remote;
  if(S.remote)$('#sync-message').textContent='Chat or another window changed the saved workspace. Your draft is still here; copy anything you want to keep before reloading.';
}
function dirty(){S.dirty=true;status();}
function allowDiscard(){if(!S.dirty)return true;return window.confirm('Discard the unsaved changes in this editor?');}
function artwork(n=0){
  const paths=['M12 38H42V16H77V38H106','M12 40L40 14L67 40L103 14','M12 30H105','M12 42H48V18L99 40','M15 44L43 16L70 44L99 16','M16 30H48M71 30H104','M12 14V44H104V14H12','M14 38H47V15H72V38H104'];
  return '<svg viewBox="0 0 120 60" aria-hidden="true"><path d="'+paths[n%paths.length]+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="38" r="4" fill="currentColor"/><path d="M100 5l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="currentColor" opacity=".6"/></svg>';
}
function cardView(card,index,live=false){
  return `<div class="card-art" style="--tint:${e(card.color)}">${artwork(index)}<span class="card-qty">× ${card.quantity}</span></div><div class="card-details"><span class="card-tag">${e(card.tag||'Game card')}</span><strong class="card-title">${e(card.title)}</strong><span class="card-copy">${e(card.body)}</span><span class="card-bottom"><span>${live?'LIVE PREVIEW':'ROUTE '+String(index+1).padStart(2,'0')}</span><span>63 × 88 mm</span></span></div>`;
}
function boardView(board,{mini=false,interactive=false}={}){
  return '<div class="board-grid '+(mini?'mini-board ':'')+(board.cols>6?'dense':'')+'" style="--cols:'+board.cols+'">'+board.cells.map((cell,i)=>
    '<'+(interactive?'button type="button" data-action="select-cell" data-index="'+i+'" aria-label="Space '+(i+1)+': '+e(cell.label)+'"':'div')+' class="space '+cell.kind+(interactive&&i===S.cell?' selected':'')+'" style="background:'+e(cell.color)+'"><span class="coord">'+(Math.floor(i/board.cols)+1)+'·'+(i%board.cols+1)+'</span><span class="space-symbol">'+(cell.kind==='home'?'⌂':cell.kind==='landmark'?'✦':'·')+'</span><strong>'+e(cell.label)+'</strong></'+(interactive?'button':'div')+'>').join('')+'</div>';
}
function palette(target,color){
  return '<div class="palette" aria-label="Colour presets">'+COLORS.map(c=>'<button type="button" class="swatch'+(c===color?' selected':'')+'" style="background:'+c+'" data-color="'+c+'" data-target="'+target+'" aria-label="Use colour '+c+'"></button>').join('')+'</div>';
}
function overview(){
  const p=S.p,total=p.cards.reduce((n,c)=>n+c.quantity,0);
  return `<div class="overview-layout"><section class="panel"><div class="panel-heading"><div class="section-label">THE GAME PLAN <span class="pill">Editable prototype</span></div><h2>Give your game a shape.</h2><p>Set the essentials, then write the rules in your own words.</p></div><div class="panel-body"><form id="overview-form" data-editor><label>Game name<input name="name" maxlength="80" required value="${e(p.name)}"></label><label>One-line pitch<input name="tagline" maxlength="160" value="${e(p.tagline)}"></label><div class="form-grid three"><label>Min. players<input name="min" type="number" min="1" max="8" required value="${p.players.min}"></label><label>Max. players<input name="max" type="number" min="1" max="8" required value="${p.players.max}"></label><label>Minutes<input name="minutes" type="number" min="1" max="360" required value="${p.minutes}"></label></div><hr class="form-separator"><label>How to play<textarea class="rules-editor" name="rules" maxlength="20000" spellcheck="true">${e(p.rules)}</textarea></label><div class="form-footer"><span class="hint">A goal, a setup, a turn, an ending.<br><span id="rules-count">${p.rules.length}</span> / 20,000 characters</span><button class="button primary" type="submit">Save game <span>↗</span></button></div></form></div></section>
  <div class="stack"><section class="panel on-table"><div class="panel-body"><div class="section-label">ON THE TABLE <span class="pill">Live project</span></div><div class="stat-grid"><div class="stat"><strong>${p.players.min}–${p.players.max}</strong><span>Players</span></div><div class="stat"><strong>${p.minutes}<small style="font-size:11px"> min</small></strong><span>Play time</span></div><div class="stat"><strong>${total}</strong><span>Cards</span></div></div><div class="mini-board-wrap">${boardView(p.board,{mini:true})}<div class="preview-label"><span>${p.board.rows} × ${p.board.cols} GRID BOARD</span><span>✦ ${p.board.cells.filter(c=>c.kind==='landmark').length} LANDMARKS</span></div></div><div class="form-footer"><span class="hint">Every space has a story.<br>Change labels and colours in the builder.</span><button class="button quiet" type="button" data-action="go-board">Edit board →</button></div></div></section><div class="overview-note"><b>✦</b><p><strong>Make it. Print it. Play it.</strong>Your rules, cards and board become a self-contained paper kit. Try a round, make a note, change an idea.</p></div></div></div>`;
}
function cards(){
  const p=S.p;
  if(!p.cards.some(c=>c.id===S.cardId))S.cardId=p.cards[0]?.id||null;
  const selected=p.cards.find(c=>c.id===S.cardId),at=p.cards.findIndex(c=>c.id===S.cardId);
  const tiles=p.cards.map((c,i)=>'<button type="button" draggable="true" data-action="select-card" data-card="'+c.id+'" class="deck-card'+(c.id===S.cardId?' selected':'')+'" aria-pressed="'+(c.id===S.cardId)+'" aria-label="Edit card '+e(c.title)+'">'+cardView(c,i)+'</button>').join('');
  let inspector='<section class="panel inspector"><div class="panel-body empty-state"><h3>Your first card awaits.</h3><p>Add a card to give it a name, an effect and a colour.</p></div></section>';
  if(selected)inspector=`<section class="panel inspector"><div class="panel-heading"><div class="section-label">CARD DETAILS <span class="pill">${at+1} / ${p.cards.length}</span></div></div><div class="panel-body"><div id="live-card" class="live-card">${cardView(selected,at,true)}</div><form id="card-form" data-editor><label>Card name<input name="title" maxlength="56" required value="${e(selected.title)}"></label><label>Small label<input name="tag" maxlength="24" value="${e(selected.tag)}"></label><label>What does it do?<textarea name="body" maxlength="360">${e(selected.body)}</textarea><span class="hint">Up to 360 characters and 5 lines, to fit the printed card.</span></label><div class="form-grid"><label>Copies<input name="quantity" type="number" min="1" max="12" required value="${selected.quantity}"></label><label>Colour<input id="card-color" type="color" name="color" value="${selected.color}"></label></div>${palette('card-color',selected.color)}<button class="button primary wide" type="submit">Save card</button></form><hr class="form-separator"><div class="row"><button class="button secondary" type="button" data-action="move-card" data-dir="-1" ${at===0?'disabled':''}>← Earlier</button><button class="button secondary" type="button" data-action="move-card" data-dir="1" ${at===p.cards.length-1?'disabled':''}>Later →</button></div><button class="button quiet wide" style="margin-top:9px;color:#9a6150" type="button" data-action="delete-card">Remove card</button></div></section>`;
  return `<div class="workshop-heading"><div><h2>A little deck. A lot of possibilities.</h2><p>${p.cards.length} designs · ${p.cards.reduce((n,c)=>n+c.quantity,0)} printed cards. Drag to reorder, or use Earlier / Later.</p></div><button class="button secondary" type="button" data-action="add-card">+ Add card</button></div><div class="cards-layout"><div class="deck-grid">${tiles}<button class="add-card-tile" type="button" data-action="add-card"><span>+</span>One more idea</button></div>${inspector}</div>`;
}
function board(){
  const b=S.p.board;S.cell=Math.min(S.cell,b.cells.length-1);const c=b.cells[S.cell];
  return `<div class="workshop-heading"><div><h2>Build somewhere to play.</h2><p>Click a space to change its name, colour or role.</p></div><span class="pill">${b.rows*b.cols} labelled spaces</span></div><div class="board-layout"><div><div class="board-table">${boardView(b,{interactive:true})}</div><div class="board-legend"><span>⌂ Home</span><span>✦ Landmark</span><span>· Path</span><span style="margin-left:auto">No hidden rules</span></div></div><section class="panel inspector"><div class="panel-heading"><div class="section-label">SPACE DETAILS <span class="pill">${Math.floor(S.cell/b.cols)+1} · ${S.cell%b.cols+1}</span></div><h3>Make this space yours.</h3></div><div class="panel-body"><form id="board-form" data-editor><label>Space label<input name="label" maxlength="40" required value="${e(c.label)}"></label><label>Role<select name="kind"><option value="path" ${c.kind==='path'?'selected':''}>Path · ordinary space</option><option value="home" ${c.kind==='home'?'selected':''}>Home · a starting point</option><option value="landmark" ${c.kind==='landmark'?'selected':''}>Landmark · somewhere special</option></select></label><label>Colour<input id="cell-color" type="color" name="color" value="${c.color}"></label>${palette('cell-color',c.color)}<hr class="form-separator"><div class="section-label">GRID SIZE</div><div class="form-grid"><label>Rows<input type="number" name="rows" min="3" max="8" required value="${b.rows}"></label><label>Columns<input type="number" name="cols" min="3" max="8" required value="${b.cols}"></label></div><p class="hint">3–8 in each direction. Resizing keeps overlapping spaces and removes those outside the new grid.</p><button class="button primary wide" style="margin-top:20px" type="submit">Save board</button></form></div></section></div>`;
}
function kit(){
  const p=S.p,total=p.cards.reduce((n,c)=>n+c.quantity,0);
  return `<div class="kit-layout"><div class="stack"><section class="panel"><div class="panel-heading"><div class="section-label">READY FOR A FIRST ROUND</div><h2>Take it off the screen.</h2><p>Turn this saved version into something you can hold, shuffle and play.</p></div><div class="panel-body"><ul class="kit-checklist"><li><span>✓</span><div><strong>A complete rule sheet</strong><small>${e(p.name)} · ${p.players.min}–${p.players.max} players · about ${p.minutes} minutes</small></div></li><li><span>✓</span><div><strong>${total} cards, ready to cut</strong><small>${p.cards.length} designs · standard 63 × 88 mm cards · dashed cut lines</small></div></li><li><span>✓</span><div><strong>Your ${p.board.rows} × ${p.board.cols} board and player pieces</strong><small>Labelled spaces, folding pawns and route passports</small></div></li></ul><button class="button primary wide" id="export-html" type="button" data-action="export-html">Create printable HTML kit <span>↗</span></button><p class="hint" style="text-align:center;margin:10px 0 23px">Self-contained · A4 portrait · works offline</p><hr class="form-separator"><div class="row"><div><h3 style="font-size:14px">Keep the editable original.</h3><p class="hint">Download all rules, cards and board data as JSON.</p></div><button class="button secondary" id="export-json" type="button" data-action="export-json">Export JSON ↓</button></div></div></section><section class="panel"><div class="panel-body"><div class="section-label">YOUR EXPORTED VERSIONS <span class="pill">Snapshots</span></div><p class="hint">Open the HTML, then use your browser’s Print command. Choose A4, 100% scale and background graphics; turn headers and footers off.</p><div id="export-list" class="export-list"><p class="muted">Loading saved exports…</p></div></div></section></div><div class="kit-cover"><div class="paper-stack"><p class="eyebrow">A GAME BY YOU</p><h2>${e(p.name)}</h2><p>${e(p.tagline)}</p>${boardView(p.board,{mini:true})}<p>${total} cards · ${p.players.max} player pieces<br>Revision ${p.revision}</p></div><p>Paper, a pencil, and a few people.<br>That’s a good place to start.</p></div></div>`;
}
function renderExports(){
  const root=$('#export-list');if(!root)return;
  root.innerHTML=S.exports.length?S.exports.map(x=>'<div class="export-row"><div><strong>'+(x.format==='html'?'Printable HTML kit':'Editable JSON')+' <span class="pill">v'+x.revision+'</span></strong><small>'+new Date(x.createdAt).toLocaleString()+' · '+Math.ceil(x.bytes/1024)+' KB</small></div><div class="export-links">'+(x.format==='html'?'<a href="'+e(x.url)+'" target="_blank" rel="noopener noreferrer">Open print view ↗</a>':'')+'<a href="'+e(x.downloadUrl)+'" download>Download ↓</a></div></div>').join(''):'<p class="hint">Your first export will appear here. Each export keeps the exact saved version used to create it.</p>';
}
async function loadExports(){const id=S.p.id;try{const data=await api('/api/projects/'+id+'/exports');if(S.p.id===id){S.exports=data.exports;renderExports();}}catch(error){toast(error.message,true);}}
function render(){
  if(!S.p){$('#content').innerHTML='<div class="empty-state"><h2>A blank table awaits.</h2><p>Create a game to begin.</p></div>';return;}
  $('#project-heading').textContent=S.p.name;$('#project-subtitle').textContent=S.p.tagline;$('#crumb-name').textContent=S.p.name;
  $('#hero-eyebrow').textContent={overview:'FROM AN IDEA TO YOUR TABLE',cards:'MAKE EVERY CARD COUNT',board:'GIVE YOUR GAME A PLACE',kit:'THE FIRST PLAYTEST STARTS HERE'}[S.tab];
  $('#nav-card-count').textContent=S.p.cards.length;
  document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===S.tab;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('#project-list').innerHTML=S.workspace.projects.map(p=>'<button class="project-button'+(p.id===S.p.id?' selected':'')+'" data-project="'+p.id+'"><span class="project-tile">▦</span><span><strong>'+e(p.name)+'</strong><small>'+p.cardCount+' cards · v'+p.revision+'</small></span></button>').join('');
  $('#content').innerHTML=({overview,cards,board,kit})[S.tab]();status();
  if(S.tab==='kit')loadExports();
}
async function refresh(){
  S.workspace=await api('/api/workspace');S.p=S.workspace.project;S.dirty=false;S.remote=null;S.offline=false;render();
}
async function saveChanges(changes,message='Saved.'){
  if(S.busy)return false;
  if(S.remote){toast('Load the newer saved version before making another change.',true);return false;}
  S.busy=true;status();
  try{
    const current=S.p;
    await api('/api/projects/'+current.id+'/update',{revision:current.revision,changes});
    await refresh();toast(message);return true;
  }catch(error){
    if(error.code==='REVISION_CONFLICT'){try{S.remote=await api('/api/workspace');}catch{}}
    toast(error.message,true);return false;
  }finally{S.busy=false;status();}
}
function resized(b,rows,cols){
  return {rows,cols,cells:Array.from({length:rows*cols},(_,i)=>{const r=Math.floor(i/cols),c=i%cols;return r<b.rows&&c<b.cols?{...b.cells[r*b.cols+c]}:{label:'Space '+(i+1),kind:'path',color:'#ede9df'};})};
}
async function createExport(format){
  if(S.dirty){toast('Save the editor changes before exporting.',true);return;}
  if(S.remote){toast('Load the newer saved version before exporting.',true);return;}
  if(S.busy)return;
  S.busy=true;status();
  try{
    await api('/api/projects/'+S.p.id+'/exports',{revision:S.p.revision,format});
    S.tab='kit';render();await loadExports();toast(format==='html'?'Printable kit saved. Open the print view below.':'Editable JSON saved. Download it below.');
  }catch(error){toast(error.message,true);}finally{S.busy=false;status();}
}
function previewForm(form){
  const d=new FormData(form);
  if(form.id==='overview-form'){$('#project-heading').textContent=d.get('name');$('#project-subtitle').textContent=d.get('tagline');$('#rules-count').textContent=d.get('rules').length;}
  if(form.id==='card-form'){
    const at=S.p.cards.findIndex(c=>c.id===S.cardId);const c={...S.p.cards[at],title:d.get('title'),body:d.get('body'),tag:d.get('tag'),quantity:Number(d.get('quantity')),color:d.get('color')};
    $('#live-card').innerHTML=cardView(c,at,true);
  }
  if(form.id==='board-form'){
    const cell=$('.space.selected');if(cell){cell.style.background=d.get('color');cell.querySelector('strong').textContent=d.get('label');cell.querySelector('.space-symbol').textContent=d.get('kind')==='home'?'⌂':d.get('kind')==='landmark'?'✦':'·';}
  }
}
async function chooseTab(tab){if(tab===S.tab)return;if(!allowDiscard())return;S.dirty=false;S.remote=null;S.tab=tab;await refresh();}
function openNew(){if(!allowDiscard())return;$('#new-name').value='';$('#new-template').value='blank';$('#new-dialog').showModal();$('#new-name').focus();}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>chooseTab(b.dataset.tab).catch(e=>toast(e.message,true))));
$('#new-project').addEventListener('click',openNew);$('#new-project-side').addEventListener('click',openNew);
$('#close-new').addEventListener('click',()=>$('#new-dialog').close());
$('#new-template').addEventListener('change',()=>{if(!$('#new-name').value&&$('#new-template').value==='lantern-circuit')$('#new-name').value='Lantern Circuit · my edition';});
$('#new-form').addEventListener('submit',async event=>{
  event.preventDefault();if(S.busy)return;const form=event.currentTarget;if(!form.reportValidity())return;
  S.busy=true;status();try{const d=new FormData(form);await api('/api/projects',{name:d.get('name'),template:d.get('template')});$('#new-dialog').close();S.tab='overview';S.cell=12;S.cardId=null;await refresh();toast('New game saved. Make it yours.');}catch(error){toast(error.message,true);}finally{S.busy=false;status();}
});
$('#project-list').addEventListener('click',async event=>{
  const b=event.target.closest('[data-project]');if(!b||!allowDiscard())return;
  try{await api('/api/session',{projectId:b.dataset.project,revision:S.workspace.sessionRevision});S.cardId=null;S.cell=12;await refresh();toast('Opened saved game.');}catch(error){toast(error.message,true);if(error.code==='REVISION_CONFLICT'){S.remote=await api('/api/workspace');status();}}
});
$('#export-top').addEventListener('click',()=>createExport('html'));
$('#reload-latest').addEventListener('click',()=>refresh().catch(error=>toast(error.message,true)));
$('#content').addEventListener('input',event=>{const form=event.target.closest('[data-editor]');if(form){dirty();previewForm(form);}});
$('#content').addEventListener('change',event=>{const form=event.target.closest('[data-editor]');if(form){dirty();previewForm(form);}});
$('#content').addEventListener('submit',async event=>{
  const form=event.target.closest('[data-editor]');if(!form)return;event.preventDefault();if(!form.reportValidity())return;
  const d=new FormData(form);
  if(form.id==='overview-form')await saveChanges({name:d.get('name'),tagline:d.get('tagline'),players:{min:Number(d.get('min')),max:Number(d.get('max'))},minutes:Number(d.get('minutes')),rules:d.get('rules')},'Game and rules saved.');
  if(form.id==='card-form'){
    const cards=structuredClone(S.p.cards);const at=cards.findIndex(c=>c.id===S.cardId);
    cards[at]={...cards[at],title:d.get('title'),tag:d.get('tag'),body:d.get('body'),quantity:Number(d.get('quantity')),color:d.get('color')};
    await saveChanges({cards},'Card saved.');
  }
  if(form.id==='board-form'){
    const b=structuredClone(S.p.board);b.cells[S.cell]={label:d.get('label'),kind:d.get('kind'),color:d.get('color')};
    const rows=Number(d.get('rows')),cols=Number(d.get('cols')),oldRow=Math.floor(S.cell/b.cols),oldCol=S.cell%b.cols;
    const newBoard=resized(b,rows,cols);S.cell=Math.min(oldRow,rows-1)*cols+Math.min(oldCol,cols-1);
    await saveChanges({board:newBoard},'Board saved.');
  }
});
$('#content').addEventListener('click',async event=>{
  const swatch=event.target.closest('[data-color]');
  if(swatch){const input=document.getElementById(swatch.dataset.target);input.value=swatch.dataset.color;input.dispatchEvent(new Event('input',{bubbles:true}));swatch.parentElement.querySelectorAll('.swatch').forEach(b=>b.classList.toggle('selected',b===swatch));return;}
  const b=event.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;
  if(action==='go-board'){await chooseTab('board');return;}
  if(action==='export-html'||action==='export-json'){await createExport(action==='export-html'?'html':'json');return;}
  if(action==='select-card'){if(!allowDiscard())return;S.dirty=false;S.cardId=b.dataset.card;render();return;}
  if(action==='select-cell'){if(!allowDiscard())return;S.dirty=false;S.cell=Number(b.dataset.index);render();return;}
  if(['add-card','move-card','delete-card'].includes(action)){
    if(S.dirty){toast('Save your card changes first.',true);return;}
    const cards=structuredClone(S.p.cards),at=cards.findIndex(c=>c.id===S.cardId);
    if(action==='add-card'){const c={id:crypto.randomUUID(),title:'New idea',body:'What happens when this card is played?',quantity:1,color:COLORS[cards.length%COLORS.length],tag:'Game card'};cards.push(c);S.cardId=c.id;}
    if(action==='move-card'){const to=at+Number(b.dataset.dir);if(at<0||to<0||to>=cards.length)return;const [c]=cards.splice(at,1);cards.splice(to,0,c);}
    if(action==='delete-card'){if(at<0||!window.confirm('Remove “'+cards[at].title+'” and its printed copies from this project?'))return;cards.splice(at,1);S.cardId=cards[Math.min(at,cards.length-1)]?.id||null;}
    await saveChanges({cards},action==='move-card'?'Card order saved.':action==='delete-card'?'Card removed.':'New card added.');
  }
});
$('#content').addEventListener('dragstart',event=>{const card=event.target.closest('[data-card]');if(card){event.dataTransfer.setData('text/plain',card.dataset.card);event.dataTransfer.effectAllowed='move';}});
$('#content').addEventListener('dragover',event=>{const card=event.target.closest('[data-card]');if(card){event.preventDefault();card.classList.add('dragover');}});
$('#content').addEventListener('dragleave',event=>event.target.closest('[data-card]')?.classList.remove('dragover'));
$('#content').addEventListener('drop',async event=>{
  const target=event.target.closest('[data-card]');if(!target)return;event.preventDefault();target.classList.remove('dragover');
  if(S.dirty){toast('Save your card changes before reordering.',true);return;}
  const source=event.dataTransfer.getData('text/plain'),cards=structuredClone(S.p.cards),from=cards.findIndex(c=>c.id===source),to=cards.findIndex(c=>c.id===target.dataset.card);
  if(from<0||to<0||from===to)return;const [c]=cards.splice(from,1);cards.splice(to,0,c);S.cardId=c.id;await saveChanges({cards},'Card order saved.');
});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();$('#content form[data-editor]')?.requestSubmit();}});
window.addEventListener('beforeunload',event=>{if(S.dirty){event.preventDefault();event.returnValue='';}});
async function poll(){
  try{
    if(S.token&&!S.busy){
      const w=await api('/api/workspace');S.offline=false;
      const changed=w.activeProjectId!==S.p?.id||w.project?.revision!==S.p?.revision||w.sessionRevision!==S.workspace?.sessionRevision;
      if(changed){if(S.dirty){S.remote=w;status();}else{S.workspace=w;S.p=w.project;S.remote=null;render();}}
    }
  }catch{S.offline=true;status();}
  setTimeout(poll,1500);
}
async function boot(){
  try{const h=await api('/api/health');if(h.app!=='im-board-games')throw new Error('The host opened a different app.');S.token=h.token;await refresh();poll();}
  catch(error){$('#content').innerHTML='<div class="loading-panel"><h2>The workshop is not connected.</h2><p>'+e(error.message)+'</p><p>Open this app from your local I’m-Ditto host, then refresh this page.</p></div>';S.offline=true;status();}
}
boot();
})();
