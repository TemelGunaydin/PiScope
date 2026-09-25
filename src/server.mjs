import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EventStore } from './store.mjs';
import { equalSecret, cookieValue } from './security.mjs';
import { validateEvent } from './events.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);
const publicDir = new URL('../public/', import.meta.url);
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function json(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value));
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON content type required'), { status: 415 });
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

export function createDashboard({ dataDir, token, maxBytes, heartbeatMs = 15000 }) {
  if (!token || token.length < 24) throw new Error('A strong local access token is required');
  const store = new EventStore(dataDir, { maxBytes });
  const clients = new Set(); let updateTimer; let origins = new Set();
  function sendSnapshot(client) {
    if (client.destroyed) return;
    // Disconnect slow consumers rather than accumulating unbounded buffers.
    if (client.writableLength > 1024 * 1024) { client.destroy(); return; }
    client.write(`id: ${store.sequence}\nevent: snapshot\ndata: ${JSON.stringify(store.snapshot())}\n\n`);
  }
  function announce() {
    if (updateTimer) return;
    updateTimer = setTimeout(() => { updateTimer = null; for (const client of clients) sendSnapshot(client); }, 180);
    updateTimer.unref();
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', CSP);
    try {
      const requestOrigin = `http://${req.headers.host}`;
      if (!origins.has(requestOrigin)) return json(res, 403, { error: 'Host rejected' });
      if (req.headers.origin && !origins.has(req.headers.origin)) return json(res, 403, { error: 'Origin rejected' });
      const url = new URL(req.url, requestOrigin);
      if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { ok: true, version: '0.1.0' });
      if (assets.has(url.pathname) && req.method === 'GET') {
        const [name, contentType] = assets.get(url.pathname);
        res.writeHead(200, { 'Content-Type': contentType });
        return res.end(readFileSync(new URL(name, publicDir)));
      }
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const input = await body(req);
        if (!equalSecret(input?.token, token)) return json(res, 401, { error: 'Invalid token' });
        // HTTP is intentionally loopback-only. SameSite+Origin checks restrict browser cross-site access.
        res.setHeader('Set-Cookie', `agentdesk=${token}; HttpOnly; SameSite=Strict; Path=/`);
        return json(res, 200, { ok: true });
      }
      const headerToken = (req.headers.authorization || '').replace(/^Bearer /, '');
      const authorizedHeader = equalSecret(headerToken, token);
      if (!authorizedHeader && !equalSecret(cookieValue(req.headers.cookie, 'agentdesk'), token)) return json(res, 401, { error: 'Open the pairing URL printed by npm start' });
      if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, store.snapshot());
      if (url.pathname === '/api/export' && req.method === 'GET') {
        res.setHeader('Content-Disposition', 'attachment; filename="agent-workflow-history.json"');
        return json(res, 200, store.snapshot());
      }
      if (url.pathname === '/api/events' && req.method === 'POST') {
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
    server, store,
    async listen(port = 7331) {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
      const actualPort = server.address().port;
      origins = new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]);
      return `http://127.0.0.1:${actualPort}`;
    },
    async close() {
      clearTimeout(updateTimer); for (const client of clients) client.destroy();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
