import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectPreferences, PROJECT_PREFERENCES_KEY, readWorkspaceRoute, workspacePath, retainedRequests, searchRequests, attentionRequests, requestDay } from '../public/workspace.js';
import { ReplyReadState } from '../public/replies.js';

function preferencesStorage(value) {
  const values = new Map(value ? [[PROJECT_PREFERENCES_KEY, value]] : []);
  return { getItem: key => values.get(key), setItem: (key, next) => values.set(key, next) };
}
const run = (id, extra = {}) => ({ id, prompt: 'Investigate streaming', summary: 'Fixed buffer race', startedAt: '2026-10-25T00:15:00Z', model: 'provider/old', primaryModels: ['provider/old', 'provider/current'], performance: { verdict: 'completed' }, status: 'idle', ...extra });
const session = (runs, extra = {}) => ({ id: 'session-1', projectId: 'project-1', projectName: 'Shared name', model: 'provider/new-session-model', runs, ...extra });

test('workspace request links round-trip exact identities and never include private content', () => {
  const route = { view: 'request', projectId: 'project:full', sessionId: 'session.full', runId: 'run-full', prompt: 'PRIVATE_PROMPT', token: 'SECRET' };
  const path = workspacePath(route);
  assert.deepEqual(readWorkspaceRoute(path.slice(1)), { view: 'request', projectId: route.projectId, sessionId: route.sessionId, runId: route.runId });
  assert.ok(!path.includes('PRIVATE') && !path.includes('SECRET'));
  for (const query of ['?view=request', '?view=request&project=valid&session=valid&request=<script>', '?view=unknown']) assert.equal(readWorkspaceRoute(query).view, 'invalid');
  assert.deepEqual(readWorkspaceRoute(''), { view: 'projects' });
  for (const view of ['attention', 'history', 'report', 'notes']) assert.deepEqual(readWorkspaceRoute(workspacePath({ view }).slice(1)), { view });
});

test('project layout and pins persist only identities, validate storage, and stay bounded', () => {
  const disk = preferencesStorage(), prefs = new ProjectPreferences(disk);
  prefs.setLayout('list'); prefs.togglePin('project-full');
  const reload = new ProjectPreferences(disk);
  assert.equal(reload.layout, 'list'); assert.deepEqual([...reload.pinned], ['project-full']);
  reload.togglePin('project-full'); assert.equal(reload.pinned.size, 0);
  reload.togglePin('<script>'); reload.setLayout('bad'); assert.equal(reload.layout, 'list'); assert.equal(reload.pinned.size, 0);
  for (let n = 0; n < 510; n++) reload.togglePin('p-' + n);
  assert.equal(reload.pinned.size, 500);
  for (const invalid of ['invalid json', JSON.stringify({ version: 1, layout: 'list', pinned: ['<script>'] }), JSON.stringify({ version: 2, layout: 'list', pinned: [] })]) {
    const broken = new ProjectPreferences(preferencesStorage(invalid)); assert.equal(broken.layout, 'cards'); assert.equal(broken.pinned.size, 0);
  }
  const blocked = new ProjectPreferences({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
  blocked.togglePin('p'); blocked.setLayout('list'); assert.equal(blocked.layout, 'list'); assert.ok(blocked.pinned.has('p'));
});

test('history searches every retained live request with observed models, including model switches', () => {
  const entries = retainedRequests({ sessions: [session([run('older'), run('newer', { startedAt: '2026-10-25T12:00:00Z', summary: 'Different result', agents: { a: { model: 'observed/child', modelSource: 'observed' }, b: { model: 'requested/child', modelSource: 'requested' } } })]), session([run('demo')], { id: 'demo', demo: true })] });
  assert.deepEqual(entries.map(r => r.runId), ['newer', 'older']);
  assert.equal(searchRequests(entries, { query: 'buffer RACE' }).at(0).runId, 'older');
  assert.equal(searchRequests(entries, { model: 'provider/current' }).length, 2);
  assert.equal(searchRequests(entries, { model: 'provider/new-session-model' }).length, 0);
  assert.equal(searchRequests(entries, { model: 'requested/child' }).length, 0);
  assert.equal(searchRequests(entries, { model: 'observed/child' }).length, 1);
  assert.equal(searchRequests(entries, { projectId: 'wrong-project' }).length, 0);
  assert.equal(searchRequests(entries, { verdict: 'failed' }).length, 0);
});

test('history date ranges use the displayed report timezone and combine with text and outcome', () => {
  const entries = retainedRequests({ sessions: [session([run('boundary', { startedAt: '2026-10-24T22:15:00Z' }), run('failed', { summary: 'Provider failed', performance: { verdict: 'failed' }, status: 'error' })])] });
  assert.equal(requestDay(entries[1].startedAt, 'Europe/Istanbul'), '2026-10-25');
  assert.equal(searchRequests(entries, { from: '2026-10-25', to: '2026-10-25', query: 'buffer', verdict: 'completed' }, 'Europe/Istanbul').length, 1);
  assert.equal(searchRequests(entries, { from: '2026-10-25', to: '2026-10-25', query: 'buffer' }, 'UTC').length, 0);
  assert.equal(searchRequests(entries, { from: '2026-10-26', to: '2026-10-24' }, 'UTC').length, 0);
});

test('attention keeps an unread older reply separate from latest failure and merges only exact request identities', () => {
  const p = { projectId: 'project-1', projectName: 'Shared name', latest: { sessionId: 'session-1', runId: 'failed', verdict: 'failed', errorMessage: 'Provider overloaded', stages: [{ status: 'blocked' }] } };
  const reads = new ReplyReadState(preferencesStorage()); reads.update([p], []);
  const sessions = [session([run('reply', { endedAt: '2026-10-25T00:16:00Z', outcome: 'idle' }), run('failed', { outcome: 'error' })])];
  reads.update([p], sessions);
  const attention = attentionRequests([p, { ...p, demo: true }], sessions, reads);
  assert.equal(attention.length, 2);
  assert.deepEqual(attention[0].reasons, ['Model/provider error', 'Blocked plan']); assert.equal(attention[0].runId, 'failed');
  assert.deepEqual(attention[1].reasons, ['New reply']); assert.equal(attention[1].runId, 'reply');
  reads.markRead(p.projectId, 'session-1', 'reply');
  assert.equal(attentionRequests([p], sessions, reads).length, 1);
  p.latest = { sessionId: 'session-1', runId: 'next', verdict: 'completed', stages: [] };
  assert.equal(attentionRequests([p], sessions, reads).length, 0);
});

test('attention preserves saved-summary targets and never mixes duplicate names or demo data', () => {
  const p = { projectId: 'saved-project', projectName: 'Shared name', latest: { sessionId: 'saved-session', runId: 'saved-run', verdict: 'completed', summary: 'Saved reply', startedAt: '2026-10-25T12:00:00Z', stages: [] } };
  const reads = new ReplyReadState(preferencesStorage()); reads.update([], []); reads.update([p], []);
  const attention = attentionRequests([p], [session([run('saved-run')], { id: 'saved-session', demo: true })], reads);
  assert.equal(attention.length, 1); assert.equal(attention[0].retained, false); assert.equal(attention[0].summary, 'Saved reply');
});
