export function clockText(feed,row){
  if(feed?.status==='protected')return 'Protected mode · clock details hidden';
  if(feed?.status==='disabled')return 'Reply clock guidance is off';
  if(feed?.status==='waiting')return 'Waiting for a Bridge reply';
  if(!row)return 'Bridge reply clocks · unavailable';
  const names={awaiting_message:'Waiting for reply marker · advisory only',yielded:'Reply finished',report_due:'Reply period ended · report requested',checkpoint_due:'Handover requested',wrap_up:'Wrapping up',disabled:'Reply clock guidance is off'};
  if(names[row.phase])return names[row.phase];
  return 'This reply · '+Math.ceil(row.remaining_seconds/60)+' min left';
}
export function mountReplyClocks({api,document=globalThis.document}){
  const container=document.createElement('details');container.className='reply-clocks';container.id='reply-clocks';
  const summary=document.createElement('summary');summary.textContent='Bridge reply clocks';container.append(summary);
  const panel=document.createElement('div');panel.className='clock-panel';container.append(panel);
  const notice=document.createElement('span');notice.className='sr-only';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');container.append(notice);
  document.querySelector('main').prepend(container);
  let selected=null,pending=false,previousNotice='';
  const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
  async function refresh(){
    if(pending||document.hidden)return;pending=true;
    let feed;try{feed=await api('/api/bridge/clocks');}catch{feed={status:'disconnected',sessions:[]};}finally{pending=false;}
    const rows=feed.sessions||[];
    if(!rows.some(r=>r.display_id===selected))selected=rows.length===1?rows[0].display_id:null;
    const row=rows.find(r=>r.display_id===selected);
    summary.textContent=rows.length>1&&!row?`${rows.length} Bridge chats · choose a reply clock`:clockText(feed,row);
    const notification=[feed.status,row?.display_id,row?.period,row?.phase].join(':');
    if(previousNotice&&notification!==previousNotice)notice.textContent=summary.textContent;
    previousNotice=notification;
    // Keep the select element focused during polling; only rebuild options when identities change.
    let select=panel.querySelector('select');
    if(rows.length>1){
      if(!select){const label=el('label','Reply clock');label.htmlFor='clock-choice';select=document.createElement('select');select.id='clock-choice';select.onchange=()=>{selected=select.value||null;void refresh();};panel.prepend(label,select);}
      const keys=rows.map(r=>r.display_id).sort().join();
      if(select.dataset.keys!==keys){select.replaceChildren();const prompt=el('option','Choose a chat');prompt.value='';select.append(prompt);for(const r of [...rows].sort((a,b)=>a.display_id.localeCompare(b.display_id))){const option=el('option','Bridge chat '+r.display_id.slice(0,6)+' · reply '+r.period);option.value=r.display_id;select.append(option);}select.dataset.keys=keys;}
      for(const option of select.options){const r=rows.find(r=>r.display_id===option.value);if(r)option.textContent='Bridge chat '+r.display_id.slice(0,6)+' · reply '+r.period;}
      select.value=selected||'';
    }else if(select){panel.querySelector('label')?.remove();select.remove();}
    panel.querySelector('.clock-description')?.remove();const description=el('div','');description.className='clock-description';
    description.append(el('p',feed.message||'25 minutes per reply to a new message. Calls and reconnects within that reply keep its deadline. No manual unlock needed.'));
    if(row){description.append(el('p','Last Bridge contact: '+new Date(row.last_seen_at).toLocaleString()+'. This is not proof the AI is still thinking.'));
      description.append(el('p',row.checkpoint?`Handover recorded for reply ${row.checkpoint.period} at ${new Date(row.checkpoint.at).toLocaleTimeString()}${row.checkpoint.period!==row.period?' (an earlier reply)':''}. Read its notes in Bridge’s Chat work clocks.`:'No handover recorded for this chat yet.'));
    }
    description.append(el('p','20 min: wrap up · 23 min: save handover · 25 min: report back. The AI marks each reply; missing markers are advisory. These clocks are shared Bridge chat activity, not automatically matched to an I’m. No notes or controls are shared with installed I’ms.'));
    panel.append(description);
  }
  void refresh();const timer=setInterval(()=>void refresh(),5000);
  return ()=>{clearInterval(timer);container.remove();};
}
