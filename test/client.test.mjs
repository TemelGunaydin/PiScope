import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { MonitorClient } from '../extensions/agent-dashboard/client.mjs';
import { MAX_BATCH_BYTES } from '../extensions/agent-dashboard/spool.mjs';
import { createDashboard } from '../src/server.mjs';
import { directory, event, token, fixture } from './helpers.mjs';

const accepted = (_url, options) => Promise.resolve(Response.json({ accepted: JSON.parse(options.body).length }));
const offline = async () => { throw new Error('offline'); };
function client(t, options = {}, dir = directory(t)) {
  const configPath = join(dir, 'connection.json');
  if (!existsSync(configPath)) writeFileSync(configPath, JSON.stringify({ url: 'http://127.0.0.1:7331', token }));
  const instance = new MonitorClient({ configPath, fetchImpl: accepted, ...options });
  t.after(async () => { await instance.stop(); rmSync(dir, { recursive: true, force: true }); });
  return instance;
}
const queueIds = c => c.queue.map(e => e.id);
const record = id => event('prompt.received', { prompt: id }, { id });
const clientModule = new URL('../extensions/agent-dashboard/client.mjs', import.meta.url).href;
function crashWriter(configPath, ids = ['old-1', 'old-2']) {
  const program = `import { MonitorClient } from ${JSON.stringify(clientModule)};
    const client = new MonitorClient({configPath: process.argv[1]});
    for(const event of JSON.parse(process.argv[2])) if(!client.enqueue(event)) throw new Error('enqueue failed');
    process.kill(process.pid, 'SIGKILL');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program, configPath, JSON.stringify(ids.map(record))], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.signal, 'SIGKILL', result.stderr);
}

test('construction has no side effects; accepted data is private and redacted before disk', t => {
  const c = client(t); assert.equal(existsSync(c.spool.root), false);
  const raw = event('tool.started', { model: 'api_key=MODEL_SECRET', toolName: 'write', file: 'file.txt', prompt: 'password=PROMPT_SECRET', content: 'RAW_SOURCE', requestedModel: 'IGNORED', headers: { authorization: 'SECRET_HEADER' } });
  assert.equal(c.enqueue(raw), true);
  const pending = c.spool.records[0]; const text = readFileSync(pending.file, 'utf8');
  for (const secret of ['MODEL_SECRET', 'PROMPT_SECRET', 'RAW_SOURCE', 'IGNORED', 'SECRET_HEADER']) assert.ok(!text.includes(secret));
  assert.equal(statSync(pending.file).mode & 0o777, 0o600);
  assert.equal(statSync(dirname(pending.file)).mode & 0o777, 0o700);
  assert.equal(statSync(c.spool.root).mode & 0o777, 0o700);
  raw.data.file = 'changed'; assert.equal(c.queue[0].data.file, 'file.txt');
});

test('offline stop and same-process reload recover older events before new ones', async t => {
  const dir = directory(t), first = client(t, { fetchImpl: offline }, dir);
  first.enqueue(record('one')); first.enqueue(record('two')); await first.flush(true);
  assert.equal(first.status, 'disconnected'); await first.stop();
  const sent = [], next = client(t, { fetchImpl: async (url, options) => { sent.push(...JSON.parse(options.body)); return accepted(url, options); } }, dir);
  next.enqueue(record('three'));
  assert.deepEqual(queueIds(next), ['one', 'two', 'three']);
  assert.equal(next.spool.recovered, 2);
  assert.deepEqual(next.queue.map(e => e.recovered), [true, true, false]);
  await next.flush(true); assert.equal(next.queue.length, 0);
  assert.deepEqual(sent.map(e => e.id), ['one', 'two', 'three']);
});

test('events survive SIGKILL without stop or a running dashboard', async t => {
  const c = client(t); crashWriter(c.configPath);
  c.enqueue(record('fresh'));
  assert.deepEqual(queueIds(c), ['old-1', 'old-2', 'fresh']);
  await c.flush(true); assert.equal(c.queue.length, 0);
});

test('active producers do not claim or acknowledge each other', async t => {
  const dir = directory(t), a = client(t, { fetchImpl: offline }, dir), b = client(t, {}, dir);
  a.enqueue(record('a')); b.enqueue(record('b'));
  assert.deepEqual(queueIds(a), ['a']); assert.deepEqual(queueIds(b), ['b']);
  const file = a.spool.records[0].file; await b.flush(true); assert.ok(existsSync(file));
  await a.stop(); await b.stop();
  const c = client(t, {}, dir); c.openSpool(); assert.deepEqual(queueIds(c), ['a']);
});

test('concurrent processes claim an abandoned directory exactly once', async t => {
  const c = client(t); crashWriter(c.configPath);
  const program = `import { MonitorClient } from ${JSON.stringify(clientModule)};
    const c = new MonitorClient({configPath: process.argv[1], fetchImpl: async(_u,o)=>Response.json({accepted: JSON.parse(o.body).length})});
    c.openSpool(); console.log(JSON.stringify(c.queue.map(e=>e.id)));
    await new Promise(r=>setTimeout(r,100)); await c.stop();`;
  const worker = () => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', program, c.configPath]);
    let out = '', err = ''; p.stdout.on('data', x => { out += x; }); p.stderr.on('data', x => { err += x; });
    p.once('error', reject); p.once('close', code => code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err)));
  });
  const results = await Promise.all([worker(), worker()]);
  assert.deepEqual(results.flat().sort(), ['old-1', 'old-2']);
});

test('queue pressure preserves the in-flight prefix and reports rejected additions', async t => {
  let resolve;
  const c = client(t, { maxQueue: 2, fetchImpl: () => new Promise(r => { resolve = r; }) });
  c.enqueue(record('first')); const flight = c.flush(true);
  assert.equal(c.enqueue(record('second')), true); assert.equal(c.enqueue(record('third')), false);
  assert.equal(c.dropped, 1); assert.deepEqual(queueIds(c), ['first', 'second']);
  resolve(Response.json({ accepted: 1 })); await flight;
  assert.deepEqual(queueIds(c), ['second']); c.fetch = accepted;
});

test('byte limits refuse new writes without removing previously accepted files', t => {
  const c = client(t); c.enqueue(record('first'));
  c.spool.maxBytes = c.spool.bytes;
  assert.equal(c.enqueue(record('second')), false);
  assert.deepEqual(queueIds(c), ['first']); assert.equal(c.dropped, 1);
  assert.ok(existsSync(c.spool.records[0].file));
});

test('HTTP batches honor encoded byte bounds for large multibyte events', async t => {
  const bodies = [], c = client(t, { fetchImpl: async (url, options) => { bodies.push(options.body); return accepted(url, options); } });
  for (let i = 0; i < 8; i++) assert.equal(c.enqueue(event('prompt.received', { prompt: '😀'.repeat(6000), task: '😀'.repeat(2000), summary: '😀'.repeat(2000), tools: Array.from({ length: 50 }, (_, n) => ({ id: String(n), file: 'x'.repeat(512), name: 'read' })) })), true);
  while (c.queue.length) await c.flush(true);
  assert.ok(bodies.length > 1);
  assert.ok(bodies.every(b => Buffer.byteLength(b) <= MAX_BATCH_BYTES));
  assert.equal(bodies.flatMap(JSON.parse).length, 8);
});

test('invalid acknowledgements and transient HTTP errors retain durable records', async t => {
  const responses = [Response.json({}), new Response('broken'), new Response('', { status: 401 }), new Response('', { status: 503 })];
  const c = client(t, { fetchImpl: async () => responses.shift() }); c.enqueue(record('one'));
  const file = c.spool.records[0].file;
  for (let i = 0; i < 4; i++) { await c.flush(true); assert.ok(existsSync(file)); assert.equal(c.queue.length, 1); }
  c.fetch = accepted; await c.flush(true); assert.equal(c.queue.length, 0);
});

test('permanent rejection isolates the offending event instead of dropping neighbors', async t => {
  const delivered = [], c = client(t, { fetchImpl: async (url, options) => {
    const batch = JSON.parse(options.body);
    if (batch.some(e => e.id === 'poison')) return new Response('', { status: 400 });
    delivered.push(...batch.map(e => e.id)); return accepted(url, options);
  } });
  for (const id of ['before', 'poison', 'after']) c.enqueue(record(id));
  for (let n = 0; c.queue.length && n < 8; n++) await c.flush(true);
  assert.equal(c.queue.length, 0); assert.deepEqual(delivered, ['before', 'after']); assert.equal(c.dropped, 1);
  assert.equal(readdirSync(join(c.spool.root, 'quarantine')).length, 1);
  assert.match(c.persistenceError, /rejected/);
});

test('corrupt and incomplete files are quarantined while valid history recovers', async t => {
  const dir = directory(t), a = client(t, { fetchImpl: offline }, dir);
  a.enqueue(record('broken')); a.enqueue(record('valid'));
  writeFileSync(a.spool.records[0].file, '{incomplete');
  writeFileSync(join(dirname(a.spool.records[0].file), '000000000003.json.tmp'), '{torn');
  await a.stop();
  const b = client(t, {}, dir); b.openSpool();
  assert.deepEqual(queueIds(b), ['valid']); assert.equal(b.spool.corrupt, 2);
  assert.equal(readdirSync(join(b.spool.root, 'quarantine')).length, 2);
  await b.flush(true); assert.equal(b.queue.length, 0);
});

test('storage failures never throw into Pi and are visible until a successful write', t => {
  const c = client(t); writeFileSync(c.spool.root, 'not a directory');
  assert.equal(c.enqueue(record('not-persisted')), false); assert.equal(c.queue.length, 0);
  assert.match(c.persistenceError, /not persisted/); assert.equal(c.dropped, 1);
  rmSync(c.spool.root); assert.equal(c.enqueue(record('persisted')), true);
  assert.equal(c.persistenceError, '');
});

test('heartbeats coalesce without taking durable capacity or surviving restart', async t => {
  const dir = directory(t), a = client(t, { fetchImpl: offline, maxQueue: 1 }, dir);
  a.enqueue(record('real-event'));
  for (let i = 0; i < 100; i++) a.enqueue(event('session.heartbeat'));
  assert.equal(a.queue.length, 1); assert.equal(a.dropped, 0);
  await a.stop(); const b = client(t, {}, dir); b.openSpool();
  assert.deepEqual(queueIds(b), ['real-event']); assert.equal(b.heartbeat, undefined);
});

test('late response after shutdown cannot remove records claimed by a new client', async t => {
  let resolve;
  const dir = directory(t), a = client(t, { fetchImpl: () => new Promise(r => { resolve = r; }) }, dir);
  a.enqueue(record('pending')); const flight = a.flush(true); await a.stop();
  const b = client(t, {}, dir); b.openSpool(); const file = b.spool.records[0].file;
  resolve(Response.json({ accepted: 1 })); await flight;
  assert.ok(existsSync(file)); await b.flush(true); assert.equal(b.queue.length, 0);
});

test('collector restart after lost acknowledgement does not double-count replayed tokens', async t => {
  const storage = directory(t), sender = directory(t);
  let app = createDashboard({ dataDir: storage, token }); let url = await app.listen(0);
  t.after(async () => { await app.close(); });
  const configPath = join(sender, 'connection.json');
  writeFileSync(configPath, JSON.stringify({ url, token }));
  const a = client(t, { fetchImpl: async (u, o) => { const response = await fetch(u, o); await response.text(); throw new Error('ack lost'); } }, sender);
  a.enqueue(event('run.started', { model: 'provider/any' }));
  a.enqueue(event('message.completed', { usage: { input: 123, output: 7 } }));
  a.enqueue(event('run.ended', { outcome: 'idle' }));
  await a.flush(true); assert.equal(app.store.sequence, 3); await a.stop();
  await app.close(); app = createDashboard({ dataDir: storage, token }); url = await app.listen(0);
  writeFileSync(configPath, JSON.stringify({ url, token }));
  const b = client(t, { fetchImpl: fetch }, sender); b.openSpool(); await b.flush(true);
  assert.equal(b.queue.length, 0); assert.equal(app.store.sequence, 3);
  assert.equal(Object.values(app.store.snapshot().sessions[0].runs[0].usage)[0].input, 123);
});

test('recovery delivers original chronology without fabricating live Pi presence', async t => {
  const { app, url } = await fixture(t), sender = directory(t);
  writeFileSync(join(sender, 'connection.json'), JSON.stringify({ url, token }));
  const a = client(t, { fetchImpl: offline }, sender);
  const old = '2026-01-01T00:00:00.000Z';
  a.enqueue(event('run.started', { model: 'provider/old' }, { time: old })); await a.stop();
  const b = client(t, { fetchImpl: fetch }, sender); b.openSpool(); await b.flush(true);
  const session = app.store.snapshot().sessions[0];
  assert.equal(session.connected, false); assert.equal(session.lastSeen, old);
  assert.equal(session.runs[0].performance.verdict, 'unknown'); assert.equal(session.runs[0].performance.fresh, false);
});
