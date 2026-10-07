import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Manager} from '../ditto/manager.mjs';
import {loadBundle,verifyRelease} from '../ditto/package.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('second-domain package: board workshop shares the host, exports real products and retains edits',{timeout:45000},async()=>{
  const dir=path.join(root,'acceptance','board-'+randomUUID()),m=await new Manager(dir).init();
  const filename=path.join(root,'im-catalogue/im-board-games-0.1.0.impack.json'),bundle=await loadBundle(filename);
  const call=async args=>{const r=await m.call('im-board-games',args);assert.equal(r.ok,true,r.stderr);return JSON.parse(r.stdout);};
  try{
    await m.install(filename,bundle.sha256);let run=await m.start('im-board-games');
    const original=await call(['inspect']);assert.equal(original.name,'Lantern Circuit');assert.equal(original.cards.reduce((n,c)=>n+c.quantity,0),24);
    const p=await call(['create','--name','Shared workshop acceptance','--template','lantern-circuit']);
    let edited=await call(['update','--revision',String(p.revision),'--json',JSON.stringify({tagline:'Human and AI, one game'})]);
    const ui=await (await fetch(run.url+'/api/workspace')).json();assert.equal(ui.project.tagline,edited.tagline);assert.equal(ui.project.id,edited.id);
    const stale=await m.call('im-board-games',['update','--revision',String(p.revision),'--json',JSON.stringify({name:'Wrong'})]);assert.equal(stale.ok,false);assert.match(stale.stderr,/REVISION_CONFLICT/);
    edited=await call(['card','add','--title','<script>alert(1)</script>','--body','Safe printed text & characters','--quantity','1']);
    const html=await call(['export','--format','html']),json=await call(['export','--format','json']);
    const htmlResponse=await fetch(html.url),printed=await htmlResponse.text();assert.equal(htmlResponse.status,200);assert.match(printed,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(printed,/<script>/i);assert.match(printed,/@page\{size:A4 portrait/);
    assert.deepEqual(await (await fetch(json.url)).json(),edited);
    const data=path.join(dir,'workspaces/im-board-games');assert.equal((await fs.readFile(path.join(data,html.path),'utf8')),printed);
    await m.stop('im-board-games');await m.start('im-board-games');assert.deepEqual(await call(['inspect']),edited);
    await m.remove('im-board-games');await m.install(filename,bundle.sha256);await m.start('im-board-games');assert.deepEqual(await call(['inspect']),edited);
    await call(['select',original.id]);await verifyRelease(await m.release(bundle.sha256));
    await fs.writeFile(path.join(dir,'RESULT.json'),JSON.stringify({ok:true,bundle:bundle.sha256,profile:dir,html:path.join(data,html.path),json:path.join(data,json.path),sharedState:true,staleEditRejected:true,escapedPrint:true,restartAndReinstall:true,originalDemoRestored:true},null,2));
  }finally{await m.close();}
});
