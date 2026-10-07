// Read-only release check. Never log matched secret values.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadBundle} from '../ditto/package.mjs';

const root = path.resolve(import.meta.dirname, '..');
const textType = /\.(?:md|mjs|cjs|js|json|html|css|svg|txt|cmd|ps1|yml|yaml)$/i;
const secretPattern = /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,})|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const blockedPath = /(^|\/)(?:local-profile|acceptance|node_modules|\.git|\.env(?:\.[^/]+)?|connection\.json|remote-connection\.json|workspace-state\.json|ai-clients\.json|ditto-clock-display\.json|work-sessions)(\/|$)|(^|\/)tests\/runs\//i;
const git = (directory, args) => execFileSync('git', args, {
  cwd: directory, encoding: 'utf8', windowsHide: true, maxBuffer: 100 * 1024 * 1024
});
const isText = file => textType.test(file) || /(^|\/)(?:LICENSE|NOTICE)$/i.test(file);

export function auditPath(file) {
  assert(!blockedPath.test(file.replaceAll('\\', '/')), 'Private/generated path in export: ' + file);
}

export function auditContent(file, bytes) {
  assert(bytes.length < 90 * 1024 * 1024, 'Unexpected large Git member: ' + file);
  if (!isText(file)) return false;
  const text = bytes.toString('utf8');
  assert(!secretPattern.test(text), 'Credential pattern found in ' + file);
  if (file.endsWith('.impack.json')) {
    const bundle = JSON.parse(text);
    assert(Array.isArray(bundle.files), 'Invalid package member list: ' + file);
    for (const member of bundle.files) {
      assert(typeof member.path === 'string' && typeof member.content === 'string', 'Invalid package member: ' + file);
      auditPath(member.path);
      const decoded = Buffer.from(member.content, 'base64');
      assert(!secretPattern.test(decoded.toString('utf8')), 'Credential pattern in package member: ' + file + ' : ' + member.path);
    }
  }
  return true;
}

export function checkMetadata(pkg, lock) {
  const locked = lock.packages?.[''];
  for (const field of ['name', 'version']) {
    assert.equal(lock[field], pkg[field], 'Package lock ' + field + ' differs');
    assert.equal(locked?.[field], pkg[field], 'Root lock ' + field + ' differs');
  }
  assert.equal(locked.license, pkg.license, 'Root lock licence differs');
  assert.deepEqual(locked.engines, pkg.engines, 'Root lock runtime requirement differs');
}

export function auditHistory(directory) {
  assert.equal(git(directory, ['rev-parse', '--is-shallow-repository']).trim(), 'false', 'Full-history audit requires an unshallow checkout.');
  const commits = git(directory, ['rev-list', '--all']).trim().split('\n').filter(Boolean);
  assert(commits.length > 0, 'No retained history to audit.');
  const scanned = new Set(), blobs = new Set();
  let treeEntries = 0;
  for (const commit of commits) {
    const entries = git(directory, ['ls-tree', '-r', '-z', '--full-tree', commit]).split('\0').filter(Boolean);
    for (const entry of entries) {
      const [header, ...name] = entry.split('\t');
      const [mode, type, oid] = header.split(' '), file = name.join('\t');
      auditPath(file);
      assert.equal(type, 'blob', 'Unsupported historical entry: ' + file);
      assert.notEqual(mode, '120000', 'Historical symlink requires review: ' + file);
      treeEntries++;
      // The same bytes may also appear under a package filename, where decoded
      // members need inspection in addition to the plain text check.
      const scanKey = oid + (file.endsWith('.impack.json') ? ':bundle' : ':text');
      if (!isText(file) || scanned.has(scanKey)) continue;
      auditContent(file, Buffer.from(git(directory, ['cat-file', 'blob', oid]), 'utf8'));
      scanned.add(scanKey); blobs.add(oid);
    }
    const message = git(directory, ['show', '-s', '--format=%B', commit]);
    assert(!secretPattern.test(message), 'Credential pattern in commit message: ' + commit);
  }
  return {commits: commits.length, treeEntries, uniqueTextBlobs: blobs.size};
}

export async function reviewExport(directory, {history = false} = {}) {
  const files = [...new Set(git(directory, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))];
  let textFiles = 0, packages = 0;
  for (const file of files) {
    auditPath(file);
    const full = path.join(directory, file), stat = await fs.lstat(full);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'Unsupported export member: ' + file);
    if (auditContent(file, await fs.readFile(full))) textFiles++;
    if (file.endsWith('.impack.json')) { await loadBundle(full); packages++; }
  }
  checkMetadata(JSON.parse(await fs.readFile(path.join(directory, 'package.json'))), JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'))));
  const docs = ['README.md', 'REVIEW.md', 'CONTRIBUTING.md', 'SECURITY.md', 'START_HERE.html',
    'LICENSE', 'CREATOR_RIGHTS.md', 'COMMERCIAL_LICENSE.md', 'TRADEMARKS.md',
    'LICENSES/Im-Ditto-Core-1.0.md', 'LICENSES/Legacy-PC-Bridge-Ditto.md',
    'creator-template/README.md', 'creator-template/NOTICE-DITTO-STARTER.md',
    'docs/CREATOR_JOURNEY.md', 'docs/MAKE_YOUR_OWN_IM.md', 'docs/DITTO_QUICK_START.md',
    'docs/DITTO_TUTORIAL.md', 'docs/RELEASE_NOTES.md', 'docs/SUPPORT.md', 'docs/PUBLIC_RELEASE_CHECKLIST.md', 'docs/RELEASE_READINESS.md',
    'docs/licensing/LICENSING_PROPOSAL.md', 'docs/licensing/CREATOR_PERMISSIONS_DRAFT.md'];
  let links = 0;
  for (const doc of docs) {
    const body = await fs.readFile(path.join(directory, doc), 'utf8');
    const refs = [...body.matchAll(/\]\(([^)]+)\)|(?:href|src)="([^"]+)"/g)].map(m => m[1] || m[2]);
    for (const ref of refs) {
      if (/^(?:https?:|#|mailto:)/.test(ref)) continue;
      const target = path.resolve(directory, path.dirname(doc), decodeURIComponent(ref.split('#')[0]));
      const relative = path.relative(directory, target);
      assert(!relative.startsWith('..') && !path.isAbsolute(relative), 'Documentation link leaves repository: ' + doc);
      await fs.access(target); links++;
    }
  }
  return {files: files.length, textFiles, packages, localLinks: links, metadata: 'pass',
    history: history ? auditHistory(directory) : 'not requested',
    blockedPaths: 0, credentialPatternMatches: 0,
    limitation: 'Pattern/inventory check only. Not a security certification; does not inspect image/video pixels, Git author email addresses, unreachable objects or remote release assets.'};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(process.argv.slice(2).every(arg => arg === '--history'), 'Usage: node tests/review-export.mjs [--history]');
    console.log(JSON.stringify(await reviewExport(root, {history: process.argv.includes('--history')}), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
