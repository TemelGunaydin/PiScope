import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { dataDirectory, parseTailscaleOrigin } from '../src/config.mjs';
try {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--tailscale', '--control'].includes(arg))) throw new Error('Usage: npm run open [-- --tailscale] [--control]');
  const { url, token, tailscaleUrl, controlEnabled } = JSON.parse(readFileSync(join(dataDirectory(), 'connection.json'), 'utf8'));
  const local = new URL(url);
  if (local.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(local.hostname)) throw new Error('Invalid local URL');
  const remote = args.includes('--tailscale');
  if (remote && !tailscaleUrl) throw new Error('Start the dashboard with AGENT_DASHBOARD_TAILSCALE_ORIGIN first');
  const origin = remote ? parseTailscaleOrigin(tailscaleUrl) : local.origin;
  if (args.includes('--control') && !controlEnabled) throw new Error('Start with AGENT_DASHBOARD_CONTROL=1 first');
  const controlToken = args.includes('--control') ? readFileSync(join(dataDirectory(), 'control.token'), 'utf8').trim() : undefined;
  if (controlToken && !/^[a-f0-9]{64}$/.test(controlToken)) throw new Error('Invalid control token');
  const target = `${origin}/#${controlToken ? 'control-token' : 'token'}=${controlToken || token}`;
  if (process.platform !== 'darwin' && process.platform !== 'linux') throw new Error('Use the pairing URL from npm start on this OS');
  const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { stdio: 'ignore', detached: true });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; }); child.unref();
} catch (error) { console.error('Start the dashboard first:', error.message); process.exitCode = 1; }
