import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TerminalTodos, terminalTodosFile } from '../src/todos.mjs';
import { directory, fixture, event, token, snapshots } from './helpers.mjs';

const controlToken = 'b'.repeat(64);
const task = (id = 1, project = 'Same Name') => ({ id, title: 'Türkçe görev 🦀 <img src=x onerror=alert(1)>', completed: false, created_at: 1720000000, ...(project == null ? {} : { project }) });
const database = tasks => ({ version: 2, next_id: Math.max(0, ...tasks.map(t => t.id)) + 1, tasks });
function source(t, tasks = [task()]) {
  const dir = directory(t), path = join(dir, 'todos.json');
  writeFileSync(path, JSON.stringify(database(tasks)), { mode: 0o640 });
  return { path, dir, original: readFileSync(path), modified: statSync(path).mtimeMs };
}
function unchanged(s) { assert.deepEqual(readFileSync(s.path), s.original); assert.equal(statSync(s.path).mtimeMs, s.modified); assert.deepEqual(readdirSync(s.dir), ['todos.json']); }
async function pair(f) {
  const response = await fetch(f.url + '/api/control/login', { method: 'POST', headers: { Origin: f.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: controlToken }) });
  return { Cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), Origin: f.url, 'Content-Type': 'application/json' };
}
const link = (f, headers, labelId, projectId) => fetch(f.url + '/api/control/todo-link', { method: 'POST', headers, body: JSON.stringify({ labelId, projectId }) });
const send = (f, headers, input) => fetch(f.url + '/api/control/requests', { method: 'POST', headers, body: JSON.stringify(input) });
const poll = (f, project = 'project-a', idle = true) => f.request('/api/control/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: `session-${project}`, projectId: project, runId: `run-${project}`, owner: `owner-${project}`, idle }) });
async function seed(f, project = 'project-a') {
  const fields = { sessionId: `session-${project}`, projectId: project, projectName: 'Same Name', runId: `run-${project}` };
  for (const e of [event('prompt.received', { prompt: 'Previously captured work' }, fields), event('run.ended', { outcome: 'idle' }, fields), event('run.settled', {}, fields)]) await f.post(e);
}

test('Terminal Todos is opt-in; exact environment paths, no discovery or legacy import', t => {
  const env = { HOME: '/synthetic/home', AGENT_DASHBOARD_TODOS_FILE: '/synthetic/explicit.json' };
  assert.equal(terminalTodosFile(env), undefined);
  assert.equal(terminalTodosFile({ AGENT_DASHBOARD_TODOS: '1', HOME: env.HOME }), '/synthetic/home/.local/share/terminal-todos/todos.json');
  assert.equal(terminalTodosFile({ AGENT_DASHBOARD_TODOS: '1', XDG_DATA_HOME: '/synthetic/xdg', HOME: 'relative' }), '/synthetic/xdg/terminal-todos/todos.json');
  assert.equal(terminalTodosFile({ AGENT_DASHBOARD_TODOS: '1', XDG_DATA_HOME: 'relative', HOME: env.HOME }), '/synthetic/home/.local/share/terminal-todos/todos.json');
  assert.equal(terminalTodosFile({ ...env, AGENT_DASHBOARD_TODOS: '1' }), env.AGENT_DASHBOARD_TODOS_FILE);
  assert.throws(() => terminalTodosFile({ AGENT_DASHBOARD_TODOS: '1', HOME: 'relative' }), /HOME or an absolute/);
  assert.throws(() => terminalTodosFile({ AGENT_DASHBOARD_TODOS: '1', AGENT_DASHBOARD_TODOS_FILE: 'relative' }), /absolute/);
  const dir = directory(t), reader = new TerminalTodos(dir);
  assert.equal(reader.refresh(), false); assert.equal(reader.snapshot().enabled, false); assert.deepEqual(readdirSync(dir), []);
});
test('versions 1 and 2 preserve complete text, IDs, language and completion without source writes', t => {
  for (const version of [1, 2]) {
    const s = source(t, [task(1, version === 1 ? null : 'Same Name'), { ...task(9, null), completed: true }]);
    if (version === 1) { const raw = JSON.parse(s.original); raw.version = 1; writeFileSync(s.path, JSON.stringify(raw)); s.original = readFileSync(s.path); s.modified = statSync(s.path).mtimeMs; }
    const reader = new TerminalTodos(directory(t), s.path), snapshot = reader.snapshot();
    assert.equal(snapshot.available, true); assert.equal(snapshot.tasks[0].title, task().title); assert.equal(snapshot.tasks[1].id, '9'); assert.equal(snapshot.tasks[1].completed, true);
    assert.equal(snapshot.labels.length, version === 1 ? 0 : 1); assert.equal(snapshot.labels[0]?.projectId || null, null);
    assert.equal(reader.refresh(), false); unchanged(s);
  }
});
test('unsupported, unsafe and oversized sources fail closed without overwriting last read notes', t => {
  const s = source(t), reader = new TerminalTodos(directory(t), s.path), good = reader.snapshot().tasks;
  for (const raw of [
    { ...database([task()]), version: 3 }, { ...database([task()]), version: 1 },
    database([task(), task()]), { ...database([task()]), next_id: 1 },
    database([{ ...task(), id: Number.MAX_SAFE_INTEGER + 1 }]), database([{ ...task(), created_at: -1 }]),
    database([{ ...task(), created_at: Number.MAX_SAFE_INTEGER }]), database([{ ...task(), project: '' }]),
    database([{ ...task(), project: 'bad\nlabel' }]), database([{ ...task(), project: 'x'.repeat(241) }]),
    database([{ ...task(), completed: 'true' }]), database([{ ...task(), title: 'x'.repeat(64001) }]),
    database([{ ...task(), extra: 1 }]), { ...database([task()]), extra: 1 },
    database([{ ...task(), project: '\ud800' }]), database([{ ...task(), title: '\ud800' }]),
    database(Array.from({ length: 1001 }, (_, i) => task(i + 1)))
  ]) {
    writeFileSync(s.path, JSON.stringify(raw)); reader.refresh(); assert.equal(reader.snapshot().available, false); assert.deepEqual(reader.snapshot().tasks, good);
    assert.ok(!reader.snapshot().warning.includes(s.dir)); assert.throws(() => reader.setLink({ labelId: reader.snapshot().labels[0].id, projectId: null }, []), /available/);
  }
  for (const bytes of [Buffer.from('{bad'), Buffer.from([0xff]), Buffer.from('x'.repeat(512 * 1024 + 1))]) {
    writeFileSync(s.path, bytes); reader.refresh(); assert.equal(reader.snapshot().available, false); assert.deepEqual(readFileSync(s.path), bytes);
  }
  rmSync(s.path); reader.refresh(); assert.match(reader.snapshot().warning, /missing/); assert.deepEqual(readdirSync(s.dir), []);
});
test('directories and source symlinks are not read; no lock, migration or backup files appear', t => {
  const s = source(t), dir = directory(t);
  assert.equal(new TerminalTodos(dir, s.dir).snapshot().available, false);
  const symlink = join(dir, 'linked.json'); symlinkSync(s.path, symlink);
  assert.equal(new TerminalTodos(dir, symlink).snapshot().available, false); unchanged(s);
});
test('explicit hashed-label links distinguish same-name project identities and survive restart privately', t => {
  const s = source(t, [task(1, 'Same Name'), task(2, ' Same Name '), task(3, null)]), dir = directory(t), reader = new TerminalTodos(dir, s.path);
  const projects = ['project-a', 'project-b'].map(projectId => ({ projectId, projectName: 'Same Name' }));
  const labels = reader.snapshot().labels; assert.notEqual(labels[0].id, labels[1].id); assert.ok(labels.every(l => !l.projectId));
  assert.throws(() => reader.setLink({ labelId: labels[0].id, projectId: 'unknown' }, projects), /tracked PiScope/);
  assert.throws(() => reader.setLink({ labelId: null, projectId: 'project-a' }, projects), /current note label/);
  reader.setLink({ labelId: labels[0].id, projectId: 'project-b' }, projects);
  const restored = new TerminalTodos(dir, s.path); assert.equal(restored.snapshot().labels.find(l => l.id === labels[0].id).projectId, 'project-b');
  assert.equal(restored.snapshot().labels.find(l => l.id === labels[1].id).projectId, null);
  const path = join(dir, 'todo-links.json'); assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.ok(!readFileSync(path, 'utf8').includes(task().title)); assert.ok(!readFileSync(path, 'utf8').includes('Same Name'));
  restored.setLink({ labelId: labels[0].id, projectId: null }, projects); assert.equal(restored.snapshot().labels.find(l => l.id === labels[0].id).projectId, null); unchanged(s);
});
test('all permitted link identities fit the private reader budget and can be unlinked after restart', t => {
  const s = source(t), dir = directory(t), reader = new TerminalTodos(dir, s.path), current = reader.snapshot().labels[0].id;
  const links = Array.from({ length: 1000 }, (_, i) => ({ labelId: i === 0 ? current : i.toString(16).padStart(64, '0'), projectId: 'x'.repeat(160) }));
  writeFileSync(join(dir, 'todo-links.json'), JSON.stringify({ schemaVersion: 1, links }));
  const restored = new TerminalTodos(dir, s.path); assert.equal(restored.snapshot().canLink, true); assert.equal(restored.links.size, 1000);
  restored.setLink({ labelId: current, projectId: null }, []); assert.equal(restored.links.size, 999); unchanged(s);
});
test('source cannot alias the writable mapping file, including a missing file through a directory symlink', t => {
  const dir = directory(t), links = join(dir, 'todo-links.json');
  assert.throws(() => new TerminalTodos(dir, links), /source cannot be/);
  const other = directory(t), alias = join(other, 'alias'); symlinkSync(dir, alias, 'dir');
  assert.throws(() => new TerminalTodos(dir, join(alias, 'todo-links.json')), /source cannot be/);
  assert.deepEqual(readdirSync(dir), []);
});
test('unreadable PiScope links remain untouched and cannot be replaced with guessed mappings', t => {
  const s = source(t), dir = directory(t), path = join(dir, 'todo-links.json'); writeFileSync(path, '{broken');
  const reader = new TerminalTodos(dir, s.path); assert.equal(reader.snapshot().available, true); assert.equal(reader.snapshot().canLink, false);
  assert.match(reader.snapshot().warning, /links are unreadable/);
  assert.throws(() => reader.setLink({ labelId: reader.snapshot().labels[0].id, projectId: null }, []), /links are unreadable/);
  assert.equal(readFileSync(path, 'utf8'), '{broken'); unchanged(s);
});
test('notes are redacted, authenticated and excluded from history export and daily report context', async t => {
  const s = source(t, [{ ...task(), title: 'Keep language: Türkçe api_key=PRIVATE_TODO_VALUE' }]), f = await fixture(t, { todosFile: s.path });
  assert.equal((await fetch(f.url + '/api/state')).status, 401);
  for (const path of ['/todos.json', '/todo-links.json', '/src/todos.mjs']) assert.equal((await f.request(path)).status, 404);
  assert.equal((await fetch(f.url + '/notes.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  const state = await (await f.request('/api/state')).json(); assert.equal(state.terminalTodos.available, true);
  assert.ok(!JSON.stringify(state).includes('PRIVATE_TODO_VALUE')); assert.ok(!JSON.stringify(state).includes(s.path));
  assert.match(state.terminalTodos.tasks[0].title, /Türkçe/);
  const exported = await (await f.request('/api/export')).json(); assert.ok(!('terminalTodos' in exported));
  assert.deepEqual(state.dailyReport.records, []); assert.deepEqual(state.projectOverview.items, []); unchanged(s);
});
test('saving a label link requires separate control pairing and exact Origin but never enables Pi work', async t => {
  const s = source(t), f = await fixture(t, { todosFile: s.path, controlToken }); await seed(f);
  const label = f.app.todos.snapshot().labels[0].id;
  const view = { Cookie: `agentdesk=${token}`, Origin: f.url, 'Content-Type': 'application/json' };
  assert.equal((await link(f, view, label, 'project-a')).status, 403);
  const headers = await pair(f);
  assert.equal((await link(f, { ...headers, Origin: 'https://evil.example' }, label, 'project-a')).status, 403);
  const { Origin, ...withoutOrigin } = headers; assert.equal((await link(f, withoutOrigin, label, 'project-a')).status, 403);
  assert.equal((await link(f, { ...headers, 'Content-Type': 'text/plain' }, label, 'project-a')).status, 415);
  assert.equal((await link(f, headers, label, 'unknown-project')).status, 400);
  assert.equal((await link(f, headers, label, 'project-a')).status, 200);
  assert.equal(f.app.control.agents.size, 0); assert.equal(f.app.control.requests.size, 0); unchanged(s);
  const off = await fixture(t, { todosFile: s.path }); assert.equal((await link(off, view, label, 'project-a')).status, 403);
});
test('an edited note uses ordinary exact, single-project, at-most-once input; sent is not completed', async t => {
  const s = source(t), f = await fixture(t, { todosFile: s.path, controlToken }); await seed(f); await seed(f, 'project-b');
  const headers = await pair(f), input = { id: 'note-prompt-1', sessionId: 'session-project-b', projectId: 'project-b', runId: 'run-project-b', prompt: task().title + '\nEdited instruction: yalnız bu proje.' };
  assert.equal((await send(f, headers, input)).status, 409); // Runtime is not opted in.
  await poll(f, 'project-a'); await poll(f, 'project-b', false);
  assert.equal((await send(f, headers, input)).status, 409); // No busy queuing.
  await poll(f, 'project-b');
  assert.equal((await send(f, headers, { ...input, projectId: 'project-a' })).status, 409);
  assert.equal((await send(f, headers, { ...input, runId: 'old' })).status, 409);
  assert.equal((await send(f, headers, input)).status, 202); assert.equal((await send(f, headers, input)).status, 202);
  assert.equal((await (await poll(f, 'project-a')).json()).command, null);
  const command = (await (await poll(f, 'project-b')).json()).command;
  assert.equal(command.prompt, input.prompt); assert.equal(command.projectId, 'project-b');
  assert.equal((await (await poll(f, 'project-b')).json()).command, null);
  assert.equal(f.app.control.requests.size, 1); assert.equal(f.app.todos.snapshot().tasks[0].completed, false); unchanged(s);
});
test('source changes arrive over SSE without model activity; missing data is marked unavailable', async t => {
  const s = source(t), f = await fixture(t, { todosFile: s.path, todosPollMs: 30 });
  const controller = new AbortController(); t.after(() => controller.abort());
  const response = await f.request('/api/events', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) });
  const stream = snapshots(response.body); assert.equal((await stream.next()).value.terminalTodos.tasks[0].title, task().title);
  writeFileSync(s.path, JSON.stringify(database([{ ...task(), title: 'Changed in Terminal Todos' }])));
  let changed; do { changed = (await stream.next()).value; } while (changed.terminalTodos.tasks[0].title !== 'Changed in Terminal Todos');
  assert.deepEqual(changed.sessions, []); assert.deepEqual(changed.dailyReport.records, []);
  rmSync(s.path); let missing; do { missing = (await stream.next()).value; } while (missing.terminalTodos.available);
  assert.match(missing.terminalTodos.warning, /missing/);
  await stream.return(); controller.abort();
});
