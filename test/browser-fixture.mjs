// Isolated collector for browser-smoke.py. Never writes to the user's dashboard.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import https from 'node:https';
import { createDashboard } from '../src/server.mjs';
import { saveConnection } from '../src/config.mjs';

const dir = mkdtempSync(join(tmpdir(), 'agentdesk-browser-'));
const token = randomBytes(32).toString('hex');
let app, proxy, url, tailscaleOrigin;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    await app?.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
try {
  if (process.argv.includes('--tailscale')) {
    // Simulate Serve's HTTPS termination + preserved Host without changing the tailnet.
    await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=dashboard.test-tailnet.ts.net', '-keyout', join(dir, 'test.key'), '-out', join(dir, 'test.crt')]);
    proxy = https.createServer({ key: readFileSync(join(dir, 'test.key')), cert: readFileSync(join(dir, 'test.crt')) }, (req, res) => {
      const upstream = http.request(url, { path: req.url, method: req.method, headers: {
        ...req.headers, 'x-forwarded-host': req.headers.host, 'x-forwarded-proto': 'https', 'x-forwarded-for': '100.101.102.103'
      } }, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    });
    await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
    tailscaleOrigin = `https://dashboard.test-tailnet.ts.net:${proxy.address().port}`;
  }
  app = createDashboard({ dataDir: dir, token, tailscaleOrigin });
  url = await app.listen(0);
  saveConnection(dir, url, token, tailscaleOrigin);
  await promisify(execFile)(process.execPath, ['scripts/demo.mjs', '--fast', '--hold'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, AGENT_DASHBOARD_HOME: dir }
  });
  // Keep demo records to prove they remain hidden. A distinct live copy exercises
  // the real UI; both are synthetic, and exist only in this disposable collector.
  const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map(line => {
    const e = JSON.parse(line);
    return { ...e, id: randomUUID(), demo: false, sessionId: `fixture-${e.sessionId}`,
      projectId: `fixture-${e.projectId}`, projectName: 'Fixture Playground' };
  });
  for (const event of events) app.store.append(event);
  // Read only by the parent test process; never uses the user's access token.
  console.log(JSON.stringify({ url, token, tailscaleUrl: tailscaleOrigin }));
} catch (error) {
  await close();
  throw error;
}
