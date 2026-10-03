import { createHash } from 'node:crypto';

const id = x => typeof x === 'string' && /^[a-zA-Z0-9_.:\-]{1,160}$/.test(x);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const terminal = new Set(['submitted', 'rejected', 'expired', 'unknown']);

/** Ephemeral, at-most-once handoff. Never replay browser commands after restart. */
export class ControlBroker {
  constructor(store, { now = Date.now } = {}) {
    this.store = store; this.now = now; this.agents = new Map(); this.requests = new Map();
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
      }
    }
    for (const [key, r] of this.requests) if (now - r.createdAt > 600000 && terminal.has(r.status)) this.requests.delete(key);
    for (const [key, a] of this.agents) if (now >= a.until) this.agents.delete(key);
    for (const key of this.reservations.keys()) if (!this.store.sessions.has(key)) this.reservations.delete(key);
  }
  ready(sessionId, projectId, runId) {
    this.sweep();
    const a = this.agents.get(sessionId), s = this.store.sessions.get(sessionId), r = s?.runs.at(-1);
    if (!a || a.until <= this.now() || !s?.connected || s.demo || this.now() - Date.parse(s.lastSeen) >= 30000) return 'Pi control is offline. Open Pi and use /dashboard-control on.';
    if (a.projectId !== projectId || s.projectId !== projectId || a.runId !== runId || r?.id !== runId) return 'The selected request is no longer current. Open the latest request.';
    if (a.limited) return 'Pi control limit reached. Use /dashboard-control off, then on in Pi.';
    if (!a.idle || !r.endedAt || !r.settled || r.status === 'running') return 'Pi is busy or still settling. Wait until the current request finishes.';
    const reserved = this.reservations.get(sessionId);
    if (reserved?.runId === runId) return 'A request for this run was already sent or is pending. Check Pi before trying again.';
    return '';
  }
  submit(input) {
    this.sweep();
    if (!input || !id(input.id) || !id(input.sessionId) || !id(input.projectId) || !id(input.runId)) fail(400, 'Invalid request identity');
    const signature = createHash('sha256').update(JSON.stringify([input.sessionId, input.projectId, input.runId, input.recommendationId ?? null, input.expectedPrompt ?? null, input.prompt ?? null])).digest('hex');
    const previous = this.requests.get(input.id);
    if (previous) {
      if (previous.signature !== signature) fail(409, 'Request ID already used for different input');
      return this.summary(previous);
    }
    const reason = this.ready(input.sessionId, input.projectId, input.runId);
    if (reason) fail(409, reason);
    let prompt, title = 'Other prompt';
    if (input.recommendationId !== undefined) {
      if (!id(input.recommendationId) || input.prompt !== undefined) fail(400, 'Choose a recommendation or an Other prompt, not both');
      const recommendation = this.store.sessions.get(input.sessionId).runs.at(-1).recommendations?.find(r => r.id === input.recommendationId);
      if (!recommendation || input.expectedPrompt !== recommendation.prompt) fail(409, 'This recommendation changed. Review the latest suggestion before sending.');
      ({ prompt, title } = recommendation);
    } else prompt = input.prompt;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(prompt)) fail(400, 'Prompt must contain 1–8000 characters without control codes');
    if (this.requests.size >= 100) fail(429, 'Control request limit reached; try again after old receipts expire');
    const a = this.agents.get(input.sessionId), now = this.now();
    const r = { id: input.id, sessionId: input.sessionId, projectId: input.projectId, runId: input.runId,
      owner: a.owner, title, signature, prompt, status: 'queued', createdAt: now, deadline: now + 15000 };
    this.requests.set(r.id, r); this.reservations.set(r.sessionId, { runId: r.runId, id: r.id });
    return this.summary(r);
  }
  agent(input) {
    this.sweep();
    if (!input || !id(input.sessionId) || !id(input.projectId) || !id(input.owner) || (input.runId !== '' && !id(input.runId)) || typeof input.idle !== 'boolean' || (input.limited !== undefined && typeof input.limited !== 'boolean')) fail(400, 'Invalid Pi control presence');
    const s = this.store.sessions.get(input.sessionId);
    if (!s || s.demo || s.projectId !== input.projectId) fail(409, 'Pi session has not delivered its monitoring events yet');
    const old = this.agents.get(input.sessionId);
    if (old && old.owner !== input.owner && old.until > this.now()) fail(409, 'Another Pi process owns this session; enable control in only one process');
    if (input.ack) {
      const r = this.requests.get(input.ack.id);
      if (!r || r.sessionId !== input.sessionId || r.owner !== input.owner || !['submitted', 'rejected'].includes(input.ack.status)) fail(409, 'Invalid control receipt');
      if (r.status === 'claimed') {
        r.status = input.ack.status;
        r.reason = r.status === 'submitted' ? 'Sent to Pi. Actual execution is shown by Pi events.' : 'Pi rejected the request because its session changed or was busy.';
        if (r.status === 'rejected') this.release(r);
      }
    }
    if (input.enabled === false) {
      if (old?.owner === input.owner) this.agents.delete(input.sessionId);
      for (const r of this.requests.values()) if (r.sessionId === input.sessionId && r.owner === input.owner && r.status === 'queued') {
        r.status = 'rejected'; r.reason = 'Control disabled in Pi.'; delete r.prompt;
        this.release(r);
      }
      return { command: null };
    }
    if (!old && this.agents.size >= 80) fail(429, 'Too many opted-in Pi sessions');
    const currentRunId = input.runId || s.runs.at(-1)?.id || '';
    this.agents.set(input.sessionId, { sessionId: input.sessionId, projectId: input.projectId, runId: currentRunId,
      owner: input.owner, idle: input.idle && !input.limited, limited: Boolean(input.limited), until: this.now() + 15000 });
    // A new observed request releases the old run's reservation, never a mere timeout.
    const reserved = this.reservations.get(input.sessionId);
    if (reserved && reserved.runId !== currentRunId && s.runs.at(-1)?.id === currentRunId) this.reservations.delete(input.sessionId);
    const r = [...this.requests.values()].find(r => r.sessionId === input.sessionId && r.owner === input.owner && r.status === 'queued');
    if (!r) return { command: null, currentRunId };
    if (!input.idle || input.limited || currentRunId !== r.runId || s.runs.at(-1)?.id !== r.runId || !s.connected || this.now() - Date.parse(s.lastSeen) >= 30000) {
      r.status = 'rejected'; r.reason = 'Pi session changed or became busy before delivery.'; delete r.prompt;
      this.release(r); return { command: null };
    }
    const command = { id: r.id, sessionId: r.sessionId, projectId: r.projectId, runId: r.runId, prompt: r.prompt };
    r.status = 'claimed'; r.deadline = this.now() + 15000; delete r.prompt;
    return { command, currentRunId };
  }
  summary(r) {
    return { id: r.id, sessionId: r.sessionId, projectId: r.projectId, runId: r.runId,
      title: r.title, status: r.status, reason: r.reason || '', createdAt: r.createdAt };
  }
  snapshot() {
    this.sweep();
    return { enabled: true, agents: [...this.agents.values()].filter(a => a.until > this.now()).map(({ owner, ...a }) => a),
      requests: [...this.requests.values()].map(r => this.summary(r)),
      reservations: [...this.reservations].map(([sessionId, r]) => ({ sessionId, runId: r.runId })) };
  }
}
