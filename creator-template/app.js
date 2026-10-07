let state,token;const $=s=>document.querySelector(s);
async function load(){const h=await (await fetch('/api/health')).json();token=h.token;state=await (await fetch('/api/project')).json();$('#name').value=state.name;$('#notes').value=state.notes;$('#status').textContent='Saved revision '+state.revision;}
$('#save').onclick=async()=>{try{const r=await fetch('/api/project',{method:'POST',headers:{'Content-Type':'application/json','x-app-token':token},body:JSON.stringify({revision:state.revision,name:$('#name').value,notes:$('#notes').value})});const b=await r.json();if(!r.ok)throw Error(b.error);state=b;$('#status').textContent='Saved revision '+state.revision;}catch(e){$('#status').textContent=e.message;}};
$('#reload').onclick=load;load();
