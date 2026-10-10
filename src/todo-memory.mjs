import { existsSync, readFileSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { savePrivateJSON } from './private-json.mjs';
import { redact } from './security.mjs';
import { runVerdict } from './metrics.mjs';

const LIMIT = 500, BYTES = 2 * 1024 * 1024;
const states = new Set(['queued', 'sent', 'running', 'reply', 'error', 'unknown']);
function record(raw) {
  if (!raw || typeof raw.todoRef !== 'string' || !/^[a-f0-9]{64}$/.test(raw.todoRef) || !states.has(raw.status)) throw new Error('Invalid note activity');
  const value = { todoRef: raw.todoRef, status: raw.status };
  for (const name of ['id', 'projectId', 'sessionId', 'baseRunId', 'runId', 'checkpoint']) if (raw[name] !== undefined) {
    if (typeof raw[name] !== 'string' || !/^[a-zA-Z0-9_.:\-]{1,160}$/.test(raw[name])) throw new Error('Invalid activity identity'); value[name] = raw[name];
  }
  for (const name of ['createdAt', 'eventAt']) if (raw[name] !== undefined) {
    if (typeof raw[name] !== 'string' || !Number.isFinite(Date.parse(raw[name]))) throw new Error('Invalid activity time'); value[name] = new Date(raw[name]).toISOString();
  }
  for (const [name, max] of [['summary', 1000], ['reason', 1000], ['model', 300]]) value[name] = redact(raw[name], max);
  if (!value.id || !value.projectId || !value.sessionId || !value.baseRunId || !value.createdAt) throw new Error('Missing activity identity');
  return value;
}

/** Latest approved request per source identity. Evidence only; never stores or replays prompts. */
export class TodoMemory {
  constructor(dir, warn) {
    this.path = join(dir, 'todo-activity.json'); this.warn = warn; this.entries = new Map(); this.pending = new Map(); this.replaying = true;
    if (existsSync(this.path)) try {
      if (statSync(this.path).size > BYTES + 1024) throw new Error('Activity size limit');
      const raw = JSON.parse(readFileSync(this.path, 'utf8'));
      if (raw.schemaVersion !== 1 || !Array.isArray(raw.activity) || raw.activity.length > LIMIT) throw new Error('Invalid activity file');
      const ids = new Set();
      for (const input of raw.activity) {
        const r = record(input); if (this.entries.has(r.todoRef) || ids.has(r.id)) throw new Error('Duplicate note activity'); ids.add(r.id);
        if (r.checkpoint) this.pending.set(r.todoRef, r.checkpoint);
        if (['queued', 'sent', 'running'].includes(r.status)) { r.status = 'unknown'; r.reason = 'Collector restarted; delivery or execution is uncertain. Check Pi. Nothing was replayed.'; this.dirty = true; }
        this.entries.set(r.todoRef, r);
      }
    } catch {
      this.entries.clear(); this.pending.clear(); renameSync(this.path, `${this.path}.invalid-${randomUUID()}`);
      warn('Note activity was unreadable; the original file was preserved. Notes and Pi history are unchanged.');
    }
  }
  start(input) {
    const old = this.entries.get(input.todoRef), dirty = this.dirty;
    if ([...this.entries.values()].some(r => r.id === input.id)) throw Object.assign(new Error('This request ID is already recorded. Check Pi; do not replay the request.'), { status: 409 });
    if (old && ['queued', 'sent', 'running'].includes(old.status)) throw Object.assign(new Error('This note already has a pending Pi request. Check its result before sending again.'), { status: 409 });
    const r = record({ ...input, status: 'queued' }); this.entries.set(r.todoRef, r); this.dirty = true;
    try { this.flush(); } catch (error) { if (old) this.entries.set(r.todoRef, old); else this.entries.delete(r.todoRef); this.dirty = dirty; throw error; }
  }
  delivery(id, status, reason) {
    const r = [...this.entries.values()].find(r => r.id === id);
    if (!r || r.runId || !['queued', 'sent'].includes(r.status)) return;
    if (status === 'submitted') { r.status = 'sent'; r.reason = 'Sent to Pi; waiting for its bound request. Sent is not completed.'; }
    else if (['rejected', 'expired', 'unknown'].includes(status)) { r.status = status === 'unknown' ? 'unknown' : 'error'; r.reason = redact(reason, 1000); }
    else return;
    this.changed();
  }
  observe(e, run) {
    if (!e.controlRequestId || e.demo) return;
    const r = [...this.entries.values()].find(r => r.id === e.controlRequestId && r.projectId === e.projectId && r.sessionId === e.sessionId);
    if (!r) return;
    if (this.replaying && this.pending.has(r.todoRef)) { if (this.pending.get(r.todoRef) === e.id) this.pending.delete(r.todoRef); return; }
    if (e.time < r.createdAt || (r.eventAt && e.time < r.eventAt)) return;
    if (!r.runId && e.type === 'prompt.received' && e.runId && e.runId !== r.baseRunId) r.runId = e.runId;
    if (!r.runId || r.runId !== e.runId) return;
    r.checkpoint = e.id; r.eventAt = e.time;
    if (e.type === 'prompt.received' || e.type === 'run.started') { r.status = 'running'; r.reason = ''; if (e.type === 'run.started') r.summary = ''; }
    if (e.data.model) r.model = redact(e.data.model, 300);
    if (e.type === 'message.completed') r.summary = redact(e.data.summary || r.summary, 1000);
    if (e.type === 'run.ended') {
      r.summary = redact(e.data.summary, 1000);
      const verdict = runVerdict(run);
      r.status = verdict === 'failed' ? 'error' : verdict === 'completed' && run.requestStartedAt && r.summary.trim() ? 'reply' : 'unknown';
      r.reason = r.status === 'reply' ? 'Pi returned a response. This is not verification that the note or project is complete.' : redact(run.errorMessage || (verdict === 'cancelled' ? 'Pi was cancelled. Check its terminal.' : verdict === 'failed' ? 'Pi reported an execution failure.' : 'No completed captured response is available. Check Pi; nothing is retried.'), 1000);
    }
    this.changed();
  }
  sweep(now = Date.now()) {
    for (const r of this.entries.values()) if (!r.runId && ['queued', 'sent'].includes(r.status) && now - Date.parse(r.createdAt) > 30000) {
      r.status = 'unknown'; r.reason = 'No bound Pi request was observed. Check Pi before sending again; nothing was retried.'; this.changed();
    }
  }
  changed() {
    this.dirty = true;
    if (!this.replaying && !this.timer) { this.timer = setTimeout(() => { this.timer = undefined; try { this.flush(); } catch { this.warn('Note activity could not be saved; check collector storage.'); } }, 500); this.timer.unref(); }
  }
  flush() {
    clearTimeout(this.timer); this.timer = undefined; if (!this.dirty) return;
    const retained = []; let bytes = 0;
    for (const r of [...this.entries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, LIMIT)) {
      const size = Buffer.byteLength(JSON.stringify(r)) + 1; if (bytes + size > BYTES) continue; retained.push(r); bytes += size;
    }
    savePrivateJSON(this.path, { schemaVersion: 1, activity: retained }); this.entries = new Map(retained.map(r => [r.todoRef, r])); this.dirty = false;
  }
  finishReplay() { this.replaying = false; this.pending.clear(); this.flush(); }
  snapshot(sessions, now = Date.now()) {
    this.sweep(now);
    return [...this.entries.values()].map(r => {
      const { checkpoint, eventAt, ...value } = r, s = sessions.get(r.sessionId);
      const bound = s?.projectId === r.projectId && s.runs.some(run => run.id === r.runId && run.controlRequestId === r.id);
      if (r.status === 'running' && (!s?.connected || now - Date.parse(s.lastSeen) >= 30000)) { value.status = 'unknown'; value.reason = 'Pi signal is offline or stale; the last observed request was running. Check Pi.'; }
      return { ...value, detailAvailable: Boolean(bound) };
    });
  }
}
