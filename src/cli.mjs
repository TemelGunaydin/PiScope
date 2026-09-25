import { createDashboard } from './server.mjs';
import { dataDirectory, ensureToken, acquireLock, saveConnection } from './config.mjs';

const port = Number(process.env.PORT || 7331);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('PORT must be an integer between 1024 and 65535'); process.exit(1);
}
const dir = dataDirectory(); let release; let app;
try {
  const token = ensureToken(dir); release = acquireLock(dir);
  app = createDashboard({ dataDir: dir, token });
  const url = await app.listen(port); saveConnection(dir, url, token);
  console.log(`\n  AGENT DESK  /  LOCAL WORKFLOW MONITOR\n\n  Dashboard: ${url}\n  Browser pairing (private; do not share):\n  ${url}/#token=${token}\n\n  History: ${dir}\n  Pi: npm run install:pi -- /absolute/path/to/your/project\n  Demo: npm run demo\n\n  No model API calls. Loopback only. Ctrl+C stops the monitor.\n`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await app.close(); release(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('exit', release);
} catch (err) {
  console.error('Cannot start dashboard:', err.message);
  if (app) await app.close().catch(() => {}); release?.(); process.exitCode = 1;
}
