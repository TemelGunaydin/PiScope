import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, openSync, closeSync, unlinkSync } from 'node:fs';

export function dataDirectory() { return resolve(process.env.AGENT_DASHBOARD_HOME || join(homedir(), '.agent-workflow-dashboard')); }
export function ensureToken(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
  const file = join(dir, 'auth.token');
  try {
    const token = readFileSync(file, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Malformed auth.token; restore or remove it before restarting');
    chmodSync(file, 0o600); return token;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const token = randomBytes(32).toString('hex');
    writeFileSync(file, token, { flag: 'wx', mode: 0o600 }); return token;
  }
}
export function acquireLock(dir) {
  const file = join(dir, 'server.lock');
  try {
    const fd = openSync(file, 'wx', 0o600); writeFileSync(fd, String(process.pid)); closeSync(fd);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const pid = Number(readFileSync(file, 'utf8'));
    let alive = Number.isInteger(pid) && pid > 0;
    if (alive) { try { process.kill(pid, 0); } catch (e) { alive = e.code !== 'ESRCH'; } }
    if (alive) throw new Error('A dashboard already uses this data directory. Stop it first.');
    unlinkSync(file); return acquireLock(dir);
  }
  let released = false;
  return () => { if (!released) { released = true; try { unlinkSync(file); } catch {} } };
}
export function saveConnection(dir, url, token) {
  const file = join(dir, 'connection.json');
  writeFileSync(file, JSON.stringify({ url, token }, null, 2) + '\n', { mode: 0o600 }); chmodSync(file, 0o600);
}
