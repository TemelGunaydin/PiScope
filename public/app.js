import { initializeControls, renderControls, modelError } from './control.js';
const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = String(text); return node; };
let snapshot = { sessions: [] }, sessionId = '', runId = '', overview = true, eventSource, projectRenderKey = '';
let overviewScrollY = 0, returnProjectId = '', followSubmission;
const labels = { running: 'Running', starting: 'Request sent', pending: 'Waiting', idle: 'Response finished', done: 'Done', error: 'Error', blocked: 'Blocked', cancelled: 'Cancelled', unknown: 'Outcome unknown' };
const time = value => value ? new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';
const count = n => new Intl.NumberFormat('en-US', { notation: n > 99999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
function duration(start, end) { if (!start) return '—'; const n = Math.max(0, Math.floor(((end ? Date.parse(end) : Date.now()) - Date.parse(start)) / 1000)); return n < 60 ? `${n} s` : `${Math.floor(n / 60)} min ${n % 60} s`; }
function modelLabel(model) {
  if (!model) return 'Model not reported yet';
  if (/mimo/i.test(model)) return 'MiMo'; if (/qwen/i.test(model)) return 'Qwen'; if (/sol/i.test(model)) return 'Sol';
  if (/deepseek/i.test(model)) return 'DeepSeek';
  if (/glm/i.test(model)) return 'GLM'; return model.split('/').slice(-1)[0];
}
function badge(status) { return el('span', `badge ${status}`, labels[status] || status); }
// Only the observed agent.finished mark is terminal proof for an agent card.
// A progress-only status literal — even a terminal-looking 'done'/'error'/
// 'blocked'/'cancelled' — is never a result: without the finished mark the card
// shows the unknown/waiting note, never a green done/red error badge. Live
// in-progress states keep their labels; the main card keeps the run-level
// status (terminal only via an observed run.ended).
const liveCardStatuses = new Set(['running', 'starting', 'pending']);
function cardBadge(card) {
  if (card.main || card.finished || liveCardStatuses.has(card.status)) return badge(card.status);
  return el('span', 'badge unknown', 'Outcome unknown / awaiting completion');
}
const invocationLabels = { finished: ['done', 'Done'], failed: ['error', 'Error'], unresolved: ['idle', 'Unresolved'] };
const msDuration = ms => ms === undefined ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
const tokenLabel = u => u ? `${count((u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0))} tokens` : '—';
function filteredSessions() {
  return snapshot.sessions.filter(s => !s.demo).sort((a, b) =>
    a.projectName.localeCompare(b.projectName, 'en') || a.id.localeCompare(b.id));
}
const projectStates = { running: ['running', 'Running'], waiting: ['pending', 'Unfinished work'], attention: ['error', 'Needs attention'], finished: ['done', 'Last request finished'], cancelled: ['cancelled', 'Cancelled'], unknown: ['unknown', 'Outcome unknown'] };
const fullDate = value => new Date(value).toLocaleString('en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const excerpt = (text, max) => text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
function sinceWork(value, now) {
  if (!value) return 'No work recorded yet';
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  const hours = Math.floor(minutes / 60), days = Math.floor(minutes / 1440);
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${hours} ${hours === 1 ? 'hour' : 'hours'} ago` : `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
function projectsNow() {
  const now = Date.now();
  // Activity changes content, not position. Name + ID also stays stable on reload.
  return (snapshot.projectOverview?.items || []).filter(p => !p.demo).sort((a, b) =>
    a.projectName.localeCompare(b.projectName, 'en') || a.projectId.localeCompare(b.projectId)).map(p => {
    // Expire the working badge even if the collector or tab stops receiving SSE.
    const activeSessions = (p.activeUntil || []).filter(until => until > now).length;
    return { ...p, activeSessions, status: activeSessions ? 'running' : p.idleStatus,
      stale: Boolean(p.lastWorkedAt && now - Date.parse(p.lastWorkedAt) >= 7 * 86400000), ago: sinceWork(p.lastWorkedAt, now) };
  });
}
function openDetails(nextSessionId, nextRunId = '', projectId = '') {
  if (overview) { overviewScrollY = window.scrollY; returnProjectId = projectId; }
  sessionId = nextSessionId; runId = nextRunId; overview = false;
  render(); $('detail-heading').focus({ preventScroll: true }); window.scrollTo(0, 0);
}
function returnToProjects() {
  overview = true; render();
  const card = [...$('project-list').children].find(c => c.dataset.project === returnProjectId);
  (card?.querySelector('.project-open') || $('overview-heading')).focus({ preventScroll: true });
  window.scrollTo(0, overviewScrollY);
}
function appendProjectText(card, field, label, text, expanded) {
  const paragraph = el('p', `project-text ${field === 'prompt' ? 'project-prompt' : field === 'error' ? 'project-error' : 'project-answer'}`, text);
  paragraph.id = `project-text-${encodeURIComponent(card.dataset.project)}-${field}`;
  paragraph.dataset.field = field; paragraph.tabIndex = -1;
  card.append(el('p', 'project-field-label', label), paragraph);
  if (text.length <= 220) return;
  const button = el('button', 'project-expand'); button.type = 'button'; button.dataset.field = field;
  button.setAttribute('aria-controls', paragraph.id);
  let open = expanded.has(JSON.stringify([card.dataset.project, field]));
  const update = () => {
    paragraph.textContent = open ? text : excerpt(text, 220);
    paragraph.classList.toggle('expanded', open);
    button.textContent = open ? 'Show less' : 'Show more';
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', `${label}: ${button.textContent}`);
  };
  button.onclick = () => { open = !open; update(); };
  update(); card.append(button);
}
function renderProjects() {
  if (!overview) return;
  const projects = projectsNow(), query = $('project-search').value.trim().toLocaleLowerCase('en'), filter = $('project-filter').value;
  // Heartbeats should not replace focused cards or collapse their saved summaries.
  const key = JSON.stringify([query, filter, projects.map(({ activeUntil, ...p }) => p)]);
  if (key === projectRenderKey) return;
  projectRenderKey = key;
  $('project-totals').replaceChildren();
  for (const [status, label, total] of [['all', 'Recorded projects', projects.length], ['running', 'Running', projects.filter(p => p.status === 'running').length], ['waiting', 'Unfinished work', projects.filter(p => p.status === 'waiting').length], ['stale', 'Inactive for 7+ days', projects.filter(p => p.stale).length]]) {
    const metric = el('article'); metric.dataset.status = status;
    metric.append(el('span', 'metric-label', label), el('strong', '', count(total))); $('project-totals').append(metric);
  }
  const matches = projects.filter(p => (!filter || (filter === 'stale' ? p.stale : p.status === filter)) &&
    `${p.projectName} ${p.latest?.prompt || ''} ${p.latest?.summary || ''} ${p.nextStep?.title || ''}`.toLocaleLowerCase('en').includes(query));
  $('project-results').textContent = `${matches.length} ${matches.length === 1 ? 'project' : 'projects'} shown · Project name (A–Z)`;
  const list = $('project-list'), expanded = new Set([...list.querySelectorAll('.project-expand[aria-expanded="true"]')]
    .map(button => JSON.stringify([button.closest('.project-card').dataset.project, button.dataset.field])));
  const focus = document.activeElement, focusedProject = list.contains(focus) ? focus.closest('.project-card')?.dataset.project : undefined;
  const focusedField = focus?.classList.contains('project-expand') ? focus.dataset.field : undefined;
  const focusedOpen = focus?.classList.contains('project-open');
  list.replaceChildren();
  if (!matches.length) {
    const empty = el('div', 'empty-state');
    empty.append(el('h2', '', projects.length ? 'No matching projects.' : 'Your projects will appear here.'),
      el('p', '', projects.length ? 'Try a different search or status filter.' : 'Install the monitoring extension in a Pi project and start working. Your latest request and reported plan will stay here when you return.'));
    if (!projects.length) empty.append(el('code', '', 'npm run install:pi -- /absolute/path/to/your/project'));
    list.append(empty);
  }
  for (const p of matches) {
    const card = el('article', 'project-card'); card.dataset.project = p.projectId; card.dataset.status = p.status;
    const recorded = snapshot.sessions.find(s => s.id === p.latest?.sessionId)?.runs.find(r => r.id === p.latest.runId);
    const error = p.latest?.errorMessage || modelError(recorded);
    const heading = el('div', 'project-card-head'), [tone, label] = error && !p.activeSessions ? ['error', 'Error'] : projectStates[p.status] || projectStates.unknown;
    heading.append(el('h2', '', p.projectName), el('span', `badge ${tone}`, label));
    const when = el('p', 'project-when');
    if (p.lastWorkedAt) { const date = el('time', '', `${p.ago} · ${fullDate(p.lastWorkedAt)}`); date.dateTime = p.lastWorkedAt; when.append(date); }
    else when.textContent = p.ago;
    if (p.activeSessions) when.append(el('span', '', ` · ${p.activeSessions} active ${p.activeSessions === 1 ? 'session' : 'sessions'}`));
    card.append(heading, when);
    appendProjectText(card, 'prompt', 'Last request', p.latest?.prompt || 'Request text not recorded.', expanded);
    if (error) appendProjectText(card, 'error', 'Model/provider error', error, expanded);
    appendProjectText(card, 'summary', 'Last response', p.latest?.summary || 'Response summary not recorded.', expanded);
    const next = el('div', `project-next${p.nextStep ? ' has-next' : ''}`);
    const nextLabel = { running: 'Plan: Step in progress', pending: 'Plan: Next step', blocked: 'Plan: Blocked step', error: 'Plan: Step with a reported error' }[p.nextStep?.status] || 'Plan: Next step';
    next.append(el('span', 'project-field-label', nextLabel), el('p', '', p.nextStep?.title || 'No next step reported.'));
    if (p.pendingCount > 1) next.append(el('small', '', `${p.pendingCount} unfinished stages`));
    card.append(next);
    if (p.detailAvailable) {
      const button = el('button', 'button project-open', 'Open last request ↗'); button.type = 'button'; button.setAttribute('aria-label', `${p.projectName}: open last request`);
      button.onclick = () => openDetails(p.latest.sessionId, p.latest.runId, p.projectId);
      card.append(button);
    } else if (p.latest) card.append(el('p', 'project-archive', 'Summary saved; detailed event history is no longer retained.'));
    list.append(card);
    if (focusedProject === p.projectId) {
      const target = focusedField ? card.querySelector(`.project-expand[data-field="${focusedField}"]`) || card.querySelector(`.project-text[data-field="${focusedField}"]`)
        : focusedOpen ? card.querySelector('.project-open') : undefined;
      target?.focus({ preventScroll: true });
    }
  }
}
function selected() {
  const sessions = filteredSessions();
  const s = sessions.find(s => s.id === sessionId) || sessions[0];
  if (!s) return {};
  sessionId = s.id;
  const r = s.runs.find(r => r.id === runId) || s.runs[s.runs.length - 1];
  if (r) runId = r.id;
  return { s, r };
}
function renderSidebar() {
  const all = filteredSessions();
  $('project-count').textContent = (snapshot.projectOverview?.items || []).filter(p => !p.demo).length;
  $('sessions').replaceChildren();
  if (!all.length) $('sessions').append(el('p', 'sessions-empty', 'No sessions connected yet.'));
  for (const s of all) {
    const button = el('button', `session-item ${!overview && s.id === sessionId ? 'active' : ''}`); button.type = 'button';
    button.append(el('strong', '', s.projectName), el('small', '', `${s.id.slice(0, 7)} · ${s.runs.length} ${s.runs.length === 1 ? 'request' : 'requests'}`));
    button.addEventListener('click', () => openDetails(s.id));
    $('sessions').append(button);
  }
}
function renderStages(r) {
  $('stages').replaceChildren();
  if (!r.stages.length) $('stages').append(el('p', 'stage-empty', 'No plan reported yet. Stages appear when the agent calls workflow_report. Tool and model events are monitored automatically, even without a plan.'));
  r.stages.forEach((stage, index) => {
    const box = el('article', `stage ${stage.status}`);
    const heading = el('div', 'stage-index'); heading.append(el('span', '', `${String(index + 1).padStart(2, '0')}`), el('span', '', stage.status === 'done' ? '✓' : stage.status === 'running' ? '●' : stage.status === 'error' ? '!' : '○'));
    box.append(heading, el('h3', '', stage.title), el('p', 'stage-model', stage.agent || modelLabel(stage.model)), el('p', 'stage-status', labels[stage.status]));
    $('stages').append(box);
  });
  $('stage-reason').textContent = r.stageReason || '';
  const next = r.stages.find(s => s.status === 'pending');
  $('next-task').replaceChildren();
  if (next) $('next-task').append(el('span', 'next-arrow', '↗'), el('h3', 'next-task-name', next.title), el('p', 'next-task-model', next.agent || modelLabel(next.model)), el('p', 'next-note', 'This is a reported plan. Actual model execution is shown by a separate Pi event.'));
  else $('next-task').append(el('p', 'next-note', r.stages.length ? 'No waiting stage reported. This alone does not mean the task has been verified.' : 'No stages reported yet. A next step is never guessed.'));
}
function renderModels(s, r) {
  const agents = Object.values(r.agents);
  // Only the observed agent.finished mark settles an invocation: an agent
  // without it keeps the main session waiting, whatever its progress-only
  // status literal claims.
  const active = agents.some(a => !a.finished);
  const cards = [{ model: r.model || s.model, agent: 'Main session', status: r.status === 'running' ? (active ? 'pending' : 'running') : r.status,
    task: active ? 'Waiting for subagent results.' : 'Main session · planning, coordination and response', main: true }];
  // Most recent invocation per agent, without misreporting parallel work as a model switch.
  const byAgent = new Map(); for (const a of agents) byAgent.set(a.agent || a.id, a);
  cards.push(...byAgent.values());
  $('models').replaceChildren();
  for (const card of cards) {
    const label = modelLabel(card.model); const node = el('article', 'model-card'); const heading = el('div', 'model-card-head');
    const avatar = el('div', `model-avatar ${label.toLowerCase()}`, label[0]);
    const name = el('div'); name.append(el('h3', '', label), el('p', 'model-role', card.agent));
    heading.append(avatar, name, cardBadge(card));
    node.append(heading, el('span', 'model-id', card.model || 'Awaiting a subagent progress event'), el('p', 'model-task', card.task || card.summary || 'Task details not reported.'));
    const currentTools = (card.tools || []).filter(t => t.status === 'running');
    node.append(el('p', 'model-source', card.main ? 'Observed in the main Pi session' : currentTools.length ? `Active: ${currentTools.map(t => t.name + (t.file ? ' · ' + t.file : '')).join(', ')}` : card.modelSource === 'requested' ? 'Requested model; execution not yet confirmed' : card.model ? 'From a subagent progress / result event' : 'Awaiting model identity'));
    if (card.summary) { const details = el('details', 'model-result'); details.append(el('summary', '', 'View subagent result'), el('p', '', card.summary)); node.append(details); }
    $('models').append(node);
  }
}
function eventPresentation(e) {
  const d = e.data; const title = {
    'prompt.received': 'New request received', 'run.started': 'Main model started working',
    'model.selected': 'Main session model changed', 'tool.started': `${d.toolName || 'Tool'} started`,
    'tool.finished': `${d.toolName || 'Tool'} ${d.isError ? 'returned an error' : 'finished'}`,
    'agent.started': `Task sent to ${d.agent || 'subagent'}`, 'agent.finished': `${d.agent || 'Subagent'} ${d.isError ? 'failed' : 'returned a result'}`,
    'message.completed': d.errorMessage ? 'Model/provider error reported' : 'Model response recorded', 'workflow.updated': 'Task plan updated', 'workflow.configured': 'Workflow profile recorded',
    'tests.recorded': 'JUnit test report attached',
    'run.ended': d.outcome === 'error' ? 'Main run stopped with an error' : d.outcome === 'aborted' ? 'Main run cancelled' : d.outcome === 'idle' ? 'Main model finished its response' : d.outcome ? `Main run stopped with an unknown outcome (${d.outcome})` : 'Main run stopped without an outcome',
    'run.settled': 'Pi automatic continuation ended', 'monitor.warning': 'Monitoring warning', 'session.disconnected': 'Pi session disconnected'
  }[e.type] || e.type;
  const reportDetail = e.type === 'tests.recorded' ? `${d.evidence.file} · ${d.evidence.passed} passed / ${d.evidence.failures + d.evidence.errors} failed / ${d.evidence.skipped} skipped · SHA-256 ${d.evidence.sha256.slice(0, 12)}` : '';
  const detail = d.errorMessage || reportDetail || (e.type === 'workflow.configured' ? `${d.workflow.label} · ${d.workflow.id} @ ${d.workflow.version}` : '') || (e.type === 'agent.finished' ? [d.model, d.summary].filter(Boolean).join('\n') : '') || d.file || d.task || d.reason || d.message || d.model || (['message.completed', 'run.ended'].includes(e.type) ? d.summary : '') || '';
  return { title, detail, icon: e.type.startsWith('agent.') ? '↗' : e.type === 'tool.finished' ? (d.isError ? '!' : '✓') : e.type === 'workflow.updated' ? '≡' : '·' };
}
function renderPerf(s, r) {
  const p = r.performance, box = $('perf'); box.replaceChildren();
  if (!p) return;
  const verdicts = { completed: ['completed', 'Technical completion'], failed: ['error', 'Ended with an error'], cancelled: ['cancelled', 'Cancelled'], unknown: ['unknown', 'Outcome unknown'] };
  const [tone, title] = verdicts[p.verdict];
  const head = el('div', 'perf-verdict');
  head.append(el('span', `perf-dot ${tone}`), el('strong', '', title));
  if (p.verdict === 'completed') head.append(el('span', 'tag', 'QUALITY / TESTS NOT VERIFIED'));
  box.append(head);
  const notes = [];
  if (p.verdict === 'completed') notes.push('Technical completion: the request ended and all subagent calls finished without errors in the observed events. This does not prove the task was done correctly or that tests passed.');
  if (p.verdict === 'failed') notes.push(p.outcome === 'error' ? 'Main run stopped with an error (run.ended: error observed).' : 'The main response ended, but at least one subagent call returned an error — not counted as completed.');
  if (p.verdict === 'cancelled') notes.push('Main run cancelled (run.ended: aborted observed).');
  if (p.verdict === 'unknown') {
    if (!p.outcome) notes.push(p.settled ? 'Automatic continuation ended, but no run.ended event was observed; the outcome is unknown.' : 'No run.ended event observed yet; the outcome is unknown.');
    else if (p.outcome !== 'idle') notes.push(p.outcome === 'unknown' ? 'The run.ended outcome was empty or missing; no known terminal outcome, so not counted as completed.' : `The run.ended outcome "${p.outcome}" is not a known terminal outcome; not counted as completed.`);
    if (p.agents.unresolved) notes.push(`${count(p.agents.unresolved)} subagent calls started but did not finish; not counted as completed.`);
    if (!p.fresh) notes.push('Pi signal is stale; the latest state is uncertain.');
  }
  for (const note of notes) box.append(el('p', 'perf-note', note));
  const rows = el('div', 'perf-rows');
  const row = (label, value) => { const line = el('div', 'perf-row'); line.append(el('span', '', label), el('strong', '', value)); rows.append(line); };
  row('Subagent calls', `${count(p.agents.finished)} finished · ${count(p.agents.failed)} failed · ${count(p.agents.unresolved)} unresolved`);
  row('Observed tool errors', p.toolFailureCount ? count(p.toolFailureCount) : 'None');
  box.append(rows);
  if (p.toolFailures.length) box.append(el('p', 'perf-note', `Tools with errors: ${p.toolFailures.map(t => t.name + (t.file ? ' · ' + t.file : '')).join(', ')}`));
  if (p.invocations.length) {
    box.append(el('p', 'perf-sub', 'Elapsed time per call · reported tokens'));
    const list = el('ul', 'perf-list');
    for (const i of p.invocations) {
      const item = el('li', 'perf-item'), main = el('div', 'perf-item-main'), meta = el('div', 'perf-item-meta');
      main.append(el('strong', '', i.agent || 'Unknown agent'), el('small', '', [modelLabel(i.model), i.task].filter(Boolean).join(' · ') || 'No task details'));
      const [statusTone, statusText] = invocationLabels[i.status];
      meta.append(el('span', `badge ${statusTone}`, statusText), el('span', '', msDuration(i.elapsedMs)), el('span', '', tokenLabel(i.usage)));
      item.append(main, meta); list.append(item);
    }
    box.append(list);
    if (p.invocationsTotal > p.invocations.length) box.append(el('p', 'perf-note', `Showing the latest ${count(p.invocations.length)} calls (${count(p.invocationsTotal)} total records).`));
  }
  box.append(el('p', 'perf-note', 'Reported plan stages (workflow_report) are not part of this metric; they appear separately under Task workflow. A tool result, model response or agent report is not test or quality verification.'));
}
function renderHistory(s) {
  const box = $('history'); box.replaceChildren();
  const project = (snapshot.projects || []).find(p => p.projectId === s.projectId);
  const h = project?.live;
  if (!h || !h.total) {
    box.append(el('p', 'perf-note', 'No live requests recorded for this project. Demo records are excluded.'));
    return;
  }
  const rows = el('div', 'perf-rows');
  const row = (label, value) => { const line = el('div', 'perf-row'); line.append(el('span', '', label), el('strong', '', value)); rows.append(line); };
  row('Recorded requests', count(h.total));
  row('Technical completion', count(h.completed));
  row('Failed', count(h.failed));
  row('Cancelled', count(h.cancelled));
  row('Unresolved / unknown', count(h.unknown));
  box.append(rows);
  const ratio = el('div', 'perf-verdict');
  ratio.append(el('strong', '', h.terminal ? `Technical completion rate: ${Math.round(h.technicalCompletionRatio * 100)}%` : 'No terminal requests to calculate a rate'));
  box.append(ratio);
  box.append(el('p', 'perf-note', `Denominator: terminal requests = completed + failed + cancelled (${count(h.terminal)}). Unresolved requests (${count(h.unknown)}) are excluded from the rate and are not counted as completed.`));
  box.append(el('p', 'perf-note', 'Demo records are excluded. Only retained requests are counted (up to 30 per session); expired journal records may drop out of these totals.'));
}
function renderTimeline(r) {
  const query = $('event-search').value.toLocaleLowerCase('en');
  const events = [...r.events].reverse().filter(e => { const p = eventPresentation(e); return `${p.title} ${p.detail} ${e.type}`.toLocaleLowerCase('en').includes(query); });
  $('timeline').replaceChildren();
  if (!events.length) $('timeline').append(el('p', 'event-empty', 'No matching events.'));
  for (const e of events) {
    const p = eventPresentation(e); const item = el('article', `event ${e.type.startsWith('agent.') ? 'agent' : ''} ${e.data.isError ? 'error' : ''}`);
    const body = el('div', 'event-body'), top = el('div', 'event-top');
    top.append(el('span', 'event-title', p.title), el('time', '', time(e.time)));
    body.append(top, el('p', 'event-detail', p.detail), el('p', 'event-kind', `${e.type}${e.type === 'workflow.updated' ? ' · AGENT REPORT' : e.type === 'workflow.configured' ? ' · CONFIGURATION' : e.type === 'tests.recorded' ? ' · IMPORTED REPORT' : ' · OBSERVED EVENT'}`));
    item.append(el('div', 'event-icon', p.icon), body); $('timeline').append(item);
  }
}
function renderWorkflowComparison(s, r) {
  const box = $('workflow-comparison'); box.replaceChildren();
  const data = snapshot.projects?.find(p => p.projectId === s.projectId)?.workflows?.live;
  const filter = $('workflow-task-set'), previous = filter.value;
  filter.replaceChildren(Object.assign(el('option', '', 'All records'), { value: '' }));
  for (const name of [...new Set((data?.groups || []).map(g => g.taskSet).filter(Boolean))].sort()) {
    filter.append(Object.assign(el('option', '', name), { value: name }));
  }
  filter.value = [...filter.options].some(o => o.value === previous) ? previous : '';
  box.append(el('p', 'perf-note', r.workflow ? `Selected request: ${r.workflow.label} · ${r.workflow.id} @ ${r.workflow.version}${r.workflowConflict ? ' · conflicting profile; excluded from comparison' : ''}` : 'No workflow profile recorded for the selected request.'));
  if (!data?.groups.length) {
    box.append(el('p', 'perf-note', 'No comparable profiles recorded yet. Define roles in .pi/agent-dashboard.workflow.json in your project; subsequent requests are grouped automatically.'));
    return;
  }
  const wrap = el('div', 'comparison-scroll'), table = el('table', 'comparison-table');
  wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Workflow results; scroll horizontally on narrow screens');
  const head = el('tr');
  for (const title of ['Workflow / models', 'Requests', 'Technical completion', 'Avg. duration', 'Avg. reported tokens', 'JUnit results']) head.append(el('th', '', title));
  const thead = el('thead'); thead.append(head); table.append(thead);
  const body = el('tbody');
  for (const group of data.groups.filter(g => !filter.value || g.taskSet === filter.value)) {
    const row = el('tr'), identity = el('td');
    identity.append(el('strong', '', `${group.label} · v${group.version}`), el('small', '', `${group.id} · ${group.taskSet || 'Task set not specified'}`));
    for (const assignment of group.models) identity.append(el('small', '', `${assignment.role}: ${assignment.models.join(', ') || 'No model observed'}`));
    const total = el('td', '', count(group.total));
    total.append(el('small', '', `${group.failed} failed · ${group.cancelled} cancelled · ${group.unknown} unresolved`));
    const ratio = el('td', '', group.terminal ? `${Math.round(group.technicalCompletionRatio * 100)}%` : '—');
    ratio.append(el('small', '', `${group.completed} / ${group.terminal} terminal requests`));
    const elapsed = el('td', '', msDuration(group.meanElapsedMs)); elapsed.append(el('small', '', `${group.durationSamples} samples`));
    const tokens = el('td', '', group.meanReportedTokens === undefined ? '—' : count(Math.round(group.meanReportedTokens))); tokens.append(el('small', '', `${group.tokenSamples} samples`));
    const tests = el('td', 'comparison-evidence'), evidence = group.testEvidence;
    tests.append(el('span', '', evidence?.coveredRuns ? `Reports in ${evidence.coveredRuns} / ${group.total} requests` : 'No reports'));
    for (const set of evidence?.sets || []) tests.append(el('small', '', `${set.suiteHash.slice(0, 8)} · ${set.tests} tests: ${set.passed} passed / ${set.failed} failed / ${set.inconclusive} inconclusive requests`));
    if (evidence?.unusableRuns) tests.append(el('small', '', `${evidence.unusableRuns} requests exceeded the report limit; excluded`));
    row.append(identity, total, ratio, elapsed, tokens, tests); body.append(row);
  }
  table.append(body); wrap.append(table); box.append(wrap);
  const scope = el('details', 'model-result'); scope.append(el('summary', '', 'Measurement scope'));
  scope.append(el('p', 'perf-note', 'Compare the same task set. Duration and token averages include only terminal requests with the relevant measurements; missing data is not zero. Model lists show observed identities, not execution order.'));
  scope.append(el('p', 'perf-note', 'JUnit results are grouped by test-name sets. A matching short ID means the same test names, not identical test code or execution conditions. Missing, empty or entirely skipped reports are not passes.'));
  scope.append(el('p', 'perf-note', `Quality and cost are not measured. ${data.unconfigured} requests without profiles and ${data.conflicted} conflicting or model-limit-exceeded requests are excluded. Only retained records are shown.`));
  box.append(scope);
}
function renderEvidence(r) {
  const box = $('test-evidence'); box.replaceChildren();
  const evidence = r.testEvidence, reports = evidence?.reports || [];
  if (!reports.length) box.append(el('p', 'perf-note', 'No test report attached to this request. After it finishes, use /dashboard-evidence path/to/junit.xml in Pi.'));
  if (evidence?.truncated) box.append(el('p', 'perf-note', 'Report limit exceeded; test results for this request are excluded from comparison.'));
  for (const report of reports) {
    const row = el('article', 'evidence-report'), failed = report.failures + report.errors;
    row.append(el('strong', '', report.file), el('span', `badge ${failed ? 'error' : report.passed ? 'done' : 'unknown'}`, failed ? 'Failed in report' : report.passed ? 'Passed in report' : 'Inconclusive'));
    row.append(el('p', 'perf-note', `${report.tests} tests · ${report.passed} passed · ${report.failures} failed · ${report.errors} errors · ${report.skipped} skipped`));
    const details = el('details', 'model-result'); details.append(el('summary', '', 'Report source and file details'));
    details.append(el('p', '', `JUnit XML · imported by user command\nTest set: ${report.suiteHash}\nSHA-256: ${report.sha256}\nFile: ${report.bytes} bytes · modified: ${report.modifiedAt}\nImported: ${report.importedAt}`));
    row.append(details); box.append(row);
  }
  if (reports.length) box.append(el('p', 'perf-note', 'The latest imported report per file is shown; earlier summaries remain in the activity log. A report alone does not prove execution against the current code or task quality.'));
}
function updateDuration() {
  const { s, r } = selected(); if (!s || !r) return;
  renderControls(s, r, snapshot.control);
  const fresh = s.connected && Date.now() - Date.parse(s.lastSeen) < 30000;
  $('freshness').textContent = fresh ? '● Pi signal is current' : `○ Pi signal stale / offline · ${time(s.lastSeen)}`;
  if (!fresh && r.status === 'running') $('run-status').textContent = 'Disconnected · last state: running';
  else $('run-status').textContent = labels[r.status] || r.status;
  $('metric-duration').textContent = duration(r.startedAt, r.endedAt || (!fresh ? s.lastSeen : undefined));
  $('duration-label').textContent = !fresh && !r.endedAt ? 'At last signal; outcome unknown' : 'Wall-clock duration';
}
function render() {
  if (followSubmission && sessionId === followSubmission.sessionId) {
    const latest = snapshot.sessions.find(s => s.id === sessionId)?.runs.at(-1);
    if (latest && latest.id !== followSubmission.runId) { runId = latest.id; followSubmission = undefined; }
  }
  const { s, r } = selected(); renderSidebar();
  $('project-overview').classList.toggle('hidden', !overview); $('workspace-details').classList.toggle('hidden', overview);
  renderProjects();
  $('back-to-projects').classList.toggle('hidden', overview);
  $('project-name').textContent = overview ? 'My projects' : s?.projectName || 'Pi sessions';
  $('empty').classList.toggle('hidden', Boolean(r)); $('run-content').classList.toggle('hidden', !r);
  const options = s ? [...s.runs].reverse() : [];
  const select = $('run-select'); select.replaceChildren();
  for (const entry of options) { const o = el('option', '', `${time(entry.startedAt)} · ${entry.prompt.slice(0, 32) || 'Request'}`); o.value = entry.id; o.selected = entry.id === runId; select.append(o); }
  if (!options.length) select.append(el('option', '', 'No requests yet'));
  $('storage-warning').classList.toggle('hidden', !snapshot.warnings?.length);
  $('storage-warning').textContent = snapshot.warnings?.join(' · ') || '';
  if (!r) return;
  $('prompt').textContent = r.prompt || 'Request text not reported yet.';
  $('run-status').replaceWith(Object.assign(badge(r.status), { id: 'run-status' }));
  $('run-time').textContent = time(r.startedAt); $('run-id').textContent = `RUN ${r.id.slice(0, 8)}`;
  const subTools = Object.values(r.agents).flatMap(a => a.tools || []);
  $('metric-tools').textContent = count(Object.keys(r.tools).length + subTools.length);
  $('metric-agents').textContent = count(Object.keys(r.agents).length);
  const uses = Object.values(r.usage);
  $('metric-tokens').textContent = uses.length ? count(uses.reduce((sum, u) => sum + (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0), 0)) : '—';
  $('summary').textContent = r.summary || 'No completed text response yet.';
  renderControls(s, r, snapshot.control); renderStages(r); renderModels(s, r); renderPerf(s, r); renderHistory(s); renderEvidence(r); renderWorkflowComparison(s, r); renderTimeline(r); updateDuration();
}
function connect() {
  eventSource?.close();
  eventSource = new EventSource('/api/events');
  eventSource.addEventListener('snapshot', e => {
    try { snapshot = JSON.parse(e.data); $('pairing').classList.add('hidden'); render(); $('last-update').textContent = `Updated ${time(snapshot.now)}`; } catch { $('connection-label').textContent = 'Invalid data'; }
  });
  eventSource.onopen = () => { $('connection-label').textContent = 'Dashboard connected'; $('connection-dot').classList.add('online'); };
  eventSource.onerror = () => { $('connection-label').textContent = 'Reconnecting'; $('connection-dot').classList.remove('online'); };
}
$('back-to-projects').onclick = returnToProjects;
$('project-search').oninput = renderProjects;
$('project-filter').onchange = renderProjects;
$('run-select').onchange = e => { followSubmission = undefined; runId = e.target.value; render(); };
$('event-search').oninput = () => { const { r } = selected(); if (r) renderTimeline(r); };
$('workflow-task-set').onchange = () => { const { s, r } = selected(); if (r) renderWorkflowComparison(s, r); };
setInterval(updateDuration, 1000);
setInterval(renderProjects, 1000);
async function boot() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const controlToken = fragment.get('control-token');
  const token = controlToken || fragment.get('token');
  if (token) {
    history.replaceState(null, '', location.pathname);
    const response = await fetch(controlToken ? '/api/control/login' : '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    if (!response.ok) throw new Error('Pairing failed');
  }
  const response = await fetch('/api/state');
  if (!response.ok) { $('pairing').classList.remove('hidden'); $('connection-label').textContent = 'Pairing required'; return; }
  snapshot = await response.json();
  await initializeControls(receipt => { followSubmission = sessionId === receipt.sessionId ? receipt : undefined; render(); });
  render(); connect();
}
boot().catch(() => { $('pairing').classList.remove('hidden'); $('connection-label').textContent = 'Could not connect'; });
