import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { validateEvent } from './events.mjs';
import { EventSpool } from './spool.mjs';

/** Durable bounded delivery. No network work is awaited by Pi event callbacks. */
export class MonitorClient {
  constructor({ configPath, fetchImpl = globalThis.fetch, maxQueue = 5000, maxBytes } = {}) {
    this.configPath = configPath || join(process.env.AGENT_DASHBOARD_HOME || join(homedir(), '.agent-workflow-dashboard'), 'connection.json');
    this.fetch = fetchImpl;
    this.spool = new EventSpool(join(dirname(this.configPath), 'spool'), { maxQueue, maxBytes });
    this.status = 'not-connected'; this.failures = 0; this.nextTry = 0; this.generation = 0;
    this.batchLimit = 8; this.closed = false; this.storageError = ''; this.invalid = 0;
  }
  get queue() { return this.spool.records.map(record => record.event); }
  get dropped() { return this.spool.dropped + this.spool.corrupt + this.invalid; }
  get busy() { return Boolean(this.inFlight); }
  get persistenceError() { return this.storageError || this.spool.lastError; }
  openSpool() {
    try { this.spool.open(); return true; }
    catch (error) { this.storageError = `Offline storage unavailable (${error.code || 'I/O error'})`; return false; }
  }
  enqueue(raw) {
    if (this.closed) return false;
    let event;
    try { event = validateEvent(raw); }
    catch { this.invalid++; this.storageError = 'Invalid monitor event was not queued'; return false; }
    // Heartbeats describe current liveness. Coalesce in memory, never replay them.
    if (event.type === 'session.heartbeat') { this.heartbeat = event; return true; }
    try {
      const accepted = this.spool.enqueue(event);
      if (accepted) this.storageError = '';
      return accepted;
    } catch (error) {
      this.invalid++; this.storageError = `Event not persisted (${error.code || 'I/O error'})`; return false;
    }
  }
  start() {
    this.closed = false; this.openSpool();
    if (!this.timer) { this.timer = setInterval(() => void this.flush(), 350); this.timer.unref(); }
  }
  flush(force = false) {
    if (this.closed) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    if (!this.openSpool() || (!force && Date.now() < this.nextTry)) return Promise.resolve();
    if (!this.spool.records.length && !this.heartbeat) return Promise.resolve();
    const generation = this.generation;
    const operation = this.deliver(generation);
    this.inFlight = operation;
    void operation.finally(() => { if (this.generation === generation) this.inFlight = undefined; });
    return operation;
  }
  connection() {
    const cfg = JSON.parse(readFileSync(this.configPath, 'utf8'));
    const url = new URL(cfg.url);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Only a loopback dashboard is allowed');
    if (!/^[a-f0-9]{64}$/.test(cfg.token)) throw new Error('Invalid dashboard token');
    return { ...cfg, url };
  }
  async controlRequest(input) {
    const cfg = this.connection();
    if (!cfg.controlEnabled) throw new Error('Dashboard control is disabled');
    const response = await this.fetch(new URL('/api/control/agent', cfg.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(input), signal: AbortSignal.timeout(900), redirect: 'error'
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Control HTTP ${response.status}`); }
    return response.json();
  }
  async deliver(generation) {
    const records = this.spool.batch(this.batchLimit);
    const heartbeat = !records.length && !this.spool.records.length ? this.heartbeat : undefined;
    const batch = records.length ? records.map(r => r.event) : heartbeat ? [heartbeat] : [];
    if (!batch.length) return;
    try {
      const cfg = this.connection();
      const url = cfg.url;
      this.requestAbort = new AbortController();
      const timeout = Math.max(1, Math.min(900, (this.stopDeadline || Infinity) - Date.now()));
      const response = await this.fetch(new URL('/api/events', url), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify(batch), signal: AbortSignal.any([this.requestAbort.signal, AbortSignal.timeout(timeout)]), redirect: 'error'
      });
      if (generation !== this.generation) return;
      if (!response.ok) {
        // Isolate poison events instead of discarding valid neighbors in a batch.
        if ([400, 413, 415].includes(response.status)) {
          if (records.length > 1) this.batchLimit = 1;
          else if (records.length === 1) this.spool.reject(records[0]);
          else if (this.heartbeat === heartbeat) this.heartbeat = undefined;
        }
        await response.body?.cancel();
        throw new Error(`Dashboard HTTP ${response.status}`);
      }
      const receipt = await response.json();
      if (generation !== this.generation) return;
      if (!Number.isInteger(receipt.accepted) || receipt.accepted < 0 || receipt.accepted > batch.length) throw new Error('Invalid collector acknowledgement');
      this.spool.acknowledge(records);
      if (this.heartbeat === heartbeat) this.heartbeat = undefined;
      this.status = 'connected'; this.failures = 0; this.nextTry = 0; this.batchLimit = 8; this.lastError = '';
    } catch (error) {
      if (generation !== this.generation) return;
      this.status = 'disconnected'; this.lastError = error.code === 'ENOENT' ? 'Start the dashboard first' : error.message;
      this.failures++; this.nextTry = Date.now() + Math.min(10000, 500 * 2 ** Math.min(this.failures, 5));
    }
  }
  async stop() {
    clearInterval(this.timer); this.timer = undefined;
    this.stopDeadline = Date.now() + 1400;
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(resolve, 1400); });
    try {
      do {
        const failures = this.failures;
        await Promise.race([this.flush(true), deadline]);
        if (this.failures !== failures || this.busy || !this.spool.records.length) break;
      } while (Date.now() < this.stopDeadline);
    } finally {
      clearTimeout(timer); this.closed = true; this.generation++; this.requestAbort?.abort();
      this.inFlight = undefined; this.heartbeat = undefined; this.stopDeadline = undefined;
      try { this.spool.release(); } catch (error) { this.storageError = `Pending events retained; release failed (${error.code || 'I/O error'})`; }
    }
  }
}
