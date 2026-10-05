import { existsSync, mkdirSync, readFileSync, appendFileSync, renameSync, rmSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { validateEvent } from './events.mjs';
import { aggregateRuns, runPerformance, terminalStatus } from './metrics.mjs';
import { compareWorkflows } from './workflows.mjs';
import { runEvidence } from './evidence.mjs';
import { ProjectMemory } from './project-memory.mjs';
import { DailyMemory } from './daily-memory.mjs';
import { ReportMemory } from './report-memory.mjs';

const MAX_EVENTS = 350, MAX_RUNS = 30, MAX_SESSIONS = 80;

export class EventStore {
  constructor(dir, { maxBytes = 20 * 1024 * 1024 } = {}) {
    this.dir = dir; this.maxBytes = maxBytes;
    this.sessions = new Map(); this.seen = new Set(); this.sequence = 0; this.warnings = [];
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.projectMemory = new ProjectMemory(dir, message => { if (!this.warnings.includes(message)) this.warnings.push(message); });
    this.dailyMemory = new DailyMemory(dir, message => { if (!this.warnings.includes(message)) this.warnings.push(message); });
    this.reportMemory = new ReportMemory(dir, message => { if (!this.warnings.includes(message)) this.warnings.push(message); });
    for (const file of ['events.2.jsonl', 'events.1.jsonl', 'events.jsonl']) {
      const path = join(dir, file);
      if (!existsSync(path)) continue;
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line);
          const event = validateEvent(raw, new Date(raw.receivedAt || raw.time));
          if (!this.seen.has(event.id)) this.reduce(event);
        } catch { this.warnings.push(`Ignored an invalid or truncated record in ${file}`); }
      }
    }
    this.warnings = [...new Set(this.warnings)];
    // A persisted heartbeat is never proof that a process survived a restart.
    for (const session of this.sessions.values()) session.connected = false;
    this.projectMemory.finishReplay(); this.dailyMemory.finishReplay(); this.reportMemory.finishReplay();
    // Separate an incomplete final record from subsequent valid appends.
    if (existsSync(this.logPath)) {
      const contents = readFileSync(this.logPath, 'utf8');
      if (contents && !contents.endsWith('\n')) appendFileSync(this.logPath, '\n', { mode: 0o600 });
    }
    this.bytes = existsSync(this.logPath) ? statSync(this.logPath).size : 0;
  }
  get logPath() { return join(this.dir, 'events.jsonl'); }
  append(raw) {
    const event = validateEvent(raw);
    if (this.seen.has(event.id)) return { duplicate: true, event };
    if (event.type !== 'session.heartbeat') {
      const line = JSON.stringify(event) + '\n';
      if (this.bytes + Buffer.byteLength(line) > this.maxBytes) {
        // Preserve summaries before rotating away their recovery events. A disk
        // failure stops rotation instead of silently losing older projects.
        this.projectMemory.flush(); this.dailyMemory.flush(); this.reportMemory.flush();
        rmSync(join(this.dir, 'events.2.jsonl'), { force: true });
        if (existsSync(join(this.dir, 'events.1.jsonl'))) renameSync(join(this.dir, 'events.1.jsonl'), join(this.dir, 'events.2.jsonl'));
        if (existsSync(this.logPath)) renameSync(this.logPath, join(this.dir, 'events.1.jsonl'));
        this.bytes = 0;
      }
      appendFileSync(this.logPath, line, { mode: 0o600 });
      chmodSync(this.logPath, 0o600);
      this.bytes += Buffer.byteLength(line);
    }
    this.reduce(event);
    return { duplicate: false, event };
  }
  reduce(e) {
    this.seen.add(e.id);
    if (this.seen.size > 60000) this.seen.delete(this.seen.values().next().value);
    this.sequence++;
    let s = this.sessions.get(e.sessionId);
    if (!s) {
      s = { id: e.sessionId, projectId: e.projectId, projectName: e.projectName,
        demo: e.demo, connected: true, model: '', runs: [], lastSeen: e.receivedAt };
      this.sessions.set(s.id, s);
    }
    // An abandoned producer's backlog is history, not a fresh Pi connection.
    s.lastSeen = e.recovered ? e.time : e.receivedAt;
    s.connected = !e.recovered && e.type !== 'session.disconnected';
    if (['session.connected', 'model.selected'].includes(e.type) && e.data.model) s.model = e.data.model;
    if (e.type === 'session.disconnected') s.connected = false;
    if (this.sessions.size > MAX_SESSIONS) {
      const oldest = [...this.sessions.values()].sort((a, b) => a.lastSeen.localeCompare(b.lastSeen))[0];
      this.sessions.delete(oldest.id);
    }
    if (e.type === 'session.heartbeat' || !e.runId) { this.projectMemory.observe(e); return; }
    let r = s.runs.find(r => r.id === e.runId);
    if (!r) {
      r = { id: e.runId, prompt: '', model: s.model, startedAt: e.time,
        status: 'running', events: [], tools: Object.create(null), agents: Object.create(null), stages: [], usage: Object.create(null), files: [], summary: '' };
      s.runs.push(r); if (s.runs.length > MAX_RUNS) s.runs.shift();
    }
    const d = e.data;
    if (e.reportRequestId) r.reportRequestId = e.reportRequestId;
    const rememberModel = (models, model) => {
      if (!model || models.includes(model)) return;
      if (models.length >= 100) { r.modelsTruncated = true; return; }
      models.push(model);
    };
    if (['run.started', 'model.selected', 'message.completed'].includes(e.type)) {
      rememberModel(r.primaryModels ||= [], d.model);
    }
    switch (e.type) {
      case 'prompt.received': r.requestStartedAt ||= e.time; r.prompt = d.prompt || ''; break;
      case 'run.started': r.requestStartedAt ||= e.time; r.observedStartedAt ||= e.time; r.status = 'running'; delete r.endedAt; delete r.outcome; r.settled = false; r.errorMessage = ''; r.model = d.model || s.model; break;
      case 'model.selected': r.model = d.model || ''; break;
      case 'run.ended':
        // Only known terminal outcomes map to a settled status; an unrecognized
        // outcome (e.g. 'timeout') or a missing/empty one must not claim 'idle'
        // completion anywhere. Absent outcome is 'unknown', never invented 'idle'.
        r.status = d.outcome === 'error' ? 'error' : d.outcome === 'aborted' ? 'cancelled'
          : d.outcome === 'idle' ? 'idle' : 'unknown';
        r.outcome = d.outcome || 'unknown';
        r.endedAt = e.time; r.summary = d.summary || r.summary;
        if (typeof d.errorMessage === 'string') r.errorMessage = d.errorMessage;
        else if (d.outcome === 'error') r.errorMessage ||= 'Pi reported a model/provider error. No error details were recorded.';
        else r.errorMessage = '';
        break;
      case 'run.settled':
        // Settled without an observed run.ended outcome is not 'idle' completion:
        // the result is unknown. Known terminal statuses from run.ended survive.
        if (r.status === 'running') r.status = 'unknown';
        r.settled = true; r.endedAt ||= e.time; break;
      case 'workflow.updated': r.stages = d.stages; r.recommendations = d.recommendations || []; r.stageReason = d.reason || ''; break;
      case 'tests.recorded': {
        r.testReports ||= Object.create(null);
        const report = d.evidence;
        if (!r.testReports[report.reportKey] && Object.keys(r.testReports).length >= 20) r.evidenceTruncated = true;
        else r.testReports[report.reportKey] = { ...report, importedAt: e.time };
        break;
      }
      case 'workflow.configured':
        if (!r.workflow) r.workflow = d.workflow;
        else if (JSON.stringify(r.workflow) !== JSON.stringify(d.workflow)) r.workflowConflict = true;
        break;
      case 'message.completed':
        if (d.summary) r.summary = d.summary;
        if (typeof d.errorMessage === 'string') r.errorMessage = d.errorMessage;
        if (d.usage) r.usage[e.id] = { model: d.model || r.model, ...d.usage };
        break;
      case 'tool.started':
      case 'tool.finished': {
        const key = d.toolCallId || e.id;
        r.tools[key] = { ...r.tools[key], id: key, name: d.toolName,
          file: d.file || r.tools[key]?.file || '', model: d.model || r.model,
          status: e.type === 'tool.started' ? 'running' : d.isError ? 'error' : 'done',
          startedAt: r.tools[key]?.startedAt || e.time, endedAt: e.type === 'tool.finished' ? e.time : undefined };
        if (e.type === 'tool.finished' && !d.isError && ['edit', 'write'].includes(d.toolName) && d.file && !r.files.includes(d.file)) r.files.push(d.file);
        break;
      }
      case 'agent.started':
      case 'agent.progress':
      case 'agent.finished': {
        const key = d.agentCallId || e.id;
        const old = r.agents[key] || {};
        const observedModels = [...(old.observedModels || [])];
        if (d.source === 'observed') rememberModel(observedModels, d.model);
        // agent.finished is the only terminal mark; a late progress/status event
        // must never regress a finished invocation back to running/done.
        const finished = e.type === 'agent.finished' || Boolean(old.finished);
        r.agents[key] = { ...old, observedModels, id: key, agent: d.agent || old.agent,
          model: d.model || old.model || '', modelSource: d.source === 'observed' ? 'observed' : old.modelSource || d.source || 'unknown', task: d.task || old.task || '',
          // agent.finished status is conservatively normalized (metrics
          // terminalStatus): known failure literals ('error'/'failed'/
          // 'blocked'/'cancelled') or isError are failure evidence even when
          // the other is missing (direct authenticated ingestion); only
          // explicit success ('done', or no status with isError: false) is
          // 'done'; any unknown/in-progress literal stays 'unknown', never
          // success. A progress-only status never marks an invocation terminal.
          status: e.type === 'agent.finished' ? terminalStatus(d.status, d.isError) : finished ? old.status : e.type === 'agent.started' ? 'starting' : d.status || 'running',
          tools: d.tools || old.tools || [], usage: d.usage || old.usage,
          elapsedMs: d.elapsedMs ?? old.elapsedMs, summary: d.summary || old.summary || '',
          // Only agent.started establishes a start. A first-seen agent.finished
          // or progress without one keeps the duration missing (undefined)
          // instead of inventing a false 0 ms one; reported elapsedMs survives.
          startedAt: old.startedAt || (e.type === 'agent.started' && !finished ? e.time : undefined), finished, endedAt: e.type === 'agent.finished' ? e.time : old.endedAt };
        // Agent usage is cumulative; one key per invocation avoids double counting.
        if (d.usage) r.usage[`agent:${key}`] = { model: d.model || old.model || 'unknown', ...d.usage };
        break;
      }
    }
    // Progress snapshots update cards without flooding the visible timeline.
    if (e.type !== 'agent.progress') { r.events.push(e); if (r.events.length > MAX_EVENTS) r.events.shift(); }
    for (const object of [r.tools, r.agents, r.usage]) {
      const keys = Object.keys(object); for (const k of keys.slice(0, Math.max(0, keys.length - 2000))) delete object[k];
    }
    if (r.files.length > 500) r.files = r.files.slice(-500);
    this.projectMemory.observe(e, r); this.dailyMemory.observe(e, r); this.reportMemory.observe(e, r);
    if (this.sessions.size > MAX_SESSIONS) {
      const oldest = [...this.sessions.values()].sort((a, b) => a.lastSeen.localeCompare(b.lastSeen))[0];
      this.sessions.delete(oldest.id);
    }
  }
  reportProjects() {
    const projects = new Map();
    for (const p of [...this.dailyMemory.entries.values(), ...this.projectMemory.entries.values()]) if (!p.demo) projects.set(p.projectId, { projectId: p.projectId, projectName: p.projectName });
    return [...projects.values()].sort((a, b) => a.projectName.localeCompare(b.projectName, 'en') || a.projectId.localeCompare(b.projectId));
  }
  snapshot() {
    const now = Date.now();
    // Derived metrics are computed here from reduced state, so journal replay and
    // restart rebuild identical verdicts. Demo and live history stay separated.
    const sessions = [...this.sessions.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).map(s => ({
      ...s,
      runs: s.runs.map(r => ({ ...r, testEvidence: runEvidence(r), performance: runPerformance(r, { now, lastSeen: s.lastSeen, connected: s.connected }) }))
    }));
    const projects = new Map();
    for (const s of this.sessions.values()) {
      let p = projects.get(s.projectId);
      if (!p) { p = { projectId: s.projectId, projectName: s.projectName, live: [], demo: [] }; projects.set(s.projectId, p); }
      p[s.demo ? 'demo' : 'live'].push(...s.runs);
    }
    return { schemaVersion: 1, sequence: this.sequence, now: new Date().toISOString(),
      warnings: this.warnings, sessions, projectOverview: this.projectMemory.snapshot(this.sessions, now), dailyReport: { ...this.dailyMemory.snapshot(this.sessions), projects: this.reportProjects(), summaries: this.reportMemory.snapshot(this.dailyMemory, this.reportProjects()) },
      projects: [...projects.values()].map(p => ({ projectId: p.projectId, projectName: p.projectName,
        live: aggregateRuns(p.live), demo: aggregateRuns(p.demo),
        workflows: { live: compareWorkflows(p.live), demo: compareWorkflows(p.demo) } })) };
  }
  close() { this.projectMemory.flush(); this.dailyMemory.flush(); this.reportMemory.flush(); }
}
