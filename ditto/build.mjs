import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pack,safe} from './package.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function filesUnder(root,prefix=''){
  const out=[];for(const entry of await fs.readdir(path.join(root,prefix),{withFileTypes:true})){
    const name=prefix+entry.name;await safe(root,name);
    if(entry.isDirectory())out.push(...await filesUnder(root,name+'/'));else if(entry.isFile())out.push(name);else throw Error('Unsupported member.');
  }return out;
}
const args=process.argv.slice(2);
if(args[0]==='studio'){
  const dir=path.join(root,'ims/studio'),members=(await filesUnder(dir)).filter(x=>x!=='demo-assets/manifest.json');
  console.log(JSON.stringify(await pack(dir,members,path.join(root,'im-catalogue/im-studio-0.1.0.impack.json'))));
}else if(args[0]==='pack'){
  const dir=path.resolve(args[1]),members=(await filesUnder(dir)).filter(x=>! /^(tests|evidence|data|outputs|\.git|node_modules)\//.test(x) && !['BUILD_BRIEF.md','BUILD_REPORT.md'].includes(x));
  console.log(JSON.stringify(await pack(dir,members,path.resolve(args[2]))));
}else if(args[0]==='portable'){
  const dest=path.resolve(args[1]);try{await fs.stat(dest);throw Error('Portable output already exists. Choose a new folder.');}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.mkdir(dest,{recursive:true});
  for(const part of ['ditto','im-catalogue','creator-template','README.md','START_HERE.html','UPSTREAM_PC_BRIDGE_README.md','AGENTS.md','DITTO_TASK.md','PRODUCT_DIRECTION.md','EXAMPLE_RECIPES.md','DITTO_README.md','DITTO_CONNECT.md','DITTO_SECURITY.md','LICENSE','LICENSES','NOTICE','CREATOR_RIGHTS.md','COMMERCIAL_LICENSE.md','TRADEMARKS.md','THIRD_PARTY_NOTICES.md','package.json','Launch Im-Ditto.cmd'])await fs.cp(path.join(root,part),path.join(dest,part),{recursive:true});
  // Ship only the Ditto guide and approved tutorial, never the upstream docs tree
  // or a user's profile. The original preview archives remain immutable.
  for(const part of ['REVIEW.md','CONTRIBUTING.md','SECURITY.md','docs/SUPPORT.md','docs/PUBLIC_RELEASE_CHECKLIST.md','docs/RELEASE_READINESS.md','docs/RELEASE_NOTES.md','docs/PRIVATE_RELEASE_MANIFEST.json','docs/licensing/LICENSING_PROPOSAL.md','docs/licensing/CREATOR_PERMISSIONS_DRAFT.md','docs/releases/0.1.0-preview.5.md','docs/releases/0.1.0-preview.6.md','docs/releases/0.1.0-preview.7.md','docs/releases/0.1.0-preview.8.md','docs/FRIEND_TRIAL.md','docs/BRIDGE_WORK_CLOCK_INTEGRATION_PLAN.md','docs/CREATOR_JOURNEY.md','docs/RELEASE_CHECKS.md','docs/PRESENTATION_NOTES.md','docs/DITTO_QUICK_START.md','docs/MAKE_YOUR_OWN_IM.md','docs/DITTO_TUTORIAL.md','docs/media/Im-Ditto-Setup-and-First-Workspace.mp4']){
    await fs.mkdir(path.dirname(path.join(dest,part)),{recursive:true});
    await fs.copyFile(path.join(root,part),path.join(dest,part));
  }
  await fs.cp(path.join(root,'docs/images'),path.join(dest,'docs/images'),{recursive:true});
  await fs.mkdir(path.join(dest,'src'));for(const part of ['core.mjs','commands.mjs','git.mjs'])await fs.copyFile(path.join(root,'src',part),path.join(dest,'src',part));
  await fs.mkdir(path.join(dest,'runtime'));await fs.copyFile(process.execPath,path.join(dest,'runtime/node.exe'));
  const runtimeLicense=path.join(root,'runtime-notices','LICENSE-node-'+process.version+'.txt');
  try{await fs.copyFile(runtimeLicense,path.join(dest,'runtime/LICENSE-node.txt'));}catch(e){if(e.code!=='ENOENT')throw e;throw Error('Node license missing; portable output is incomplete and cannot be distributed.');}
  console.log(JSON.stringify({portable:dest,nodeBundled:true,ffmpegBundled:false}));
}else{console.log('Usage: node ditto/build.mjs studio | pack SOURCE OUTPUT.impack.json | portable NEW_OUTPUT_FOLDER');}
