import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { fixture, event, directory, token } from './helpers.mjs';
import { PiControl } from '../extensions/agent-dashboard/control.mjs';
import { MonitorClient } from '../extensions/agent-dashboard/client.mjs';
import { validateEvent } from '../extensions/agent-dashboard/events.mjs';
import { EventStore } from '../src/store.mjs';
import { ensureToken, saveConnection } from '../src/config.mjs';

const controlToken = 'b'.repeat(64);
const presence = { sessionId: 'session-a', projectId: 'project-a', owner: 'owner-a', runId: 'run-a', idle: true };
const input = { id: 'approved-1', sessionId: 'session-a', projectId: 'project-a', runId: 'run-a', prompt: 'Implement the approved test fix.' };
async function seed(f, overrides = {}) {
  for (const e of [event('prompt.received', { prompt: 'Synthetic initial work' }, overrides),
    event('workflow.updated', { stages: [{ id: 'done', title: 'Respond', status: 'done' }], recommendations: [{ id: 'test', title: 'Check the result', prompt: 'Run the relevant tests.' }] }, overrides),
    event('run.ended', { outcome: 'idle' }, overrides), event('run.settled', {}, overrides)]) await f.post(e);
}
async function pair(f, value = controlToken) {
  const response = await fetch(f.url + '/api/control/login', { method: 'POST', headers: { Origin: f.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }) });
  return { response, headers: { Cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), Origin: f.url, 'Content-Type': 'application/json' } };
}
const poll = (f, value = presence) => f.request('/api/control/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
const send = (f, headers, value = input) => fetch(f.url + '/api/control/requests', { method: 'POST', headers, body: JSON.stringify(value) });

test('control defaults off and requires distinct tokens', async t => {
  const f = await fixture(t);
  assert.deepEqual(await (await f.request('/api/control')).json(), { enabled: false, canSubmit: false });
  assert.equal((await pair(f)).response.status, 403);
  assert.equal((await poll(f)).status, 403);
  const { createDashboard } = await import('../src/server.mjs');
  assert.throws(() => createDashboard({ dataDir: f.dir, token, controlToken: token }), /separate strong token/);
});
test('control token is private, stable, distinct and never included in Pi connection metadata', t => {
  const dir = directory(t), view = ensureToken(dir), write = ensureToken(dir, 'control.token');
  assert.notEqual(view, write); assert.equal(ensureToken(dir, 'control.token'), write);
  assert.equal(statSync(join(dir, 'control.token')).mode & 0o777, 0o600);
  saveConnection(dir, 'http://127.0.0.1:7331', view, undefined, true);
  const metadata = readFileSync(join(dir, 'connection.json'), 'utf8'); assert.ok(!metadata.includes(write)); assert.equal(JSON.parse(metadata).controlEnabled, true);
  saveConnection(dir, 'http://127.0.0.1:7331', view); assert.equal(JSON.parse(readFileSync(join(dir, 'connection.json'), 'utf8')).controlEnabled, undefined);
});
test('read pairing cannot send work; control pairing needs exact Origin and private cookies', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); await poll(f);
  assert.equal((await pair(f, token)).response.status, 401);
  const paired = await pair(f); assert.equal(paired.response.status, 200);
  for (const cookie of paired.response.headers.getSetCookie()) { assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.ok(!cookie.includes('Domain=')); }
  const readHeaders = { Cookie: `agentdesk=${token}`, Origin: f.url, 'Content-Type': 'application/json' };
  assert.equal((await send(f, readHeaders)).status, 403);
  assert.equal((await send(f, { ...paired.headers, Origin: 'https://evil.example' })).status, 403);
  const { Origin, ...noOrigin } = paired.headers;
  assert.equal((await send(f, noOrigin)).status, 403);
  assert.equal((await send(f, { ...paired.headers, 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.request('/api/control/requests', { method: 'POST', headers: { Origin: f.url, 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status, 403);
  assert.equal(f.app.control.requests.size, 0);
});
test('an approved prompt is handed off once, receipts omit raw prompts and retries are idempotent', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); await poll(f); const { headers } = await pair(f);
  const prompt = 'Exact user text with api_key=PRIVATE_CONTROL_VALUE\nDo not alter my input.';
  const body = { ...input, prompt };
  assert.equal((await send(f, headers, body)).status, 202);
  assert.equal((await send(f, headers, body)).status, 202);
  assert.equal((await send(f, headers, { ...body, prompt: 'Different input' })).status, 409);
  assert.equal((await send(f, headers, { ...body, id: 'double-click' })).status, 409);
  const state = JSON.stringify(await (await f.request('/api/state')).json());
  assert.ok(!state.includes('PRIVATE_CONTROL_VALUE'));
  assert.ok(!readFileSync(join(f.dir, 'events.jsonl'), 'utf8').includes('PRIVATE_CONTROL_VALUE'));
  const claimed = await (await poll(f)).json(); assert.equal(claimed.command.prompt, prompt);
  assert.equal((await (await poll(f)).json()).command, null);
  await poll(f, { ...presence, ack: { id: input.id, status: 'submitted' } });
  assert.equal(f.app.control.requests.get(input.id).status, 'submitted');
  assert.equal((await send(f, headers, body)).status, 202);
  assert.equal((await send(f, headers, { ...body, id: 'another' })).status, 409);
  assert.ok(!JSON.stringify(f.app.control.snapshot()).includes(prompt));
  assert.ok(!('prompt' in f.app.control.requests.get(input.id)));
});
test('closed, busy, demo, unsettled, old-run and wrong-project targets cannot start', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); const { headers } = await pair(f);
  assert.equal((await send(f, headers)).status, 409);
  await poll(f, { ...presence, idle: false }); assert.equal((await send(f, headers)).status, 409);
  await poll(f); assert.equal((await send(f, headers, { ...input, projectId: 'other-project' })).status, 409);
  assert.equal((await send(f, headers, { ...input, runId: 'old-run' })).status, 409);
  f.app.store.sessions.get('session-a').runs.at(-1).settled = false;
  assert.equal((await send(f, headers)).status, 409);
  f.app.store.sessions.get('session-a').runs.at(-1).settled = true;
  f.app.store.sessions.get('session-a').connected = false;
  assert.equal((await send(f, headers)).status, 409);
  await seed(f, { sessionId: 'demo-session', demo: true });
  assert.equal((await poll(f, { ...presence, sessionId: 'demo-session' })).status, 409);
});
test('recommendations are bound to the exact preview and remain reports, not automatic execution', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); await poll(f); const { headers } = await pair(f);
  const { prompt, ...target } = input;
  const recommended = { ...target, recommendationId: 'test', expectedPrompt: 'Run the relevant tests.' };
  assert.equal(f.app.control.requests.size, 0);
  assert.equal((await send(f, headers, { ...recommended, expectedPrompt: 'Old suggestion' })).status, 409);
  assert.equal((await send(f, headers, { ...recommended, prompt: 'Injected' })).status, 400);
  assert.equal((await send(f, headers, recommended)).status, 202);
  assert.equal((await (await poll(f)).json()).command.prompt, 'Run the relevant tests.');
});
test('owner conflicts, stale claim races and explicit disable fail closed', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); await poll(f); const { headers } = await pair(f);
  assert.equal((await poll(f, { ...presence, owner: 'another-owner' })).status, 409);
  await send(f, headers);
  assert.equal((await (await poll(f, { ...presence, idle: false })).json()).command, null);
  assert.equal(f.app.control.requests.get(input.id).status, 'rejected');
  await poll(f); await send(f, headers, { ...input, id: 'second' });
  await poll(f, { ...presence, enabled: false });
  assert.equal(f.app.control.requests.get('second').status, 'rejected');
  assert.equal(f.app.control.snapshot().agents.length, 0);
});
test('lost delivery never retries, queued requests expire, and restart does not replay commands', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); let clock = Date.now(); f.app.control.now = () => clock;
  await poll(f); const { headers } = await pair(f); await send(f, headers); await poll(f);
  clock += 16000; f.app.control.sweep();
  assert.equal(f.app.control.requests.get(input.id).status, 'unknown');
  await poll(f); assert.equal((await (await poll(f)).json()).command, null);
  assert.equal((await send(f, headers, { ...input, id: 'retry-unknown' })).status, 409);
  const { ControlBroker } = await import('../src/control.mjs');
  assert.deepEqual(new ControlBroker(f.app.store).snapshot().requests, []);
  const other = await fixture(t, { controlToken }); await seed(other); let time = Date.now(); other.app.control.now = () => time;
  await poll(other); const paired = await pair(other); await send(other, paired.headers);
  time += 16000; other.app.control.sweep(); assert.equal(other.app.control.requests.get(input.id).status, 'expired');
});
test('Tailscale control pairing is Secure; remote Pi polling and ingestion remain prohibited', async t => {
  const origin = 'https://dashboard.test-tailnet.ts.net:8443';
  const f = await fixture(t, { controlToken, tailscaleOrigin: origin }); await seed(f); await poll(f);
  const raw = (path, body, cookie = '') => new Promise((resolve, reject) => {
    const req = request(f.url + path, { method: 'POST', headers: { Host: new URL(origin).host, Origin: origin, Cookie: cookie,
      'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' } }, res => {
      let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode, cookies: res.headers['set-cookie'], text }));
    }); req.on('error', reject); req.end(JSON.stringify(body));
  });
  const paired = await raw('/api/control/login', { token: controlToken }); assert.equal(paired.status, 200);
  for (const cookie of paired.cookies) assert.match(cookie, /; Secure/);
  const cookie = paired.cookies.map(c => c.split(';')[0]).join('; ');
  assert.equal((await raw('/api/control/requests', input, cookie)).status, 202);
  assert.equal((await raw('/api/control/agent', presence, cookie)).status, 403);
  assert.equal((await raw('/api/events', event(), cookie)).status, 403);
});
test('recommended text is bounded, redacted, safely projected and survives saved-summary restart', t => {
  const e = event('workflow.updated', { stages: [{ id: 'one', title: 'Respond', status: 'done' }], recommendations: [{ id: 'a', title: 'Check', prompt: 'api_key=SECRET_VALUE', private: 'DROP_ME' }] });
  const projected = validateEvent(e); assert.ok(!JSON.stringify(projected).includes('SECRET_VALUE')); assert.ok(!JSON.stringify(projected).includes('DROP_ME'));
  for (const list of [Array(6).fill(e.data.recommendations[0]), [e.data.recommendations[0], e.data.recommendations[0]], [{ id: 'a', title: '', prompt: 'x' }]]) assert.throws(() => validateEvent({ ...e, data: { ...e.data, recommendations: list } }));
  const dir = directory(t), store = new EventStore(dir); store.append(event('prompt.received', { prompt: 'Work' })); store.append(e); store.close();
  const restarted = new EventStore(dir); t.after(() => restarted.close());
  assert.equal(restarted.snapshot().projectOverview.items[0].latest.recommendations[0].id, 'a');
});
test('Pi control is opt-in, restores current run on reload, and uses sendUserMessage exactly once', async t => {
  let calls = [], polls = [], command = { ...input };
  const state = { identity: { sessionId: 'session-a', projectId: 'project-a' }, context: { isIdle: () => true, hasPendingMessages: () => false }, runId: undefined, running: false, settled: true };
  const control = new PiControl({ sendUserMessage: (...args) => calls.push(args) }, { async controlRequest(p) { polls.push(p); return { currentRunId: 'run-a', command }; } }, () => state);
  t.after(() => control.stop()); await control.poll(); assert.equal(polls.length, 0);
  await control.start(); assert.equal(calls.length, 1); assert.equal(calls[0][0], input.prompt); assert.deepEqual(calls[0][1], { expandPromptTemplates: false });
  await control.poll(); assert.equal(calls.length, 1); assert.equal(polls.at(-1).ack.status, 'submitted');
  command = null; await control.stop(); assert.equal(polls.at(-1).enabled, false);
});
test('Pi checks idle state, current identity and branch again after a network wait', async t => {
  for (const change of [state => state.context.isIdle = () => false, state => state.identity.sessionId = 'new-session', state => state.leaf = 'new-leaf', state => state.settled = false, state => state.context.hasPendingMessages = () => true]) {
    let calls = 0; const state = { identity: { sessionId: 'session-a', projectId: 'project-a' }, runId: 'run-a', running: false, settled: true, leaf: 'old-leaf' };
    state.context = { isIdle: () => true, hasPendingMessages: () => false, sessionManager: { getLeafId: () => state.leaf } };
    const control = new PiControl({ sendUserMessage: () => calls++ }, { async controlRequest() { change(state); return { command: input }; } }, () => state);
    t.after(() => control.stop()); await control.start(); assert.equal(calls, 0); assert.equal(control.acks[0].status, 'rejected');
  }
});
test('control transport rejects non-loopback URLs and disabled configuration before fetching', async t => {
  const path = join(directory(t), 'connection.json'); let calls = 0;
  const client = new MonitorClient({ configPath: path, fetchImpl: async () => { calls++; return Response.json({ command: null }); } }); t.after(() => client.stop());
  for (const url of ['https://evil.example', 'http://127.0.0.1:7331/?leak=1', 'http://user:pass@localhost:7331/']) {
    writeFileSync(path, JSON.stringify({ url, token, controlEnabled: true })); await assert.rejects(client.controlRequest(presence));
  }
  writeFileSync(path, JSON.stringify({ url: 'http://127.0.0.1:7331', token })); await assert.rejects(client.controlRequest(presence)); assert.equal(calls, 0);
});
test('invalid prompt bodies and bounded receipt capacity never dispatch', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); await poll(f); const { headers } = await pair(f);
  for (const prompt of [undefined, '', '   ', 'x'.repeat(8001), 'bad\u0000text']) assert.equal((await send(f, headers, { ...input, prompt })).status, 400);
  for (let i = 0; i < 100; i++) f.app.control.requests.set(`synthetic-${i}`, { ...input, id: `synthetic-${i}`, title: 'Synthetic', status: 'rejected', createdAt: Date.now() });
  assert.equal((await send(f, headers)).status, 429);
  assert.equal((await (await poll(f)).json()).command, null);
});
test('stale presence expires even if the Pi session itself still looks connected', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); let clock = Date.now(); f.app.control.now = () => clock;
  await poll(f); const { headers } = await pair(f); clock += 16000;
  assert.equal((await send(f, headers)).status, 409); assert.equal(f.app.control.snapshot().agents.length, 0);
});
test('a late rejection for an old command cannot remove a newer run reservation', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); await poll(f); const { headers } = await pair(f);
  await send(f, headers); await poll(f); await seed(f, { runId: 'run-b' });
  const newer = { ...presence, runId: 'run-b' }; await poll(f, newer);
  const next = { ...input, id: 'new-run-request', runId: 'run-b' }; assert.equal((await send(f, headers, next)).status, 202);
  const response = await (await poll(f, { ...newer, ack: { id: input.id, status: 'rejected' } })).json();
  assert.equal(response.command.id, next.id); assert.equal(f.app.control.reservations.get(input.sessionId).id, next.id);
  assert.equal((await send(f, headers, { ...next, id: 'duplicate-new-run' })).status, 409);
});
test('reservations remain visible after receipt expiry instead of offering a duplicate', async t => {
  const f = await fixture(t, { controlToken }); await seed(f); let clock = Date.now(); f.app.control.now = () => clock;
  await poll(f); const { headers } = await pair(f); await send(f, headers); await poll(f);
  clock += 601000; const snapshot = f.app.control.snapshot();
  assert.equal(snapshot.requests.length, 0); assert.deepEqual(snapshot.reservations, [{ sessionId: 'session-a', runId: 'run-a' }]);
});
test('revocation during a network wait cannot dispatch an already-claimed command', async t => {
  let resolve, calls = 0;
  const state = { identity: presence, runId: 'run-a', settled: true, context: { isIdle: () => true, hasPendingMessages: () => false } };
  const control = new PiControl({ sendUserMessage: () => calls++ }, { controlRequest: p => p.enabled === false ? Promise.resolve({ command: null }) : new Promise(r => resolve = r) }, () => state);
  t.after(() => control.stop()); const pending = control.start(); await control.stop(); resolve({ command: input }); await pending;
  assert.equal(calls, 0); assert.equal(control.enabled, false); assert.equal(control.seen.size, 0);
});
test('deduplication limits advertise a pause before accepting another command', async t => {
  let advertised;
  const state = { identity: presence, runId: 'run-a', settled: true, context: { isIdle: () => true, hasPendingMessages: () => false } };
  const control = new PiControl({}, { async controlRequest(p) { advertised = p; return { command: null }; } }, () => state);
  t.after(() => control.stop()); for (let i = 0; i < 100; i++) control.seen.add(`received-${i}`);
  await control.start(); assert.equal(advertised.idle, false); assert.equal(advertised.limited, true); assert.match(control.lastError, /limit reached/);
});
test('missing pending-message API cannot advertise safe idle control', async t => {
  const control = new PiControl({}, { async controlRequest() { return { command: input }; } }, () => ({ identity: presence, runId: 'run-a', settled: true, context: { isIdle: () => true } }));
  t.after(() => control.stop()); await control.start(); assert.equal(control.acks[0].status, 'rejected');
});
