import { mkdirSync, lstatSync, chmodSync, readdirSync, readFileSync, writeFileSync,
  openSync, fsyncSync, closeSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateEvent } from './events.mjs';

export const MAX_BATCH_BYTES = 240 * 1024; // Below the collector's 256 KB limit.
const producerName = /^(\d{16}-[a-f0-9-]{36})\.(\d+)\.([a-f0-9-]{36})$/;
const eventName = /^\d{12}\.json$/;
function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!lstatSync(path).isDirectory()) throw new Error('Spool must be a real directory');
  chmodSync(path, 0o700);
}
function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

/** Atomic directory rename claims dead/released producers. FIFO is per producer;
 * unrelated Pi sessions have no shared execution order. Accepted events are
 * projected, fsynced and renamed before enqueue returns. */
export class EventSpool {
  constructor(root, { maxQueue = 5000, maxBytes = 20 * 1024 * 1024 } = {}) {
    this.root = root; this.maxQueue = maxQueue; this.maxBytes = maxBytes;
    this.records = []; this.bytes = 0; this.dropped = 0; this.recovered = 0;
    this.corrupt = 0; this.quarantined = 0; this.lastError = ''; this.directories = new Set(); this.opened = false;
  }
  open() {
    if (this.opened) return;
    privateDirectory(dirname(this.root)); privateDirectory(this.root);
    const quarantine = join(this.root, 'quarantine');
    try {
      if (!lstatSync(quarantine).isDirectory()) throw new Error('Quarantine must be a real directory');
      this.quarantined = readdirSync(quarantine).length;
      if (this.quarantined) this.lastError = 'Quarantined events retained; inspect spool/quarantine';
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { for (const name of readdirSync(this.root).sort()) {
      const match = producerName.exec(name);
      if (!match || alive(Number(match[2]))) continue;
      const old = join(this.root, name);
      let stat; try { stat = lstatSync(old); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (!stat.isDirectory()) continue;
      const claimed = join(this.root, `${match[1]}.${process.pid}.${randomUUID()}`);
      try { renameSync(old, claimed); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      this.directories.add(claimed);
      this.load(claimed);
    } } catch (error) {
      // Never start newer work ahead of a partially loaded recovery directory.
      this.release(); throw error;
    }
    this.opened = true;
  }
  load(dir) {
    chmodSync(dir, 0o700);
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      if (/^\d{12}\.json\.tmp$/.test(name)) {
        this.quarantine(file, 'partial'); this.corrupt++;
        this.lastError = 'Incomplete pending event quarantined; inspect spool/quarantine';
        continue;
      }
      if (!eventName.test(name)) continue;
      let event, bytes;
      try {
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.size > MAX_BATCH_BYTES - 128) throw new Error('Invalid pending file');
        chmodSync(file, 0o600);
        const raw = readFileSync(file, 'utf8'); bytes = Buffer.byteLength(raw);
        event = validateEvent(JSON.parse(raw));
        if (Buffer.byteLength(JSON.stringify({ ...event, recovered: true })) > MAX_BATCH_BYTES - 2) throw new Error('Oversized projected pending event');
      } catch {
        this.quarantine(file, 'invalid'); this.corrupt++;
        this.lastError = 'Invalid pending event quarantined; inspect spool/quarantine';
        continue;
      }
      this.records.push({ file, bytes, event: { ...event, recovered: true } });
      this.bytes += bytes; this.recovered++;
    }
  }
  writer() {
    if (!this.writeDir) {
      const base = `${String(Date.now()).padStart(16, '0')}-${randomUUID()}`;
      const dir = join(this.root, `${base}.${process.pid}.${randomUUID()}`);
      privateDirectory(dir); this.writeDir = dir; this.directories.add(dir); this.sequence = 0;
    }
    return this.writeDir;
  }
  enqueue(event) {
    this.open();
    const json = JSON.stringify(event), bytes = Buffer.byteLength(json);
    // Preserve accepted events. Recovery can exceed current limits: reject new
    // events until the backlog drains, rather than deleting recovered history.
    if (this.records.length >= this.maxQueue || this.bytes + bytes > this.maxBytes || bytes > MAX_BATCH_BYTES - 128) {
      this.dropped++; return false;
    }
    const file = join(this.writer(), `${String(++this.sequence).padStart(12, '0')}.json`);
    const temporary = file + '.tmp'; let fd;
    try {
      fd = openSync(temporary, 'wx', 0o600);
      writeFileSync(fd, json); fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(temporary, file);
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
    this.records.push({ file, bytes, event }); this.bytes += bytes;
    return true;
  }
  batch(limit = 8) {
    const batch = []; let bytes = 2;
    for (const record of this.records.slice(0, limit)) {
      const size = Buffer.byteLength(JSON.stringify(record.event)) + (batch.length ? 1 : 0);
      if (bytes + size > MAX_BATCH_BYTES) break;
      batch.push(record); bytes += size;
    }
    return batch;
  }
  acknowledge(records) {
    for (const record of records) {
      if (this.records[0] !== record) throw new Error('Spool acknowledgement out of order');
      unlinkSync(record.file);
      this.records.shift(); this.bytes -= record.bytes;
    }
  }
  quarantine(file, reason) {
    const target = join(this.root, 'quarantine'); privateDirectory(target);
    renameSync(file, join(target, `${randomUUID()}.${reason}.json`));
    this.quarantined++;
  }
  reject(record) {
    if (this.records[0] !== record) throw new Error('Spool rejection out of order');
    this.quarantine(record.file, 'rejected');
    this.records.shift(); this.bytes -= record.bytes; this.dropped++;
    this.lastError = 'Collector rejected an event; inspect spool/quarantine';
  }
  release() {
    // pid=0 releases ownership even during /reload in the same Pi process.
    for (const dir of this.directories) {
      try { rmdirSync(dir); }
      catch (error) {
        if (error.code === 'ENOENT') continue;
        if (error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST') throw error;
        const match = producerName.exec(basename(dir));
        renameSync(dir, join(this.root, `${match[1]}.0.${randomUUID()}`));
      }
    }
    this.directories.clear(); this.records = []; this.bytes = 0;
    this.writeDir = undefined; this.opened = false;
  }
}
