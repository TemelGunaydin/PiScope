import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { dataDirectory } from '../src/config.mjs';
try {
  const { url, token } = JSON.parse(readFileSync(join(dataDirectory(), 'connection.json'), 'utf8'));
  const local = new URL(url);
  if (local.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(local.hostname)) throw new Error('Invalid local URL');
  const target = `${local.origin}/#token=${token}`;
  if (process.platform !== 'darwin' && process.platform !== 'linux') throw new Error('Use the pairing URL from npm start on this OS');
  const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { stdio: 'ignore', detached: true });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; }); child.unref();
} catch (error) { console.error('Start the dashboard first:', error.message); process.exitCode = 1; }
