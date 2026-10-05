import { existsSync, readFileSync, statSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { redact } from './security.mjs';
import { runVerdict } from './metrics.mjs';
import { accomplishments } from '../extensions/agent-dashboard/events.mjs';
import { savePrivateJSON } from './private-json.mjs';
import { reportSourceVersion } from './report-prompt.mjs';

export const DAILY_LIMIT = 1000;
const MODE_BYTES = 12 * 1024 * 1024;
const workTypes = new Set(['prompt.received', 'run.started', 'message.completed', 'workflow.updated',
  'tool.started', 'tool.finished', 'agent.started', 'agent.finished', 'run.ended', 'run.settled']);
const keyOf = r => JSON.stringify([r.demo, r.day, r.sessionId, r.runId]);
const identity = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:\-]{1,160}$/.test(value)) throw new Error('Invalid daily report identity');
  return value;
};
const timestamp = value => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid daily report time');
  return new Date(value).toISOString();
};
function record(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.day) || new Date(`${raw.day}T12:00:00Z`).toISOString().slice(0, 10) !== raw.day) throw new Error('Invalid report day');
  if (!['completed', 'failed', 'cancelled', 'unknown'].includes(raw.verdict)) throw new Error('Invalid report outcome');
  const r = { day: raw.day, demo: raw.demo === true, projectId: identity(raw.projectId), projectName: redact(raw.projectName, 240),
    sessionId: identity(raw.sessionId), runId: identity(raw.runId), checkpoint: identity(raw.checkpoint),
    firstAt: timestamp(raw.firstAt), lastAt: timestamp(raw.lastAt), prompt: redact(raw.prompt, 600),
    summary: redact(raw.summary, 1000), errorMessage: redact(raw.errorMessage, 1000),
    accomplishments: accomplishments(raw.accomplishments), verdict: raw.verdict };
  for (const name of ['responseAt', 'reportAt', 'errorAt']) if (raw[name]) r[name] = timestamp(raw[name]);
  return r;
}

/** Per-day/request excerpts, independent of detailed session retention. No
 * summaries from another day are copied into today's reported results. */
export class DailyMemory {
  constructor(dir, warn) {
    this.path = join(dir, 'daily-reports.json'); this.warn = warn; this.entries = new Map();
    this.replayPending = new Map(); this.replaying = true; this.dirty = false;
    this.observedRuns = new WeakSet(); this.partialRuns = new WeakSet();
    this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (existsSync(this.path)) {
      try {
        if (statSync(this.path).size > MODE_BYTES * 2 + 1024) throw new Error('Report file exceeds limit');
        const saved = JSON.parse(readFileSync(this.path, 'utf8'));
        if (saved.schemaVersion !== 1 || !Array.isArray(saved.records) || saved.records.length > DAILY_LIMIT * 2 || typeof saved.timeZone !== 'string') throw new Error('Invalid report snapshot');
        new Intl.DateTimeFormat('en', { timeZone: saved.timeZone });
        const records = saved.records.map(record);
        for (const demo of [false, true]) if (records.filter(r => r.demo === demo).length > DAILY_LIMIT) throw new Error('Report mode exceeds limit');
        for (const r of records) {
          const key = keyOf(r); if (this.entries.has(key)) throw new Error('Duplicate daily record');
          this.entries.set(key, r); this.replayPending.set(key, r.checkpoint);
        }
        this.timeZone = saved.timeZone; chmodSync(this.path, 0o600);
      } catch {
        this.entries.clear(); this.replayPending.clear();
        renameSync(this.path, `${this.path}.invalid-${randomUUID()}`);
        this.warn('Daily reports were unreadable; retained events will rebuild them. The original report file was preserved.');
      }
    }
    this.formatter = new Intl.DateTimeFormat('en-US', { timeZone: this.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  day(time) {
    const parts = Object.fromEntries(this.formatter.formatToParts(new Date(time)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  observe(e, run) {
    if (e.reportRequestId || !run || !e.runId || !workTypes.has(e.type)) return;
    const day = this.day(e.time), key = keyOf({ ...e, day });
    if (this.replaying && this.replayPending.has(key)) {
      if (this.replayPending.get(key) === e.id) this.replayPending.delete(key);
      return;
    }
    let r = this.entries.get(key);
    if (!this.observedRuns.has(run)) {
      if (r && !run.requestStartedAt) this.partialRuns.add(run);
      this.observedRuns.add(run);
    }
    if (!r) {
      r = { day, demo: e.demo, projectId: e.projectId, projectName: e.projectName, sessionId: e.sessionId, runId: e.runId,
        firstAt: e.time, lastAt: e.time, prompt: '', summary: '', errorMessage: '', accomplishments: [], verdict: 'unknown' };
      this.entries.set(key, r);
    }
    r.checkpoint = e.id;
    if (e.time < r.firstAt) r.firstAt = e.time;
    if (e.time >= r.lastAt) { r.lastAt = e.time; r.projectName = e.projectName; }
    r.prompt = redact(run.prompt || r.prompt, 600);
    const verdict = runVerdict(run);
    // A terminal tail after detail eviction cannot prove old failed/unresolved
    // children recovered. A retained start establishes the full current run.
    if (!this.partialRuns.has(run) || run.requestStartedAt || verdict !== 'completed') r.verdict = verdict;
    const d = e.data;
    if (['message.completed', 'run.ended'].includes(e.type)) {
      if (d.summary && (!r.responseAt || e.time >= r.responseAt)) { r.summary = redact(d.summary, 1000); r.responseAt = e.time; }
      if (typeof d.errorMessage === 'string' && (!r.errorAt || e.time >= r.errorAt)) { r.errorMessage = redact(d.errorMessage, 1000); r.errorAt = e.time; }
      else if (e.type === 'run.ended' && (!r.errorAt || e.time >= r.errorAt)) { r.errorMessage = d.outcome === 'error' ? r.errorMessage || 'Pi reported an error; details were not recorded.' : ''; r.errorAt = e.time; }
    }
    if (e.type === 'run.started' && (!r.errorAt || e.time >= r.errorAt)) { r.errorMessage = ''; r.errorAt = e.time; }
    if (e.type === 'workflow.updated' && d.accomplishments !== undefined && (!r.reportAt || e.time >= r.reportAt)) {
      r.accomplishments = accomplishments(d.accomplishments); r.reportAt = e.time;
    }
    const mode = [...this.entries.values()].filter(r => r.demo === e.demo).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    for (const old of mode.slice(DAILY_LIMIT)) this.entries.delete(keyOf(old));
    this.dirty = true;
    if (!this.replaying && !this.timer) {
      this.timer = setTimeout(() => { this.timer = undefined; try { this.flush(); } catch { this.warn('Daily reports could not be saved; journal rotation is held until storage recovers.'); } }, 500);
      this.timer.unref();
    }
  }
  finishReplay() { this.replaying = false; this.replayPending.clear(); this.flush(); }
  flush() {
    clearTimeout(this.timer); this.timer = undefined;
    if (!this.dirty) return;
    const retained = [];
    for (const demo of [false, true]) {
      let bytes = 0;
      for (const r of [...this.entries.values()].filter(r => r.demo === demo).sort((a, b) => b.lastAt.localeCompare(a.lastAt))) {
        const size = Buffer.byteLength(JSON.stringify(r)) + 1;
        if (bytes + size > MODE_BYTES) continue;
        bytes += size; retained.push(r);
      }
    }
    savePrivateJSON(this.path, { schemaVersion: 1, timeZone: this.timeZone, records: retained });
    this.entries = new Map(retained.map(r => [keyOf(r), r])); this.dirty = false;
  }
  reportRecords(day, projectId) {
    return [...this.entries.values()].filter(r => !r.demo && r.day === day && (projectId === undefined || r.projectId === projectId)).sort((a, b) => a.lastAt.localeCompare(b.lastAt) || a.sessionId.localeCompare(b.sessionId) || a.runId.localeCompare(b.runId)).slice(-DAILY_LIMIT);
  }
  sourceVersion(day, projectId, projects) { return reportSourceVersion(this.reportRecords(day, projectId), projects); }
  snapshot(sessions) {
    return { limit: DAILY_LIMIT, timeZone: this.timeZone, records: [...this.entries.values()].map(r => {
      const { checkpoint, responseAt, reportAt, errorAt, ...summary } = r;
      return { ...summary, detailAvailable: Boolean(sessions.get(r.sessionId)?.runs.some(run => run.id === r.runId)) };
    }) };
  }
}
