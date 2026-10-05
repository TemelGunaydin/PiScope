import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, event, token, snapshots } from './helpers.mjs';

test('server listens on loopback; static HTML contains no access token', async t => {
  const f = await fixture(t);
  assert.equal(f.app.server.address().address, '127.0.0.1');
  const response = await fetch(f.url); assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes(token));
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
});
test('branding assets are public, typed, and keep Host/Origin and private-file boundaries', async t => {
  const f = await fixture(t);
  for (const [path, type, size] of [
    ['/icon.png', 'image/png', 1024], ['/icon-64.png', 'image/png', 64],
    ['/apple-touch-icon.png', 'image/png', 180], ['/favicon.ico', 'image/x-icon']
  ]) {
    const response = await fetch(f.url + path); // Pairing is not required for public branding.
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes, readFileSync(new URL(`../public${path}`, import.meta.url)));
    if (size) {
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
    } else {
      assert.deepEqual([...bytes.subarray(0, 4)], [0, 0, 1, 0]);
      assert.equal(bytes.readUInt16LE(4), 3);
      assert.deepEqual([6, 22, 38].map(offset => bytes[offset]), [48, 32, 16]);
    }
    assert.equal((await fetch(f.url + path, { headers: { Origin: 'https://evil.example' } })).status, 403);
    const { request } = await import('node:http');
    const code = await new Promise(resolve => {
      const req = request(f.url + path, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.end();
    });
    assert.equal(code, 403);
  }
  for (const path of ['/icon.json', '/auth.token', '/connection.json', '/daily-reports.json', '/src/config.mjs']) {
    assert.equal((await f.request(path)).status, 404);
  }
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
  const response = await f.request('/api/events', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) });
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const stream = snapshots(response.body);
  const initial = (await stream.next()).value;
  assert.deepEqual(initial.sessions, []);
  await f.post(event('prompt.received', { prompt: 'live message' }));
  const updated = (await stream.next()).value;
  assert.equal(updated.sessions[0].runs[0].prompt, 'live message');
  // Close the reader before aborting fetch; otherwise decoder cancellation can reject.
  await stream.return(); controller.abort();
});
test('reconnected SSE includes durable latest state, not a blank session', async t => {
  const f = await fixture(t); await f.post(event('prompt.received', { prompt: 'keep me' }));
  for (let i = 0; i < 2; i++) {
    const controller = new AbortController(); t.after(() => controller.abort());
    const response = await f.request('/api/events', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) });
    const stream = snapshots(response.body);
    const value = (await stream.next()).value;
    assert.equal(value.sessions[0].runs[0].prompt, 'keep me');
    await stream.return(); controller.abort();
  }
});
test('SSE snapshot reader handles split UTF-8, retry frames and coalesced snapshots', async () => {
  const bytes = new TextEncoder().encode('retry: 2000\n\n: heartbeat\n\nevent: snapshot\ndata: {"prompt":"İş"}\n\nevent: snapshot\ndata: {"prompt":"updated"}\n\n');
  const split = bytes.indexOf(0xc4) + 1; // Split inside the first Turkish character.
  const body = new ReadableStream({ start(controller) {
    for (const chunk of [bytes.slice(0, 7), bytes.slice(7, split), bytes.slice(split)]) controller.enqueue(chunk);
    controller.close();
  } });
  const stream = snapshots(body);
  assert.deepEqual((await stream.next()).value, { prompt: 'İş' });
  assert.deepEqual((await stream.next()).value, { prompt: 'updated' });
  await assert.rejects(stream.next(), /stream ended/);
});
test('SSE snapshot reader does not hide read or cleanup errors', async () => {
  for (const error of [new Error('SSE connection lost'), new DOMException('Unexpected abort', 'AbortError')]) {
    const failed = new ReadableStream({ start(controller) { controller.error(error); } });
    await assert.rejects(snapshots(failed).next(), actual => actual === error);

    let source;
    const body = new ReadableStream({ start(controller) {
      source = controller;
      controller.enqueue(new TextEncoder().encode('event: snapshot\ndata: {"sessions":[]}\n\n'));
    } });
    const stream = snapshots(body);
    assert.deepEqual((await stream.next()).value, { sessions: [] });
    source.error(error);
    await new Promise(resolve => setImmediate(resolve)); // Let the decoder receive the failure.
    await assert.rejects(stream.return(), actual => actual === error);
  }
});
test('malformed JSON, unknown paths and non-JSON ingestion fail safely', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })).status, 400);
  assert.equal((await f.request('/api/events', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await f.request('/auth.token')).status, 404);
});

test('state snapshot exposes derived performance and project history', async t => {
  const f = await fixture(t);
  await f.post(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', isError: false }));
  await f.post(event('run.ended', { outcome: 'idle' }));
  const state = await (await f.request('/api/state')).json();
  assert.equal(state.sessions[0].runs[0].performance.verdict, 'completed');
  assert.equal(state.projects[0].live.completed, 1);
  assert.equal(state.projects[0].live.technicalCompletionRatio, 1);
  assert.equal(state.projectOverview.items[0].status, 'finished');
  assert.equal(state.dailyReport.records[0].verdict, 'completed');
  const reportModule = await fetch(f.url + '/report.js');
  assert.equal(reportModule.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await reportModule.text(), /initializeDailyReport/);
  const exported = await (await f.request('/api/export')).json();
  assert.deepEqual(exported.projectOverview, state.projectOverview);
  assert.deepEqual(exported.dailyReport, state.dailyReport);
});

test('oversized ingestion is refused without accepting an event', async t => {
  const f = await fixture(t); const huge = JSON.stringify(event('prompt.received', { prompt: 'x'.repeat(300000) }));
  const response = await f.request('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: huge });
  assert.equal(response.status, 413); assert.equal(f.app.store.sequence, 0);
});
