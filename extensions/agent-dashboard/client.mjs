import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Nonblocking, bounded, in-memory delivery. Does not execute or control agents. */
export class MonitorClient {
  constructor({ configPath, fetchImpl = globalThis.fetch, maxQueue = 500 } = {}) {
    this.configPath = configPath || join(process.env.AGENT_DASHBOARD_HOME || join(homedir(), '.agent-workflow-dashboard'), 'connection.json');
    this.fetch = fetchImpl; this.maxQueue = maxQueue; this.queue = [];
    this.status = 'not-connected'; this.dropped = 0; this.busy = false; this.failures = 0; this.nextTry = 0;
  }
  enqueue(event) {
    if (this.queue.length >= this.maxQueue) { this.queue.shift(); this.dropped++; }
    this.queue.push(event);
  }
  start() { if (!this.timer) { this.timer = setInterval(() => void this.flush(), 350); this.timer.unref(); } }
  async flush(force = false) {
    if (this.busy || !this.queue.length || (!force && Date.now() < this.nextTry)) return;
    this.busy = true;
    try {
      const cfg = JSON.parse(readFileSync(this.configPath, 'utf8'));
      const url = new URL(cfg.url);
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/') throw new Error('Only a loopback dashboard is allowed');
      if (!/^[a-f0-9]{64}$/.test(cfg.token)) throw new Error('Invalid dashboard token');
      const batch = this.queue.slice(0, 8);
      const response = await this.fetch(new URL('/api/events', url), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify(batch), signal: AbortSignal.timeout(900), redirect: 'error'
      });
      if (!response.ok) {
        if ([400, 413, 415].includes(response.status)) { this.queue = this.queue.filter(e => !batch.some(b => b.id === e.id)); this.dropped += batch.length; }
        throw new Error(`Dashboard HTTP ${response.status}`);
      }
      await response.text();
      const acknowledged = new Set(batch.map(e => e.id));
      this.queue = this.queue.filter(e => !acknowledged.has(e.id));
      this.status = 'connected'; this.failures = 0; this.nextTry = 0;
    } catch (err) {
      this.status = 'disconnected'; this.lastError = err.code === 'ENOENT' ? 'Start the dashboard first' : err.message;
      this.failures++; this.nextTry = Date.now() + Math.min(10000, 500 * 2 ** Math.min(this.failures, 5));
    } finally { this.busy = false; }
  }
  async stop() {
    clearInterval(this.timer); this.timer = null;
    const deadline = Date.now() + 1400;
    while (this.busy && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    if (!this.busy && Date.now() < deadline) await this.flush(true);
  }
}
