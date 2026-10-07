import {spawn} from 'node:child_process';

export function openDashboard(url,{spawnProcess=spawn}={}){
  return new Promise((resolve,reject)=>{
    const child=spawnProcess('powershell.exe',[
      '-NoProfile','-NonInteractive','-Command',
      "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:DITTO_DASHBOARD_URL",
    ],{
      shell:false,windowsHide:true,stdio:['ignore','ignore','inherit'],
      env:{...process.env,DITTO_DASHBOARD_URL:url},
    });
    child.once('error',error=>reject(new Error('Could not open the browser. Open '+url+' manually.',{cause:error})));
    child.once('close',(code,signal)=>{
      if(code===0)resolve();
      else reject(new Error('Could not open the browser ('+(signal||'exit '+code)+'). Open '+url+' manually.'));
    });
  });
}
