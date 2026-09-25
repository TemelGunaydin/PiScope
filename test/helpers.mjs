import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createDashboard } from '../src/server.mjs';
export const token = 'a'.repeat(64);
export function event(type = 'run.started', data = {}, overrides = {}) {
  return { schemaVersion: 1, id: randomUUID(), type, time: new Date().toISOString(),
    sessionId: 'session-a', runId: 'run-a', projectId: 'project-a', projectName: 'Test Project', data, ...overrides };
}
export function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-desk-test-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir;
}
export async function fixture(t) {
  const dir = directory(t); const app = createDashboard({ dataDir: dir, token }); const url = await app.listen(0);
  t.after(() => app.close());
  const request = (path, options = {}) => fetch(url + path, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  const post = data => request('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return { dir, app, url, request, post };
}
