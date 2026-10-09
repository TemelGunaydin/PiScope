import { createDashboard } from './server.mjs';
import { terminalTodosFile } from './todos.mjs';
import { dataDirectory, ensureToken, acquireLock, saveConnection, parseTailscaleOrigin } from './config.mjs';

const port = Number(process.env.PORT || 7331);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('PORT must be an integer between 1024 and 65535'); process.exit(1);
}
const dir = dataDirectory(); let release; let app;
try {
  const tailscaleOrigin = parseTailscaleOrigin(process.env.AGENT_DASHBOARD_TAILSCALE_ORIGIN || undefined);
  const token = ensureToken(dir); release = acquireLock(dir);
  const controlEnabled = process.env.AGENT_DASHBOARD_CONTROL === '1';
  const controlToken = controlEnabled ? ensureToken(dir, 'control.token') : undefined;
  app = createDashboard({ dataDir: dir, token, tailscaleOrigin, controlToken, todosFile: terminalTodosFile() });
  const url = await app.listen(port); saveConnection(dir, url, token, tailscaleOrigin, controlEnabled);
  const controlLink = controlEnabled ? `\n  Control pairing (can start Pi work; private; do not share):\n  ${tailscaleOrigin || url}/#control-token=${controlToken}\n  Enable each Pi session with /dashboard-control on.\n` : '\n  Control: disabled (observation only).\n';
  const remote = tailscaleOrigin ? `\n  Tailscale browser pairing (private; do not share):\n  ${tailscaleOrigin}/#token=${token}\n  Requires Tailscale Serve (tailnet only, not Funnel):\n  tailscale serve --bg --https=${new URL(tailscaleOrigin).port || 443} ${url}\n` : '';
  console.log(`\n  PISCOPE  /  PI WORKFLOW DASHBOARD\n\n  Dashboard: ${url}\n  Browser pairing (private; do not share):\n  ${url}/#token=${token}\n${remote}${controlLink}\n  History: ${dir}\n  Pi: npm run install:pi -- /absolute/path/to/your/project\n\n  No direct model API calls. Approved control prompts use the existing Pi session.\n  Collector stays on loopback. Ctrl+C stops the monitor.\n`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await app.close(); release(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('exit', release);
} catch (err) {
  console.error('Cannot start dashboard:', err.message);
  if (app) await app.close().catch(() => {}); release?.(); process.exitCode = 1;
}
