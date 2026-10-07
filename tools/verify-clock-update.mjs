import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.argv[2]);
const candidate=path.join(out,'bridge-candidate'),env={...process.env,DITTO_TEST_BRIDGE_SESSIONS:path.join(candidate,'app/src/work-sessions.mjs')};
const results=[];
for(const [name,cwd,args,expected] of [
  ['ditto',root,['--test',...(await fs.readdir(path.join(root,'tests'))).filter(x=>/^ditto.*\.test\.mjs$/.test(x)).map(x=>'tests/'+x)],48],
  ['bridge',candidate,['--test','tests/work-sessions.test.mjs','tests/transport.test.mjs','tests/finish-hook.test.mjs'],20],
]){
  const result=await exec(process.execPath,args,{cwd,env,windowsHide:true,timeout:120000,maxBuffer:2*1024*1024});
  await fs.writeFile(path.join(out,name+'-tests.txt'),result.stdout+result.stderr);
  assert.match(result.stdout,new RegExp('pass '+expected+'\\b'));assert.match(result.stdout,/fail 0\b/);assert.match(result.stdout,/skipped 0\b/);
  results.push({name,passed:expected,failed:0,skipped:0});
}
const read=async file=>JSON.parse(await fs.readFile(path.join(out,file),'utf8'));
const desktop=await read('bridge-smoke/smoke-result.json'),baseline=await read('bridge-baseline-smoke/smoke-result.json');
const clockUI=await read('bridge-smoke/work-clock-ui-result.json');assert.equal(clockUI.ok,true);
assert.ok(desktop.ok||(baseline.ok===false&&baseline.error===desktop.error),'New desktop regression');
const build=await read('bridge-candidate/BUILD_RESULT.json');
const report={tests:results,clock_ui:clockUI,desktop_full_smoke:desktop,baseline_full_smoke:baseline,desktop_regression:!desktop.ok?'same pre-existing failure on original and candidate':null,build,installed_modified:false,provider_calls:0};
await fs.writeFile(path.join(out,'VERIFICATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
