const workspaceId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:\-]{1,160}$/.test(value);
export const PROJECT_PREFERENCES_KEY = 'piscope.projects.v1';

export class ProjectPreferences {
  constructor(storage) {
    this.storage = storage; this.layout = 'cards'; this.pinned = new Set();
    try {
      const raw = storage?.getItem(PROJECT_PREFERENCES_KEY);
      if (!raw || raw.length > 90000) return;
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !['cards', 'list'].includes(saved.layout) || !Array.isArray(saved.pinned) ||
          saved.pinned.length > 500 || !saved.pinned.every(workspaceId)) return;
      this.layout = saved.layout; this.pinned = new Set(saved.pinned);
    } catch { /* Preferences still work for this page when storage is unavailable. */ }
  }
  save() {
    try { this.storage?.setItem(PROJECT_PREFERENCES_KEY, JSON.stringify({ version: 1, layout: this.layout, pinned: [...this.pinned] })); } catch { /* Page-local fallback. */ }
  }
  setLayout(value) { if (['cards', 'list'].includes(value)) { this.layout = value; this.save(); } }
  togglePin(projectId) {
    if (!workspaceId(projectId)) return;
    if (this.pinned.has(projectId)) this.pinned.delete(projectId);
    else if (this.pinned.size < 500) this.pinned.add(projectId);
    this.save();
  }
}

export function readWorkspaceRoute(search) {
  const params = new URLSearchParams(search), view = params.get('view') || 'projects';
  if (!['projects', 'attention', 'history', 'report', 'notes', 'request'].includes(view)) return { view: 'invalid' };
  if (view !== 'request') return { view };
  const projectId = params.get('project'), sessionId = params.get('session'), runId = params.get('request');
  return [projectId, sessionId, runId].every(workspaceId) ? { view, projectId, sessionId, runId } : { view: 'invalid' };
}

export function workspacePath(route) {
  const params = new URLSearchParams();
  if (route.view !== 'projects') params.set('view', route.view);
  if (route.view === 'request') {
    params.set('project', route.projectId); params.set('session', route.sessionId); params.set('request', route.runId);
  }
  return '/' + (params.size ? '?' + params : '');
}

export function retainedRequests(snapshot) {
  return (snapshot.sessions || []).filter(s => !s.demo).flatMap(s => s.runs.map(r => ({
    projectId: s.projectId, projectName: s.projectName, sessionId: s.id, runId: r.id,
    startedAt: r.requestStartedAt || r.startedAt, prompt: r.prompt || '', summary: r.summary || '',
    model: r.model || '', models: [...new Set([r.model, ...(r.primaryModels || []), ...Object.values(r.agents || {}).filter(a => a.modelSource !== 'requested').map(a => a.model)].filter(Boolean))],
    verdict: r.performance?.verdict || 'unknown', status: r.status, errorMessage: r.errorMessage || '',
    retained: true
  }))).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || '') || a.projectId.localeCompare(b.projectId) || a.sessionId.localeCompare(b.sessionId) || a.runId.localeCompare(b.runId));
}

export function requestDay(value, timeZone) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function searchRequests(entries, { query = '', projectId = '', model = '', verdict = '', from = '', to = '' } = {}, timeZone) {
  const terms = query.trim().toLocaleLowerCase('en').split(/\s+/).filter(Boolean);
  return entries.filter(r => {
    if (projectId && r.projectId !== projectId || model && !r.models.includes(model) || verdict && (verdict === 'running' ? r.status !== 'running' : r.verdict !== verdict)) return false;
    const day = requestDay(r.startedAt, timeZone);
    if ((from || to) && !day || from && day < from || to && day > to) return false;
    const text = `${r.projectName} ${r.prompt} ${r.summary} ${r.errorMessage} ${r.models.join(' ')}`.toLocaleLowerCase('en');
    return terms.every(term => text.includes(term));
  });
}

export function attentionRequests(projects, sessions, replyReads) {
  const items = new Map();
  const add = (p, ref, reason, tone) => {
    if (!ref) return;
    const key = JSON.stringify([p.projectId, ref.sessionId, ref.runId]);
    let item = items.get(key);
    if (!item) {
      const r = sessions.find(s => !s.demo && s.projectId === p.projectId && s.id === ref.sessionId)?.runs.find(r => r.id === ref.runId);
      const saved = p.latest?.sessionId === ref.sessionId && p.latest?.runId === ref.runId ? p.latest : undefined;
      item = { projectId: p.projectId, projectName: p.projectName, sessionId: ref.sessionId, runId: ref.runId,
        startedAt: r?.requestStartedAt || r?.startedAt || saved?.startedAt, prompt: r?.prompt || saved?.prompt || '',
        summary: r?.summary || saved?.summary || '', errorMessage: r?.errorMessage || saved?.errorMessage || '',
        retained: Boolean(r), reasons: [], tone };
      items.set(key, item);
    }
    item.reasons.push(reason); if (tone === 'error') item.tone = tone;
  };
  for (const p of projects.filter(p => !p.demo)) {
    add(p, replyReads.unread(p.projectId), 'New reply', 'idle');
    const latest = p.latest;
    if (latest?.errorMessage) add(p, latest, 'Model/provider error', 'error');
    else if (latest?.verdict === 'failed') add(p, latest, 'Request ended with an error', 'error');
    if (latest?.stages?.some(s => s.status === 'blocked')) add(p, latest, 'Blocked plan', 'error');
    if (latest?.stages?.some(s => s.status === 'error')) add(p, latest, 'Plan reports an error', 'error');
  }
  return [...items.values()].sort((a, b) => Number(b.tone === 'error') - Number(a.tone === 'error') || a.projectName.localeCompare(b.projectName, 'en') || a.projectId.localeCompare(b.projectId) || a.runId.localeCompare(b.runId));
}
