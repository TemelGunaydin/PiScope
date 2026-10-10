import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EventStore } from './store.mjs';
import { equalSecret, cookieValue } from './security.mjs';
import { validateEvent } from './events.mjs';
import { parseTailscaleOrigin } from './config.mjs';
import { ControlBroker } from './control.mjs';
import { TerminalTodos } from './todos.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/control.js', ['control.js', 'text/javascript; charset=utf-8']],
  ['/report.js', ['report.js', 'text/javascript; charset=utf-8']],
  ['/notes.js', ['notes.js', 'text/javascript; charset=utf-8']],
  ['/note-request.js', ['../extensions/agent-dashboard/note-request.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/icon.png', ['icon.png', 'image/png']],
  ['/icon-64.png', ['icon-64.png', 'image/png']],
  ['/apple-touch-icon.png', ['apple-touch-icon.png', 'image/png']],
  ['/favicon.ico', ['favicon.ico', 'image/x-icon']]
]);
const publicDir = new URL('../public/', import.meta.url);
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function json(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value));
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON content type required'), { status: 415 });
  const raw = await new Promise((resolve, reject) => {
    let size = 0, rejected = false; const chunks = [];
    req.on('data', chunk => {
      if (rejected) return;
      size += chunk.length;
      if (size > 256 * 1024) {
        rejected = true; chunks.length = 0;
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        return; // Keep draining without buffering; do not destroy the response socket.
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', err => reject(Object.assign(err, { status: 400 })));
    req.on('aborted', () => reject(Object.assign(new Error('Request aborted'), { status: 400 })));
  });
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

export function createDashboard({ dataDir, token, maxBytes, heartbeatMs = 15000, tailscaleOrigin, controlToken, todosFile, todosPollMs = 2000 }) {
  if (!token || token.length < 24) throw new Error('A strong local access token is required');
  const remoteOrigin = parseTailscaleOrigin(tailscaleOrigin);
  if (controlToken !== undefined && (!/^[a-f0-9]{64}$/.test(controlToken) || equalSecret(controlToken, token))) throw new Error('Control requires a separate strong token');
  const todos = new TerminalTodos(dataDir, todosFile);
  const store = new EventStore(dataDir, { maxBytes });
  const control = controlToken ? new ControlBroker(store, { validTodo: ref => { todos.refresh(); return todos.available && todos.tasks.some(t => t.ref === ref); } }) : undefined;
  const snapshot = () => ({ ...store.snapshot(), control: control?.snapshot() || { enabled: false, agents: [], requests: [] }, terminalTodos: { ...todos.snapshot(), activity: todos.file ? store.todoMemory.snapshot(store.sessions) : [] } });
  const clients = new Set(); let updateTimer; let origins = new Map();
  function sendSnapshot(client) {
    if (client.destroyed) return;
    // Disconnect slow consumers rather than accumulating unbounded buffers.
    if (client.writableLength > 1024 * 1024) { client.destroy(); return; }
    client.write(`id: ${store.sequence}\nevent: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
  }
  function announce() {
    if (updateTimer) return;
    updateTimer = setTimeout(() => { updateTimer = null; for (const client of clients) sendSnapshot(client); }, 180);
    updateTimer.unref();
  }
  const controlView = () => JSON.stringify([control?.snapshot(), store.todoMemory.snapshot(store.sessions), [...store.reportMemory.entries.values()].map(r => [r.id, r.status])], (key, value) => key === 'until' ? undefined : value);
  let controlSignature = controlView();
  function controlChanged() {
    const next = controlView();
    if (next !== controlSignature) { controlSignature = next; announce(); }
  }
  const controlTimer = control ? setInterval(controlChanged, 1000) : undefined;
  controlTimer?.unref();
  const todosTimer = todosFile ? setInterval(() => { if (todos.refresh()) announce(); }, todosPollMs) : undefined;
  todosTimer?.unref();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', CSP);
    try {
      // Serve preserves Host. Never trust X-Forwarded-* to authorize a host or TLS.
      const requestOrigin = origins.get(req.headers.host?.toLowerCase());
      if (!requestOrigin) return json(res, 403, { error: 'Host rejected' });
      if (req.headers.origin && req.headers.origin !== requestOrigin) return json(res, 403, { error: 'Origin rejected' });
      const remote = requestOrigin === remoteOrigin;
      // Serve adds forwarding headers. A proxied caller must not select the
      // local-only ingestion path by spoofing a loopback Host. Headers can deny
      // access here, but never grant it or expand the host allowlist.
      const forwarded = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'].some(name => req.headers[name] !== undefined);
      if (forwarded && !remote) return json(res, 403, { error: 'Proxy requests require the configured Tailscale host' });
      const url = new URL(req.url, requestOrigin);
      if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { ok: true, version: '0.1.0' });
      if (assets.has(url.pathname) && req.method === 'GET') {
        const [name, contentType] = assets.get(url.pathname);
        res.writeHead(200, { 'Content-Type': contentType });
        return res.end(readFileSync(new URL(name, publicDir)));
      }
      if (url.pathname === '/api/control/login' && req.method === 'POST') {
        if (!control || req.headers.origin !== requestOrigin) return json(res, 403, { error: 'Control is disabled or exact Origin is missing' });
        const input = await body(req);
        if (!equalSecret(input?.token, controlToken)) return json(res, 401, { error: 'Invalid control token' });
        const flags = `; HttpOnly; SameSite=Strict${remote ? '; Secure' : ''}`;
        res.setHeader('Set-Cookie', [`agentdesk=${token}; Path=/${flags}`, `piscope-control=${controlToken}; Path=/api/control${flags}`]);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const input = await body(req);
        if (!equalSecret(input?.token, token)) return json(res, 401, { error: 'Invalid token' });
        // Only the explicitly configured Serve origin receives a Secure cookie.
        res.setHeader('Set-Cookie', `agentdesk=${token}; HttpOnly; SameSite=Strict; Path=/${remote ? '; Secure' : ''}`);
        return json(res, 200, { ok: true });
      }
      const headerToken = (req.headers.authorization || '').replace(/^Bearer /, '');
      const authorizedHeader = equalSecret(headerToken, token);
      if (!authorizedHeader && !equalSecret(cookieValue(req.headers.cookie, 'agentdesk'), token)) return json(res, 401, { error: 'Open the pairing URL printed by npm start' });
      if (url.pathname === '/api/control' && req.method === 'GET') return json(res, 200, { enabled: Boolean(control), canSubmit: Boolean(control && equalSecret(cookieValue(req.headers.cookie, 'piscope-control'), controlToken)) });
      if (url.pathname === '/api/control/report-preview' && req.method === 'GET') {
        if (!control || !equalSecret(cookieValue(req.headers.cookie, 'piscope-control'), controlToken)) return json(res, 403, { error: 'Pair this browser with the separate control link first' });
        return json(res, 200, control.reportPreview(Object.fromEntries(url.searchParams)));
      }
      if (url.pathname === '/api/control/todo-link' && req.method === 'POST') {
        if (!control || req.headers.origin !== requestOrigin || !equalSecret(cookieValue(req.headers.cookie, 'piscope-control'), controlToken)) return json(res, 403, { error: 'Pair this browser with the separate control link first' });
        todos.setLink(await body(req), store.reportProjects()); announce();
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/control/requests' && req.method === 'POST') {
        if (!control || req.headers.origin !== requestOrigin || !equalSecret(cookieValue(req.headers.cookie, 'piscope-control'), controlToken)) return json(res, 403, { error: 'Pair this browser with the separate control link first' });
        const receipt = control.submit(await body(req)); controlChanged(); return json(res, 202, receipt);
      }
      if (url.pathname === '/api/control/agent' && req.method === 'POST') {
        if (!control || remote || forwarded || !authorizedHeader) return json(res, 403, { error: 'Pi control polling requires a local bearer token and control opt-in' });
        const result = control.agent(await body(req)); controlChanged();
        return json(res, 200, result);
      }
      if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, snapshot());
      if (url.pathname === '/api/export' && req.method === 'GET') {
        res.setHeader('Content-Disposition', 'attachment; filename="agent-workflow-history.json"');
        const { terminalTodos, ...history } = snapshot();
        return json(res, 200, history);
      }
      if (url.pathname === '/api/events' && req.method === 'POST') {
        if (remote) return json(res, 403, { error: 'Event ingestion is local-only' });
        if (!authorizedHeader) return json(res, 403, { error: 'Ingestion requires a bearer token' });
        const input = await body(req); const batch = Array.isArray(input) ? input : [input];
        if (!batch.length || batch.length > 40) return json(res, 400, { error: 'Expected 1–40 events' });
        // Validate the complete batch before mutating any state.
        try { for (const e of batch) validateEvent(e); } catch (err) { return json(res, 400, { error: err.message }); }
        let accepted = 0;
        for (const e of batch) if (!store.append(e).duplicate) accepted++;
        announce(); return json(res, 200, { accepted });
      }
      if (url.pathname === '/api/events' && req.method === 'GET') {
        if (clients.size >= 12) return json(res, 429, { error: 'Too many dashboard connections' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('retry: 2000\n\n'); clients.add(res); sendSnapshot(res);
        const ping = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, heartbeatMs);
        ping.unref();
        res.on('close', () => { clients.delete(res); clearInterval(ping); });
        return;
      }
      return json(res, 404, { error: 'Not found' });
    } catch (err) {
      if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : 'Storage or server failure; check the terminal' });
      else res.end();
      if (!err.status) console.error('Dashboard request failed:', err.message);
    }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  return {
    server, store, control, todos,
    async listen(port = 7331) {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
      const actualPort = server.address().port;
      origins = new Map(['127.0.0.1', 'localhost'].map(host => [`${host}:${actualPort}`, `http://${host}:${actualPort}`]));
      if (remoteOrigin) {
        const remote = new URL(remoteOrigin);
        origins.set(remote.host, remoteOrigin);
        if (!remote.port) origins.set(`${remote.hostname}:443`, remoteOrigin);
      }
      return `http://127.0.0.1:${actualPort}`;
    },
    async close() {
      clearTimeout(updateTimer); clearInterval(controlTimer); clearInterval(todosTimer); for (const client of clients) client.destroy();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      store.close();
    }
  };
}
