'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {startServer}=require('./src/server');
const {StudioClient}=require('./studio');
exports.start=async function({dataRoot,packageRoot,port=0,instanceId}){
  if(process.env.IM_DITTO_DATA_ROOT!==dataRoot)throw Error('The host must assign the exact data root.');
  const app=await startServer({root:dataRoot,port,quiet:true,instanceId});
  try {
    if(app.studio.list().projects.length===0){
      const client=new StudioClient(app.url);await client.connect();
      let p=await client.request('/api/projects',{method:'POST',body:{name:'Neon Atlas'}});
      const files=['01-signal.png','02-pulse.png','03-orbit.png','04-spectrum.png','05-horizon.png','neon-atlas-original.wav'];
      for(const name of files)p=await client.importFile(p.id,p.revision,path.join(packageRoot,'demo-assets',name),name.endsWith('.wav')?'audio':'image');
      const captions=['SOUND BECOMES PICTURE','LIGHT FINDS A RHYTHM','FOLLOW THE ORBIT','COLOUR IN MOTION','LEAVE A SIGNAL'];
      for(let i=0;i<5;i++)p=await client.edit(p.id,p.revision,{action:'add-shot',assetId:p.assets.find(a=>a.name===files[i]).id,duration:4,caption:captions[i]});
      p=await client.edit(p.id,p.revision,{action:'set-audio',assetId:p.assets.find(a=>a.kind==='audio').id});
      await fs.writeFile(path.join(dataRoot,'welcome.json'),JSON.stringify({originalDemo:true,projectId:p.id}));
    }
    return {url:app.url,close:app.close};
  }catch(e){await app.close();throw e;}
};
