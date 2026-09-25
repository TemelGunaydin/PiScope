import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, event, token } from './helpers.mjs';

test('server listens on loopback; static HTML contains no access token', async t => {
  const f = await fixture(t);
  assert.equal(f.app.server.address().address, '127.0.0.1');
  const response = await fetch(f.url); assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes(token));
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
});
test('private state and stream require authentication', async t => {
  const f = await fixture(t);
  for (const path of ['/api/state', '/api/events', '/api/export']) assert.equal((await fetch(f.url + path)).status, 401);
});
test('foreign Origin and Host are rejected', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/state', { headers: { Origin: 'https://evil.example' } })).status, 403);
  // Test Host directly; fetch implementations may normalize Host.
  const { request } = await import('node:http');
  const code = await new Promise(resolve => { const req = request(f.url + '/health', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.end(); });
  assert.equal(code, 403);
});
test('pairing sets HttpOnly cookie; cookie permits reads but not ingestion', async t => {
  const f = await fixture(t);
  const response = await fetch(f.url + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  const cookie = response.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const headers = { Cookie: cookie.split(';')[0] };
  assert.equal((await fetch(f.url + '/api/state', { headers })).status, 200);
  assert.equal((await fetch(f.url + '/api/events', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(event()) })).status, 403);
});
test('ingestion redacts before persistence and rejects invalid batch atomically', async t => {
  const f = await fixture(t); const e = event('prompt.received', { prompt: 'api_key=TOPSECRET' });
  assert.equal((await f.post(e)).status, 200);
  assert.ok(!readFileSync(join(f.dir, 'events.jsonl'), 'utf8').includes('TOPSECRET'));
  const before = f.app.store.sequence;
  assert.equal((await f.post([event(), event('bad.type')])).status, 400); assert.equal(f.app.store.sequence, before);
});
test('SSE immediately supplies a snapshot and delivers updates', async t => {
  const f = await fixture(t); const controller = new AbortController(); t.after(() => controller.abort());
  const response = await f.request('/api/events', { signal: controller.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const reader = response.body.getReader(); const initial = new TextDecoder().decode((await reader.read()).value);
  assert.match(initial, /event: snapshot/);
  await f.post(event('prompt.received', { prompt: 'live message' }));
  const updated = new TextDecoder().decode((await reader.read()).value);
  assert.match(updated, /live message/); controller.abort();
});
test('reconnected SSE includes durable latest state, not a blank session', async t => {
  const f = await fixture(t); await f.post(event('prompt.received', { prompt: 'keep me' }));
  for (let i = 0; i < 2; i++) {
    const controller = new AbortController(); const response = await f.request('/api/events', { signal: controller.signal });
    const value = new TextDecoder().decode((await response.body.getReader().read()).value);
    assert.match(value, /keep me/); controller.abort();
  }
});
test('malformed JSON, unknown paths and non-JSON ingestion fail safely', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })).status, 400);
  assert.equal((await f.request('/api/events', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await f.request('/auth.token')).status, 404);
});
