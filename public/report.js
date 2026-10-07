const reportNode = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const reportId = id => document.getElementById(id);
let reportSource, reportSessions = [], reportControl, reportAvailability, reportSummary, followToday = true, reportDraft, reportSending = false, reportLoading = false, reportDate = '', reportAwaitedId, reportTargetId, reportChosen = false;
const reportVersions = new WeakMap();
function reportDay(time, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function reportDateLabel(day) { return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }); }
function shiftReportDay(day, offset) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
function reportState() { renderDailyReport(reportSource, reportSessions, reportControl); }
function cancelReport() { reportDraft = undefined; reportId('report-review').classList.add('hidden'); }
function reportSessionState(s) {
  const state = reportAvailability(s, s?.runs.at(-1), reportControl);
  if (state.code !== 'ready') return state;
  return reportControl.agents.find(a => a.sessionId === s.id)?.canReport ? state : { code: 'extension', reason: 'Daily reporting is unavailable in this session. The extension may be outdated, TypeBox unavailable, or prompt capture disabled.' };
}
function reportTarget() {
  const sessions = reportSessions.filter(s => !s.demo && (s.connected || s.id === reportTargetId)).sort((a, b) => a.projectName.localeCompare(b.projectName, 'en') || a.id.localeCompare(b.id));
  const selected = sessions.find(s => s.id === reportTargetId), rank = { ready: 0, extension: 1, busy: 2, offline: 3, no_run: 4 };
  const best = sessions.reduce((best, s) => !best || (rank[reportSessionState(s).code] ?? 5) < (rank[reportSessionState(best).code] ?? 5) ? s : best, undefined);
  const s = selected && (reportChosen || reportSessionState(selected).code === 'ready') ? selected : best;
  if (s) reportTargetId = s.id;
  const records = reportSource?.records?.filter(r => !r.demo && r.day === reportId('report-date').value) || [];
  const captured = records.some(r => r.summary || r.accomplishments?.length || r.prompt && r.prompt !== '[Prompt capture disabled]');
  const pending = reportSource?.summaries?.some(r => r.scope === 'all' && r.day === reportId('report-date').value && ['queued', 'generating'].includes(r.status));
  let state = reportSessionState(s);
  if (!['collector_off', 'view_only'].includes(state.code)) {
    if (pending) state = { code: 'pending', reason: 'A daily report is already pending. Wait for Pi to finish; do not submit another request.' };
    else if (!captured) state = { code: 'no_context', reason: 'No captured work text is available for this day. This does not mean nothing was done.' };
  }
  return { sessions, s, r: s?.runs.at(-1), ...state };
}
const reportGuidance = {
  ready: { title: 'Ready to generate', badge: 'Ready', tone: 'ready', steps: [] },
  collector_off: { title: 'Enable report generation in PiScope', badge: 'Setup needed', steps: [{ text: 'Restart PiScope with control enabled, preserving your existing Tailscale settings.', code: 'AGENT_DASHBOARD_CONTROL=1 npm start' }] },
  view_only: { title: 'Pair this browser for generation', badge: 'Viewing only', steps: [{ text: 'Open the private Control pairing link printed in the PiScope terminal in a fresh tab. The viewing link cannot send model requests.' }] },
  no_run: { title: 'Choose a Pi session with a finished request', badge: 'Session needed', steps: [{ text: 'Open Pi in a monitored project or select another connected session. Generation needs a current, finished and settled request.' }] },
  offline: { title: 'Enable control in the selected Pi session', badge: 'Setup needed', steps: [{ text: 'Keep that Pi session open and enable local control there.', code: '/dashboard-control on' }, { text: 'If the session disconnected, reopen Pi and select its connected session. No permissions are enabled automatically.' }] },
  extension: { title: 'Enable daily reporting in this Pi session', badge: 'Update needed', steps: [{ text: 'Update ONLY the selected project’s extension. Run this from the PiScope directory, replacing the example path.', code: 'npm run install:pi -- "/absolute/path/to/selected-project" --update' }, { text: 'Restart Pi in that project; /reload may keep old modules. Then enable local control.', code: '/dashboard-control on' }, { text: 'Generation needs prompt capture. If you keep it disabled, choose another permitted session. Other projects do not need an extension update for their saved work to be included.' }] },
  busy: { title: 'Wait for the selected Pi session', badge: 'Busy', tone: 'working', steps: [{ text: 'Let its current request finish, or choose another ready session. PiScope will not interrupt or steer active work.' }] },
  stale: { title: 'The selected Pi request changed', badge: 'Not current', steps: [{ text: 'Wait for the latest request to settle. If you navigated Pi’s session tree, enable local control again and select the current session.' }] },
  limited: { title: 'Renew local control in Pi', badge: 'Control paused', steps: [{ text: 'Turn local control off, then explicitly enable it again in the selected Pi session.', code: '/dashboard-control off\n/dashboard-control on' }] },
  reserved: { title: 'Check the request already sent to Pi', badge: 'Check Pi', steps: [{ text: 'Inspect the Pi terminal or its receipt before trying again. Input delivery is not proof of a completed report.' }] },
  pending: { title: 'Waiting for your daily report', badge: 'In progress', tone: 'working', steps: [{ text: 'Keep Pi open. The completed report will appear below automatically; no additional approval or request is needed.' }] },
  no_context: { title: 'Choose a day with captured work', badge: 'No context', steps: [{ text: 'Pick another date or continue ordinary work in a monitored project. Missing or expired history cannot be reconstructed.' }] }
};
function renderReportReadiness(target) {
  const code = reportSending ? 'sending' : reportLoading ? 'loading' : target.code;
  const guidance = code === 'sending' ? { title: 'Sending your approved request', badge: 'Sending', tone: 'working', steps: [] } : code === 'loading' ? { title: 'Preparing your exact prompt', badge: 'Preparing', tone: 'working', steps: [] } : reportGuidance[code];
  const panel = reportId('report-readiness'); panel.dataset.state = guidance.tone || 'setup';
  reportText('report-readiness-title', guidance.title); reportText('report-ready-badge', guidance.badge);
  reportId('report-ready-badge').dataset.state = guidance.tone || 'setup';
  reportText('report-availability', code === 'sending' ? 'Input delivery is not completion. Waiting for Pi to acknowledge your request.' : code === 'loading' ? 'No model work has started. You will review and approve the prompt first.' : target.reason || 'One request covers all projects. Review the exact prompt before any model work starts.');
  const steps = reportId('report-setup-steps'), signature = JSON.stringify(guidance.steps);
  if (steps.dataset.steps !== signature) {
    steps.dataset.steps = signature; steps.replaceChildren();
    for (const step of guidance.steps) { const item = reportNode('li', '', step.text); if (step.code) item.append(reportNode('code', 'report-setup-command', step.code)); steps.append(item); }
  }
  steps.classList.toggle('hidden', !guidance.steps.length);
}
async function reviewReport() {
  const target = reportTarget(); if (target.reason || reportSending || reportLoading) return;
  reportChosen = true;
  const day = reportId('report-date').value;
  const request = { id: crypto.randomUUID(), projectId: target.s.projectId, sessionId: target.s.id, runId: target.r.id, reportDay: day };
  reportLoading = true; reportState();
  try {
    const response = await fetch('/api/control/report-preview?' + new URLSearchParams(request));
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Preview unavailable');
    if (reportId('report-date').value !== day || reportTargetId !== request.sessionId) return;
    reportDraft = { ...request, expectedPrompt: result.prompt, expectedSourceHash: result.sourceHash };
    reportText('report-review-target', `All tracked projects (${result.totalProjects})`);
    reportText('report-review-date', `${reportDateLabel(day)} · ${reportSource.timeZone}`);
    reportText('report-review-model', result.model);
    reportText('report-review-session', `${result.projectName} · session ${request.sessionId.slice(0, 7)}`);
    reportText('report-review-scope', `Context included: ${result.includedProjects} of ${result.totalProjects} tracked projects · ${result.included} of ${result.total} retained work records. Excerpts are shortened; omitted work may not appear in the report.`);
    reportId('report-review-prompt').textContent = result.prompt;
    reportId('report-review-prompt').scrollTop = 0; reportId('report-review-details').open = false;
    reportId('report-review').classList.remove('hidden');
    reportId('report-review').scrollIntoView({ block: 'start' }); reportId('report-review-heading').focus({ preventScroll: true });
  } catch (error) { reportId('report-copy-status').textContent = `Could not prepare report: ${error.message}`; }
  finally { reportLoading = false; reportState(); }
}
export function initializeDailyReport(availability) {
  reportAvailability = availability;
  reportId('report-date').onchange = () => { followToday = false; cancelReport(); reportState(); };
  for (const [id, offset] of [['report-previous', -1], ['report-next', 1]]) reportId(id).onclick = () => {
    if (!reportId('report-date').value) return;
    followToday = false; cancelReport(); reportId('report-date').value = shiftReportDay(reportId('report-date').value, offset); reportState();
  };
  reportId('report-today').onclick = () => { followToday = true; cancelReport(); reportState(); };
  reportId('report-session').onchange = () => { reportChosen = true; reportTargetId = reportId('report-session').value; cancelReport(); reportState(); };
  reportId('report-generate').onclick = reviewReport;
  reportId('report-cancel').onclick = () => { cancelReport(); reportId('report-generate').focus(); };
  reportId('report-confirm').onclick = async () => {
    if (!reportDraft || reportSending || reportTarget().reason) return;
    const request = reportDraft; reportSending = true; reportState();
    try {
      const response = await fetch('/api/control/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request rejected');
      cancelReport();
      if (reportId('report-date').value === request.reportDay) { reportAwaitedId = request.id; reportId('report-copy-status').textContent = 'Sent to Pi. Waiting for the daily report; input delivery is not completion.'; }
    } catch (error) { reportId('report-copy-status').textContent = `Not confirmed: ${error.message}. Check Pi before retrying. The same request ID is retained.`; }
    finally { reportSending = false; reportState(); }
  };
  reportId('report-copy').onclick = async () => {
    const r = reportSummary; if (!r?.summary) return;
    const lines = [`Daily report — ${reportDateLabel(reportId('report-date').value)}`, `Report timezone: ${reportSource.timeZone}`, 'All tracked projects. AI-generated from captured work; not independent verification.', ''];
    if (r.status !== 'ready') lines.push(`Previous generated report; latest generation status: ${r.status}.`);
    lines.push(r.summary);
    if (r.remaining) lines.push('Remaining / blocked:', r.remaining);
    if (r.stale) lines.push('Projects or recorded context changed after this report.');
    lines.push(`Context: ${r.contentIncludedProjects} of ${r.contentTotalProjects} tracked projects; ${r.contentIncluded} of ${r.contentTotal} retained records, with shortened excerpts.`);
    try { await navigator.clipboard.writeText(lines.join('\n')); reportId('report-copy-status').textContent = 'Report copied. Review private content before sharing.'; }
    catch { reportId('report-copy-status').textContent = 'Copy is unavailable. Select and copy the generated report below.'; }
  };
}
export function refreshDailyReport() { if (reportSource) reportState(); }
function reportText(id, text) { if (reportId(id).textContent !== text) reportId(id).textContent = text; }
export function renderDailyReport(source, sessions = reportSessions, control = reportControl) {
  if (!source) return;
  reportSource = source; reportSessions = sessions || []; reportControl = control || { enabled: false, agents: [] };
  const date = reportId('report-date'), today = reportDay(Date.now(), source.timeZone);
  if (date.max !== today) date.max = today;
  if (followToday && date.value !== today && document.activeElement !== date) date.value = today;
  if (reportDate !== date.value) { reportDate = date.value; reportAwaitedId = undefined; cancelReport(); reportId('report-copy-status').textContent = ''; }
  const awaited = source.summaries?.find(r => r.scope === 'all' && r.id === reportAwaitedId);
  if (awaited && !['queued', 'generating'].includes(awaited.status)) {
    reportAwaitedId = undefined;
    reportText('report-copy-status', awaited.status === 'ready' ? 'Generated daily report is ready.' : 'Generation did not finish successfully. See the report status; check Pi before trying again.');
  }
  reportId('report-next').disabled = !date.value || date.value >= today; reportId('report-previous').disabled = !date.value;
  const r = reportSummary = source.summaries?.find(r => r.scope === 'all' && r.day === date.value);
  const records = source.records?.filter(r => !r.demo && r.day === date.value) || [];
  reportText('report-results', date.value ? `${reportDateLabel(date.value)} · ${source.projects?.length || 0} tracked projects · ${records.length} retained records` : 'Select a date to see the daily report.');
  reportId('report-copy').disabled = !r?.summary;
  reportText('report-scope', `Report timezone: ${source.timeZone}. One approved request summarizes the selected day across all tracked projects using one idle Pi session’s current model. Context is bounded and may be incomplete; no recorded activity does not mean nothing was done. AI reports are not independent proof of work or passing tests. No automatic model calls.`);
  reportId('report-confirm').disabled = reportSending || !reportDraft || Boolean(reportDraft && reportTarget().reason);
  reportId('report-cancel').disabled = reportSending;
  const target = reportTarget(), select = reportId('report-session');
  const options = target.sessions.map(s => [s.id, `${s.projectName} · ${s.model || 'Pi model'} · ${s.id.slice(0, 7)} · ${reportGuidance[reportSessionState(s).code].badge}`]), signature = JSON.stringify(options);
  if (select.dataset.options !== signature) { select.dataset.options = signature; select.replaceChildren(); if (!options.length) select.append(reportNode('option', '', 'No connected Pi sessions')); for (const [value, text] of options) { const option = reportNode('option', '', text); option.value = value; select.append(option); } }
  if (target.s && select.value !== target.s.id) select.value = target.s.id;
  select.disabled = reportSending || reportLoading || !options.length;
  reportText('report-model', target.s?.model || target.r?.model || 'No model selected');
  reportText('report-engine-context', target.s ? `${target.s.projectName} · session ${target.s.id.slice(0, 7)}${reportChosen ? ' · selected by you' : ' · automatically selected'}` : 'Open Pi in one monitored project to provide the model.');
  reportText('report-engine-hint', `This chooses the model, not a project filter. All ${source.projects?.length || 0} tracked projects are considered; their Pi sessions may be closed.`);
  reportId('report-generate').disabled = reportSending || reportLoading || Boolean(target.reason);
  reportId('report-generate').setAttribute('aria-busy', String(reportSending || reportLoading));
  reportText('report-generate', reportSending ? 'Sending…' : reportLoading ? 'Preparing preview…' : 'Generate report');
  renderReportReadiness(target);
  const list = reportId('report-list');
  if (!list.children.length) {
    const content = reportNode('article', 'report-summary report-generated');
    for (const [tag, id, cls] of [['p', 'report-kind', 'report-label'], ['div', 'report-body', ''], ['p', 'report-meta', 'report-label'], ['p', 'report-stale', 'notice hidden'], ['p', 'report-job-status', 'report-label']]) { const node = reportNode(tag, cls); node.id = id; content.append(node); }
    list.append(content);
  }
  const body = reportId('report-body'), version = JSON.stringify([date.value, r?.summary, r?.remaining, Boolean(records.length)]);
  if (reportVersions.get(body) !== version) {
    reportVersions.set(body, version); body.replaceChildren();
    if (r?.summary) {
      body.append(reportNode('p', 'report-response', r.summary));
      if (r.remaining) body.append(reportNode('h3', 'report-remaining-heading', 'Remaining / blocked'), reportNode('p', 'report-response', r.remaining));
    } else body.append(reportNode('p', 'report-response', records.length ? 'No daily report generated yet. Use Generate report once to summarize all tracked projects.' : 'No recorded work for this day. Choose another date; uncaptured work cannot be reconstructed.'));
  }
  reportText('report-kind', r?.summary ? r.status === 'ready' ? 'AI-generated daily report' : 'Previous generated daily report' : '');
  reportText('report-meta', r?.summary ? `${r.model || 'Pi model'} · ${new Date(r.generatedAt).toLocaleString('en-US', { timeZone: source.timeZone })} · ${r.contentIncludedProjects} of ${r.contentTotalProjects} tracked projects; ${r.contentIncluded} of ${r.contentTotal} retained records; shortened excerpts` : '');
  reportId('report-stale').classList.toggle('hidden', !r?.stale); reportText('report-stale', 'Projects or recorded context changed. Generate again to update this report.');
  const status = r && r.status !== 'ready' ? ['queued', 'generating'].includes(r.status) ? 'Waiting for Pi to generate the daily report…' : r.errorMessage || 'Generation is unresolved. Check Pi before trying again.' : '';
  reportId('report-job-status').classList.toggle('project-error', r?.status === 'failed'); reportText('report-job-status', status);
}
