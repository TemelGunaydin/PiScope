// Browser-only read receipts: identities, never prompts/responses or source tasks.
export const REPLY_READ_KEY = 'piscope.reply-reads.v1';
const LIMIT = 500, MAX_BYTES = 256 * 1024;
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:\-]{1,160}$/.test(value);
const token = reply => JSON.stringify([reply.sessionId, reply.runId]);

export class ReplyReadState {
  constructor(storage) {
    this.storage = storage; this.seen = null; this.replies = new Map();
    try {
      const text = storage?.getItem(REPLY_READ_KEY);
      if (!text || text.length > MAX_BYTES) return;
      const saved = JSON.parse(text);
      if (saved.version !== 1 || !Array.isArray(saved.seen) || saved.seen.length > LIMIT ||
          saved.seen.some(row => !Array.isArray(row) || row.length !== 3 || !row.every(validId))) return;
      this.seen = new Map(saved.seen.map(([projectId, sessionId, runId]) => [projectId, token({ sessionId, runId })]));
    } catch { /* Storage disabled/corrupt: keep tracking within this page. */ }
  }
  update(projects = [], sessions = []) {
    const live = new Map(projects.filter(p => !p.demo).map(p => [p.projectId, p]));
    this.replies = new Map();
    const remember = (projectId, sessionId, runId, startedAt, endedAt) => {
      if (![projectId, sessionId, runId].every(validId)) return;
      const reply = { projectId, sessionId, runId, start: Date.parse(startedAt) || 0, end: Date.parse(endedAt || startedAt) || 0 };
      const old = this.replies.get(projectId);
      // Parallel requests can finish out of start order. Prefer the latest reply.
      if (!old || reply.end > old.end || reply.end === old.end &&
          (reply.start > old.start || reply.start === old.start && token(reply) > token(old))) this.replies.set(projectId, reply);
    };
    for (const p of live.values()) {
      const r = p.latest;
      // Use the saved terminal summary only when its detailed run is gone.
      const retained = sessions.some(s => !s.demo && s.projectId === p.projectId && s.id === r?.sessionId && s.runs.some(run => run.id === r.runId));
      if (!retained && r?.verdict === 'completed' && r.summary?.trim()) remember(p.projectId, r.sessionId, r.runId, r.startedAt);
    }
    for (const s of sessions) {
      if (s.demo || !live.has(s.projectId)) continue;
      for (const r of s.runs) {
        // Intermediate text/tool/stage updates are not a finished main reply.
        // This does not claim that subagents, tests, notes or the project succeeded.
        if (r.outcome === 'idle' && r.endedAt && r.summary?.trim()) remember(s.projectId, s.id, r.id, r.requestStartedAt || r.startedAt, r.endedAt);
      }
    }
    if (this.seen === null) {
      // First visit starts quietly; do not badge all historical replies.
      this.seen = new Map([...this.replies].map(([id, reply]) => [id, token(reply)]));
      this.save();
    }
  }
  unread(projectId) {
    const reply = this.replies.get(projectId);
    return reply && this.seen?.get(projectId) !== token(reply) ? reply : undefined;
  }
  markRead(projectId, sessionId, runId) {
    const reply = this.unread(projectId);
    if (!reply || reply.sessionId !== sessionId || reply.runId !== runId) return false;
    this.seen.delete(projectId); this.seen.set(projectId, token(reply));
    while (this.seen.size > LIMIT) this.seen.delete(this.seen.keys().next().value);
    this.save(); return true;
  }
  save() {
    try {
      this.storage?.setItem(REPLY_READ_KEY, JSON.stringify({ version: 1,
        seen: [...this.seen].slice(-LIMIT).map(([projectId, key]) => [projectId, ...JSON.parse(key)]) }));
    } catch { /* Read tracking still works until this page is reloaded. */ }
  }
}
