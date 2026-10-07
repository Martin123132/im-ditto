'use strict';
import {recipes,creatorWalkthrough} from './recipes.mjs';
import {mountReplyClocks} from './reply-clocks.mjs';
let token,state,selected,setup,startAfterInstall=false,waiting=false,creatorDraft=null,creating=false;
const $=s=>document.querySelector(s),status=t=>{$('#status').textContent=t;$('#creator-feedback').textContent=t;};
async function api(route,body){const r=await fetch(route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-ditto-owner':token||''},body:body?JSON.stringify(body):undefined});const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
async function act(task){try{status('Working…');await task();await refresh();if($('#status').textContent==='Working…')status('Ready.');}catch(e){status(e.message);}}
function button(label,fn,cls=''){const b=node('button',label,cls);b.onclick=()=>act(fn);return b;}
function showView(view){
  for(const id of ['creator','learn','library','welcome'])$('#'+id).hidden=id!==view;
  for(const [id,panel] of [['creator-open','creator'],['learn-open','learn'],['library-open','library'],['welcome-open','welcome']]){
    if(panel===view)$('#'+id).setAttribute('aria-current','page');else $('#'+id).removeAttribute('aria-current');
  }
  window.scrollTo({top:0,behavior:'smooth'});
}
function showRecipe(recipe){
  const body=$('#review-body');body.replaceChildren(node('p',recipe.summary));
  for(const [title,description] of recipe.steps)body.append(node('h3',title),node('p',description));
  body.append(node('h3','A starting brief you can change'),node('p',recipe.briefLabel||'Reconstructed from the build record—not a verbatim chat transcript.','meta'),node('pre',recipe.brief),node('p',recipe.evidence,'meta'));
  const actions=node('div',undefined,'actions');
  actions.append(button(recipe.button,async()=>{
    $('#review').close();showView('creator');$('#creator-name').value=recipe.variation;$('#creator-brief').value=recipe.brief;
    status('Starting brief copied into your form. Change it to fit your job, then prepare your own I’m. Nothing was created or installed.');
    $('#creator-form').scrollIntoView({behavior:'smooth'});$('#creator-brief').focus();
  },'primary'));
  const example=state.catalogue.find(m=>m.id===recipe.appId);
  if(example)actions.append(button('Review finished example instead',async()=>{
    $('#review').close();const installed=state.apps.some(m=>m.id===example.id&&m.installed);
    if(installed){showView('library');status('This example is already in My I’ms.');}else review(example);
  },'small'));
  body.append(actions);$('#review-name').textContent=recipe.name;$('#dialog-label').textContent='HOW THIS I’M WAS BUILT';$('#install-controls').hidden=true;$('#review').showModal();
}
function renderRecipes(){
  $('#creator-walkthrough-open').onclick=()=>showRecipe(creatorWalkthrough);
  $('#recipes').replaceChildren();
  for(const recipe of recipes){const card=node('article',undefined,'card'),content=node('div',undefined,'content');content.append(node('p',recipe.tag,'eyebrow'),node('h2',recipe.name),node('p',recipe.summary),button('See how it was built',async()=>showRecipe(recipe),'primary'));card.append(content);$('#recipes').append(card);}
}
function show(title,content,label='WORKSPACE GUIDE'){$('#review-name').textContent=title;$('#review-body').replaceChildren(node('pre',content));$('#dialog-label').textContent=label;$('#install-controls').hidden=true;$('#review').showModal();}
function review(m,start=false){
  selected=m;startAfterInstall=start;$('#review-name').textContent=m.name+' · '+m.version;$('#dialog-label').textContent='REVIEW BEFORE INSTALLING';
  const body=$('#review-body');
  body.replaceChildren(node('p',m.description),node('pre','Declared access:\n'+m.permissions.join('\n')+'\n\nDependencies: '+m.dependencies.join(', ')+'\n\nPackage SHA-256:\n'+m.sha256+'\n\nIntegrity checks detect changed bytes. They do not prove who authored code or make it safe.'));
  if(m.source==='creator'){
    body.append(node('p',m.warning,'attention'),node('h3','Files in this package'),node('pre',m.files.map(f=>f.path+' · '+f.bytes+' bytes').join('\n')));
    if(m.updateReport)body.append(node('h3','AI update report — unverified claims'),node('pre',m.updateReport));
    body.append(node('h3',m.updateReport?'Original build report — unverified claims':'AI build report — unverified claims'),node('pre',m.report||'No build report supplied. Ask your AI what it tested and review the source before trusting it.'));
  }
  $('#install-controls').hidden=false;$('#trust').checked=false;$('#confirm-install').disabled=true;$('#confirm-install').textContent=start?'Install and start workspace':'Install this version';$('#review').showModal();
}
async function refresh(){
  state=await api('/api/state');$('#profile').textContent='Your saved work: '+state.profile;$('#count').textContent=state.apps.filter(a=>a.installed).length+' installed';
  const all=new Map();for(const m of state.catalogue){const old=all.get(m.id);if(!old||m.version.localeCompare(old.version,undefined,{numeric:true})>0)all.set(m.id,m);}
  for(const m of state.apps)if(!all.has(m.id))all.set(m.id,m);
  $('#apps').replaceChildren();
  for(const m of all.values()){
    const installed=state.apps.find(a=>a.id===m.id&&a.installed),running=installed?.running==='running';
    if(!installed)continue;
    const card=node('article',undefined,'card'),cover=node('div',undefined,'cover');cover.append(node('span',m.id==='im-studio'?'▥':m.id==='im-board-games'?'⚄':'✦','symbol'),node('span',running?'OPEN':installed?'READY':'AVAILABLE','badge'));
    const content=node('div',undefined,'content');content.append(node('h2',m.name),node('p',m.description),node('div','Version '+(installed?.version||m.version)+' · '+m.dependencies.join(' + '),'meta'));
    const actions=node('div',undefined,'actions');
    if(!installed)actions.append(button('Review & install',async()=>review(m),'primary'));
    else{
      if(running){const link=node('a','Open workspace','button primary');link.href=installed.url;link.target='_blank';link.rel='noopener';actions.append(link);}
      else actions.append(button('Start workspace',async()=>{await api('/api/apps/'+m.id+'/start',{});status(m.name+' is ready. Select Open workspace.');},'primary'));
      actions.append(button('AI instructions',async()=>show(m.name,(await api('/api/apps/'+m.id+'/instructions')).instructions),'small'));
      actions.append(button('Connect my AI',async()=>{await choose(m.id,setup?.route==='local'?'codex':setup?.route||'codex');await openWelcome();},'small'));
      if(running)actions.append(button('Stop',async()=>{await api('/api/apps/'+m.id+'/stop',{});status('App stopped. Your work is saved.');},'small'));
      else{
        if(m.sha256&&m.sha256!==installed.active)actions.append(button('Review update',async()=>review(m),'small'));
        if(installed.previous?.length)actions.append(button('Rollback',async()=>{await api('/api/apps/'+m.id+'/rollback',{});status('Previous app release restored. Saved work kept.');},'small'));
        actions.append(button('Remove',async()=>{await api('/api/apps/'+m.id+'/remove',{});status('Removed from your apps. Projects and releases are retained.');},'small'));
      }
    }
    content.append(actions);card.append(cover,content);$('#apps').append(card);
  }
  $('#library-empty').hidden=state.apps.some(a=>a.installed);
  renderRecipes();
  await refreshSetup(true);
  if(!$('#creator').hidden)await refreshCreator();
}
$('#trust').onchange=()=>{$('#confirm-install').disabled=!$('#trust').checked;};
$('#confirm-install').onclick=()=>act(async()=>{const m=selected;await api(m.source==='creator'?'/api/creator/'+m.draftId+'/install':'/api/install',{sha256:m.sha256,trust:m.sha256});$('#review').close();showView('library');if(startAfterInstall)await api('/api/apps/'+m.id+'/start',{});status(m.name+(startAfterInstall?' is open and ready.':' installed. Start it from My I’ms when you’re ready.'));});
$('#refresh').onclick=()=>act(refresh);
async function openWelcome(){await api('/api/setup/reopen',{});showView('welcome');await refreshSetup(true);}
$('#welcome-open').onclick=()=>act(openWelcome);
$('#learn-open').onclick=$('#learn-from-home').onclick=$('#library-learn').onclick=()=>showView('learn');
$('#library-open').onclick=()=>showView('library');
$('#learn-create').onclick=$('#library-create').onclick=()=>{showView('creator');$('#creator-form').scrollIntoView({behavior:'smooth'});$('#creator-name').focus();};
function external(label,url){const a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
async function choose(appId,route){waiting=false;$('#setup-prompt-area').hidden=true;await api('/api/setup/select',{appId,route});}
async function refreshSetup(force=false){
  const next=await api('/api/setup');if(force||JSON.stringify(next)!==JSON.stringify(setup)){setup=next;renderSetup();}
}
function renderSetup(){
  const app=setup.app,open=app?.running==='running',verified=setup.verification?.current;
  $('#step-choose').classList.toggle('done',!!setup.appId);$('#step-open').classList.toggle('done',open);$('#step-connect').classList.toggle('done',open&&(setup.route==='local'||verified));
  $('#welcome-choices').replaceChildren();
  const latest=new Map();
  for(const m of state.apps)if(m.installed)latest.set(m.id,m);
  $('#connection-empty').hidden=latest.size>0;
  for(const m of latest.values()){
    const studio=m.id==='im-studio',board=m.id==='im-board-games',b=button('',async()=>{await choose(m.id,setup.route);await api('/api/setup/check',{});},'workspace-choice');
    b.setAttribute('aria-pressed',String(setup.appId===m.id));b.append(node('span',studio?'02 / MAKE A FILM':board?'03 / MAKE A GAME':'YOUR CREATION','eyebrow'),node('strong',m.name),node('span',studio?'Pictures + music → a real video. Needs FFmpeg.':board?'Rules + cards → a printable prototype. Nothing extra to install.':m.description,'choice-detail'));$('#welcome-choices').append(b);
  }
  $('#welcome-readiness').hidden=!latest.has(setup.appId);$('#welcome-connect').hidden=!open;$('#welcome-finish').hidden=!open;
  if(!latest.has(setup.appId))return;
  const m=latest.get(setup.appId);$('#setup-app-name').textContent=m?.name||setup.appId;
  const checks=setup.checks,rows=$('#setup-dependencies');rows.replaceChildren();
  if(checks){for(const [name,result] of Object.entries(checks.dependencies)){const row=node('p',undefined,'dependency');row.append(node('span',result.ok?'Ready':'Needs attention',result.ok?'good':'attention'),node('span',name+(result.ok?' · '+result.version:' · not found')));rows.append(row);}
    rows.append(node('p','Checked '+new Date(checks.checkedAt).toLocaleTimeString()+'. This only inspects local prerequisites; it installs nothing.','meta'));
    if(!checks.ok){const p=node('p','This workspace is missing a declared prerequisite. FFmpeg and FFprobe must be available on PATH if required. After installing them, fully stop/relaunch I’m-Ditto so it sees the new PATH. ');p.append(external('Official FFmpeg download options','https://ffmpeg.org/download.html'));rows.append(p);}
  }else rows.append(node('p','Check your setup before opening this workspace.'));
  const actions=$('#setup-launch');actions.replaceChildren();
  if(open){const a=node('a','Open workspace','button primary');a.href=app.url;a.target='_blank';a.rel='noopener';actions.append(a,node('span','Local workspace ready.','ready-label'));}
  else if(app)actions.append(button('Start my workspace',async()=>{await api('/api/apps/'+app.id+'/start',{});status('Your workspace is ready.');},'primary'));
  else{const b=button('Review & open this I’m',async()=>review(m,true),'primary');b.disabled=!checks?.ok;actions.append(b);}
  $('#setup-routes').replaceChildren();
  for(const [id,label] of [['local','Just me for now'],['bridge','My ChatGPT already has Bridge'],['codex','I use Codex on this PC'],['new-bridge','I need to connect ChatGPT']]){const b=button(label,async()=>{await choose(setup.appId,id);});b.setAttribute('aria-pressed',String(id===setup.route));$('#setup-routes').append(b);}
  const guide=$('#setup-guide');guide.replaceChildren();
  if(setup.route==='local')guide.append(node('p','You’re ready to use the buttons and make your first project. AI is optional. Come back to Connection whenever you want to connect it.'));
  else{
    if(setup.route==='new-bridge'){
      guide.append(node('p','This preview uses PC Bridge to connect ChatGPT to your Windows workspace. It does not contain an AI subscription or create the connection for you.'));
      const list=node('ol');for(const line of ['Install/open PC Bridge, then use its Connect ChatGPT wizard. Keep its tunnel credentials inside Bridge—not in chat.','Finish the owner-controlled connection in ChatGPT. Availability depends on your account/workspace settings.','In Bridge, share the I’m-Ditto folder shown below, and allow the finite command through its normal access controls. Then generate the check prompt here.'])list.append(node('li',line));guide.append(list,external('PC Bridge setup guide','https://github.com/Martin123132/PC-Bridge/blob/main/docs/CHATGPT_SETUP.md'),node('span',' · '),external('OpenAI connection guide','https://developers.openai.com/plugins/deploy/connect-chatgpt'));
    }else guide.append(node('p',setup.route==='bridge'?'Use your existing connected Bridge chat. Its authorized project must include this I’m-Ditto folder; the prompt will not grant access or change Bridge settings.':'Open this I’m-Ditto folder as a local Codex project, then paste the check prompt. No Bridge tunnel is needed for local Codex.'));
    guide.append(node('pre',setup.root),button('Create connection-check prompt',async()=>{const p=await api('/api/setup/prompt',{});$('#setup-prompt').value=p.prompt;$('#prompt-expiry').textContent='One check · expires '+new Date(p.expiresAt).toLocaleTimeString()+'. No secret or new permission is included.';$('#setup-prompt-area').hidden=false;waiting=true;status('Paste the prompt into your AI chat. This page will notice the successful check.');},'primary'));
  }
  const cs=$('#setup-connection-status');
  cs.textContent=setup.route==='local'?'AI connection: not requested.':verified?'Connection checked at '+new Date(setup.verification.verifiedAt).toLocaleTimeString()+'. The local command inspected this workspace successfully.':setup.verification?'Previously checked. Check again for this workspace session.':'Not checked yet. Copying the prompt does not confirm access.';
  cs.className=verified?'good':'meta';
  if(verified){waiting=false;$('#prompt-expiry').textContent='Check received. This confirms access at that time, not a continuously online AI.';}
  const studio=setup.appId==='im-studio',board=setup.appId==='im-board-games';$('#first-output-title').textContent=studio?'Your first music video.':board?'Your first tabletop prototype.':'Try your new workspace.';
  $('#first-output-recipe').textContent=studio?'Open the separate Neon Atlas demo, change a caption, then export an MP4. Your personal Studio projects are not imported or changed.':board?'Open Lantern Circuit, change a card or rule, then use its printable export. Save it before printing. Your AI can make later changes to this same project.':'Try one small job with test data first. Your AI can read this I’m’s instructions and use its finite commands against the same saved work you see here.';
  $('#first-output-link').href=app?.url||'#';$('#finish-setup').disabled=!open||(setup.route!=='local'&&!verified);
}
function selectDraft(d){creatorDraft=d;$('#creator-result').hidden=false;$('#creator-result-title').textContent=d.name;$('#creator-prompt').value=d.prompt;$('#creator-paths').textContent='Editable source: '+d.source+'\nBrief: '+d.briefFile+'\nFinished package: '+d.output;$('#creator-stage').textContent=d.status==='installed'?'Installed. Open My I’ms to start it.':d.status==='reviewed'?'Previously reviewed. Check again if the AI changed the package.':'Starter prepared. Waiting for your AI to build the actual workspace.';}
async function refreshCreator(){const {drafts}=await api('/api/creator');const list=$('#creator-drafts');list.replaceChildren();if(!drafts.length)list.append(node('p','No builds yet. Your first idea starts above.'));for(const d of [...drafts].reverse()){const row=node('div',undefined,'creator-row');row.append(node('strong',d.name),node('span',d.status==='installed'?'Installed':d.status==='reviewed'?'Reviewed, not necessarily installed':'Awaiting build','meta'),button('Open build prompt',async()=>{selectDraft(d);$('#creator-result').scrollIntoView({behavior:'smooth'});},'small'));list.append(row);}if(creatorDraft){const current=drafts.find(d=>d.id===creatorDraft.id);if(current)selectDraft(current);}}
$('#creator-open').onclick=()=>act(async()=>{showView('creator');await refreshCreator();});
$('#creator-close').onclick=()=>showView('library');
$('#creator-form').onsubmit=e=>{e.preventDefault();if(creating)return;creating=true;$('#creator-create').disabled=true;void act(async()=>{const d=await api('/api/creator',{name:$('#creator-name').value,brief:$('#creator-brief').value});selectDraft(d);$('#creator-form').reset();status('Starter prepared. Copy the prompt to your AI; nothing has been built or installed yet.');$('#creator-result').scrollIntoView({behavior:'smooth'});}).finally(()=>{creating=false;$('#creator-create').disabled=false;});};
$('#creator-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#creator-prompt').value);status('Build prompt copied. Paste it into your existing AI chat with access to this folder.');}catch{$('#creator-prompt').focus();$('#creator-prompt').select();status('Select and copy the build prompt manually.');}};
$('#creator-review').onclick=()=>act(async()=>{if(!creatorDraft)throw Error('Choose a build first.');review(await api('/api/creator/'+creatorDraft.id+'/review',{}));status('Package structure and hashes checked. Review its source, access and reported tests before trusting it.');});
$('#setup-check').onclick=()=>act(async()=>{await api('/api/setup/check',{});status('Prerequisite check complete.');});
$('#copy-prompt').onclick=async()=>{try{await navigator.clipboard.writeText($('#setup-prompt').value);status('Prompt copied. Paste it into your AI chat.');}catch{ $('#setup-prompt').focus();$('#setup-prompt').select();status('Select and copy the prompt manually; clipboard access was unavailable.');}};
$('#check-connection').onclick=()=>act(refreshSetup);
$('#finish-setup').onclick=()=>act(async()=>{await api('/api/setup/finish',{});waiting=false;showView('library');status('You’re set. Your workspace and setup choices are saved.');});
setInterval(()=>{if(waiting&&!document.hidden)refreshSetup().catch(e=>{waiting=false;status('Connection check interrupted: '+e.message);});},3000);
$('#quit').onclick=async()=>{try{await api('/api/stop',{});status('I’m-Ditto stopped. Reopen it with the launcher.');$('#quit').disabled=true;}catch(e){status(e.message);}};
api('/api/session').then(x=>{token=x.ownerToken;mountReplyClocks({api});return refresh();}).catch(e=>status(e.message));
