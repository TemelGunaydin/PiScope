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

// HTTP chunks are not SSE messages. Keep incomplete frames (and UTF-8 bytes)
// between reads, and leave coalesced snapshots available for the next read.
export async function* snapshots(body) {
  let pending = '';
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    pending += chunk;
    let end;
    while ((end = pending.indexOf('\n\n')) !== -1) {
      const frame = pending.slice(0, end); pending = pending.slice(end + 2);
      const lines = frame.split('\n');
      if (!lines.includes('event: snapshot')) continue;
      yield JSON.parse(lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'));
    }
  }
  throw new Error('SSE stream ended while waiting for a snapshot');
}
