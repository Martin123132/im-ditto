import test from 'node:test';
import assert from 'node:assert/strict';
import {mountReplyClocks} from '../ditto/ui/reply-clocks.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Element{
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.textContent='';}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  prepend(...children){for(const child of children)child.parent=this;this.children.unshift(...children);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(){}
  get options(){return this.children;}
  querySelector(selector){for(const child of this.children){if(selector[0]==='.'?child.className===selector.slice(1):child.tag===selector)return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;}
}
const row={display_id:'a'.repeat(64),period:1,phase:'working',remaining_seconds:1200,last_seen_at:'2026-01-01T12:00:00Z',checkpoint:null};
function fixture(t,api){
  t.mock.timers.enable({apis:['setInterval']});
  const main=new Element('main'),document={hidden:false,createElement:tag=>new Element(tag),querySelector:()=>main};
  const dispose=mountReplyClocks({api,document});t.after(dispose);
  return {main,document,dispose,poll:async()=>{t.mock.timers.tick(5000);await tick();}};
}
test('clock polls preserve unchanged details and selection while countdown and handovers update',async t=>{
  let feed={status:'connected',server_time:'first',sessions:[{...row}]};
  const f=fixture(t,async()=>feed);await tick();const container=f.main.children[0],panel=container.querySelector('div');
  const description=panel.querySelector('.clock-description');
  feed={...feed,server_time:'second',sessions:[{...row,remaining_seconds:1100}]};await f.poll();
  assert.equal(panel.querySelector('.clock-description'),description);
  assert.match(container.querySelector('summary').textContent,/19 min left/);
  feed.sessions[0].checkpoint={period:1,at:'2026-01-01T12:01:00Z'};await f.poll();
  assert.notEqual(panel.querySelector('.clock-description'),description);
  assert.ok(panel.querySelector('.clock-description').children.some(el=>el.textContent.includes('Handover recorded')));
  feed.sessions.push({...row,display_id:'b'.repeat(64)});await f.poll();
  const select=panel.querySelector('select');select.value=row.display_id;select.onchange();await tick();
  feed.server_time='third';await f.poll();
  assert.equal(panel.querySelector('select'),select);assert.equal(select.value,row.display_id);
  feed={status:'protected',sessions:[]};await f.poll();
  assert.equal(panel.querySelector('select'),null);assert.match(container.querySelector('summary').textContent,/Protected/);
  assert.ok(!panel.querySelector('.clock-description').children.some(el=>el.textContent.includes('Last Bridge contact')));
});
test('slow polls never overlap and disposed panels ignore pending responses',async t=>{
  let calls=0,resolve;
  const f=fixture(t,()=>{calls++;return new Promise(r=>resolve=r);});
  const container=f.main.children[0],panel=container.querySelector('div');
  await f.poll();await f.poll();assert.equal(calls,1);
  f.dispose();resolve({status:'connected',sessions:[row]});await tick();
  assert.equal(f.main.children.length,0);assert.equal(panel.children.length,0);
  await f.poll();assert.equal(calls,1);
});
test('hidden dashboards skip polls and failed polls recover',async t=>{
  let calls=0;
  const f=fixture(t,async()=>{calls++;if(calls===1)throw Error('Unavailable');return {status:'connected',sessions:[row]};});
  await tick();assert.match(f.main.children[0].querySelector('summary').textContent,/unavailable/);
  f.document.hidden=true;await f.poll();assert.equal(calls,1);
  f.document.hidden=false;await f.poll();assert.equal(calls,2);
  assert.match(f.main.children[0].querySelector('summary').textContent,/20 min left/);
});
