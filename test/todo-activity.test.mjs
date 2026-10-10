import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { EventStore } from '../src/store.mjs';
import { TerminalTodos } from '../src/todos.mjs';
import { ControlBroker } from '../src/control.mjs';
import { createDashboard } from '../src/server.mjs';
import { directory, event, fixture } from './helpers.mjs';
import { noteRequestPrompt } from '../extensions/agent-dashboard/note-request.mjs';

const ref = 'c'.repeat(64), other = 'd'.repeat(64), controlToken = 'b'.repeat(64);
const input = (extra = {}) => ({ id: 'approved-note', todoRef: ref, projectId: 'project-a', sessionId: 'session-a', baseRunId: 'base-run', createdAt: new Date().toISOString(), ...extra });
function harness(t) {
  const cleanups = [], dir = directory({ after: fn => cleanups.push(fn) }), store = new EventStore(dir), stores = [store];
  t.after(() => { try { for (const s of stores.toReversed()) s.close(); } finally { for (const cleanup of cleanups) cleanup(); } });
  const emit = (type, data = {}, fields = {}) => store.append(event(type, data, { runId: 'bound-run', controlRequestId: 'approved-note', ...fields }));
  const activity = () => store.todoMemory.snapshot(store.sessions).find(a => a.todoRef === ref);
  store.todoMemory.start(input());
  return { dir, store, stores, emit, activity };
}
const sourceData = (created_at = 1720000000, title = 'Original synthetic note') => ({ version: 2, next_id: 3, tasks: [1, 2].map(id => ({ id, title, created_at, completed: false, project: 'Same name' })) });

test('note identity is path + ID + creation time, not text, label or project name', t => {
  const dir = directory(t), path = join(dir, 'todos.json'); writeFileSync(path, JSON.stringify(sourceData()));
  const reader = new TerminalTodos(directory(t), path), first = reader.tasks[0].ref;
  assert.notEqual(first, reader.tasks[1].ref);
  writeFileSync(path, JSON.stringify(sourceData(1720000000, 'Edited in the source'))); reader.refresh(); assert.equal(reader.tasks[0].ref, first);
  writeFileSync(path, JSON.stringify(sourceData(1720000001))); reader.refresh(); assert.notEqual(reader.tasks[0].ref, first);
  const second = join(dir, 'other.json'); writeFileSync(second, JSON.stringify(sourceData())); assert.notEqual(new TerminalTodos(directory(t), second).tasks[0].ref, first);
});
test('tracking source cannot alias the private activity file before EventStore loads or writes it', t => {
  const dir = directory(t), path = join(dir, 'todo-activity.json'), bytes = JSON.stringify(sourceData()); writeFileSync(path, bytes);
  const otherDir = directory(t); symlinkSync(dir, join(otherDir, 'alias'), 'dir');
  for (const file of [path, join(otherDir, 'alias', 'todo-activity.json')]) assert.throws(() => createDashboard({ dataDir: dir, token: 'a'.repeat(64), todosFile: file }), /source cannot be/);
  assert.equal(readFileSync(path, 'utf8'), bytes); assert.deepEqual(readdirSync(dir), ['todo-activity.json']);
});
test('Pending is not Sent; bound IDs alone link progress and final literal reply', t => {
  const f = harness(t); assert.equal(f.activity().status, 'queued'); assert.equal(f.activity().detailAvailable, false);
  f.store.todoMemory.delivery('approved-note', 'submitted'); assert.equal(f.activity().status, 'sent');
  for (const fields of [{ controlRequestId: undefined }, { controlRequestId: 'unrelated' }, { sessionId: 'other-session' }, { projectId: 'other-project' }, { runId: 'base-run' }]) f.emit('prompt.received', { prompt: 'Same prompt is insufficient' }, fields);
  assert.equal(f.activity().status, 'sent'); assert.equal(f.activity().runId, undefined);
  f.emit('prompt.received', { prompt: 'Edited draft, not the original note' }); f.emit('run.started', { model: 'synthetic/model' });
  assert.equal(f.activity().status, 'running'); assert.equal(f.activity().detailAvailable, true);
  f.emit('run.ended', { outcome: 'idle', summary: 'Yanıt <img src=x> api_key=PRIVATE_VALUE' });
  assert.equal(f.activity().status, 'reply'); assert.match(f.activity().summary, /Yanıt <img/); assert.ok(!f.activity().summary.includes('PRIVATE_VALUE'));
  assert.match(f.activity().reason, /not verification/);
  f.store.todoMemory.delivery('approved-note', 'unknown', 'Late ack'); assert.equal(f.activity().status, 'reply');
});
test('final outcome, not intermediate text, determines reply/error/unknown; retry clears old reply', t => {
  const f = harness(t); f.emit('prompt.received'); f.emit('run.started'); f.emit('message.completed', { summary: 'Working on it' });
  f.emit('run.ended', { outcome: 'idle', summary: '' }); assert.equal(f.activity().status, 'unknown'); assert.equal(f.activity().summary, '');
  f.emit('run.started'); f.emit('run.ended', { outcome: 'idle', summary: 'First complete reply' }); assert.equal(f.activity().status, 'reply');
  f.emit('run.started'); assert.equal(f.activity().status, 'running'); assert.equal(f.activity().summary, '');
  f.emit('run.ended', { outcome: 'error', errorMessage: 'Provider overload api_key=PRIVATE_VALUE', summary: '' });
  assert.equal(f.activity().status, 'error'); assert.match(f.activity().reason, /Provider overload/); assert.ok(!f.activity().reason.includes('PRIVATE_VALUE'));
  f.emit('run.started'); f.emit('run.ended', { outcome: 'aborted', summary: 'Interrupted text' }); assert.equal(f.activity().status, 'unknown');
});
test('child failure cannot become Reply ready solely because the primary model ended idle', t => {
  const f = harness(t); f.emit('prompt.received'); f.emit('run.started'); f.emit('agent.finished', { agentCallId: 'child', status: 'error', isError: true });
  f.emit('run.ended', { outcome: 'idle', summary: 'This does not prove success' }); assert.equal(f.activity().status, 'error');
});
test('new approved attempt replaces only that note; old/wrong runs cannot overwrite it', t => {
  const f = harness(t); f.emit('prompt.received'); f.emit('run.started'); f.emit('run.ended', { outcome: 'idle', summary: 'First reply' });
  f.store.todoMemory.start(input({ id: 'second-attempt' }));
  f.store.todoMemory.start(input({ todoRef: other, id: 'other-note' }));
  f.emit('run.ended', { outcome: 'error' }); assert.equal(f.activity().id, 'second-attempt'); assert.equal(f.activity().status, 'queued');
  f.emit('prompt.received', {}, { controlRequestId: 'second-attempt', runId: 'second-run' });
  f.emit('run.ended', { outcome: 'idle', summary: 'Unrelated run' }, { controlRequestId: 'second-attempt', runId: 'wrong-run' }); assert.equal(f.activity().status, 'running');
  assert.equal(f.store.todoMemory.entries.get(other).status, 'queued');
  assert.throws(() => f.store.todoMemory.start(input({ id: 'duplicate-other', todoRef: other })), /already has a pending/);
});
test('timeouts, restart and signal loss are Unknown, never replay or invented completion', t => {
  const f = harness(t); f.store.todoMemory.delivery('approved-note', 'submitted'); f.store.todoMemory.sweep(Date.now() + 31000); assert.equal(f.activity().status, 'unknown');
  f.emit('prompt.received'); f.emit('run.started'); f.store.sessions.get('session-a').connected = false; assert.equal(f.activity().status, 'unknown');
  f.store.close(); const restored = new EventStore(f.dir); f.stores.push(restored);
  assert.equal(restored.todoMemory.snapshot(restored.sessions)[0].status, 'unknown'); assert.equal(new ControlBroker(restored).requests.size, 0);
  assert.throws(() => restored.todoMemory.start(input()), /already recorded/);
  restored.append(event('run.ended', { outcome: 'idle', summary: 'Captured completion after restart' }, { runId: 'bound-run', controlRequestId: 'approved-note' }));
  assert.equal(restored.todoMemory.snapshot(restored.sessions)[0].status, 'reply');
});
test('retained excerpt survives journal replay and expired run detail; no note/draft database', t => {
  const f = harness(t); f.emit('prompt.received', { prompt: 'DO_NOT_STORE_DRAFT_IN_ACTIVITY' }); f.emit('run.started'); f.emit('run.ended', { outcome: 'idle', summary: 'Retained reply' });
  for (let i = 0; i < 35; i++) f.emit('run.ended', { outcome: 'idle' }, { runId: `later-${i}`, controlRequestId: undefined });
  assert.equal(f.activity().detailAvailable, false); assert.equal(f.activity().summary, 'Retained reply'); f.store.close();
  const path = join(f.dir, 'todo-activity.json'); assert.equal(statSync(path).mode & 0o777, 0o600); assert.ok(!readFileSync(path, 'utf8').includes('DO_NOT_STORE_DRAFT'));
  const restored = new EventStore(f.dir); f.stores.push(restored); const activity = restored.todoMemory.snapshot(restored.sessions)[0];
  assert.equal(activity.status, 'reply'); assert.equal(activity.summary, 'Retained reply'); assert.equal(activity.detailAvailable, false);
});
test('bounded activity and corruption preserve originals without importing or executing work', t => {
  const f = harness(t);
  for (let i = 0; i < 505; i++) f.store.todoMemory.entries.set(i.toString(16).padStart(64, '0'), input({ todoRef: i.toString(16).padStart(64, '0'), id: `note-${i}`, status: 'unknown' }));
  f.store.todoMemory.dirty = true; f.store.close(); assert.equal(f.store.todoMemory.entries.size, 500);
  writeFileSync(join(f.dir, 'todo-activity.json'), '{broken'); const restored = new EventStore(f.dir); f.stores.push(restored);
  assert.equal(restored.todoMemory.entries.size, 0); assert.ok(restored.warnings.some(w => /Note activity was unreadable/.test(w)));
  const saved = readdirSync(f.dir).find(p => p.startsWith('todo-activity.json.invalid-')); assert.equal(readFileSync(join(f.dir, saved), 'utf8'), '{broken');
});
test('activity persistence failure aborts before queueing a command and preserves previous outcome', t => {
  const f = harness(t); f.emit('prompt.received'); f.emit('run.started'); f.emit('run.ended', { outcome: 'idle', summary: 'Previous response' });
  const flush = f.store.todoMemory.flush; f.store.todoMemory.flush = () => { throw new Error('Synthetic storage failure'); };
  assert.throws(() => f.store.todoMemory.start(input({ id: 'failed-write' })), /storage failure/); assert.equal(f.activity().id, 'approved-note'); assert.equal(f.activity().summary, 'Previous response');
  f.store.todoMemory.flush = flush;
});
test('tracked Other request validates source + capability, exact identity and opt-ins; no source completion or export', async t => {
  const sourceDir = directory(t), source = join(sourceDir, 'todos.json'); writeFileSync(source, JSON.stringify(sourceData()), { mode: 0o640 });
  const before = readFileSync(source), modified = statSync(source).mtimeMs;
  const f = await fixture(t, { todosFile: source, controlToken });
  for (const type of ['prompt.received', 'run.ended', 'run.settled']) await f.post(event(type, type === 'run.ended' ? { outcome: 'idle' } : {}, { runId: 'base-run' }));
  await f.post(event('model.selected', { model: 'synthetic/current' }, { runId: undefined }));
  const note = f.app.todos.tasks[0], second = f.app.todos.tasks[1];
  const paired = await fetch(f.url + '/api/control/login', { method: 'POST', headers: { Origin: f.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: controlToken }) });
  const headers = { Cookie: paired.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), Origin: f.url, 'Content-Type': 'application/json' };
  const send = value => fetch(f.url + '/api/control/requests', { method: 'POST', headers, body: JSON.stringify(value) });
  const request = { ...input({ todoRef: note.ref }), runId: 'base-run', expectedModel: 'synthetic/current', prompt: noteRequestPrompt('approved-note', 'PREFIX\nEdited draft only') };
  assert.equal((await send(request)).status, 409);
  const presence = { owner: 'owner-a', sessionId: 'session-a', projectId: 'project-a', runId: 'base-run', idle: true, model: 'synthetic/current' };
  f.app.control.agent(presence); assert.equal((await send(request)).status, 409);
  f.app.control.agent({ ...presence, canTrack: true });
  assert.equal((await send({ ...request, todoRef: 'bad' })).status, 400);
  assert.equal((await send({ ...request, reportDay: '2026-01-01' })).status, 400);
  for (const prompt of ['PREFIX\nEdited draft only', noteRequestPrompt('other-id', 'Draft'), noteRequestPrompt(request.id, '  '), noteRequestPrompt(request.id, 'x'.repeat(8000))]) {
    assert.equal((await send({ ...request, prompt })).status, 400);
    assert.equal(f.app.control.requests.size, 0); assert.equal(f.app.store.todoMemory.entries.size, 0);
  }
  assert.equal((await send(request)).status, 202); assert.equal((await send(request)).status, 202);
  assert.equal((await send({ ...request, todoRef: second.ref })).status, 409);
  const command = f.app.control.agent({ ...presence, canTrack: true }).command; assert.equal(command.prompt, request.prompt); assert.equal(command.controlRequestId, request.id);
  assert.equal(f.app.control.agent({ ...presence, canTrack: true }).command, null);
  f.app.control.agent({ ...presence, canTrack: true, ack: { id: request.id, status: 'submitted' } });
  assert.equal(f.app.store.todoMemory.entries.get(note.ref).status, 'sent'); assert.equal(f.app.store.todoMemory.entries.has(second.ref), false);
  const state = await (await f.request('/api/state')).json(); assert.equal(state.terminalTodos.activity[0].todoRef, note.ref);
  const exported = await (await f.request('/api/export')).json(); assert.equal(exported.terminalTodos, undefined);
  assert.equal((await f.request('/todo-activity.json')).status, 404);
  assert.deepEqual(readFileSync(source), before); assert.equal(statSync(source).mtimeMs, modified); assert.deepEqual(readdirSync(sourceDir), ['todos.json']);
  assert.ok(f.app.todos.tasks.every(t => !t.completed));
});
test('changed/missing source fails before tracking or sending; definite expiry is Error', async t => {
  const dir = directory(t), source = join(dir, 'todos.json'); writeFileSync(source, JSON.stringify(sourceData()));
  const f = await fixture(t, { todosFile: source, controlToken });
  for (const type of ['prompt.received', 'run.ended', 'run.settled']) f.app.store.append(event(type, type === 'run.ended' ? { outcome: 'idle' } : {}, { runId: 'base-run' }));
  f.app.store.append(event('model.selected', { model: 'synthetic/current' }, { runId: undefined }));
  let now = Date.now(); f.app.control.now = () => now;
  const presence = { model: 'synthetic/current', owner: 'owner-a', sessionId: 'session-a', projectId: 'project-a', runId: 'base-run', idle: true, canTrack: true };
  f.app.control.agent(presence); const note = f.app.todos.tasks[0], request = { ...input({ todoRef: note.ref }), runId: 'base-run', expectedModel: 'synthetic/current', prompt: noteRequestPrompt('approved-note', 'Draft') };
  writeFileSync(source, '{broken'); assert.throws(() => f.app.control.submit(request), /source note is unavailable/); assert.equal(f.app.control.requests.size, 0);
  writeFileSync(source, JSON.stringify(sourceData(1720000001))); assert.throws(() => f.app.control.submit(request), /changed identity/);
  writeFileSync(source, JSON.stringify(sourceData())); f.app.control.submit(request); now += 16000; f.app.control.sweep(); assert.equal(f.app.store.todoMemory.entries.get(note.ref).status, 'error');
});
