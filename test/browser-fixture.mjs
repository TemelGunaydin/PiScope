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
import { MonitorClient } from '../extensions/agent-dashboard/client.mjs';
import { registerMonitor } from '../extensions/agent-dashboard/monitor.mjs';

const dir = mkdtempSync(join(tmpdir(), 'agentdesk-browser-'));
const token = randomBytes(32).toString('hex');
const controlToken = process.argv.includes('--control') ? randomBytes(32).toString('hex') : undefined;
let app, proxy, url, tailscaleOrigin, mockShutdown;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    await mockShutdown?.();
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
  app = createDashboard({ dataDir: dir, token, tailscaleOrigin, controlToken });
  url = await app.listen(0);
  saveConnection(dir, url, token, tailscaleOrigin, Boolean(controlToken));
  if (controlToken) {
    const handlers = new Map(), commands = new Map(), tools = new Map(); let idle = true, finish;
    const ctx = { cwd: '/synthetic/Control-Fixture', model: { provider: 'synthetic', id: 'current-model' }, isIdle: () => idle,
      hasPendingMessages: () => false, sessionManager: { getSessionId: () => 'browser-control-fixture' }, ui: { notify() {} } };
    const pi = { on: (n, f) => handlers.set(n, f), registerCommand: (n, c) => commands.set(n, c), registerTool: t => tools.set(t.name, t),
      sendUserMessage(prompt) {
        idle = false; handlers.get('before_agent_start')({ prompt }, ctx); handlers.get('agent_start')({}, ctx);
        finish = setTimeout(async () => {
          const reportId = /^PiScope daily work summary\. Request ID: ([a-zA-Z0-9_.:\-]+)/.exec(prompt)?.[1];
          if (reportId && prompt.includes('REPORT_PROVIDER_FAILURE_FIXTURE')) {
            handlers.get('agent_end')({ messages: [{ role: 'assistant', stopReason: 'error', errorMessage: 'Synthetic provider overload during report generation.', content: [] }] }, ctx);
            idle = true; handlers.get('agent_settled')({}, ctx); return;
          }
          const reportDay = /recorded work for (\d{4}-\d{2}-\d{2})/.exec(prompt)?.[1];
          if (reportId) await tools.get('daily_report').execute('mock-daily', { requestId: reportId, summary: `Daily ${reportDay}: Control-Fixture — Calendar navigation and reminder handling were improved together.${prompt.includes('OTHER_PROJECT_CONTEXT') ? ' Other Project — recorded work remains unresolved.' : ''} Literal <img src=x onerror=alert(1)> stays text.`, remaining: 'Export is still blocked by a provider failure; no test pass is independently verified.' }, undefined, undefined, ctx);
          await tools.get('workflow_report').execute('mock-report', { stages: [{ id: 'respond', title: 'Respond', status: 'done' }], recommendations: [{ id: 'check', title: 'Check the result', prompt: 'Run the relevant tests.' }] }, undefined, undefined, ctx);
          handlers.get('agent_end')({ messages: [{ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Synthetic response; no model called.' }] }] }, ctx);
          idle = true; handlers.get('agent_settled')({}, ctx);
        }, 1200);
      } };
    const client = new MonitorClient({ configPath: join(dir, 'connection.json') });
    registerMonitor(pi, { schema: {}, reportSchema: {}, client }); handlers.get('session_start')({}, ctx);
    handlers.get('before_agent_start')({ prompt: 'Synthetic completed request' }, ctx); handlers.get('agent_start')({}, ctx);
    await tools.get('workflow_report').execute('mock-report', { stages: [{ id: 'respond', title: 'Respond', status: 'done' }], recommendations: [{ id: 'check', title: 'Check the result', prompt: 'Run the relevant tests.' }] }, undefined, undefined, ctx);
    handlers.get('agent_end')({ messages: [{ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Synthetic response; no model called.' }] }] }, ctx);
    handlers.get('agent_settled')({}, ctx); await client.flush(true);
    await commands.get('dashboard-control').handler('on', ctx);
    mockShutdown = async () => { clearTimeout(finish); await handlers.get('session_shutdown')({}, ctx); };
  } else {
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
  }
  // Read only by the parent test process; never uses the user's access token.
  console.log(JSON.stringify({ url, token, tailscaleUrl: tailscaleOrigin, controlToken }));
} catch (error) {
  await close();
  throw error;
}
