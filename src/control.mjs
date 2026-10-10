import { createHash } from 'node:crypto';
import { reportPrompt, validReportDay } from './report-prompt.mjs';
import { isNoteRequestPrompt } from '../extensions/agent-dashboard/note-request.mjs';
import { redact } from './security.mjs';

const id = x => typeof x === 'string' && /^[a-zA-Z0-9_.:\-]{1,160}$/.test(x);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const terminal = new Set(['submitted', 'rejected', 'expired', 'unknown']);
const model = value => typeof value === 'string' && value.trim() && value.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value) && redact(value, 300) === value;

/** Ephemeral, at-most-once handoff. Never replay browser commands after restart. */
export class ControlBroker {
  constructor(store, { now = Date.now, validTodo = () => false } = {}) {
    this.store = store; this.now = now; this.validTodo = validTodo; this.agents = new Map(); this.requests = new Map();
    this.reservations = new Map();
  }
  release(r) {
    if (this.reservations.get(r.sessionId)?.id === r.id) this.reservations.delete(r.sessionId);
  }
  sweep() {
    const now = this.now();
    for (const r of this.requests.values()) {
      if (!terminal.has(r.status) && now > r.deadline) {
        r.status = r.status === 'queued' ? 'expired' : 'unknown';
        r.reason = r.status === 'unknown' ? 'Delivery uncertain; not retried. Check Pi before resubmitting.' : 'Pi did not collect this request in time.';
        delete r.prompt;
        if (r.status === 'expired') this.release(r);
        this.delivery(r);
      }
    }
    for (const [key, r] of this.requests) if (now - r.createdAt > 600000 && terminal.has(r.status)) this.requests.delete(key);
    for (const [key, a] of this.agents) if (now >= a.until) this.agents.delete(key);
    for (const key of this.reservations.keys()) if (!this.store.sessions.has(key)) this.reservations.delete(key);
    this.store.reportMemory.sweep(now);
  }
  delivery(r) {
    if (r.reportRequestId) this.store.reportMemory.delivery(r.id, r.status, r.reason, this.now());
    if (r.todoRef) this.store.todoMemory.delivery(r.id, r.status, r.reason);
  }
  ready(sessionId, projectId, runId) {
    this.sweep();
    const a = this.agents.get(sessionId), s = this.store.sessions.get(sessionId), r = s?.runs.at(-1);
    if (!a || a.until <= this.now() || !s?.connected || s.demo || this.now() - Date.parse(s.lastSeen) >= 30000) return 'Pi control is offline. Open Pi and use /dashboard-control on.';
    if (a.projectId !== projectId || s.projectId !== projectId || a.runId !== runId || r?.id !== runId) return 'The selected request is no longer current. Open the latest request.';
    if (!model(a.model)) return 'Update the project extension and restart Pi for model-bound approval; nothing was sent.';
    if (a.model !== (s.model || r.model)) return 'Pi model changed or its monitoring signal is not current. Wait for Pi, then review again; nothing was sent.';
    if (a.limited) return 'Pi control limit reached. Use /dashboard-control off, then on in Pi.';
    if (!a.idle || !r.endedAt || !r.settled || r.status === 'running') return 'Pi is busy or still settling. Wait until the current request finishes.';
    const reserved = this.reservations.get(sessionId);
    if (reserved?.runId === runId) return 'A request for this run was already sent or is pending. Check Pi before trying again.';
    return '';
  }
  reportPreview(input) {
    if (!input || !id(input.id) || !id(input.sessionId) || !id(input.projectId) || !id(input.runId) || !validReportDay(input.reportDay)) fail(400, 'Invalid report target or date');
    const reason = this.ready(input.sessionId, input.projectId, input.runId);
    if (reason) fail(409, reason);
    if (!this.agents.get(input.sessionId).canReport) fail(409, 'Update the project extension and restart Pi with prompt capture enabled to generate reports.');
    if (input.reportDay > this.store.dailyMemory.day(this.now())) fail(400, 'Cannot report a future day');
    if ([...this.store.reportMemory.entries.values()].some(r => r.scope === 'all' && r.day === input.reportDay && ['queued', 'generating'].includes(r.status))) fail(409, 'A daily report is already pending for this day. Check Pi before generating again.');
    const s = this.store.sessions.get(input.sessionId);
    return { ...reportPrompt(this.store.dailyMemory.reportRecords(input.reportDay), { id: input.id, day: input.reportDay, projects: this.store.reportProjects(), timeZone: this.store.dailyMemory.timeZone }), projectName: s.projectName, model: s.model || s.runs.at(-1).model || 'current Pi model' };
  }
  submit(input) {
    this.sweep();
    if (!input || !id(input.id) || !id(input.sessionId) || !id(input.projectId) || !id(input.runId)) fail(400, 'Invalid request identity');
    const signature = createHash('sha256').update(JSON.stringify([input.sessionId, input.projectId, input.runId, input.recommendationId ?? null, input.expectedPrompt ?? null, input.prompt ?? null, input.reportDay ?? null, input.expectedSourceHash ?? null, input.todoRef ?? null, input.expectedModel ?? null])).digest('hex');
    const previous = this.requests.get(input.id);
    if (previous) {
      if (previous.signature !== signature) fail(409, 'Request ID already used for different input');
      return this.summary(previous);
    }
    const reason = this.ready(input.sessionId, input.projectId, input.runId);
    if (reason) fail(409, reason);
    if (!model(input.expectedModel)) fail(400, 'Review a prompt with its exact Pi model before sending; nothing was sent.');
    if (input.expectedModel !== this.agents.get(input.sessionId).model) fail(409, 'Pi model changed. Review a fresh preview before sending; nothing was sent.');
    if (input.todoRef !== undefined) {
      if (typeof input.todoRef !== 'string' || !/^[a-f0-9]{64}$/.test(input.todoRef) || input.reportDay !== undefined || input.recommendationId !== undefined) fail(400, 'A note reference requires one Other prompt, not a report or recommendation');
      if (!this.validTodo(input.todoRef)) fail(409, 'The source note is unavailable or changed identity. Return to Project notes; nothing was sent.');
      if (!this.agents.get(input.sessionId).canTrack) fail(409, 'Update the project extension and restart Pi to link note results. Ordinary Other prompts remain available.');
    }
    let prompt, report, title = 'Other prompt';
    if (input.reportDay !== undefined) {
      if (input.prompt !== undefined || input.recommendationId !== undefined) fail(400, 'Report generation cannot be combined with another prompt');
      report = this.reportPreview(input);
      if (input.expectedPrompt !== report.prompt || input.expectedSourceHash !== report.sourceHash) fail(409, 'Recorded work changed. Review a fresh report preview before sending.');
      prompt = report.prompt; title = `Daily report · ${input.reportDay}`;
    } else if (input.recommendationId !== undefined) {
      if (!id(input.recommendationId) || input.prompt !== undefined) fail(400, 'Choose a recommendation or an Other prompt, not both');
      const recommendation = this.store.sessions.get(input.sessionId).runs.at(-1).recommendations?.find(r => r.id === input.recommendationId);
      if (!recommendation || input.expectedPrompt !== recommendation.prompt) fail(409, 'This recommendation changed. Review the latest suggestion before sending.');
      ({ prompt, title } = recommendation);
    } else prompt = input.prompt;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(prompt)) fail(400, 'Prompt must contain 1–8000 characters without control codes');
    if (input.todoRef && !isNoteRequestPrompt(input.id, prompt)) fail(400, 'Review a note prompt with its matching request ID before sending. Nothing was sent.');
    if (this.requests.size >= 100) fail(429, 'Control request limit reached; try again after old receipts expire');
    const a = this.agents.get(input.sessionId), now = this.now();
    if (report) this.store.reportMemory.start({ id: input.id, scope: 'all', day: input.reportDay, projectId: input.projectId, projectName: report.projectName, sessionId: input.sessionId, baseRunId: input.runId, sourceHash: report.sourceHash, included: report.included, total: report.total, includedProjects: report.includedProjects, totalProjects: report.totalProjects, createdAt: new Date(now).toISOString() });
    if (input.todoRef) this.store.todoMemory.start({ todoRef: input.todoRef, id: input.id, projectId: input.projectId, sessionId: input.sessionId, baseRunId: input.runId, createdAt: new Date(now).toISOString() });
    const r = { id: input.id, sessionId: input.sessionId, projectId: input.projectId, runId: input.runId,
      ...(input.todoRef ? { todoRef: input.todoRef } : {}), ...(report ? { reportRequestId: input.id } : {}), expectedModel: input.expectedModel, owner: a.owner, title, signature, prompt, status: 'queued', createdAt: now, deadline: now + 15000 };
    this.requests.set(r.id, r); this.reservations.set(r.sessionId, { runId: r.runId, id: r.id });
    return this.summary(r);
  }
  agent(input) {
    this.sweep();
    if (!input || !id(input.sessionId) || !id(input.projectId) || !id(input.owner) || (input.runId !== '' && !id(input.runId)) || typeof input.idle !== 'boolean' || (input.limited !== undefined && typeof input.limited !== 'boolean') || (input.canReport !== undefined && typeof input.canReport !== 'boolean') || (input.canTrack !== undefined && typeof input.canTrack !== 'boolean')) fail(400, 'Invalid Pi control presence');
    if (input.model !== undefined && input.model !== '' && !model(input.model)) fail(400, 'Invalid Pi control model');
    const s = this.store.sessions.get(input.sessionId);
    if (!s || s.demo || s.projectId !== input.projectId) fail(409, 'Pi session has not delivered its monitoring events yet');
    const old = this.agents.get(input.sessionId);
    if (old && old.owner !== input.owner && old.until > this.now()) fail(409, 'Another Pi process owns this session; enable control in only one process');
    if (input.ack) {
      const r = this.requests.get(input.ack.id);
      if (!r || r.sessionId !== input.sessionId || r.owner !== input.owner || !['submitted', 'rejected'].includes(input.ack.status)) fail(409, 'Invalid control receipt');
      if (r.status === 'claimed') {
        r.status = input.ack.status;
        r.reason = r.status === 'submitted' ? 'Sent to Pi. Actual execution is shown by Pi events.' : 'Pi rejected the request because its session/model changed or was busy.';
        if (r.status === 'rejected') this.release(r);
        this.delivery(r);
      }
    }
    if (input.enabled === false) {
      if (old?.owner === input.owner) this.agents.delete(input.sessionId);
      for (const r of this.requests.values()) if (r.sessionId === input.sessionId && r.owner === input.owner && r.status === 'queued') {
        r.status = 'rejected'; r.reason = 'Control disabled in Pi.'; delete r.prompt;
        this.release(r); this.delivery(r);
      }
      return { command: null };
    }
    if (!old && this.agents.size >= 80) fail(429, 'Too many opted-in Pi sessions');
    const currentRunId = input.runId || s.runs.at(-1)?.id || '';
    this.agents.set(input.sessionId, { sessionId: input.sessionId, projectId: input.projectId, runId: currentRunId,
      owner: input.owner, model: input.model || '', idle: input.idle && !input.limited, limited: Boolean(input.limited), canReport: input.canReport === true, canTrack: input.canTrack === true, until: this.now() + 15000 });
    // A new observed request releases the old run's reservation, never a mere timeout.
    const reserved = this.reservations.get(input.sessionId);
    if (reserved && reserved.runId !== currentRunId && s.runs.at(-1)?.id === currentRunId) this.reservations.delete(input.sessionId);
    const r = [...this.requests.values()].find(r => r.sessionId === input.sessionId && r.owner === input.owner && r.status === 'queued');
    if (!r) return { command: null, currentRunId };
    if (input.model !== r.expectedModel || (s.model || s.runs.at(-1)?.model) !== r.expectedModel || !input.idle || input.limited || (r.todoRef && input.canTrack !== true) || currentRunId !== r.runId || s.runs.at(-1)?.id !== r.runId || !s.connected || this.now() - Date.parse(s.lastSeen) >= 30000) {
      r.status = 'rejected'; r.reason = 'Pi session/model changed or became busy before delivery.'; delete r.prompt;
      this.release(r); this.delivery(r); return { command: null };
    }
    const command = { id: r.id, sessionId: r.sessionId, projectId: r.projectId, runId: r.runId, prompt: r.prompt, expectedModel: r.expectedModel, ...(r.reportRequestId ? { reportRequestId: r.id } : {}), ...(r.todoRef ? { controlRequestId: r.id } : {}) };
    r.status = 'claimed'; r.deadline = this.now() + 15000; delete r.prompt;
    return { command, currentRunId };
  }
  summary(r) {
    return { id: r.id, sessionId: r.sessionId, projectId: r.projectId, runId: r.runId,
      title: r.title, status: r.status, reason: r.reason || '', createdAt: r.createdAt, ...(r.todoRef ? { todoRef: r.todoRef } : {}) };
  }
  snapshot() {
    this.sweep();
    return { enabled: true, agents: [...this.agents.values()].filter(a => a.until > this.now()).map(({ owner, ...a }) => a),
      requests: [...this.requests.values()].map(r => this.summary(r)),
      reservations: [...this.reservations].map(([sessionId, r]) => ({ sessionId, runId: r.runId })) };
  }
}
