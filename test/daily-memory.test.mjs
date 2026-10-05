import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventStore } from '../src/store.mjs';
import { DailyMemory, DAILY_LIMIT } from '../src/daily-memory.mjs';
import { event } from './helpers.mjs';
const plan = accomplishments => ({ stages: [{ id: 'build', title: 'Build', status: 'done' }], accomplishments });
function setup(t, options) {
  const dir = mkdtempSync(join(tmpdir(), 'piscope-daily-')), stores = [];
  const open = () => { const store = new EventStore(dir, options); stores.push(store); return store; };
  t.after(() => { try { for (const store of stores) store.close(); } finally { rmSync(dir, { recursive: true, force: true }); } });
  return { dir, store: open(), open };
}
const records = store => store.snapshot().dailyReport.records;

test('daily reports group requests across sessions without turning plans into successful work', t => {
  const { store } = setup(t);
  store.append(event('prompt.received', { prompt: 'Add a calendar' }));
  store.append(event('workflow.updated', plan(['Added calendar navigation.'])));
  assert.equal(records(store)[0].verdict, 'unknown');
  store.append(event('run.ended', { outcome: 'idle', summary: 'Calendar added; not independently verified.' }));
  store.append(event('prompt.received', { prompt: 'Fix search' }, { sessionId: 'session-b', runId: 'run-b' }));
  store.append(event('run.ended', { outcome: 'error', errorMessage: 'Provider overloaded' }, { sessionId: 'session-b', runId: 'run-b' }));
  const values = records(store); assert.equal(values.length, 2);
  assert.deepEqual(values[0].accomplishments, ['Added calendar navigation.']); assert.equal(values[0].verdict, 'completed');
  assert.equal(values[1].verdict, 'failed'); assert.equal(values[1].errorMessage, 'Provider overloaded');
  assert.equal(values[0].projectId, values[1].projectId);
  assert.ok(values.every(r => !('checkpoint' in r)));
});
test('connection, heartbeat, profile, model and evidence metadata never invent daily work', t => {
  const { store } = setup(t);
  for (const type of ['session.connected', 'session.disconnected', 'session.heartbeat', 'model.selected', 'monitor.warning']) store.append(event(type));
  assert.deepEqual(records(store), []);
});
test('a request spanning local midnight does not borrow yesterday\'s response or claims', t => {
  const { store } = setup(t); const noon = new Date(); noon.setHours(12, 0, 0, 0);
  const yesterday = new Date(noon); yesterday.setDate(yesterday.getDate() - 1);
  const old = { time: yesterday.toISOString() }, today = { time: noon.toISOString() };
  store.append(event('prompt.received', { prompt: 'Multi-day work' }, old));
  store.append(event('workflow.updated', plan(['Yesterday\'s change.']), old));
  store.append(event('message.completed', { summary: 'Yesterday\'s reply.' }, old));
  store.append(event('tool.finished', { toolName: 'edit', isError: false }, today));
  const current = records(store).find(r => r.day === store.dailyMemory.day(noon));
  assert.equal(current.summary, ''); assert.deepEqual(current.accomplishments, []); assert.equal(current.verdict, 'unknown');
  store.append(event('run.ended', { outcome: 'idle', summary: 'Today\'s reply.' }, today));
  assert.equal(records(store).find(r => r.day === current.day).summary, 'Today\'s reply.');
  assert.equal(records(store).find(r => r.day !== current.day).summary, 'Yesterday\'s reply.');
});
test('report calendar uses its saved timezone, including DST and local midnight', t => {
  const { dir } = setup(t);
  writeFileSync(join(dir, 'daily-reports.json'), JSON.stringify({ schemaVersion: 1, timeZone: 'America/New_York', records: [] }));
  const memory = new DailyMemory(dir, () => {});
  assert.equal(memory.day('2026-03-08T04:59:59Z'), '2026-03-07');
  assert.equal(memory.day('2026-03-08T05:00:00Z'), '2026-03-08');
  assert.equal(memory.day('2026-03-08T07:01:00Z'), '2026-03-08');
  assert.equal(memory.snapshot(new Map()).timeZone, 'America/New_York');
});
test('saved daily work survives detail eviction, journal rotation and restart', t => {
  const { store, dir, open } = setup(t, { maxBytes: 700 });
  store.append(event('prompt.received', { prompt: 'Remember this day' }));
  store.append(event('workflow.updated', plan(['Added the daily view.'])));
  store.append(event('run.ended', { outcome: 'idle', summary: 'Daily view is ready.' }));
  for (let i = 0; i < 90; i++) store.append(event('prompt.received', { prompt: 'Other work' }, { projectId: `p-${i}`, sessionId: `s-${i}` }));
  store.close();
  assert.ok(!readFileSync(join(dir, 'events.2.jsonl'), 'utf8').includes('Remember this day'));
  const saved = records(open()).find(r => r.sessionId === 'session-a');
  assert.equal(saved.summary, 'Daily view is ready.'); assert.deepEqual(saved.accomplishments, ['Added the daily view.']);
  assert.equal(saved.detailAvailable, false); assert.equal(saved.verdict, 'completed');
  assert.equal(statSync(join(dir, 'daily-reports.json')).mode & 0o777, 0o600);
});
test('checkpoints preserve same-time daily summaries and recover an unflushed journal tail', t => {
  const { store, dir, open } = setup(t); const time = new Date().toISOString();
  store.append(event('prompt.received', { prompt: 'First request' }, { time }));
  store.append(event('message.completed', { summary: 'First reply.' }, { time })); store.close();
  const saved = readFileSync(join(dir, 'daily-reports.json'));
  store.append(event('message.completed', { summary: 'Latest reply.' }, { time })); store.close();
  writeFileSync(join(dir, 'daily-reports.json'), saved);
  assert.equal(records(open())[0].summary, 'Latest reply.');
});
test('older messages do not replace newer daily replies or achievements', t => {
  const { store } = setup(t); const newer = new Date().toISOString(), older = new Date(Date.now() - 1000).toISOString();
  store.append(event('prompt.received', { prompt: 'Work' }, { time: older }));
  store.append(event('message.completed', { summary: 'New reply' }, { time: newer }));
  store.append(event('workflow.updated', plan(['New outcome']), { time: newer }));
  store.append(event('message.completed', { summary: 'Old reply' }, { time: older }));
  store.append(event('workflow.updated', plan(['Old outcome']), { time: older }));
  assert.equal(records(store)[0].summary, 'New reply'); assert.deepEqual(records(store)[0].accomplishments, ['New outcome']);
});
test('partial terminal tails cannot upgrade previously observed failed or unresolved children', t => {
  const { store } = setup(t);
  for (const [status, expected] of [['error', 'failed'], ['starting', 'unknown']]) {
    const scope = { sessionId: `scope-${status}`, runId: `run-${status}` };
    store.append(event('prompt.received', {}, scope));
    store.append(event('agent.finished', { agentCallId: 'child', status }, scope));
    store.append(event('run.ended', { outcome: 'idle' }, scope));
    assert.equal(records(store).find(r => r.sessionId === scope.sessionId).verdict, expected);
    store.sessions.clear(); store.append(event('run.ended', { outcome: 'idle' }, scope));
    assert.equal(records(store).find(r => r.sessionId === scope.sessionId).verdict, expected);
  }
});
test('daily history keeps live and demo capacity separate and redacts safe projected fields', t => {
  const { store, dir } = setup(t);
  store.append(event('prompt.received', { prompt: 'api_key=PRIVATE_PROMPT', password: 'RAW_OBJECT' }));
  store.append(event('workflow.updated', plan(['Added a feature. api_key=PRIVATE_TOKEN'])));
  for (let i = 0; i < DAILY_LIMIT + 2; i++) store.append(event('prompt.received', { prompt: 'Demo' }, { demo: true, sessionId: `demo-${i}`, projectId: 'demo-project' }));
  store.close(); const values = records(store);
  assert.equal(values.filter(r => r.demo).length, DAILY_LIMIT); assert.equal(values.filter(r => !r.demo).length, 1);
  const saved = readFileSync(join(dir, 'daily-reports.json'), 'utf8');
  assert.ok(!saved.includes('PRIVATE_PROMPT')); assert.ok(!saved.includes('PRIVATE_TOKEN')); assert.ok(!saved.includes('RAW_OBJECT'));
});
test('UTF-8 daily excerpts respect the byte budget, not just the record count', t => {
  const { store, dir } = setup(t), memory = store.dailyMemory;
  for (let i = 0; i < DAILY_LIMIT; i++) {
    const time = new Date(Date.now() + i).toISOString(), longId = prefix => prefix + 'x'.repeat(140) + i;
    memory.entries.set(String(i), { day: memory.day(time), demo: false, projectId: longId('p'), projectName: '界'.repeat(240), sessionId: longId('s'), runId: longId('r'), checkpoint: longId('e'), firstAt: time, lastAt: time, prompt: '界'.repeat(600), summary: '界'.repeat(1000), errorMessage: '界'.repeat(1000), accomplishments: Array.from({ length: 5 }, (_, n) => n + '界'.repeat(239)), verdict: 'failed' });
  }
  memory.dirty = true; memory.flush();
  assert.ok(records(store).length < DAILY_LIMIT);
  assert.ok(statSync(join(dir, 'daily-reports.json')).size <= 12 * 1024 * 1024 + 1024);
  assert.equal(records(store)[0].sessionId, 's' + 'x'.repeat(140) + (DAILY_LIMIT - 1));
});
test('cancellations and unknown terminal outcomes do not become completed responses', t => {
  const { store } = setup(t);
  for (const [outcome, expected] of [['aborted', 'cancelled'], ['timeout', 'unknown'], ['', 'unknown']]) {
    const scope = { runId: `run-${expected}-${outcome || 'empty'}` };
    store.append(event('prompt.received', {}, scope)); store.append(event('run.ended', { outcome }, scope));
    assert.equal(records(store).find(r => r.runId === scope.runId).verdict, expected);
  }
});
test('daily snapshot failure holds journal rotation and retries without losing saved work', t => {
  const { store } = setup(t, { maxBytes: 1000 });
  store.append(event('prompt.received', { prompt: 'Keep this' }));
  const flush = store.dailyMemory.flush.bind(store.dailyMemory); store.dailyMemory.flush = () => { throw new Error('Synthetic storage failure'); };
  store.bytes = store.maxBytes;
  assert.throws(() => store.append(event('prompt.received', { prompt: 'Later' }, { runId: 'later' })), /Synthetic storage failure/);
  assert.equal(records(store).length, 1);
  store.dailyMemory.flush = flush; store.append(event('prompt.received', { prompt: 'Later' }, { runId: 'later' }));
  assert.equal(records(store).length, 2);
});
test('corrupt daily snapshots are preserved and rebuilt from retained records', t => {
  const { store, dir, open } = setup(t); store.append(event('prompt.received', { prompt: 'Restore me' })); store.close();
  writeFileSync(join(dir, 'daily-reports.json'), '{invalid');
  const restored = open(); assert.equal(records(restored)[0].prompt, 'Restore me');
  assert.ok(readdirSync(dir).some(n => n.startsWith('daily-reports.json.invalid-')));
  assert.ok(restored.warnings.some(w => w.startsWith('Daily reports were unreadable')));
});
