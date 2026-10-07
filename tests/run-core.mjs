// The only excluded suite renders real video and requires external FFmpeg.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const files = fs.readdirSync(path.join(root, 'tests'))
  .filter(name => /^ditto.*\.test\.mjs$/.test(name) && name !== 'ditto-studio.test.mjs')
  .sort().map(name => path.join(root, 'tests', name));
if (!files.length) throw new Error('No core tests found.');
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root, stdio: 'inherit', windowsHide: true
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
