'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const execute = promisify(execFile);
const APP_ROOT = path.resolve(__dirname, '..');
const FFMPEG = process.env.DITTO_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.DITTO_FFPROBE || 'ffprobe';

class StudioError extends Error {
  constructor(message, status = 400, code = 'INVALID_INPUT') {
    super(message); this.name = 'StudioError'; this.status = status; this.code = code;
  }
}
function check(condition, message, status = 400, code = 'INVALID_INPUT') {
  if (!condition) throw new StudioError(message, status, code);
}
function id(value) {
  check(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
    'Invalid project, media, shot, or render identifier.');
  return value;
}
function isWithin(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
function ownedPath(root, relative) {
  check(typeof relative === 'string' && !path.isAbsolute(relative), 'Absolute storage paths are not accepted.');
  const parts = relative.split(/[\\/]/);
  check(parts.every(p => p !== '..' && !/[:\u0000-\u001f]/.test(p)), 'Storage path is outside the studio.');
  const full = path.resolve(root, relative);
  check(isWithin(root, full), 'Storage path is outside the studio.');
  let cursor = path.resolve(root);
  if (fs.existsSync(cursor)) check(!fs.lstatSync(cursor).isSymbolicLink(), 'Linked storage roots are not supported.');
  for (const part of parts) {
    if (!part || part === '.') continue;
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor)) check(!fs.lstatSync(cursor).isSymbolicLink(), 'Linked storage paths are not supported.');
  }
  return full;
}
function ensureDir(root, relative) {
  const full = ownedPath(root, relative);
  fs.mkdirSync(full, {recursive:true});
  return full;
}
function writeJSON(root, relative, data) {
  const dest = ownedPath(root, relative);
  ensureDir(root, path.dirname(relative));
  const temp = ownedPath(root, relative + '.tmp-' + crypto.randomUUID());
  let fd;
  try {
    fd = fs.openSync(temp, 'wx');
    fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, dest);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function readJSON(root, relative) {
  const file = ownedPath(root, relative);
  check(fs.existsSync(file), 'The requested saved item does not exist.', 404, 'NOT_FOUND');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e instanceof StudioError) throw e; throw new StudioError('Saved JSON cannot be read: ' + relative, 500, 'CORRUPT_DATA'); }
}
function now() {return new Date().toISOString();}
function clone(value) {return structuredClone(value);}
async function probe(file) {
  try {
    const {stdout} = await execute(FFPROBE, ['-v','error','-show_streams','-show_format','-of','json',file],
      {windowsHide:true, shell:false, timeout:30000, maxBuffer:2*1024*1024});
    return JSON.parse(stdout);
  } catch (e) {
    if (e.code === 'ENOENT') throw new StudioError('FFprobe is missing. Configure the prerequisite before importing or rendering.',503,'DEPENDENCY_MISSING');
    throw new StudioError('FFprobe could not read this media: ' + String(e.stderr || e.message).slice(-1500),400,'INVALID_MEDIA');
  }
}
async function versions() {
  const result = {node:process.version};
  for (const [name, command] of [['ffmpeg',FFMPEG],['ffprobe',FFPROBE]]) {
    try {
      const {stdout} = await execute(command,['-version'],{windowsHide:true,shell:false,timeout:10000,maxBuffer:128*1024});
      result[name] = stdout.split(/\r?\n/)[0];
    } catch (e) { throw new StudioError(name + ' is required and could not be started: ' + e.message,503,'DEPENDENCY_MISSING'); }
  }
  return result;
}
module.exports = {APP_ROOT,FFMPEG,FFPROBE,StudioError,check,id,isWithin,ownedPath,ensureDir,writeJSON,readJSON,now,clone,probe,versions};
