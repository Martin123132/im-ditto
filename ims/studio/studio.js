#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

class StudioError extends Error {
  constructor(message, code = 'COMMAND_ERROR', status) {
    super(message); this.code = code; this.status = status;
  }
}

class StudioClient {
  constructor(baseUrl = 'http://127.0.0.1:8787') {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
      throw new StudioError('--url must be an HTTP loopback address with an optional port.', 'INVALID_URL');
    }
    this.url = url.origin; this.token = null;
  }
  async request(route, {method = 'GET', body, raw, headers = {}} = {}) {
    const allHeaders = {...headers};
    if (method !== 'GET') {
      if (!this.token) await this.connect();
      allHeaders['X-Studio-Token'] = this.token;
    }
    let payload = raw;
    if (body !== undefined) {
      allHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetch(this.url + route, {
        method, headers: allHeaders, body: payload, signal: AbortSignal.timeout(120000)
      });
    } catch (error) {
      throw new StudioError(
        'Cannot reach the local studio at ' + this.url + '. Start Launch-Studio.cmd, or check --url. ' + error.message,
        'CONNECTION_FAILED');
    }
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { throw new StudioError('The local server returned a non-JSON response.', 'INVALID_RESPONSE', response.status); }
    if (!response.ok) throw new StudioError(data.error || data.message || ('HTTP ' + response.status), data.code || 'HTTP_ERROR', response.status);
    return data;
  }
  async connect() {
    const state = await this.request('/api/health');
    if (!state.ok || state.app !== 'im-ditto-studio' || typeof state.token !== 'string') {
      throw new StudioError('This address is not an I\'m-Ditto Studio server.', 'WRONG_SERVER');
    }
    this.token = state.token;
    return state;
  }
  async project(projectId) {
    if (!projectId) {
      const session = await this.request('/api/projects');
      projectId = session.activeProjectId;
    }
    if (!projectId) throw new StudioError('No active project. Use create --name "My project" or select <projectId>.', 'NO_PROJECT');
    return this.request('/api/projects/' + encodeURIComponent(projectId));
  }
  async edit(projectId, revision, change) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/edit', {
      method: 'POST', body: {revision, ...change}
    });
  }
  async importFile(projectId, revision, sourcePath, kind) {
    if (!['image', 'audio'].includes(kind)) throw new StudioError('--kind must be image or audio.', 'INVALID_KIND');
    const filePath = path.resolve(sourcePath);
    let info;
    try { info = await fs.stat(filePath); }
    catch { throw new StudioError('The selected file does not exist: ' + filePath, 'FILE_NOT_FOUND'); }
    if (!info.isFile()) throw new StudioError('Import needs one file, not a directory.', 'INVALID_FILE');
    const maximum = (kind === 'image' ? 40 : 100) * 1024 * 1024;
    if (info.size > maximum) throw new StudioError(kind + ' exceeds the ' + (maximum / 1024 / 1024) + ' MiB import limit.', 'FILE_TOO_LARGE');
    const data = await fs.readFile(filePath);
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/media?name='
      + encodeURIComponent(path.basename(filePath)) + '&kind=' + kind, {
      method: 'POST', raw: data,
      headers: {'Content-Type': 'application/octet-stream', 'X-Project-Revision': String(revision)}
    });
  }
}

const HELP = {
  app: "I'm-Ditto Studio local command interface",
  usage: 'node studio.js <command> [arguments] [options]',
  globalOptions: {
    '--url': 'HTTP loopback server; default http://127.0.0.1:8787',
    '--project': 'Saved project ID; otherwise the current shared active project',
    '--revision': 'Require this exact revision for a project mutation; conflicts are errors'
  },
  commands: [
    'status', 'projects', 'create --name "Project name"', 'select <projectId>', 'inspect',
    'import <filePath> --kind image|audio',
    'set [--name "Project name"] [--format landscape|portrait]',
    'shot add <assetId> [--duration 4] [--caption "Title"]',
    'shot edit <shotId> [--duration 3.5] [--caption "New title"]',
    'shot move <shotId> --to <1-based position>', 'shot remove <shotId>',
    'audio set <assetId>|none', 'render start', 'render list', 'render status <renderId>',
    'render wait <renderId> [--timeout <seconds>]', 'render cancel <renderId>', 'render open <renderId>',
    'help'
  ],
  output: 'JSON on stdout on success; JSON on stderr and a nonzero exit code on error.',
  revisions: 'Commands read the current saved project first. A concurrent change is reported; it is never silently overwritten.',
  wait: 'Polls every 750 ms; completed exits 0, failed/cancelled/interrupted or timeout exits nonzero. Stopping wait does not cancel a render.'
};

function parse(argv) {
  const positional = [], options = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (!value.startsWith('--')) { positional.push(value); continue; }
    const equal = value.indexOf('=');
    const name = value.slice(2, equal === -1 ? undefined : equal);
    if (name === 'help') { options.help = true; continue; }
    if (Object.prototype.hasOwnProperty.call(options, name)) throw new StudioError('Duplicate option --' + name, 'INVALID_ARGUMENT');
    if (equal !== -1) options[name] = value.slice(equal + 1);
    else {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new StudioError('Missing value for --' + name, 'INVALID_ARGUMENT');
      options[name] = argv[++i];
    }
  }
  return {positional, options};
}
function need(value, message) {
  if (value === undefined || value === '') throw new StudioError(message, 'INVALID_ARGUMENT');
  return value;
}
function number(value, name, integer = false) {
  const result = Number(value);
  if (value === '' || !Number.isFinite(result) || (integer && !Number.isInteger(result))) {
    throw new StudioError(name + ' must be a finite ' + (integer ? 'integer.' : 'number.'), 'INVALID_ARGUMENT');
  }
  return result;
}
function allowOptions(options, names) {
  const allowed = new Set(['url', 'project', 'revision', 'help', ...names]);
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw new StudioError('Unknown option --' + key, 'INVALID_ARGUMENT');
}
async function execute(argv) {
  const {positional: args, options} = parse(argv);
  const command = args[0] || 'help', sub = args[1], value = args[2];
  if (command === 'help' || options.help) return HELP;
  const client = new StudioClient(options.url);
  const health = await client.connect();
  const revisionOf = project => {
    if (options.revision === undefined) return project.revision;
    const revision = number(options.revision, '--revision', true);
    if (revision < 0) throw new StudioError('--revision cannot be negative.', 'INVALID_ARGUMENT');
    return revision;
  };
  const readProject = () => client.project(options.project);
  const noExtra = count => {
    if (args.length > count) throw new StudioError('Unexpected argument: ' + args[count], 'INVALID_ARGUMENT');
  };
  if (command === 'status') {
    noExtra(1); allowOptions(options, []);
    const {token, ...safe} = health; return safe;
  }
  if (command === 'projects') {
    noExtra(1); allowOptions(options, []); return client.request('/api/projects');
  }
  if (command === 'create') {
    noExtra(1); allowOptions(options, ['name']);
    return client.request('/api/projects', {method: 'POST', body: {name: need(options.name, 'create requires --name.')}});
  }
  if (command === 'select') {
    noExtra(2); allowOptions(options, []);
    return client.request('/api/session', {method: 'POST', body: {projectId: need(sub, 'select requires a project ID.')}});
  }
  if (command === 'inspect') {
    noExtra(1); allowOptions(options, []); return readProject();
  }
  if (command === 'import') {
    noExtra(2); allowOptions(options, ['kind']);
    need(sub, 'import requires one file path.'); need(options.kind, 'import requires --kind image or --kind audio.');
    const p = await readProject(); return client.importFile(p.id, revisionOf(p), sub, options.kind);
  }
  if (command === 'set') {
    noExtra(1); allowOptions(options, ['name', 'format']);
    if (options.name === undefined && options.format === undefined) throw new StudioError('set requires --name and/or --format.', 'INVALID_ARGUMENT');
    const change = {action: 'set-project'};
    if (options.name !== undefined) change.name = options.name;
    if (options.format !== undefined) change.format = options.format;
    const p = await readProject(); return client.edit(p.id, revisionOf(p), change);
  }
  if (command === 'shot') {
    noExtra(3);
    if (!['add', 'edit', 'move', 'remove'].includes(sub)) throw new StudioError('shot requires add, edit, move or remove.', 'INVALID_ARGUMENT');
    need(value, 'shot ' + sub + ' requires an ID.');
    allowOptions(options, sub === 'move' ? ['to'] : sub === 'remove' ? [] : ['duration', 'caption']);
    let change;
    if (sub === 'add') change = {action: 'add-shot', assetId: value,
      duration: number(options.duration === undefined ? '4' : options.duration, '--duration'), caption: options.caption || ''};
    if (sub === 'edit') {
      if (options.duration === undefined && options.caption === undefined) throw new StudioError('shot edit requires --duration and/or --caption.', 'INVALID_ARGUMENT');
      change = {action: 'update-shot', shotId: value};
      if (options.duration !== undefined) change.duration = number(options.duration, '--duration');
      if (options.caption !== undefined) change.caption = options.caption;
    }
    if (sub === 'move') {
      const position = number(need(options.to, 'shot move requires --to.'), '--to', true);
      if (position < 1) throw new StudioError('--to positions start at 1.', 'INVALID_ARGUMENT');
      change = {action: 'move-shot', shotId: value, toIndex: position - 1};
    }
    if (sub === 'remove') change = {action: 'remove-shot', shotId: value};
    const p = await readProject(); return client.edit(p.id, revisionOf(p), change);
  }
  if (command === 'audio') {
    noExtra(3); allowOptions(options, []);
    if (sub !== 'set') throw new StudioError('audio requires set <assetId>|none.', 'INVALID_ARGUMENT');
    need(value, 'audio set requires an asset ID or none.');
    const p = await readProject(); return client.edit(p.id, revisionOf(p), {action: 'set-audio', assetId: value === 'none' ? null : value});
  }
  if (command === 'render') {
    allowOptions(options, sub === 'wait' ? ['timeout'] : []);
    if (sub === 'start') {
      noExtra(2); const p = await readProject();
      return client.request('/api/projects/' + encodeURIComponent(p.id) + '/render', {method: 'POST', body: {revision: revisionOf(p)}});
    }
    if (sub === 'list') {
      noExtra(2); const p = await readProject();
      return client.request('/api/renders?projectId=' + encodeURIComponent(p.id));
    }
    if (!['status', 'cancel', 'open', 'wait'].includes(sub)) throw new StudioError('Unknown render command. Use help.', 'INVALID_ARGUMENT');
    noExtra(3); need(value, 'render ' + sub + ' requires a render ID.');
    const route = '/api/renders/' + encodeURIComponent(value);
    if (sub === 'status') return client.request(route);
    if (sub === 'cancel' || sub === 'open') return client.request(route + '/' + sub, {method: 'POST', body: {}});
    const timeout = number(options.timeout === undefined ? '3600' : options.timeout, '--timeout');
    if (timeout <= 0) throw new StudioError('--timeout must be greater than zero.', 'INVALID_ARGUMENT');
    const deadline = Date.now() + timeout * 1000;
    while (true) {
      const job = await client.request(route);
      if (job.status === 'completed') return job;
      if (['failed', 'cancelled', 'interrupted'].includes(job.status)) {
        const error = new StudioError('Render ' + value + ' is ' + job.status + (job.error ? ': ' + job.error : ''), 'RENDER_' + job.status.toUpperCase());
        error.job = job; throw error;
      }
      if (Date.now() >= deadline) throw new StudioError('Waiting timed out; the render remains owned by the studio. Check render status or cancel it explicitly.', 'WAIT_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, Math.min(750, Math.max(1, deadline - Date.now()))));
    }
  }
  throw new StudioError('Unknown command "' + command + '". Use node studio.js help.', 'INVALID_ARGUMENT');
}

if (require.main === module) {
  execute(process.argv.slice(2)).then(result => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }).catch(error => {
    const result = {ok: false, error: error.message, code: error.code || 'COMMAND_ERROR'};
    if (error.status) result.status = error.status;
    if (error.job) result.job = error.job;
    process.stderr.write(JSON.stringify(result, null, 2) + '\n'); process.exitCode = 1;
  });
}
module.exports = {StudioClient, StudioError, execute, parse};
