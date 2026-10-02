import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTailscaleOrigin, saveConnection } from '../src/config.mjs';
import { directory, fixture, event, token } from './helpers.mjs';

const origin = 'https://dashboard.example-tailnet.ts.net';
const host = new URL(origin).host;
function raw(f, path, { headers = {}, method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(f.url + path, { method, headers: { Host: host, ...headers } }, res => {
      let text = ''; res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end(body);
  });
}

test('Tailscale origin is optional, explicit HTTPS with an exact ts.net host', () => {
  assert.equal(parseTailscaleOrigin(undefined), undefined);
  assert.equal(parseTailscaleOrigin(origin + '/'), origin);
  assert.equal(parseTailscaleOrigin(origin + ':8443'), origin + ':8443');
  for (const value of ['', null, 123, 'http://dashboard.example-tailnet.ts.net',
    'https://evil.example', 'https://dashboard.example-tailnet.ts.net.evil.example',
    'https://ts.net', 'https://127.0.0.1', 'https://100.98.63.17',
    'https://user:password@dashboard.example-tailnet.ts.net', origin + '/dashboard',
    origin + '?query=1', origin + '#token=secret']) {
    assert.throws(() => parseTailscaleOrigin(value), /Tailscale origin/);
  }
});

test('saved Pi URL stays local; optional browser URL is removed when disabled', t => {
  const dir = directory(t), local = 'http://127.0.0.1:7331';
  saveConnection(dir, local, token, origin);
  const read = () => JSON.parse(readFileSync(join(dir, 'connection.json'), 'utf8'));
  assert.deepEqual(read(), { url: local, token, tailscaleUrl: origin });
  saveConnection(dir, local, token);
  assert.deepEqual(read(), { url: local, token });
});

test('default server rejects a Tailscale host even with valid authentication', async t => {
  const f = await fixture(t);
  assert.equal((await raw(f, '/api/state', { headers: { Authorization: `Bearer ${token}` } })).status, 403);
});

test('Tailscale opt-in keeps loopback binding, private state and strict host/origin checks', async t => {
  const f = await fixture(t, { tailscaleOrigin: origin });
  assert.equal(f.app.server.address().address, '127.0.0.1');
  assert.equal((await raw(f, '/')).status, 200);
  for (const path of ['/api/state', '/api/events', '/api/export']) {
    assert.equal((await raw(f, path)).status, 401);
  }
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await raw(f, '/api/state', { headers: { ...auth, Origin: origin } })).status, 200);
  for (const headers of [
    { Host: 'other.example-tailnet.ts.net' }, { Host: host + '.evil.example' },
    { Host: host + ':8443' }, { Origin: 'https://evil.example' }, { Origin: 'null' },
    { Origin: origin.replace('https:', 'http:') }, { Origin: f.url },
    { Host: new URL(f.url).host, Origin: origin },
    { Host: new URL(f.url).host, 'X-Forwarded-For': '100.101.102.103' },
    { Host: 'evil.example', 'X-Forwarded-Host': host, 'X-Forwarded-Proto': 'https' }
  ]) {
    assert.equal((await raw(f, '/api/state', { headers: { ...auth, ...headers } })).status, 403);
  }
  assert.equal((await f.request('/api/state')).status, 200);
});

test('Tailscale pairing uses a Secure host-only cookie; remote ingestion stays disabled', async t => {
  const f = await fixture(t, { tailscaleOrigin: origin });
  const login = value => raw(f, '/api/login', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }) });
  assert.equal((await login('wrong')).status, 401);
  const paired = await login(token);
  assert.equal(paired.status, 200);
  const cookie = paired.headers['set-cookie'][0];
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/']) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes('Domain='));
  const headers = { Cookie: cookie.split(';')[0] };
  for (const path of ['/api/state', '/api/export']) assert.equal((await raw(f, path, { headers })).status, 200);
  const local = await f.request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.ok(!local.headers.get('set-cookie').includes('Secure'));
  const disguisedProxy = await f.request('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json',
    'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '100.101.102.103' }, body: JSON.stringify(event()) });
  assert.equal(disguisedProxy.status, 403);
  for (const credentials of [headers, { Authorization: `Bearer ${token}` }]) {
    assert.equal((await raw(f, '/api/events', { method: 'POST', headers: { ...credentials, 'Content-Type': 'application/json' }, body: JSON.stringify(event()) })).status, 403);
  }
  assert.equal(f.app.store.sequence, 0);
  assert.equal((await f.post(event('prompt.received', { prompt: 'Local Pi still works' }))).status, 200);
  const state = JSON.parse((await raw(f, '/api/state', { headers })).text);
  assert.equal(state.sessions[0].runs[0].prompt, 'Local Pi still works');
});

test('Tailscale supports an explicitly configured HTTPS port, not arbitrary ports', async t => {
  const f = await fixture(t, { tailscaleOrigin: origin + ':8443' });
  assert.equal((await raw(f, '/health', { headers: { Host: host + ':8443', Origin: origin + ':8443' } })).status, 200);
  assert.equal((await raw(f, '/health')).status, 403);
});
