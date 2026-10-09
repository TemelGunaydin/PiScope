import { join, isAbsolute, resolve, dirname, basename } from 'node:path';
import { openSync, fstatSync, readSync, closeSync, realpathSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { redact } from './security.mjs';
import { savePrivateJSON } from './private-json.mjs';

const BYTES = 512 * 1024, TASKS = 1000, TEXT = 64000;
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9_.:\-]{1,160}$/.test(value);
const labelId = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };

export function terminalTodosFile(env = process.env) {
  if (env.AGENT_DASHBOARD_TODOS !== '1') return undefined;
  if (env.AGENT_DASHBOARD_TODOS_FILE) {
    if (!isAbsolute(env.AGENT_DASHBOARD_TODOS_FILE)) fail('AGENT_DASHBOARD_TODOS_FILE must be an absolute file path');
    return env.AGENT_DASHBOARD_TODOS_FILE;
  }
  if (env.XDG_DATA_HOME && isAbsolute(env.XDG_DATA_HOME)) return join(env.XDG_DATA_HOME, 'terminal-todos/todos.json');
  if (env.HOME && isAbsolute(env.HOME)) return join(env.HOME, '.local/share/terminal-todos/todos.json');
  fail('Terminal Todos requires HOME or an absolute XDG_DATA_HOME');
}
function isLinkFile(file, path) {
  if (resolve(file) === resolve(path)) return true;
  if (basename(file).toLowerCase() !== basename(path).toLowerCase()) return false;
  // Check parents as well as spelling: even a currently missing source must
  // never be created/overwritten through a private-directory alias.
  try { return realpathSync(dirname(file)) === realpathSync(dirname(path)); } catch { return false; }
}
function readJSON(path, limit = BYTES) {
  // No source lock creation, migration, CLI execution, chmod or writes. A Rust
  // atomic replacement leaves an open descriptor reading one complete version.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW || 0));
  try {
    const stat = fstatSync(fd); if (!stat.isFile() || stat.size > limit) fail('File type or size limit');
    const buffer = Buffer.alloc(limit + 1); let used = 0, count;
    while ((count = readSync(fd, buffer, used, buffer.length - used, null)) > 0) {
      used += count; if (used > limit) fail('File size limit');
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used)));
  } finally { closeSync(fd); }
}
function tasksFrom(raw) {
  if (!raw || ![1, 2].includes(raw.version) || !Number.isSafeInteger(raw.next_id) || raw.next_id < 1 || !Array.isArray(raw.tasks) || raw.tasks.length > TASKS || Object.keys(raw).some(k => !['version', 'next_id', 'tasks'].includes(k))) fail('Unsupported task data');
  const seen = new Set();
  return raw.tasks.map(task => {
    if (!task || Object.keys(task).some(k => !['id', 'title', 'completed', 'created_at', 'project'].includes(k)) || !Number.isSafeInteger(task.id) || task.id < 1 || task.id >= raw.next_id || seen.has(task.id) || typeof task.title !== 'string' || !task.title.isWellFormed() || task.title.length > TEXT || typeof task.completed !== 'boolean' || !Number.isSafeInteger(task.created_at) || task.created_at < 0 || !Number.isFinite(new Date(task.created_at * 1000).getTime())) fail('Invalid task');
    seen.add(task.id);
    const label = task.project;
    if (label != null && (raw.version === 1 || typeof label !== 'string' || !label.isWellFormed() || !label.trim() || label.length > 240 || /[\u0000-\u001f\u007f-\u009f]/.test(label))) fail('Invalid project label');
    return { id: String(task.id), title: redact(task.title, TEXT), completed: task.completed, createdAt: new Date(task.created_at * 1000).toISOString(), labelId: label == null ? null : labelId(label), projectName: label == null ? 'Unassigned' : redact(label, 240) };
  });
}

/** Optional, read-only view of Terminal Todos; links belong only to PiScope. */
export class TerminalTodos {
  constructor(dir, file) {
    this.file = file; this.path = join(dir, 'todo-links.json'); this.tasks = []; this.links = new Map(); this.available = false; this.warning = ''; this.linksWarning = '';
    if (!file) return;
    if (!isAbsolute(file)) fail('Terminal Todos needs an absolute file path');
    if (isLinkFile(file, this.path)) fail('Terminal Todos source cannot be PiScope’s project-link file');
    try {
      const raw = readJSON(this.path);
      if (raw?.schemaVersion !== 1 || !Array.isArray(raw.links) || raw.links.length > 1000 || Object.keys(raw).some(k => !['schemaVersion', 'links'].includes(k))) fail('Invalid links');
      for (const link of raw.links) {
        if (!link || !/^[a-f0-9]{64}$/.test(link.labelId) || !identity(link.projectId) || this.links.has(link.labelId) || Object.keys(link).some(k => !['labelId', 'projectId'].includes(k))) fail('Invalid link');
        this.links.set(link.labelId, link.projectId);
      }
    } catch (error) {
      this.links.clear();
      if (error.code !== 'ENOENT') this.linksWarning = 'Project links are unreadable. The original file is unchanged; restore it before saving links.';
    }
    this.refresh();
  }
  refresh() {
    if (!this.file) return false;
    const before = JSON.stringify([this.available, this.warning, this.tasks]);
    try {
      this.tasks = tasksFrom(readJSON(this.file)); this.available = true; this.warning = '';
    } catch (error) {
      this.available = false;
      this.warning = error.code === 'ENOENT' ? 'Terminal Todos file is missing. No file was created or legacy data imported.' : 'Terminal Todos is unreadable or exceeds integration limits. The source is unchanged. Restore it or check its version and size.';
    }
    return before !== JSON.stringify([this.available, this.warning, this.tasks]);
  }
  setLink(input, projects) {
    this.refresh();
    const reject = (status, message) => { throw Object.assign(new Error(message), { status }); };
    if (!this.file || !this.available || this.linksWarning) reject(409, this.linksWarning || 'Enable an available Terminal Todos source before linking projects.');
    if (!input || typeof input.labelId !== 'string' || !this.tasks.some(t => t.labelId === input.labelId) || (input.projectId !== null && !projects.some(p => p.projectId === input.projectId))) reject(400, 'Choose a current note label and a tracked PiScope project.');
    if (isLinkFile(this.file, this.path)) reject(409, 'Terminal Todos source cannot be PiScope’s project-link file');
    const next = new Map(this.links);
    if (input.projectId === null) next.delete(input.labelId); else next.set(input.labelId, input.projectId);
    if (next.size > 1000) reject(409, 'Project-link limit reached. Review PiScope’s private todo-links.json locally.');
    savePrivateJSON(this.path, { schemaVersion: 1, links: [...next].map(([labelId, projectId]) => ({ labelId, projectId })) });
    this.links = next;
  }
  snapshot() {
    const labels = new Map();
    for (const task of this.tasks) if (task.labelId) labels.set(task.labelId, { id: task.labelId, name: task.projectName, projectId: this.links.get(task.labelId) || null });
    return { enabled: Boolean(this.file), available: this.available, warning: [this.warning, this.linksWarning].filter(Boolean).join(' '), canLink: Boolean(this.available && !this.linksWarning), tasks: this.tasks, labels: [...labels.values()].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id)) };
  }
}
