import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EventStore } from '../src/store.mjs';
import { directory, event } from './helpers.mjs';

test('duplicate event IDs are idempotent', t => {
  const store = new EventStore(directory(t)), e = event('message.completed', { usage: { input: 10 }, model: 'test/model' });
  assert.equal(store.append(e).duplicate, false); assert.equal(store.append(e).duplicate, true);
  assert.equal(Object.keys(store.snapshot().sessions[0].runs[0].usage).length, 1);
});
test('history survives restart without falsely showing a live process', t => {
  const dir = directory(t); const a = new EventStore(dir);
  a.append(event('prompt.received', { prompt: 'My request' }));
  const b = new EventStore(dir); assert.equal(b.snapshot().sessions[0].runs[0].prompt, 'My request');
  assert.equal(b.snapshot().sessions[0].connected, false);
});
test('corrupt trailing journal record does not discard valid history', t => {
  const dir = directory(t), store = new EventStore(dir); store.append(event());
  appendFileSync(join(dir, 'events.jsonl'), '{truncated');
  const restored = new EventStore(dir); assert.equal(restored.sessions.size, 1); assert.equal(restored.warnings.length, 1);
});
test('subagent token usage is replaced, not repeatedly summed', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.progress', { agentCallId: 'mimo-1', agent: 'mimo', model: 'provider/model', usage: { input: 10, output: 4 } }));
  store.append(event('agent.finished', { agentCallId: 'mimo-1', agent: 'mimo', model: 'provider/model', usage: { input: 20, output: 7 }, isError: false }));
  const r = store.snapshot().sessions[0].runs[0];
  assert.equal(Object.keys(r.usage).length, 1); assert.equal(r.usage['agent:mimo-1'].input, 20);
});
test('waiting for main agent after a child failure is not success', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'mimo-1', agent: 'mimo', isError: true }));
  store.append(event('run.ended', { outcome: 'idle' }));
  const r = store.snapshot().sessions[0].runs[0]; assert.equal(r.status, 'idle'); assert.equal(r.agents['mimo-1'].status, 'error');
  assert.deepEqual(r.stages, []);
});
test('sessions and requests are isolated', t => {
  const store = new EventStore(directory(t));
  store.append(event('prompt.received', { prompt: 'first' }));
  store.append(event('prompt.received', { prompt: 'second' }, { sessionId: 'session-b', projectId: 'project-b' }));
  store.append(event('prompt.received', { prompt: 'third' }, { runId: 'run-b' }));
  assert.equal(store.sessions.size, 2); assert.equal(store.sessions.get('session-a').runs.length, 2);
});
test('rotation retains bounded journal files', t => {
  const dir = directory(t), store = new EventStore(dir, { maxBytes: 800 });
  for (let i = 0; i < 12; i++) store.append(event('message.completed', { summary: `event-${i}` }));
  assert.ok(existsSync(join(dir, 'events.2.jsonl')));
  assert.equal(readdirSync(dir).filter(s => s.endsWith('.jsonl')).length, 3);
});
test('heartbeat does not write to disk and log permissions are private', t => {
  const dir = directory(t), store = new EventStore(dir);
  store.append(event('session.heartbeat', {}, { runId: undefined })); assert.equal(existsSync(join(dir, 'events.jsonl')), false);
  store.append(event()); assert.equal(statSync(join(dir, 'events.jsonl')).mode & 0o777, 0o600);
});
test('prototype-like tool IDs are stored safely', t => {
  const store = new EventStore(directory(t)); store.append(event('tool.started', { toolCallId: '__proto__', toolName: 'read' }));
  const tools = store.snapshot().sessions[0].runs[0].tools;
  assert.equal(Object.getPrototypeOf(tools), null); assert.equal(tools.__proto__.name, 'read');
});
test('requested model remains distinguishable until observed', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.started', { agentCallId: 'a', model: 'p/m', source: 'requested' }));
  assert.equal(store.sessions.get('session-a').runs[0].agents.a.modelSource, 'requested');
  store.append(event('agent.progress', { agentCallId: 'a', model: 'p/other', source: 'observed' }));
  assert.equal(store.sessions.get('session-a').runs[0].agents.a.modelSource, 'observed');
});

test('valid writes after recovering a torn record are readable on next restart', t => {
  const dir = directory(t); const original = new EventStore(dir); original.append(event());
  appendFileSync(join(dir, 'events.jsonl'), '{torn-record');
  const recovered = new EventStore(dir); recovered.append(event('prompt.received', { prompt: 'after recovery' }, { runId: 'run-new' }));
  const again = new EventStore(dir);
  assert.equal(again.sessions.get('session-a').runs.find(r => r.id === 'run-new').prompt, 'after recovery');
});

test('automatic continuation clears the old end time', t => {
  const store = new EventStore(directory(t)); store.append(event('run.ended', { outcome: 'idle' }));
  store.append(event('run.started', { model: 'p/model' }));
  const run = store.sessions.get('session-a').runs[0]; assert.equal(run.status, 'running'); assert.equal(run.endedAt, undefined);
});
