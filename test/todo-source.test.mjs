import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, statSync, chmodSync, existsSync, symlinkSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createDashboard } from '../src/server.mjs';
import { TerminalTodos } from '../src/todos.mjs';
import { directory, token } from './helpers.mjs';

// Independent inventory of files the collector can write, chmod, rename or remove.
const owned = ['projects.json', 'events.jsonl', 'events.1.jsonl', 'events.2.jsonl',
  'daily-reports.json', 'generated-reports.json', 'auth.token', 'control.token',
  'connection.json', 'server.lock', 'todo-links.json', 'todo-activity.json'];
const bytes = JSON.stringify({ version: 2, next_id: 2, tasks: [{ id: 1, title: 'Synthetic read-only note', completed: false, created_at: 1720000000 }] });
function original(path) {
  writeFileSync(path, bytes, { mode: 0o640 });
  return statSync(path);
}
function preserved(path, before) {
  assert.equal(readFileSync(path, 'utf8'), bytes);
  const after = statSync(path);
  for (const field of ['ino', 'mode', 'mtimeMs', 'ctimeMs']) assert.equal(after[field], before[field], field);
}
async function rejected(dir, path) {
  let app;
  try { assert.throws(() => { app = createDashboard({ dataDir: dir, token, todosFile: path }); }, /source cannot be/); }
  finally { if (app) await app.close(); }
}

test('todo source collisions fail before every collector-owned file is read or written', async t => {
  for (const name of owned) await t.test(name, async t => {
    const dir = directory(t), path = join(dir, name), before = original(path);
    await rejected(dir, path);
    preserved(path, before); assert.deepEqual(readdirSync(dir), [name]);
  });
});
test('CLI rejects a todo source collision before token chmod, lock acquisition or connection writes', t => {
  const dir = directory(t), path = join(dir, 'server.lock'), before = original(path);
  chmodSync(dir, 0o750); const mode = statSync(dir).mode;
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '65534', AGENT_DASHBOARD_HOME: dir, AGENT_DASHBOARD_TODOS: '1', AGENT_DASHBOARD_TODOS_FILE: path, AGENT_DASHBOARD_CONTROL: '0', AGENT_DASHBOARD_TAILSCALE_ORIGIN: '' },
    encoding: 'utf8', timeout: 5000
  });
  assert.equal(result.status, 1); assert.match(result.stderr, /source cannot be/); assert.equal(result.stdout, '');
  preserved(path, before); assert.equal(statSync(dir).mode, mode); assert.deepEqual(readdirSync(dir), ['server.lock']);
});
test('todo source collision detection covers directory aliases, hard links and missing targets', async t => {
  await t.test('existing source through a directory symlink', async t => {
    const dir = directory(t), elsewhere = directory(t), path = join(dir, 'projects.json'), before = original(path);
    symlinkSync(dir, join(elsewhere, 'alias'), 'dir');
    await rejected(dir, join(elsewhere, 'alias', 'projects.json'));
    preserved(path, before); assert.deepEqual(readdirSync(dir), ['projects.json']);
  });
  await t.test('hard-linked source with a different name and directory', async t => {
    const dir = directory(t), elsewhere = directory(t), path = join(dir, 'events.jsonl'), source = join(elsewhere, 'notes.json');
    original(path); linkSync(path, source); const before = statSync(path);
    await rejected(dir, source);
    preserved(path, before); preserved(source, before); assert.deepEqual(readdirSync(dir), ['events.jsonl']);
  });
  await t.test('collector connection symlink to an existing source', async t => {
    const dir = directory(t), elsewhere = directory(t), source = join(elsewhere, 'todos.json'), before = original(source);
    symlinkSync(source, join(dir, 'connection.json'));
    await rejected(dir, source);
    preserved(source, before); assert.deepEqual(readdirSync(dir), ['connection.json']); assert.deepEqual(readdirSync(elsewhere), ['todos.json']);
  });
  await t.test('nonexistent parent through a directory symlink', async t => {
    const dir = directory(t), elsewhere = directory(t); symlinkSync(dir, join(elsewhere, 'alias'), 'dir');
    const parent = join(dir, 'not-created'), source = join(parent, 'events.2.jsonl');
    await rejected(join(elsewhere, 'alias', 'not-created'), source);
    assert.equal(existsSync(parent), false); assert.deepEqual(readdirSync(dir), []);
  });
  await t.test('collector journal symlink to a missing source', async t => {
    const dir = directory(t), elsewhere = directory(t), source = join(elsewhere, 'notes.json');
    symlinkSync(source, join(dir, 'events.jsonl'));
    await rejected(dir, source);
    assert.equal(existsSync(source), false); assert.deepEqual(readdirSync(dir), ['events.jsonl']); assert.deepEqual(readdirSync(elsewhere), []);
  });
});
test('ordinary todo filename beside collector data stays read-only; disabled source is untouched', async t => {
  const dir = directory(t), path = join(dir, 'todos.json'), before = original(path);
  const reader = new TerminalTodos(dir, path);
  assert.equal(reader.snapshot().available, true); preserved(path, before); assert.deepEqual(readdirSync(dir), ['todos.json']);
  assert.equal(new TerminalTodos(dir).snapshot().enabled, false); preserved(path, before);
  const app = createDashboard({ dataDir: dir, token, todosFile: path });
  try {
    assert.equal(app.todos.snapshot().available, true);
    app.store.append({ schemaVersion: 1, id: 'safe-work', type: 'prompt.received', time: new Date().toISOString(), sessionId: 'safe-session', runId: 'safe-run', projectId: 'safe-project', projectName: 'Synthetic', data: { prompt: 'Ordinary captured work' } });
  } finally { await app.close(); }
  preserved(path, before);
});
