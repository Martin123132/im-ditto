'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const C = require('./common');
const TERMINAL = new Set(['completed','cancelled','failed','interrupted']);
function wrapCaption(value, width) {
  const result = [];
  for (const paragraph of value.replace(/\r/g,'').split('\n')) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + word.length + 1 > width) {result.push(line); line = '';}
      while (word.length > width) {
        if (line) {result.push(line);line='';}
        result.push(word.slice(0,width));word=word.slice(width);
      }
      if (word) line += (line ? ' ' : '') + word;
    }
    if (line || !paragraph.trim()) result.push(line);
  }
  return result.join('\n');
}
class Renderer {
  constructor(studio) {
    this.studio=studio;this.root=studio.root;this.jobs=new Map();this.workers=new Map();this.active=null;this.closing=false;
    const base=C.ownedPath(this.root,'data/renders');
    for (const entry of fs.readdirSync(base,{withFileTypes:true})) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      C.id(entry.name);
      const job=C.readJSON(this.root,'data/renders/' + entry.name + '/job.json');
      C.check(job.id===entry.name,'Render identifier mismatch.',500,'CORRUPT_DATA');
      if (!TERMINAL.has(job.status)) {
        job.status='interrupted';job.stage='The previous studio process stopped before this render finished.';
        job.endedAt=C.now();job.pid=null;job.outputFile=null;
        C.writeJSON(this.root,'data/renders/'+job.id+'/job.json',job);
      }
      this.jobs.set(job.id,job);
    }
  }
  save(job) {C.writeJSON(this.root,'data/renders/'+job.id+'/job.json',job);}
  get(renderId) {C.id(renderId);const job=this.jobs.get(renderId);C.check(job,'Render does not exist.',404,'NOT_FOUND');return C.clone(job);}
  list(projectId) {
    if (projectId) this.studio.get(projectId);
    return {jobs:[...this.jobs.values()].filter(j=>!projectId||j.projectId===projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(C.clone)};
  }
  start(projectId, revision) {
    C.check(!this.closing,'Studio is shutting down.',503,'SHUTTING_DOWN');
    C.check(!this.active,'Another render is already active. Wait or cancel it first.',409,'RENDER_BUSY');
    const p=this.studio.get(projectId);this.studio.revision(p,revision);
    C.check(p.shots.length>0,'Add at least one image to the storyboard before rendering.');
    for (const shot of p.shots) this.studio.mediaPath(p.id,shot.assetId,p);
    if (p.audioAssetId) this.studio.mediaPath(p.id,p.audioAssetId,p);
    const requestedDuration=p.shots.reduce((n,s)=>n+s.duration,0);
    const job={id:crypto.randomUUID(),projectId:p.id,projectName:p.name,revision:p.revision,status:'queued',progress:0,
      stage:'Waiting for render worker',createdAt:C.now(),startedAt:null,endedAt:null,pid:null,exitCode:null,stderr:'',error:null,
      format:p.format,width:p.format==='landscape'?1280:720,height:p.format==='landscape'?720:1280,fps:24,
      duration:Math.round(requestedDuration*24)/24,requestedDuration,outputFile:null};
    C.ensureDir(this.root,'data/renders/'+job.id);
    C.writeJSON(this.root,'data/renders/'+job.id+'/snapshot.json',p);
    this.jobs.set(job.id,job);this.active=job.id;this.save(job);
    const worker={child:null,cancelled:false,processes:[],promise:null};
    this.workers.set(job.id,worker);
    worker.promise=new Promise(resolve=>setImmediate(()=>resolve(this.run(job,p,worker))));
    return C.clone(job);
  }
  async runProcess(job,worker,args,label,onProgress) {
    if (worker.cancelled) throw new C.StudioError('Render was cancelled.',409,'CANCELLED');
    const cwd=C.ownedPath(this.root,'data/renders/'+job.id);
    return new Promise((resolve,reject)=>{
      let child;
      try {child=spawn(C.FFMPEG,args,{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});}
      catch(e) {reject(e);return;}
      worker.child=child;job.pid=child.pid||null;job.stage=label;this.save(job);
      const trace={label,command:C.FFMPEG,args,cwd,pid:child.pid||null,startedAt:C.now(),endedAt:null,exitCode:null,signal:null,stderr:''};
      worker.processes.push(trace);
      C.writeJSON(this.root,'data/renders/'+job.id+'/processes.json',worker.processes);
      let buffer='',spawnError=null,lastSave=0;
      child.stdout.on('data',chunk=>{
        buffer+=chunk.toString();
        fs.appendFileSync(path.join(cwd,'progress.log'),chunk);
        const lines=buffer.split(/\r?\n/);buffer=lines.pop();
        for (const line of lines) {
          if (line.startsWith('out_time=')) {
            const match=/out_time=(\d+):(\d+):([\d.]+)/.exec(line);
            if (match && onProgress) onProgress(Number(match[1])*3600+Number(match[2])*60+Number(match[3]));
          }
        }
        if (Date.now()-lastSave>450) {this.save(job);lastSave=Date.now();}
      });
      child.stderr.on('data',chunk=>{
        const message=chunk.toString();trace.stderr=(trace.stderr+message).slice(-16000);job.stderr=(job.stderr+message).slice(-16000);
        fs.appendFileSync(path.join(cwd,'ffmpeg.log'),message);
      });
      child.once('error',e=>{spawnError=e;});
      child.once('close',(code,signal)=>{
        trace.endedAt=C.now();trace.exitCode=code;trace.signal=signal||null;
        job.exitCode=code;job.pid=null;worker.child=null;
        C.writeJSON(this.root,'data/renders/'+job.id+'/processes.json',worker.processes);
        this.save(job);
        if (worker.cancelled) reject(new C.StudioError('Render cancelled by its owner.',409,'CANCELLED'));
        else if (spawnError) reject(new C.StudioError('FFmpeg could not start: '+spawnError.message,503,'DEPENDENCY_MISSING'));
        else if (code!==0) reject(new Error(label+' failed with FFmpeg exit '+code+'. '+trace.stderr.slice(-2500)));
        else resolve();
      });
    });
  }
  async run(job,p,worker) {
    const directory='data/renders/'+job.id;
    const cwd=C.ownedPath(this.root,directory);
    const partial=C.ownedPath(this.root,directory+'/output.partial.mp4');
    try {
      if (worker.cancelled) throw new C.StudioError('Cancelled before rendering.',409,'CANCELLED');
      job.status='running';job.startedAt=C.now();job.stage='Preparing storyboard';this.save(job);
      let cumulative=0,previousFrames=0,elapsed=0;
      const segments=[];
      for(let index=0;index<p.shots.length;index++) {
        if(worker.cancelled) throw new C.StudioError('Render cancelled.',409,'CANCELLED');
        const shot=p.shots[index];
        cumulative+=shot.duration;
        const endFrame=Math.round(cumulative*24),frames=endFrame-previousFrames;
        previousFrames=endFrame;
        const seconds=frames/24;
        const media=this.studio.mediaPath(p.id,shot.assetId,p);
        const caption=wrapCaption(shot.caption,p.format==='landscape'?52:29);
        const captionName='caption-'+index+'.txt';
        fs.writeFileSync(C.ownedPath(this.root,directory+'/'+captionName),caption,'utf8');
        const filters=[
          'scale='+job.width+':'+job.height+':force_original_aspect_ratio=increase',
          'crop='+job.width+':'+job.height,
          'setsar=1','fps=24','format=yuv420p'
        ];
        if(caption.trim()) {
          const font=p.format==='landscape'?34:38;
          const lines=caption.split('\n').length;
          const band=Math.min(job.height-40,lines*(font+9)+82);
          filters.push('drawbox=x=0:y=ih-'+band+':w=iw:h='+band+':color=black@0.60:t=fill');
          filters.push("drawtext=font='Arial':textfile="+captionName+":expansion=none:fontcolor=white:fontsize="+font+
            ':line_spacing=9:x=(w-text_w)/2:y=h-text_h-46:shadowcolor=black@0.35:shadowx=1:shadowy=2');
        }
        const fade=Math.min(p.fade,seconds/2);
        filters.push('fade=t=in:st=0:d='+fade,'fade=t=out:st='+Math.max(0,seconds-fade)+':d='+fade);
        const segment='segment-'+String(index).padStart(3,'0')+'.mp4';
        const args=['-hide_banner','-loglevel','error','-nostdin','-y','-loop','1','-framerate','24','-i',media.file,
          '-vf',filters.join(','),'-frames:v',String(frames),'-an','-c:v','libx264','-preset','veryfast','-crf','21',
          '-threads','2','-pix_fmt','yuv420p','-r','24','-movflags','+faststart','-progress','pipe:1',segment];
        const completed=elapsed;
        await this.runProcess(job,worker,args,'Rendering shot '+(index+1)+' of '+p.shots.length,
          t=>{job.progress=Math.min(90,90*(completed+Math.min(seconds,t))/job.duration);});
        elapsed+=seconds;job.progress=90*elapsed/job.duration;this.save(job);segments.push(segment);
      }
      fs.writeFileSync(C.ownedPath(this.root,directory+'/concat.txt'),segments.map(name=>"file '"+name+"'").join('\n')+'\n');
      const args=['-hide_banner','-loglevel','error','-nostdin','-y','-f','concat','-safe','1','-i','concat.txt'];
      if(p.audioAssetId) args.push('-stream_loop','-1','-i',this.studio.mediaPath(p.id,p.audioAssetId,p).file);
      else args.push('-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000');
      args.push('-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','2',
        '-af','afade=t=in:st=0:d=0.2,afade=t=out:st='+Math.max(0,job.duration-0.4)+':d=0.4',
        '-t',String(job.duration),'-movflags','+faststart','-progress','pipe:1','output.partial.mp4');
      await this.runProcess(job,worker,args,'Mixing music and finishing MP4',t=>{job.progress=90+Math.min(7,7*t/job.duration);});
      if(worker.cancelled) throw new C.StudioError('Render cancelled.',409,'CANCELLED');
      job.stage='Checking the encoded video and audio';job.progress=98;this.save(job);
      const metadata=await C.probe(partial);
      if(worker.cancelled) throw new C.StudioError('Render cancelled.',409,'CANCELLED');
      const video=metadata.streams.find(s=>s.codec_type==='video'),audio=metadata.streams.find(s=>s.codec_type==='audio');
      C.check(video && audio,'Rendered MP4 is missing video or audio.',500,'INVALID_OUTPUT');
      C.check(video.codec_name==='h264' && audio.codec_name==='aac','Unexpected output codecs.',500,'INVALID_OUTPUT');
      C.check(video.width===job.width && video.height===job.height,'Rendered video dimensions do not match the project.',500,'INVALID_OUTPUT');
      const actualDuration=Number(metadata.format.duration);
      C.check(Math.abs(actualDuration-job.duration)<=0.16,'Rendered duration did not match the saved storyboard.',500,'INVALID_OUTPUT');
      const output='outputs/'+job.id+'.mp4';
      fs.renameSync(partial,C.ownedPath(this.root,output));
      job.status='completed';job.progress=100;job.stage='MP4 ready';job.outputFile=output;job.exitCode=0;
      job.probe={duration:actualDuration,width:video.width,height:video.height,videoCodec:video.codec_name,audioCodec:audio.codec_name,
        frameRate:video.avg_frame_rate,frames:Number(video.nb_frames)||null,bytes:fs.statSync(C.ownedPath(this.root,output)).size};
      C.writeJSON(this.root,directory+'/ffprobe.json',metadata);
    } catch(e) {
      const cancelled=worker.cancelled || e.code==='CANCELLED';
      job.status=cancelled?'cancelled':'failed';job.error=cancelled?null:e.message;
      job.stage=cancelled?'Cancelled; saved project preserved':'Render failed';
      job.outputFile=null;
      if(fs.existsSync(partial)) fs.unlinkSync(partial);
    } finally {
      job.pid=null;job.endedAt=C.now();this.save(job);
      if(this.active===job.id) this.active=null;
    }
  }
  cancel(renderId) {
    const job=this.jobs.get(C.id(renderId));C.check(job,'Render does not exist.',404,'NOT_FOUND');
    if(TERMINAL.has(job.status)) return C.clone(job);
    const worker=this.workers.get(job.id);
    C.check(worker,'The render is no longer attached to this process.',409,'NOT_RUNNING');
    worker.cancelled=true;job.status='cancelling';job.stage='Stopping this render';this.save(job);
    if(worker.child && worker.child.exitCode===null) worker.child.kill();
    return C.clone(job);
  }
  outputPath(renderId) {
    const job=this.get(renderId);
    C.check(job.status==='completed' && job.outputFile==='outputs/'+job.id+'.mp4','This render has no completed output.',409,'OUTPUT_NOT_READY');
    const file=C.ownedPath(this.root,job.outputFile);
    C.check(fs.existsSync(file),'Completed output file is missing.',404,'MISSING_OUTPUT');
    return file;
  }
  async shutdown() {
    this.closing=true;
    if(this.active) this.cancel(this.active);
    await Promise.all([...this.workers.values()].map(w=>w.promise).filter(Boolean));
  }
}
module.exports={Renderer,TERMINAL,wrapCaption};
