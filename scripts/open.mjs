import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { dataDirectory, parseTailscaleOrigin } from '../src/config.mjs';
try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--tailscale')) throw new Error('Usage: npm run open [-- --tailscale]');
  const { url, token, tailscaleUrl } = JSON.parse(readFileSync(join(dataDirectory(), 'connection.json'), 'utf8'));
  const local = new URL(url);
  if (local.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(local.hostname)) throw new Error('Invalid local URL');
  const remote = args.includes('--tailscale');
  if (remote && !tailscaleUrl) throw new Error('Start the dashboard with AGENT_DASHBOARD_TAILSCALE_ORIGIN first');
  const origin = remote ? parseTailscaleOrigin(tailscaleUrl) : local.origin;
  const target = `${origin}/#token=${token}`;
  if (process.platform !== 'darwin' && process.platform !== 'linux') throw new Error('Use the pairing URL from npm start on this OS');
  const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { stdio: 'ignore', detached: true });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; }); child.unref();
} catch (error) { console.error('Start the dashboard first:', error.message); process.exitCode = 1; }
