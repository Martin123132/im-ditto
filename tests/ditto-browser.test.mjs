import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {openDashboard} from '../ditto/browser.mjs';

test('dashboard uses the Windows URL handler and waits for its result',async()=>{
  const child=new EventEmitter(),url='http://127.0.0.1:58818';
  let settled=false;
  const opening=openDashboard(url,{spawnProcess:(command,args,options)=>{
    assert.equal(command,'powershell.exe');
    assert.deepEqual(args.slice(0,3),['-NoProfile','-NonInteractive','-Command']);
    assert.match(args[3],/Start-Process -FilePath \$env:DITTO_DASHBOARD_URL/);
    assert.match(args[3],/\$ErrorActionPreference='Stop'/);
    assert.ok(!args.includes(url));
    assert.equal(options.env.DITTO_DASHBOARD_URL,url);
    // process.env is case-insensitive on Windows; a spread object is not.
    const pathKey=Object.keys(process.env).find(key=>key.toLowerCase()==='path');
    assert.ok(pathKey && options.env[pathKey]===process.env[pathKey],'Inherited Windows path is preserved');
    assert.equal(options.shell,false);
    assert.equal(options.windowsHide,true);
    assert.deepEqual(options.stdio,['ignore','ignore','inherit']);
    return child;
  }}).then(()=>{settled=true;});
  await Promise.resolve();
  assert.equal(settled,false);
  child.emit('close',0,null);
  await opening;
  assert.equal(settled,true);
});

test('browser failures report the dashboard URL rather than succeeding silently',async t=>{
  const url='http://127.0.0.1:58818';
  for(const [name,event,args] of [
    ['nonzero exit','close',[1,null]],
    ['terminated process','close',[null,'SIGTERM']],
    ['missing executable','error',[Object.assign(new Error('not found'),{code:'ENOENT'})]],
  ])await t.test(name,async()=>{
    const child=new EventEmitter();
    const opening=openDashboard(url,{spawnProcess:()=>child});
    const rejected=assert.rejects(opening,error=>{
      assert.match(error.message,/Could not open the browser/);
      assert.ok(error.message.includes(url));
      if(event==='error')assert.equal(error.cause,args[0]);
      return true;
    });
    child.emit(event,...args);
    await rejected;
  });
});
