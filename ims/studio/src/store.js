'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('./common');
const IMAGE_EXT = new Set(['.png','.jpg','.jpeg','.webp','.bmp']);
const AUDIO_EXT = new Set(['.wav','.mp3','.m4a','.ogg','.flac','.aac']);
const TOTAL_LIMIT = 600;
function text(value, label, max, allowEmpty = true) {
  C.check(typeof value === 'string', label + ' must be text.');
  C.check(value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), label + ' is too long or contains unsupported control characters.');
  if (!allowEmpty) C.check(value.trim().length > 0, label + ' cannot be empty.');
  return value;
}
function duration(value) {
  C.check(typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 60, 'Shot duration must be between 0.5 and 60 seconds.');
  return Math.round(value * 1000) / 1000;
}
function validName(name) {return text(name, 'Project name', 80, false).trim();}
function correctSignature(buffer, ext) {
  const ascii = (start, end) => buffer.toString('ascii', start, end);
  if (ext === '.png') return buffer.length >= 24 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (ext === '.jpg' || ext === '.jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (ext === '.webp') return ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP';
  if (ext === '.bmp') return ascii(0,2) === 'BM';
  if (ext === '.wav') return ascii(0,4) === 'RIFF' && ascii(8,12) === 'WAVE';
  if (ext === '.ogg') return ascii(0,4) === 'OggS';
  if (ext === '.flac') return ascii(0,4) === 'fLaC';
  if (ext === '.m4a') return ascii(4,8) === 'ftyp';
  if (ext === '.mp3') return ascii(0,3) === 'ID3' || (buffer[0] === 255 && (buffer[1] & 0xe0) === 0xe0);
  if (ext === '.aac') return buffer[0] === 255 && (buffer[1] & 0xf6) === 0xf0;
  return false;
}
class Studio {
  constructor(root = C.APP_ROOT) {
    this.root = path.resolve(root);
    const hostedRoot = process.env.IM_DITTO_DATA_ROOT && path.resolve(process.env.IM_DITTO_DATA_ROOT);
    C.check(C.isWithin(C.APP_ROOT, this.root) || this.root === hostedRoot, 'Studio storage must be its application folder or the exact host-assigned data folder.');
    C.ensureDir(this.root, '.');
    for (const folder of ['data/projects','data/renders','outputs']) C.ensureDir(this.root, folder);
    if (!fs.existsSync(C.ownedPath(this.root,'data/session.json'))) C.writeJSON(this.root,'data/session.json',{activeProjectId:null});
  }
  projectRelative(projectId) {return 'data/projects/' + C.id(projectId);}
  get(projectId) {
    const p = C.readJSON(this.root,this.projectRelative(projectId) + '/project.json');
    C.check(p.id === projectId, 'Saved project identifier does not match its directory.',500,'CORRUPT_DATA');
    this.validate(p); return p;
  }
  session() {return C.readJSON(this.root,'data/session.json');}
  select(projectId) {
    this.get(projectId);
    const session = {activeProjectId:projectId};
    C.writeJSON(this.root,'data/session.json',session); return session;
  }
  list() {
    const base = C.ownedPath(this.root,'data/projects');
    const projects = fs.readdirSync(base,{withFileTypes:true}).filter(d => d.isDirectory() && !d.isSymbolicLink()).map(d => {
      const p = this.get(d.name);
      return {id:p.id,name:p.name,revision:p.revision,updatedAt:p.updatedAt};
    }).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    return {projects,activeProjectId:this.session().activeProjectId};
  }
  create(name) {
    const stamp = C.now();
    const p = {schemaVersion:1,id:crypto.randomUUID(),name:validName(name || 'Untitled project'),revision:1,createdAt:stamp,updatedAt:stamp,
      format:'landscape',fps:24,fade:0.25,assets:[],shots:[],audioAssetId:null};
    C.ensureDir(this.root,this.projectRelative(p.id) + '/media');
    C.writeJSON(this.root,this.projectRelative(p.id) + '/project.json',p);
    this.select(p.id); return p;
  }
  validate(p) {
    C.check(p && p.schemaVersion === 1, 'Unsupported project schema.');
    C.id(p.id); validName(p.name);
    C.check(Number.isInteger(p.revision) && p.revision >= 1,'Invalid project revision.');
    C.check(['landscape','portrait'].includes(p.format),'Format must be landscape or portrait.');
    C.check(p.fps === 24 && p.fade === 0.25,'Unsupported project timing settings.');
    C.check(Array.isArray(p.assets) && p.assets.length <= 200,'A project supports up to 200 media assets.');
    C.check(Array.isArray(p.shots) && p.shots.length <= 60,'A storyboard supports up to 60 shots.');
    const assetIds = new Set();
    for (const a of p.assets) {
      C.id(a.id); C.check(!assetIds.has(a.id),'Duplicate media identifier.'); assetIds.add(a.id);
      C.check(['image','audio'].includes(a.kind),'Invalid media kind.');
      const ext = path.extname(a.filename || '').toLowerCase();
      C.check(a.filename === a.id + ext && (a.kind === 'image' ? IMAGE_EXT : AUDIO_EXT).has(ext),'Invalid stored media filename.');
    }
    const shotIds = new Set(); let total = 0;
    for (const s of p.shots) {
      C.id(s.id); C.check(!shotIds.has(s.id),'Duplicate shot identifier.'); shotIds.add(s.id);
      C.check(p.assets.some(a => a.id === s.assetId && a.kind === 'image'),'Shot image does not exist.');
      duration(s.duration); text(s.caption,'Caption',180); total += s.duration;
    }
    C.check(total <= TOTAL_LIMIT + 1e-8,'The total storyboard may not exceed 600 seconds.');
    C.check(p.audioAssetId === null || p.assets.some(a => a.id === p.audioAssetId && a.kind === 'audio'),'Selected audio track does not exist.');
    return p;
  }
  revision(p, revision) {
    C.check(Number.isInteger(revision),'An integer project revision is required.');
    C.check(revision === p.revision,'This project changed in another controller. Reload and retry your edit.',409,'REVISION_CONFLICT');
  }
  save(p) {
    this.validate(p); p.revision += 1; p.updatedAt = C.now();
    C.writeJSON(this.root,this.projectRelative(p.id) + '/project.json',p);
    return p;
  }
  edit(projectId, input) {
    C.check(input && typeof input === 'object' && !Array.isArray(input),'Edit must be a JSON object.');
    const p = this.get(projectId); this.revision(p,input.revision);
    const allowed = {
      'set-project':['name','format'],
      'add-shot':['assetId','duration','caption'],
      'update-shot':['shotId','duration','caption'],
      'move-shot':['shotId','toIndex'],
      'remove-shot':['shotId'],
      'set-audio':['assetId']
    };
    C.check(Object.hasOwn(allowed,input.action),'Unknown edit action.');
    for (const key of Object.keys(input)) C.check(['revision','action',...allowed[input.action]].includes(key),'Unsupported edit field: ' + key);
    const findShot = () => {
      C.id(input.shotId); const found = p.shots.find(s => s.id === input.shotId);
      C.check(found,'Shot does not exist.',404,'NOT_FOUND'); return found;
    };
    switch (input.action) {
      case 'set-project':
        C.check(input.name !== undefined || input.format !== undefined,'Provide a project name or format.');
        if (input.name !== undefined) p.name = validName(input.name);
        if (input.format !== undefined) {C.check(['landscape','portrait'].includes(input.format),'Format must be landscape or portrait.');p.format = input.format;}
        break;
      case 'add-shot':
        C.check(p.assets.some(a => a.id === input.assetId && a.kind === 'image'),'Choose an imported image.');
        p.shots.push({id:crypto.randomUUID(),assetId:input.assetId,duration:duration(input.duration === undefined ? 4 : input.duration),caption:text(input.caption === undefined ? '' : input.caption,'Caption',180)});
        break;
      case 'update-shot': {
        const shot = findShot();
        C.check(input.duration !== undefined || input.caption !== undefined,'Provide a shot duration or caption.');
        if (input.duration !== undefined) shot.duration = duration(input.duration);
        if (input.caption !== undefined) shot.caption = text(input.caption,'Caption',180);
        break;
      }
      case 'move-shot': {
        const shot = findShot();
        C.check(Number.isInteger(input.toIndex) && input.toIndex >= 0 && input.toIndex < p.shots.length,'Shot position is outside the storyboard.');
        p.shots.splice(p.shots.indexOf(shot),1);p.shots.splice(input.toIndex,0,shot);break;
      }
      case 'remove-shot': p.shots.splice(p.shots.indexOf(findShot()),1);break;
      case 'set-audio':
        C.check(input.assetId === null || p.assets.some(a => a.id === input.assetId && a.kind === 'audio'),'Choose an imported audio track.');
        p.audioAssetId = input.assetId;break;
    }
    return this.save(p);
  }
  mediaPath(projectId, assetId, snapshot) {
    const p = snapshot || this.get(projectId);
    C.id(assetId);
    const asset = p.assets.find(a => a.id === assetId);
    C.check(asset,'Media asset does not exist.',404,'NOT_FOUND');
    const file = C.ownedPath(this.root,this.projectRelative(projectId) + '/media/' + asset.filename);
    C.check(fs.existsSync(file),'Imported media file is missing.',404,'MISSING_MEDIA');
    return {file,asset};
  }
  async import(projectId, name, kind, bytes, expectedRevision) {
    const before = this.get(projectId);
    const revision = expectedRevision === undefined ? before.revision : expectedRevision;
    this.revision(before,revision);
    C.check(typeof name === 'string' && name.length >= 1 && name.length <= 180 && !/[\\/:<>"|?*\u0000-\u001f]/.test(name) && name !== '.' && name !== '..','Import filename must be a plain filename.');
    C.check(kind === 'image' || kind === 'audio','Media kind must be image or audio.');
    const ext = path.extname(name).toLowerCase();
    C.check((kind === 'image' ? IMAGE_EXT : AUDIO_EXT).has(ext),'Unsupported media extension for ' + kind + '.');
    C.check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= (kind === 'image' ? 40 : 100)*1024*1024,'Media is empty or exceeds the import size limit.');
    C.check(correctSignature(bytes,ext),'Media content does not match its filename. Playlists and network references are not accepted.',400,'INVALID_MEDIA');
    const assetId = crypto.randomUUID();
    const filename = assetId + ext;
    const file = C.ownedPath(this.root,this.projectRelative(projectId) + '/media/' + filename);
    fs.writeFileSync(file,bytes,{flag:'wx'});
    try {
      const metadata = await C.probe(file);
      const stream = (metadata.streams || []).find(s => s.codec_type === (kind === 'image' ? 'video' : 'audio'));
      C.check(stream,'No usable ' + kind + ' stream was found.',400,'INVALID_MEDIA');
      const a = {id:assetId,name,kind,filename,bytes:bytes.length,importedAt:C.now(),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
      if (kind === 'image') {
        C.check(Number.isInteger(stream.width) && Number.isInteger(stream.height) && stream.width > 0 && stream.height > 0 && stream.width <= 16384 && stream.height <= 16384 && stream.width * stream.height <= 64000000,'Image dimensions exceed supported limits.');
        a.width=stream.width;a.height=stream.height;
      } else {
        a.duration=Number(metadata.format && metadata.format.duration || stream.duration);
        C.check(Number.isFinite(a.duration) && a.duration > 0 && a.duration <= 3600,'Audio must have a readable duration of at most one hour.');
      }
      const p = this.get(projectId);this.revision(p,revision);
      p.assets.push(a);
      if (kind === 'audio') p.audioAssetId = assetId;
      return this.save(p);
    } catch (e) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      throw e;
    }
  }
}
module.exports = {Studio,IMAGE_EXT,AUDIO_EXT,duration,validName};
