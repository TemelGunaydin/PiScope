import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplyReadState, REPLY_READ_KEY } from '../public/replies.js';

const project = (projectId = 'project-full-a') => ({ projectId, projectName: 'Same name' });
const reply = (id = 'run-full-a', extra = {}) => ({ id, startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:01:00Z', outcome: 'idle', summary: 'PRIVATE_RESPONSE', ...extra });
const session = (runs, projectId = 'project-full-a', id = 'session-full-a') => ({ id, projectId, runs });
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('first visit baselines existing replies; later replies survive reload until the exact reply is opened', () => {
  const disk = storage(), state = new ReplyReadState(disk), p = project();
  state.update([p], [session([reply()])]);
  assert.equal(state.unread(p.projectId), undefined);
  const newer = reply('run-full-b', { startedAt: '2026-10-10T11:00:00Z' });
  state.update([p], [session([reply(), newer])]);
  assert.equal(state.unread(p.projectId).runId, newer.id);
  assert.equal(state.markRead(p.projectId, 'session-full-a', 'run-full-a'), false);
  const reload = new ReplyReadState(disk);
  reload.update([p], [session([reply(), newer])]);
  assert.equal(reload.unread(p.projectId).runId, newer.id);
  assert.equal(reload.markRead(p.projectId, 'session-full-a', newer.id), true);
  assert.equal(reload.unread(p.projectId), undefined);
  const again = new ReplyReadState(disk); again.update([p], [session([newer])]);
  assert.equal(again.unread(p.projectId), undefined);
  assert.ok(!disk.getItem(REPLY_READ_KEY).includes('PRIVATE_RESPONSE'));
  assert.ok(!disk.getItem(REPLY_READ_KEY).includes('Same name'));
});

test('only captured ended replies qualify; progress, failures, cancellation, unknown and demo do not', () => {
  const state = new ReplyReadState(storage()), p = project(); state.update([p], []);
  for (const bad of [
    reply('progress', { outcome: undefined, endedAt: undefined }), reply('settled', { outcome: undefined, settled: true }),
    reply('error', { outcome: 'error' }), reply('aborted', { outcome: 'aborted' }),
    reply('unknown', { outcome: 'unknown' }), reply('empty', { summary: '  ' })
  ]) { state.update([p], [session([bad])]); assert.equal(state.unread(p.projectId), undefined); }
  state.update([{ ...p, demo: true }], [{ ...session([reply()]), demo: true }]);
  assert.equal(state.unread(p.projectId), undefined);
  // A main reply is not a claim that its subagents, tests or project succeeded.
  state.update([p], [session([reply('has-response', { performance: { verdict: 'failed' } })])]);
  assert.equal(state.unread(p.projectId).runId, 'has-response');
});

test('same text and duplicate names never merge full project/session/run identities', () => {
  const state = new ReplyReadState(storage()), a = project(), b = project('project-full-a-extra');
  state.update([a, b], []);
  const sessions = [session([reply()]), session([reply()], b.projectId, 'session-full-a-extra')];
  state.update([a, b], sessions);
  assert.equal(state.markRead(a.projectId, 'session-full-a-extra', 'run-full-a'), false);
  assert.equal(state.markRead(b.projectId, 'session-full-a-extra', 'run-full-a'), true);
  assert.ok(state.unread(a.projectId)); assert.equal(state.unread(b.projectId), undefined);
  sessions[0].runs.push(reply('run-full-a-extra', { startedAt: '2026-10-10T12:00:00Z' }));
  state.update([a, b], sessions);
  assert.equal(state.unread(a.projectId).runId, 'run-full-a-extra');
});

test('starting another request does not erase an unread retained reply; heartbeat and late older results do not regress it', () => {
  const state = new ReplyReadState(storage()), p = project(); state.update([p], []);
  const newest = reply('latest', { startedAt: '2026-10-10T12:00:00Z' });
  state.update([p], [session([newest])]);
  state.update([p], [session([newest, reply('pending', { startedAt: '2026-10-10T13:00:00Z', outcome: undefined, endedAt: undefined })])]);
  assert.equal(state.unread(p.projectId).runId, newest.id);
  state.update([p], [session([newest]), session([reply('late-old')], p.projectId, 'older-tab')]);
  assert.equal(state.unread(p.projectId).runId, newest.id);
});

test('a later completion from an older parallel request is a new reply too', () => {
  const state = new ReplyReadState(storage()), p = project(); state.update([p], []);
  const newer = session([reply('newer-request', { startedAt: '2026-10-10T12:00:00Z', endedAt: '2026-10-10T13:00:00Z' })]);
  state.update([p], [newer]); state.markRead(p.projectId, newer.id, 'newer-request');
  const late = session([reply('older-request', { startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T14:00:00Z' })], p.projectId, 'parallel-tab');
  state.update([p], [newer, late]);
  assert.equal(state.unread(p.projectId)?.runId, 'older-request');
});

test('saved completed summaries remain readable by exact identity without retained sessions', () => {
  const state = new ReplyReadState(storage()), p = project(); state.update([p], []);
  p.latest = { sessionId: 'archived-session', runId: 'archived-run', startedAt: '2026-10-10T12:00:00Z', verdict: 'completed', summary: 'Saved reply' };
  state.update([p], []);
  assert.equal(state.unread(p.projectId).runId, 'archived-run');
  assert.equal(state.markRead(p.projectId, 'archived-session', 'archived-run'), true);
});

test('blocked or corrupt browser storage falls back to working page-local read tracking', () => {
  for (const disk of [undefined, { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } },
    { getItem: () => '{bad', setItem() {} }, { getItem: () => JSON.stringify({ version: 1, seen: [['not-valid']] }), setItem() {} }]) {
    const state = new ReplyReadState(disk), p = project(); state.update([p], []);
    state.update([p], [session([reply()])]); assert.ok(state.unread(p.projectId));
    assert.equal(state.markRead(p.projectId, 'session-full-a', 'run-full-a'), true);
    assert.equal(state.unread(p.projectId), undefined);
  }
});

test('read markers stay bounded and contain only full identities', () => {
  const disk = storage(), state = new ReplyReadState(disk); state.update([], []);
  for (let n = 0; n < 510; n++) {
    const p = project(`project-${n}`); state.update([p], [session([reply()], p.projectId)]);
    state.markRead(p.projectId, 'session-full-a', 'run-full-a');
  }
  const saved = JSON.parse(disk.getItem(REPLY_READ_KEY));
  assert.equal(saved.seen.length, 500);
  assert.deepEqual(saved.seen.at(-1), ['project-509', 'session-full-a', 'run-full-a']);
});
