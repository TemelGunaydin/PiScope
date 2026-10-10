import { existsSync, readFileSync, statSync, chmodSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { savePrivateJSON } from './private-json.mjs';
import { redact } from './security.mjs';
import { runVerdict } from './metrics.mjs';
import { validReportDay } from './report-prompt.mjs';

const LIMIT = 500, BYTES = 2 * 1024 * 1024;
const keyOf = r => r.scope === 'all' ? JSON.stringify(['all', 'day', r.day]) : JSON.stringify([r.projectId, r.day]);
const states = new Set(['queued', 'generating', 'ready', 'failed', 'cancelled', 'unknown']);
function project(raw) {
  if (!raw || !validReportDay(raw.day) || !states.has(raw.status)) throw new Error('Invalid generated report');
  const value = { day: raw.day, status: raw.status };
  if (raw.scope !== undefined) { if (raw.scope !== 'all') throw new Error('Invalid report scope'); value.scope = raw.scope; }
  for (const name of ['id', 'projectId', 'sessionId', 'baseRunId', 'runId', 'checkpoint']) if (raw[name] !== undefined) {
    if (typeof raw[name] !== 'string' || !/^[a-zA-Z0-9_.:\-]{1,160}$/.test(raw[name])) throw new Error('Invalid report identity');
    value[name] = raw[name];
  }
  if (!value.id || !value.projectId || !value.sessionId || !value.baseRunId) throw new Error('Missing report identity');
  for (const name of ['sourceHash', 'contentSourceHash']) if (raw[name] !== undefined) {
    if (typeof raw[name] !== 'string' || !/^[a-f0-9]{64}$/.test(raw[name])) throw new Error('Invalid report source'); value[name] = raw[name];
  }
  for (const name of ['createdAt', 'generatedAt', 'submittedAt']) if (raw[name] !== undefined) {
    if (typeof raw[name] !== 'string' || !Number.isFinite(Date.parse(raw[name]))) throw new Error('Invalid report time'); value[name] = new Date(raw[name]).toISOString();
  }
  for (const name of ['included', 'total', 'contentIncluded', 'contentTotal']) if (raw[name] !== undefined) {
    if (!Number.isInteger(raw[name]) || raw[name] < 0 || raw[name] > 1000) throw new Error('Invalid report coverage'); value[name] = raw[name];
  }
  for (const name of ['includedProjects', 'totalProjects', 'contentIncludedProjects', 'contentTotalProjects']) if (raw[name] !== undefined) {
    if (!Number.isInteger(raw[name]) || raw[name] < 1 || raw[name] > 1500) throw new Error('Invalid project coverage'); value[name] = raw[name];
  }
  if (value.scope === 'all' && (!value.includedProjects || !value.totalProjects || value.includedProjects > value.totalProjects)) throw new Error('Missing project coverage');
  for (const [name, max] of [['projectName', 240], ['summary', 2400], ['remaining', 800], ['draftSummary', 2400], ['draftRemaining', 800], ['errorMessage', 1000], ['model', 300]]) {
    if (raw[name] !== undefined && typeof raw[name] !== 'string') throw new Error('Invalid report text');
    value[name] = redact(raw[name], max);
  }
  if (!value.createdAt || !value.sourceHash || !value.included || !value.total || value.included > value.total) throw new Error('Missing report source or time');
  if (value.summary && (!value.generatedAt || !value.contentSourceHash || !value.contentIncluded || !value.contentTotal || value.contentIncluded > value.contentTotal)) throw new Error('Missing published report metadata');
  if (value.scope === 'all' && value.summary && (!value.contentIncludedProjects || !value.contentTotalProjects || value.contentIncludedProjects > value.contentTotalProjects)) throw new Error('Missing published project coverage');
  if (value.status === 'ready' && !value.summary.trim()) throw new Error('Missing published summary');
  return value;
}

/** Generated text stays separate from captured work; no commands are replayed. */
export class ReportMemory {
  constructor(dir, warn) {
    this.path = join(dir, 'generated-reports.json'); this.warn = warn; this.entries = new Map(); this.pending = new Map(); this.replaying = true;
    if (existsSync(this.path)) try {
      if (statSync(this.path).size > BYTES + 1024) throw new Error('Report file exceeds limit');
      const data = JSON.parse(readFileSync(this.path, 'utf8'));
      if (data.schemaVersion !== 1 || !Array.isArray(data.reports) || data.reports.length > LIMIT) throw new Error('Invalid report file');
      for (const raw of data.reports) {
        const r = project(raw), key = keyOf(r);
        if (this.entries.has(key)) throw new Error('Duplicate report');
        if (r.checkpoint) this.pending.set(key, r.checkpoint);
        if (['queued', 'generating'].includes(r.status)) { r.status = 'unknown'; r.errorMessage = 'Collector restarted; generation/delivery is uncertain. Check Pi before generating again.'; this.dirty = true; }
        this.entries.set(key, r);
      }
      chmodSync(this.path, 0o600);
    } catch {
      this.entries.clear(); this.pending.clear(); renameSync(this.path, `${this.path}.invalid-${randomUUID()}`);
      this.warn('Generated daily reports were unreadable; the original file was preserved. Captured work is unchanged.');
    }
  }
  start(input) {
    const key = keyOf(input), old = this.entries.get(key), wasDirty = this.dirty;
    const r = project({ ...old, ...input, status: 'queued', summary: old?.summary || '', remaining: old?.remaining || '', errorMessage: '', draftSummary: '', draftRemaining: '', submittedAt: undefined, runId: undefined, checkpoint: undefined });
    this.entries.set(key, r); this.dirty = true;
    try { this.flush(); } catch (error) { if (old) this.entries.set(key, old); else this.entries.delete(key); this.dirty = wasDirty; throw error; }
  }
  delivery(id, status, reason, now = Date.now()) {
    const r = [...this.entries.values()].find(r => r.id === id);
    if (!r || r.runId || !['queued', 'unknown'].includes(r.status)) return;
    if (status === 'submitted' && r.status === 'queued' && !r.submittedAt) { r.submittedAt = new Date(now).toISOString(); this.changed(); }
    if (['expired', 'rejected', 'unknown'].includes(status)) { r.status = status === 'unknown' ? 'unknown' : 'failed'; r.errorMessage = redact(reason, 1000); this.changed(); }
  }
  sweep(now = Date.now()) {
    for (const r of this.entries.values()) if (r.status === 'queued' && !r.runId && now - Date.parse(r.submittedAt || r.createdAt) > 30000) {
      r.status = 'unknown'; r.errorMessage = 'No bound Pi request was observed. Check Pi before approving another report; nothing was retried.'; this.changed();
    }
  }
  observe(e, run) {
    if (!e.reportRequestId || e.demo) return;
    const r = [...this.entries.values()].find(r => r.id === e.reportRequestId && r.projectId === e.projectId && r.sessionId === e.sessionId);
    if (!r) return;
    const key = keyOf(r);
    if (this.replaying && this.pending.has(key)) { if (this.pending.get(key) === e.id) this.pending.delete(key); return; }
    if (e.type === 'prompt.received' && !r.runId) { r.runId = e.runId; r.status = 'generating'; r.errorMessage = ''; }
    if (!r.runId || r.runId !== e.runId) return;
    r.checkpoint = e.id;
    if (e.type === 'daily.reported') { r.draftSummary = redact(e.data.summary, 2400); r.draftRemaining = redact(e.data.remaining, 800); }
    if (e.type === 'run.started') {
      if (['failed', 'cancelled', 'unknown'].includes(r.status)) { r.draftSummary = ''; r.draftRemaining = ''; }
      r.status = 'generating'; r.errorMessage = '';
    }
    if (e.type === 'run.ended') {
      const verdict = runVerdict(run);
      r.status = verdict === 'failed' ? 'failed' : verdict === 'cancelled' ? 'cancelled' : verdict === 'completed' && run.requestStartedAt && r.draftSummary ? 'ready' : 'unknown';
      r.errorMessage = r.status === 'ready' ? '' : redact(run.errorMessage || (r.status === 'cancelled' ? 'Report generation was cancelled.' : r.status === 'failed' ? 'Pi reported a generation failure.' : 'Pi did not return a completed structured daily summary. Check its terminal.'), 1000);
      if (r.status === 'ready') {
        r.summary = r.draftSummary; r.remaining = r.draftRemaining; r.generatedAt = e.time; r.model = run.model || '';
        r.contentSourceHash = r.sourceHash; r.contentIncluded = r.included; r.contentTotal = r.total;
        if (r.scope === 'all') { r.contentIncludedProjects = r.includedProjects; r.contentTotalProjects = r.totalProjects; }
        r.draftSummary = ''; r.draftRemaining = '';
      }
    }
    this.changed();
  }
  changed() {
    this.dirty = true;
    if (!this.replaying && !this.timer) { this.timer = setTimeout(() => { this.timer = undefined; try { this.flush(); } catch { this.warn('Generated reports could not be saved; check collector storage.'); } }, 500); this.timer.unref(); }
  }
  finishReplay() { this.replaying = false; this.pending.clear(); this.flush(); }
  flush() {
    clearTimeout(this.timer); this.timer = undefined;
    if (!this.dirty) return;
    const retained = []; let bytes = 0;
    for (const r of [...this.entries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, LIMIT)) {
      const size = Buffer.byteLength(JSON.stringify(r)) + 1;
      if (bytes + size > BYTES) continue;
      retained.push(r); bytes += size;
    }
    savePrivateJSON(this.path, { schemaVersion: 1, reports: retained }); this.entries = new Map(retained.map(r => [keyOf(r), r])); this.dirty = false;
  }
  snapshot(daily, projects, now = Date.now()) {
    this.sweep(now);
    return [...this.entries.values()].map(r => {
      const { checkpoint, draftSummary, draftRemaining, sourceHash, contentSourceHash, ...publicReport } = r;
      return { ...publicReport, stale: Boolean(r.summary && r.contentSourceHash !== daily.sourceVersion(r.day, r.scope === 'all' ? undefined : r.projectId, r.scope === 'all' ? projects : undefined)) };
    });
  }
}
