import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startHost} from '../ditto/server.mjs';
import {recipes,creatorWalkthrough} from '../ditto/ui/recipes.mjs';

test('creator-first landing and module routes work before any example is installed', async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ditto-creator-first-'));
  const host=await startHost({profile,port:0});
  try{
    const html=await (await fetch(host.url)).text();
    assert.match(html,/<section id="creator"[^>]*aria-labelledby="creator-title">/);
    assert.doesNotMatch(html,/<section id="creator"[^>]*\bhidden\b/);
    for(const id of ['learn','library','welcome'])assert.match(html,new RegExp('<section id="'+id+'"[^>]*\\bhidden\\b'));
    for(const label of ['Make my I’m','How to Ditto','My I’ms','Connection'])assert.ok(html.includes(label));
    assert.match(html,/<script type="module" src="\/app.js">/);
    assert.match(html,/id="creator-walkthrough-open"/);
    const module=await fetch(host.url+'/recipes.mjs');assert.equal(module.status,200);
    assert.match(module.headers.get('content-type'),/javascript/);
    assert.match(await module.text(),/export const recipes=/);
    assert.equal((await host.manager.list()).length,0);
    const made=await fetch(host.url+'/api/creator',{method:'POST',headers:{'content-type':'application/json','x-ditto-owner':host.ownerToken},body:JSON.stringify({name:'My rehearsal desk',brief:'Keep a set list and practice notes, let me and my AI edit them, and export a session plan.'})});
    assert.equal(made.status,201);const draft=await made.json();
    assert.equal(draft.status,'awaiting-build');assert.equal(draft.name,'My rehearsal desk');
    const brief=JSON.parse(await fs.readFile(draft.briefFile,'utf8'));
    assert.match(brief.job,/set list/);assert.ok(draft.prompt.includes(draft.briefFile));
    assert.equal((await host.manager.list()).length,0);
  }finally{await host.close();}
});

test('creation walkthrough teaches the method without adding another catalogue app',()=>{
  assert.equal(creatorWalkthrough.appId,undefined);
  assert.equal(creatorWalkthrough.brief,'Keep a set list and practice notes, let me and my AI edit them, and export a session plan.');
  assert.equal(creatorWalkthrough.steps.length,5);
  assert.match(creatorWalkthrough.evidence,/not a clean-machine/);
  assert.match(creatorWalkthrough.evidence,/not inside an OS sandbox/);
  assert.ok(!recipes.some(recipe=>recipe.id===creatorWalkthrough.id));
});

test('worked examples are three adaptable stories, not a required installed catalogue',()=>{
  assert.deepEqual(recipes.map(x=>x.id),['bridge','studio','board']);
  assert.deepEqual(recipes.filter(x=>x.appId).map(x=>x.appId),['im-studio','im-board-games']);
  for(const recipe of recipes){
    assert.ok(recipe.brief.length>=10 && recipe.brief.length<=4000);
    assert.ok(recipe.variation.length>=2 && recipe.variation.length<=80);
    assert.ok(recipe.steps.length>=3);assert.ok(recipe.evidence.length>100);
    assert.match(recipe.button,/^Adapt/);
  }
  assert.match(recipes[1].evidence,/not a continuous recording/);
  assert.match(recipes[2].evidence,/not the verbatim chat/);
  assert.match(recipes[0].evidence,/not a third bundle/);
});
