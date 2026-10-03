import { randomUUID } from 'node:crypto';

/** Per-session opt-in. No resources until explicitly enabled by a local Pi command. */
export class PiControl {
  constructor(pi, client, state) {
    this.pi = pi; this.client = client; this.state = state; this.owner = randomUUID();
    this.generation = 0; this.enabled = false; this.seen = new Set(); this.acks = [];
  }
  presence(state, enabled = this.enabled) {
    return { ...state.identity, runId: state.runId || this.restoredRunId || '', owner: this.owner, enabled,
      limited: this.seen.size >= 100,
      idle: Boolean(enabled && this.seen.size < 100 && state.settled && !state.running &&
        typeof state.context?.isIdle === 'function' && typeof state.context?.hasPendingMessages === 'function' &&
        state.context.isIdle() && !state.context.hasPendingMessages()) };
  }
  start() {
    this.enabled = true;
    if (!this.timer) { this.timer = setInterval(() => void this.poll(), 1000); this.timer.unref(); }
    return this.poll();
  }
  async poll() {
    if (!this.enabled || this.busy) return;
    const state = this.state(); if (!state.identity) return;
    const generation = this.generation, leaf = state.context?.sessionManager?.getLeafId?.(); this.busy = true;
    try {
      const response = await this.client.controlRequest({ ...this.presence(state), ack: this.acks[0] });
      if (generation !== this.generation || !this.enabled) return;
      if (this.acks.length) this.acks.shift();
      this.lastError = this.seen.size >= 100 ? 'Control limit reached. Use /dashboard-control off, then on.' : '';
      if (!state.runId && typeof response.currentRunId === 'string') this.restoredRunId = response.currentRunId;
      const command = response.command;
      if (!command) return;
      const latest = this.state();
      const valid = typeof command.id === 'string' && typeof command.prompt === 'string' && command.prompt.trim() && command.prompt.length <= 8000;
      const same = command.sessionId === latest.identity?.sessionId && command.projectId === latest.identity?.projectId && command.runId === (latest.runId || this.restoredRunId) && leaf === latest.context?.sessionManager?.getLeafId?.();
      const idle = this.presence(latest).idle;
      if (this.seen.has(command.id)) return;
      this.seen.add(command.id);
      // Fail closed rather than evicting dedup IDs in a long-lived session.
      if (this.seen.size > 100) { this.enabled = false; clearInterval(this.timer); this.timer = undefined; }
      let status = 'rejected';
      if (valid && same && idle && this.enabled) {
        try {
          // No steering, follow-up queue, template expansion, model switch or spawned Pi.
          this.pi.sendUserMessage(command.prompt, { expandPromptTemplates: false });
          status = 'submitted';
        } catch { this.lastError = 'Pi did not accept the prompt; check its terminal.'; }
      }
      this.acks.push({ id: command.id, status });
    } catch { if (generation === this.generation) this.lastError = 'Control connection unavailable. Check dashboard opt-in and /dashboard-status.'; }
    finally { if (generation === this.generation) this.busy = false; }
  }
  async stop() {
    const state = this.state(), wasEnabled = this.enabled;
    const goodbye = { ...this.presence(state, false), ack: this.acks[0] };
    this.enabled = false; this.generation++; this.busy = false;
    clearInterval(this.timer); this.timer = undefined;
    this.acks = []; this.seen.clear(); this.restoredRunId = undefined; this.owner = randomUUID();
    if (wasEnabled && state.identity && this.client.controlRequest) {
      try { await this.client.controlRequest(goodbye); } catch { /* Lease expires without replay. */ }
    }
  }
}
