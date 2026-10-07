'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class Fault extends Error {
  constructor(code, message, status = 400, details) {
    super(message); this.code = code; this.status = status; this.details = details;
  }
}
const fail = (code, message, status = 400, details) => { throw new Fault(code, message, status, details); };
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value) { if (typeof value !== 'string' || !idPattern.test(value)) fail('INVALID_ID', 'A valid project or item ID is required.'); return value.toLowerCase(); }
function object(value, name = 'Value') { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', name + ' must be an object.'); return value; }
function keys(value, allowed) { object(value); for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('UNKNOWN_FIELD', 'Unknown field: ' + key); }
function integer(value, min, max, name) { if (!Number.isInteger(value) || value < min || value > max) fail('INVALID_INPUT', name + ' must be an integer from ' + min + ' to ' + max + '.'); return value; }
function text(value, max, name, { empty = true, multiline = false, lines = Infinity } = {}) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail('INVALID_INPUT', name + ' must be ' + (empty ? 'at most ' : 'between 1 and ') + max + ' characters.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('INVALID_INPUT', name + ' contains a control character.');
  if (!multiline && /[\r\n]/.test(value)) fail('INVALID_INPUT', name + ' must be one line.');
  const normalized = value.replace(/\r\n?/g, '\n');
  if (normalized.split('\n').length > lines) fail('INVALID_INPUT', name + ' has too many lines.');
  return normalized;
}
function color(value) { if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail('INVALID_INPUT', 'Choose a six-digit hex colour.'); return value.toLowerCase(); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function digest(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function noLinks(target, allowMissing = false) {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) fail('UNSAFE_PATH', 'Symbolic links and junctions are not allowed in application paths.', 403);
    } catch (error) {
      if (error.code === 'ENOENT' && allowMissing) return resolved;
      if (error.code === 'ENOENT') fail('NOT_FOUND', 'The requested local item does not exist.', 404);
      throw error;
    }
  }
  return resolved;
}
class SafeRoot {
  constructor(root, { create = false } = {}) {
    if (typeof root !== 'string' || !root.trim() || root.includes('\0')) fail('INVALID_ROOT', 'A data or package root is required.');
    this.root = path.resolve(root);
    noLinks(path.dirname(this.root));
    if (!fs.existsSync(this.root)) {
      if (!create) fail('NOT_FOUND', 'The application root does not exist.', 404);
      fs.mkdirSync(this.root);
    }
    noLinks(this.root);
    if (!fs.lstatSync(this.root).isDirectory()) fail('INVALID_ROOT', 'The application root must be a directory.');
  }
  at(...parts) {
    for (const part of parts) if (typeof part !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part) || part === '.' || part === '..') fail('UNSAFE_PATH', 'Invalid application path component.', 403);
    const result = path.join(this.root, ...parts);
    noLinks(result, true);
    return result;
  }
  exists(...parts) { const target = this.at(...parts); return fs.existsSync(target); }
  directory(...parts) {
    const target = this.at(...parts);
    if (!fs.existsSync(target)) fs.mkdirSync(target);
    if (!fs.lstatSync(target).isDirectory()) fail('UNSAFE_PATH', 'Expected an application directory.', 403);
  }
  read(...parts) {
    const target = this.at(...parts);
    let stat;
    try { stat = fs.lstatSync(target); } catch (e) { if (e.code === 'ENOENT') fail('NOT_FOUND', 'The requested item was not found.', 404); throw e; }
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) fail('INVALID_DATA', 'The local file is invalid or too large.', 500);
    return fs.readFileSync(target);
  }
  json(...parts) {
    try { return JSON.parse(this.read(...parts).toString('utf8')); }
    catch (e) { if (e instanceof SyntaxError) fail('INVALID_DATA', 'A saved JSON file is invalid.', 500); throw e; }
  }
  write(parts, data) {
    const target = this.at(...parts);
    const tempParts = [...parts.slice(0, -1), 'tmp-' + crypto.randomUUID() + '.part'];
    const temp = this.at(...tempParts);
    try {
      const fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      this.at(...parts);
      fs.renameSync(temp, target);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(this.at(...tempParts)); }
  }
  writeJson(parts, value) { this.write(parts, JSON.stringify(value, null, 2) + '\n'); }
  unlink(...parts) { const target = this.at(...parts); if (fs.existsSync(target)) fs.unlinkSync(target); }
  list(...parts) { return fs.readdirSync(this.at(...parts)); }
}
module.exports = { Fault, fail, id, idPattern, object, keys, integer, text, color, escapeHtml, digest, noLinks, SafeRoot };
