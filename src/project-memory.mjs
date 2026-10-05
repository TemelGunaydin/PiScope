import { existsSync, readFileSync, statSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { redact } from './security.mjs';
import { runVerdict } from './metrics.mjs';
import { recommendations } from '../extensions/agent-dashboard/events.mjs';
import { savePrivateJSON } from './private-json.mjs';

export const PROJECT_LIMIT = 500;
const keyOf = p => `${p.demo ? 'demo' : 'live'}:${p.projectId}`;
const id = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:\-]{1,160}$/.test(value)) throw new Error('Invalid project memory identity');
  return value;
};
const date = value => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid project memory time');
  return new Date(value).toISOString();
};
const states = new Set(['pending', 'running', 'done', 'error', 'blocked', 'cancelled']);
function projectRecord(raw) {
  const p = { projectId: id(raw.projectId), projectName: redact(raw.projectName, 240), demo: raw.demo === true,
    firstSeen: date(raw.firstSeen), checkpoint: id(raw.checkpoint) };
  if (raw.lastWorkedAt) p.lastWorkedAt = date(raw.lastWorkedAt);
  if (raw.latest) {
    const r = raw.latest;
    if (!['completed', 'failed', 'cancelled', 'unknown'].includes(r.verdict) || !Array.isArray(r.stages) || r.stages.length > 20) throw new Error('Invalid project work summary');
    p.latest = { sessionId: id(r.sessionId), runId: id(r.runId), startedAt: date(r.startedAt),
      prompt: redact(r.prompt, 600), summary: redact(r.summary, 1000), errorMessage: redact(r.errorMessage, 1000), verdict: r.verdict,
      recommendations: recommendations(r.recommendations),
      stages: r.stages.map(s => {
        if (!states.has(s.status)) throw new Error('Invalid remembered stage');
        return { id: id(s.id), title: redact(s.title, 160), status: s.status };
      }) };
  }
  return p;
}

/** Small durable summaries survive journal rotation; detailed run retention is
 * unchanged. A per-project checkpoint prevents replay from regressing a saved
 * summary, including batches whose timestamps are identical. */
export class ProjectMemory {
  constructor(dir, warn) {
    this.path = join(dir, 'projects.json'); this.warn = warn; this.entries = new Map();
    this.replayPending = new Map(); this.dirty = false; this.replaying = true;
    this.observedRuns = new WeakSet(); this.partialRuns = new WeakSet();
    if (!existsSync(this.path)) return;
    try {
      if (statSync(this.path).size > 32 * 1024 * 1024) throw new Error('Project memory exceeds limit');
      const saved = JSON.parse(readFileSync(this.path, 'utf8'));
      if (saved.schemaVersion !== 1 || !Array.isArray(saved.projects) || saved.projects.length > PROJECT_LIMIT * 2) throw new Error('Unsupported project memory');
      const entries = saved.projects.map(projectRecord);
      if ([true, false].some(demo => entries.filter(p => p.demo === demo).length > PROJECT_LIMIT)) throw new Error('Project memory exceeds mode limit');
      for (const p of entries) {
        const key = keyOf(p);
        if (this.entries.has(key)) throw new Error('Duplicate project memory');
        this.entries.set(key, p); this.replayPending.set(key, p.checkpoint);
      }
      chmodSync(this.path, 0o600);
    } catch {
      this.entries.clear(); this.replayPending.clear();
      // Keep the unreadable original for diagnosis; do not silently overwrite it.
      renameSync(this.path, `${this.path}.invalid-${randomUUID()}`);
      this.warn('Project summaries were unreadable; retained events will rebuild them. The original projects.json was preserved.');
    }
  }
  observe(e, run) {
    if (e.type === 'session.heartbeat') return;
    const key = keyOf(e);
    if (this.replaying && this.replayPending.has(key)) {
      if (this.replayPending.get(key) === e.id) this.replayPending.delete(key);
      return;
    }
    let p = this.entries.get(key);
    if (!p) {
      p = { projectId: e.projectId, projectName: e.projectName, demo: e.demo, firstSeen: e.time, checkpoint: e.id };
      this.entries.set(key, p);
    }
    p.checkpoint = e.id;
    if (e.time < p.firstSeen) p.firstSeen = e.time;
    // Connection changes and heartbeats are not work: returning to an idle tab
    // must not make last week's task look as though it was performed today.
    if (run && !e.type.startsWith('session.') && e.type !== 'monitor.warning') {
      if (!p.lastWorkedAt || e.time >= p.lastWorkedAt) { p.lastWorkedAt = e.time; p.projectName = e.projectName; }
      const previous = p.latest, same = previous?.sessionId === e.sessionId && previous?.runId === e.runId;
      if (!this.observedRuns.has(run)) {
        if (same && !run.requestStartedAt) this.partialRuns.add(run);
        this.observedRuns.add(run);
      }
      // A late event whose request start has rotated away cannot establish
      // that an older, different request is newer than the saved summary.
      const knownStart = run.requestStartedAt;
      const newer = !previous || knownStart && (knownStart > previous.startedAt || knownStart === previous.startedAt && ['prompt.received', 'run.started'].includes(e.type));
      if (same || newer) {
        const old = same ? previous : undefined;
        const verdict = runVerdict(run);
        // A partial replay cannot prove that previously unresolved/failed
        // children have finished merely because their records rotated away.
        const partialCompletion = old && !knownStart && this.partialRuns.has(run) && verdict === 'completed';
        p.latest = { sessionId: e.sessionId, runId: e.runId, startedAt: old?.startedAt || knownStart || run.startedAt,
          prompt: redact(run.prompt || old?.prompt || '', 600), summary: redact(run.summary || old?.summary || '', 1000),
          errorMessage: redact(run.errorMessage ?? old?.errorMessage ?? '', 1000),
          recommendations: recommendations(run.recommendations ?? old?.recommendations),
          stages: (run.stages?.length ? run.stages : old?.stages || []).map(s => ({ id: s.id, title: redact(s.title, 160), status: s.status })),
          verdict: partialCompletion || old && !run.outcome && !['prompt.received', 'run.started', 'run.settled'].includes(e.type) && !e.type.startsWith('agent.')
            ? old.verdict : verdict };
      }
    }
    const modeEntries = [...this.entries.values()].filter(p => p.demo === e.demo);
    if (modeEntries.length > PROJECT_LIMIT) {
      const oldest = modeEntries.sort((a, b) => (a.lastWorkedAt || a.firstSeen).localeCompare(b.lastWorkedAt || b.firstSeen))[0];
      this.entries.delete(keyOf(oldest));
      this.warn(`Project summary limit reached; only the ${PROJECT_LIMIT} most recently active ${e.demo ? 'demo' : 'live'} projects are retained.`);
    }
    this.dirty = true;
    if (!this.replaying && !this.timer) {
      this.timer = setTimeout(() => { this.timer = undefined; try { this.flush(); } catch { this.warn('Project summaries could not be saved; journal rotation is held until storage recovers.'); } }, 500);
      this.timer.unref();
    }
  }
  finishReplay() { this.replaying = false; this.replayPending.clear(); this.flush(); }
  flush() {
    clearTimeout(this.timer); this.timer = undefined;
    if (!this.dirty) return;
    savePrivateJSON(this.path, { schemaVersion: 1, projects: [...this.entries.values()] });
    this.dirty = false;
  }
  snapshot(sessions, now = Date.now()) {
    const active = new Map();
    for (const s of sessions.values()) {
      const r = s.runs.at(-1);
      if (!s.connected || now - Date.parse(s.lastSeen) >= 30000 || !r?.requestStartedAt || r.status !== 'running' || r.endedAt) continue;
      const key = keyOf(s), times = active.get(key) || []; times.push(Date.parse(s.lastSeen) + 30000); active.set(key, times);
    }
    const items = [...this.entries.values()].map(p => {
      const latest = p.latest, activeUntil = active.get(keyOf(p)) || [];
      const stages = latest?.stages || [];
      const unfinished = stages.filter(s => ['pending', 'running', 'blocked', 'error'].includes(s.status));
      let status = 'unknown';
      if (latest?.verdict === 'cancelled') status = 'cancelled';
      else if (latest?.verdict === 'failed' || stages.some(s => s.status === 'blocked' || s.status === 'error')) status = 'attention';
      else if (unfinished.length) status = 'waiting';
      else if (latest?.verdict === 'completed') status = 'finished';
      const detailAvailable = Boolean(latest && sessions.get(latest.sessionId)?.runs.some(r => r.id === latest.runId));
      const { checkpoint: _checkpoint, ...summary } = p;
      return { ...summary, status: activeUntil.length ? 'running' : status, idleStatus: status, activeUntil,
        activeSessions: activeUntil.length, pendingCount: unfinished.length, nextStep: unfinished[0], detailAvailable };
    }).sort((a, b) => (b.lastWorkedAt || b.firstSeen).localeCompare(a.lastWorkedAt || a.firstSeen));
    return { limit: PROJECT_LIMIT, items };
  }
}
