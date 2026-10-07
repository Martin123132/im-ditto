import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {auditPath, auditContent, auditHistory, checkMetadata} from './review-export.mjs';

test('release scan rejects private paths, PowerShell secrets and encoded package leaks without printing values', () => {
  for (const file of ['local-profile/state.json', '.env.prod', 'x/ditto-clock-display.json', 'work-sessions/state.json', 'x\\connection.json']) assert.throws(() => auditPath(file));
  const fake = ['gh', 'p_', 'Z'.repeat(36)].join('');
  for (const [name, bytes] of [
    ['tools/test.ps1', Buffer.from(fake)],
    ['test.impack.json', Buffer.from(JSON.stringify({files: [{path: 'entry.cjs', content: Buffer.from(fake).toString('base64')}]}))]
  ]) {
    assert.throws(() => auditContent(name, bytes), error => /Credential pattern/.test(error.message) && !error.message.includes(fake));
  }
  assert.throws(() => auditContent('test.impack.json', Buffer.from(JSON.stringify({files: [{path: '.env', content: ''}]}))), /Private\/generated/);
  assert.equal(auditContent('README.md', Buffer.from('Use your own connection.')), true);
});

test('release metadata check rejects a stale lock version', () => {
  const pkg = {name: 'fixture', version: '1.0.0', license: 'SEE LICENSE IN LICENSE', engines: {node: '>=22'}};
  const lock = {name: pkg.name, version: pkg.version, packages: {'': structuredClone(pkg)}};
  assert.doesNotThrow(() => checkMetadata(pkg, lock));
  lock.packages[''].version = '0.9.0';
  assert.throws(() => checkMetadata(pkg, lock), /Root lock version/);
});

test('history scan still catches a secret after removal from the latest revision', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ditto-history-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith('ditto-history-test-'));
    await fs.rm(dir, {recursive: true, force: true});
  });
  const git = (...args) => execFileSync('git', args, {cwd: dir, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  git('init');
  await fs.writeFile(path.join(dir, 'README.md'), 'Harmless fixture\n');
  git('add', '.');
  const commit = message => git('-c', 'user.name=Release test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', message);
  commit('Clean');
  assert.equal(auditHistory(dir).commits, 1);
  const fake = ['gh', 'p_', 'Z'.repeat(36)].join('');
  await fs.writeFile(path.join(dir, 'old.ps1'), fake);
  git('add', '.'); commit('Synthetic leak');
  git('rm', 'old.ps1'); commit('Remove synthetic leak');
  assert.throws(() => auditHistory(dir), error => /Credential pattern/.test(error.message) && !error.message.includes(fake));
});
