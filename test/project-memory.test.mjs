import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventStore } from '../src/store.mjs';
import { PROJECT_LIMIT } from '../src/project-memory.mjs';
import { event } from './helpers.mjs';

function setup(t, options) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-desk-memory-')), stores = [];
  const open = () => { const store = new EventStore(dir, options); stores.push(store); return store; };
  t.after(() => { try { for (const s of stores) s.close(); } finally { rmSync(dir, { recursive: true, force: true }); } });
  return { dir, store: open(), open };
}
const overview = s => s.snapshot().projectOverview.items;
const weekAgo = new Date(Date.now() - 8 * 86400000).toISOString();
const plan = status => ({ stages: [{ id: 'build', title: 'Build the overview', status }] });

test('provider errors survive restart and detail eviction without replacing model replies', t => {
  const { store, open } = setup(t);
  store.append(event('prompt.received', { prompt: 'Synthetic task' }));
  store.append(event('message.completed', { summary: 'Earlier recorded response', errorMessage: 'Codex overloaded. api_key=PRIVATE_VALUE' }));
  store.append(event('run.ended', { outcome: 'error', errorMessage: 'Codex overloaded. api_key=PRIVATE_VALUE' }));
  const run = store.snapshot().sessions[0].runs[0]; assert.match(run.errorMessage, /Codex overloaded/); assert.equal(run.summary, 'Earlier recorded response');
  const remembered = overview(store)[0]; assert.equal(remembered.status, 'attention'); assert.ok(!remembered.latest.errorMessage.includes('PRIVATE_VALUE'));
  store.close(); const restored = open(); assert.match(overview(restored)[0].latest.errorMessage, /Codex overloaded/);
  restored.sessions.clear(); restored.append(event('model.selected', { model: 'fixture/model' }));
  assert.match(overview(restored)[0].latest.errorMessage, /Codex overloaded/);
});
test('legacy parent errors retain a generic notice instead of looking like an empty success', t => {
  const { store } = setup(t); store.append(event('prompt.received', { prompt: 'Legacy request' }));
  store.append(event('run.started')); store.append(event('run.ended', { outcome: 'error' }));
  const run = store.snapshot().sessions[0].runs[0]; assert.match(run.errorMessage, /No error details were recorded/);
  assert.equal(overview(store)[0].latest.errorMessage, run.errorMessage);
});
test('a new attempt or successful reply clears current errors, while retaining error events', t => {
  const { store } = setup(t); store.append(event('prompt.received', { prompt: 'Synthetic task' }));
  store.append(event('run.ended', { outcome: 'error', errorMessage: 'Provider overload' }));
  store.append(event('run.started', { model: 'fixture/model' }));
  assert.equal(store.snapshot().sessions[0].runs[0].errorMessage, ''); assert.equal(overview(store)[0].latest.errorMessage, '');
  store.append(event('message.completed', { errorMessage: 'Temporary error' }));
  store.append(event('message.completed', { errorMessage: '', summary: 'Recovered response' }));
  store.append(event('run.ended', { outcome: 'idle' }));
  const run = store.snapshot().sessions[0].runs[0]; assert.equal(run.errorMessage, ''); assert.equal(run.summary, 'Recovered response');
  assert.equal(overview(store)[0].latest.errorMessage, ''); assert.equal(overview(store)[0].status, 'finished');
  assert.ok(run.events.some(e => e.data.errorMessage === 'Provider overload'));
});
test('project overview combines tabs, isolates demo, and expires live activity', t => {
  const { store } = setup(t);
  store.append(event('prompt.received', { prompt: 'First tab' }));
  store.append(event('prompt.received', { prompt: 'Second tab' }, { sessionId: 'session-b' }));
  store.append(event('prompt.received', { prompt: 'Demo' }, { sessionId: 'demo-session', demo: true }));
  assert.equal(overview(store).length, 2);
  const live = overview(store).find(p => !p.demo);
  assert.equal(live.activeSessions, 2); assert.equal(live.status, 'running');
  assert.equal(live.latest.prompt, 'Second tab');
  const stale = store.projectMemory.snapshot(store.sessions, Date.now() + 31000).items.find(p => !p.demo);
  assert.equal(stale.status, 'unknown'); assert.equal(stale.activeSessions, 0);
});

test('connection events never refresh the last work date or invent work', t => {
  const { store } = setup(t);
  store.append(event('prompt.received', { prompt: 'Last week' }, { time: weekAgo, recovered: true }));
  for (const type of ['session.connected', 'session.heartbeat', 'session.disconnected']) store.append(event(type));
  assert.equal(overview(store)[0].lastWorkedAt, weekAgo);
  store.append(event('session.connected', {}, { projectId: 'empty', sessionId: 'empty', runId: undefined }));
  assert.equal(overview(store).find(p => p.projectId === 'empty').lastWorkedAt, undefined);
});

test('reported unfinished work, errors, cancellations and completed requests stay distinct', t => {
  const { store } = setup(t);
  for (const [name, status, outcome, expected] of [
    ['waiting', 'pending', 'idle', 'waiting'], ['failed', 'done', 'error', 'attention'],
    ['blocked', 'blocked', 'idle', 'attention'], ['cancelled', 'pending', 'aborted', 'cancelled'],
    ['finished', 'done', 'idle', 'finished'], ['unknown', 'done', 'timeout', 'unknown'],
  ]) {
    const identity = { projectId: name, sessionId: name };
    store.append(event('workflow.updated', plan(status), identity));
    store.append(event('run.ended', { outcome }, identity));
    assert.equal(overview(store).find(p => p.projectId === name).status, expected, name);
  }
  assert.equal(overview(store).find(p => p.projectId === 'waiting').nextStep.title, 'Build the overview');
});

test('summaries survive session eviction, journal rotation and restart', t => {
  const { dir, store, open } = setup(t, { maxBytes: 700 });
  store.append(event('prompt.received', { prompt: 'Remember this task' }, { time: weekAgo }));
  store.append(event('workflow.updated', plan('pending'), { time: weekAgo }));
  store.append(event('run.ended', { outcome: 'idle', summary: 'Implementation remains' }, { time: weekAgo }));
  for (let i = 0; i < 90; i++) store.append(event('prompt.received', { prompt: 'Other activity' }, { sessionId: `s-${i}`, projectId: `p-${i}` }));
  store.close();
  assert.equal(store.sessions.has('session-a'), false);
  assert.ok(!readFileSync(join(dir, 'events.2.jsonl'), 'utf8').includes('Remember this task'));
  const restored = open(), p = overview(restored).find(p => p.projectId === 'project-a');
  assert.equal(p.latest.prompt, 'Remember this task'); assert.equal(p.latest.summary, 'Implementation remains');
  assert.equal(p.lastWorkedAt, weekAgo); assert.equal(p.status, 'waiting'); assert.equal(p.detailAvailable, false);
  assert.equal(overview(restored).length, 91);
});

test('saved checkpoint preserves same-timestamp summary and recovers unflushed journal tail', t => {
  const { store, open } = setup(t);
  store.append(event('prompt.received', { prompt: 'First' }, { time: weekAgo }));
  store.append(event('run.ended', { outcome: 'idle', summary: 'First answer' }, { time: weekAgo }));
  store.append(event('prompt.received', { prompt: 'Second' }, { runId: 'second', time: weekAgo }));
  store.close();
  store.append(event('run.ended', { outcome: 'idle', summary: 'Second answer' }, { runId: 'second', time: weekAgo }));
  clearTimeout(store.projectMemory.timer); // Simulated exit before summary flush.
  const restored = open(), p = overview(restored)[0];
  assert.equal(p.latest.prompt, 'Second'); assert.equal(p.latest.summary, 'Second answer');
  assert.equal(p.status, 'finished'); assert.equal(p.activeSessions, 0);
  store.projectMemory.dirty = false; // The simulated dead writer must not flush at cleanup.
});

test('late older requests cannot replace the most recently started task', t => {
  const { store } = setup(t);
  store.append(event('prompt.received', { prompt: 'Old' }, { time: weekAgo }));
  store.append(event('prompt.received', { prompt: 'New' }, { runId: 'new' }));
  store.append(event('run.ended', { outcome: 'idle', summary: 'Old result' }));
  assert.equal(overview(store)[0].latest.prompt, 'New');
  store.sessions.clear();
  store.append(event('run.ended', { outcome: 'idle', summary: 'Unretained old result' }, { runId: 'forgotten' }));
  assert.equal(overview(store)[0].latest.prompt, 'New');
});

test('truncated run state does not erase saved context on a metadata update', t => {
  const { store } = setup(t);
  store.append(event('prompt.received', { prompt: 'Remember me' }));
  store.append(event('workflow.updated', plan('done')));
  store.append(event('run.ended', { outcome: 'idle', summary: 'Saved answer' }));
  store.sessions.clear();
  store.append(event('model.selected', { model: 'any/model' }));
  const p = overview(store)[0];
  assert.equal(p.latest.prompt, 'Remember me'); assert.equal(p.latest.summary, 'Saved answer');
  assert.equal(p.latest.stages[0].status, 'done'); assert.equal(p.status, 'finished');
});

test('a terminal event after detail eviction cannot erase known child failure', t => {
  const { store } = setup(t);
  store.append(event('prompt.received', { prompt: 'Task with failed review' }));
  store.append(event('agent.finished', { agentCallId: 'review', isError: true }));
  store.append(event('run.ended', { outcome: 'idle' }));
  assert.equal(overview(store)[0].status, 'attention');
  store.sessions.clear();
  store.append(event('run.ended', { outcome: 'idle' }));
  assert.equal(overview(store)[0].status, 'attention');
});

test('corrupt project memory is preserved and rebuilt from retained events', t => {
  const { dir, store, open } = setup(t);
  store.append(event('prompt.received', { prompt: 'Recoverable' })); store.close();
  writeFileSync(join(dir, 'projects.json'), '{truncated');
  const restored = open();
  assert.equal(overview(restored)[0].latest.prompt, 'Recoverable');
  assert.ok(restored.warnings.some(w => w.includes('summaries were unreadable')));
  const preserved = readdirSync(dir).find(f => f.startsWith('projects.json.invalid-'));
  assert.equal(readFileSync(join(dir, preserved), 'utf8'), '{truncated');
});

test('failed summary flush holds rotation and retries without losing accepted events', t => {
  const { dir, store } = setup(t, { maxBytes: 700 });
  store.append(event('prompt.received', { prompt: 'Before rotation' }));
  const path = store.projectMemory.path, before = readFileSync(store.logPath, 'utf8');
  store.projectMemory.path = join(dir, 'missing', 'projects.json');
  const next = event('message.completed', { summary: 'x'.repeat(600) });
  assert.throws(() => store.append(next), /ENOENT/);
  assert.equal(readFileSync(store.logPath, 'utf8'), before); assert.equal(store.seen.has(next.id), false);
  store.projectMemory.path = path;
  assert.equal(store.append(next).duplicate, false);
  assert.equal(overview(store)[0].latest.summary, 'x'.repeat(600));
});

function largeProjects(memory, count = PROJECT_LIMIT, demo = false) {
  const stages = Array.from({ length: 20 }, (_, i) => ({ id: `stage-${i}`, title: '界'.repeat(160), status: 'pending' }));
  const recommendations = Array.from({ length: 5 }, (_, i) => ({ id: `next-${i}`, title: '界'.repeat(240), prompt: '界'.repeat(4000) }));
  for (let i = 0; i < count; i++) {
    const time = new Date(Date.UTC(2025, 0, 1) + (demo ? 86400000 : 0) + i * 1000).toISOString();
    const e = event('workflow.updated', { stages, recommendations }, { projectId: `large-${i}`, sessionId: `large-session-${i}`, runId: `large-run-${i}`, time, demo });
    memory.observe(e, { id: e.runId, requestStartedAt: time, startedAt: time, prompt: '界'.repeat(600), summary: '界'.repeat(1000), errorMessage: '', outcome: 'idle', stages, recommendations });
  }
}
test('large UTF-8 summaries fit independent byte budgets and reload without journal recovery', t => {
  const { dir, store, open } = setup(t), memory = store.projectMemory;
  largeProjects(memory); memory.flush();
  const retainedLive = [...memory.entries.values()].map(p => p.projectId);
  const liveBytes = JSON.parse(readFileSync(memory.path, 'utf8')).projects.reduce((sum, p) => sum + Buffer.byteLength(JSON.stringify(p)) + 1, 0);
  assert.ok(liveBytes <= 32 * 1024 * 1024, `Live records exceed the byte budget: ${liveBytes}`);
  assert.ok(retainedLive.length > 0 && retainedLive.length < PROJECT_LIMIT);
  assert.ok(retainedLive.includes('large-499')); assert.ok(!retainedLive.includes('large-0'));
  largeProjects(memory, PROJECT_LIMIT, true); memory.flush();
  assert.deepEqual([...memory.entries.values()].filter(p => !p.demo).map(p => p.projectId), retainedLive, 'Newer demo work must not evict live summaries');
  const saved = JSON.parse(readFileSync(memory.path, 'utf8'));
  for (const demo of [false, true]) {
    const records = saved.projects.filter(p => p.demo === demo);
    assert.ok(records.length > 0 && records.length < PROJECT_LIMIT);
    assert.ok(records.reduce((sum, p) => sum + Buffer.byteLength(JSON.stringify(p)) + 1, 0) <= 32 * 1024 * 1024);
  }
  assert.ok(statSync(memory.path).size <= 64 * 1024 * 1024 + 1024);
  assert.equal(statSync(memory.path).mode & 0o777, 0o600); assert.ok(!readdirSync(dir).some(f => /^events(?:\.\d)?\.jsonl$/.test(f)), 'No journal is available to rebuild these summaries');
  const before = memory.snapshot(store.sessions).items, restored = open();
  assert.deepEqual(overview(restored), before); assert.equal(restored.warnings.length, 0);
  assert.ok(!readdirSync(dir).some(f => f.startsWith('projects.json.invalid-')));
  assert.ok(store.warnings.some(w => /byte limit.*live/.test(w))); assert.ok(store.warnings.some(w => /byte limit.*demo/.test(w)));
  assert.equal(overview(restored).find(p => !p.demo && p.projectId === 'large-499').latest.recommendations[0].prompt, '界'.repeat(4000));
});
test('valid legacy schema-1 summaries above the old 32 MiB reader limit remain readable', t => {
  const { dir, store, open } = setup(t), memory = store.projectMemory;
  largeProjects(memory);
  const original = JSON.stringify({ schemaVersion: 1, projects: [...memory.entries.values()] }) + '\n';
  assert.ok(Buffer.byteLength(original) > 32 * 1024 * 1024); assert.ok(Buffer.byteLength(original) < 64 * 1024 * 1024);
  writeFileSync(memory.path, original, { mode: 0o600 }); memory.dirty = false;
  const restored = open(); assert.equal(overview(restored).length, PROJECT_LIMIT); assert.equal(restored.warnings.length, 0);
  assert.equal(readFileSync(memory.path, 'utf8'), original); assert.ok(!readdirSync(dir).some(f => f.startsWith('projects.json.invalid-')));
});
test('byte-pressure retention is committed only after an atomic save succeeds', t => {
  const { store, dir } = setup(t), memory = store.projectMemory;
  store.append(event('prompt.received', { prompt: 'Existing saved project' })); memory.flush();
  const path = memory.path, before = readFileSync(path, 'utf8');
  largeProjects(memory); const ids = [...memory.entries.keys()];
  memory.path = join(dir, 'missing', 'projects.json');
  assert.throws(() => memory.flush(), /ENOENT/);
  assert.deepEqual([...memory.entries.keys()], ids); assert.equal(memory.dirty, true); assert.equal(readFileSync(path, 'utf8'), before);
  assert.ok(!store.warnings.some(w => w.includes('byte limit')));
  memory.path = path; memory.flush();
  assert.ok(memory.entries.size > 0 && memory.entries.size < ids.length); assert.equal(memory.dirty, false);
  assert.ok(store.warnings.some(w => w.includes('byte limit')));
});

test('project memory is bounded, private, redacted and excludes arbitrary payloads', t => {
  const { dir, store, open } = setup(t);
  store.append(event('prompt.received', { prompt: 'access_token=supersecret ' + 'x'.repeat(900), secretField: 'never-store-me' }, { time: weekAgo }));
  store.close();
  const p = overview(store)[0], serialized = readFileSync(join(dir, 'projects.json'), 'utf8');
  assert.ok(p.latest.prompt.length <= 601); assert.ok(!serialized.includes('supersecret')); assert.ok(!serialized.includes('never-store-me'));
  assert.equal(statSync(join(dir, 'projects.json')).mode & 0o777, 0o600);
  for (let i = 0; i < PROJECT_LIMIT; i++) store.append(event('prompt.received', { prompt: 'New project' }, { projectId: `p-${i}`, sessionId: `s-${i}` }));
  store.close();
  assert.equal(overview(store).length, PROJECT_LIMIT); assert.ok(!overview(store).some(p => p.projectId === 'project-a'));
  assert.equal(overview(open()).length, PROJECT_LIMIT);
  store.append(event('prompt.received', { prompt: 'Live project kept separately' }, { projectId: 'live-kept' }));
  for (let i = 0; i <= PROJECT_LIMIT; i++) store.append(event('prompt.received', { prompt: 'Demo' }, { projectId: `d-${i}`, sessionId: `ds-${i}`, demo: true }));
  store.close();
  const restored = overview(open());
  assert.equal(restored.filter(p => p.demo).length, PROJECT_LIMIT);
  assert.equal(restored.filter(p => !p.demo).length, PROJECT_LIMIT);
  assert.ok(restored.some(p => p.projectId === 'live-kept' && !p.demo));
});
