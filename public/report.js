const reportNode = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const reportId = id => document.getElementById(id);
let reportSource, reportOpen, reportKey = '', reportGroups = [], followToday = true;
const reportOutcomes = { completed: ['done', 'Response finished'], failed: ['error', 'Error'], cancelled: ['cancelled', 'Cancelled'], unknown: ['unknown', 'Ongoing / outcome unknown'] };
const shortReportText = (text, limit = 320) => text.length > limit ? text.slice(0, limit).trimEnd() + '…' : text;
function reportDay(time, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function shiftReportDay(day, offset) {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10);
}
function reportDateLabel(day) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
}
function reportClock(time) {
  return new Date(time).toLocaleTimeString('en-US', { timeZone: reportSource.timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
}
function reportText() {
  const lines = [`Daily report — ${reportDateLabel(reportId('report-date').value)}`, `Report timezone: ${reportSource.timeZone}`, 'Outcomes are agent reports, not independent verification.', ''];
  for (const group of reportGroups) {
    lines.push(group.projectName);
    for (const r of group.records) {
      lines.push(`- ${reportClock(r.firstAt)} · ${reportOutcomes[r.verdict][1]} · ${r.prompt || 'Request text not recorded.'}`);
      for (const outcome of r.accomplishments) lines.push(`  Reported: ${outcome}`);
      if (!r.accomplishments.length) lines.push(`  Recorded response: ${r.summary || 'Outcome text not recorded.'}`);
      if (r.errorMessage) lines.push(`  Error: ${r.errorMessage}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
export function initializeDailyReport(openRequest) {
  reportOpen = openRequest;
  reportId('report-date').onchange = () => { followToday = false; renderDailyReport(reportSource); };
  for (const [id, offset] of [['report-previous', -1], ['report-next', 1]]) reportId(id).onclick = () => {
    if (!reportId('report-date').value) return;
    followToday = false; reportId('report-date').value = shiftReportDay(reportId('report-date').value, offset); renderDailyReport(reportSource);
  };
  reportId('report-today').onclick = () => { followToday = true; renderDailyReport(reportSource); };
  reportId('report-copy').onclick = async () => {
    const text = reportText();
    try { await navigator.clipboard.writeText(text); reportId('report-copy-status').textContent = 'Report copied. Review private content before sharing.'; }
    catch { reportId('report-copy-status').textContent = 'Copy is unavailable. You can select and copy the report text below.'; }
  };
}
function reportResponse(entry, text, expanded) {
  const body = reportNode('p', 'report-response', expanded ? text : shortReportText(text)); entry.append(body);
  if (text.length <= 320) return;
  const button = reportNode('button', 'project-expand report-expand'); button.type = 'button'; button.dataset.action = 'response';
  body.id = `report-response-${encodeURIComponent(entry.dataset.key)}`; button.setAttribute('aria-controls', body.id);
  const update = () => { body.textContent = expanded ? text : shortReportText(text); button.textContent = expanded ? 'Show less' : 'Show more'; button.setAttribute('aria-expanded', String(expanded)); };
  button.onclick = () => { expanded = !expanded; update(); }; update(); entry.append(button);
}
function reportEntry(r, previous) {
  const entry = reportNode('section', 'report-entry'); entry.dataset.key = JSON.stringify([r.sessionId, r.runId]);
  const meta = reportNode('div', 'report-entry-meta'), [tone, label] = reportOutcomes[r.verdict];
  const clock = reportNode('time', '', reportClock(r.firstAt)); clock.dateTime = r.firstAt;
  meta.append(clock, reportNode('span', `badge ${tone}`, label));
  const title = reportNode('h3', '', shortReportText(r.prompt || 'Request text not recorded.', 160)); title.tabIndex = -1;
  entry.append(meta, title, reportNode('p', 'report-label', r.accomplishments.length ? 'Reported outcomes' : 'Recorded response excerpt'));
  if (r.accomplishments.length) {
    const outcomes = reportNode('ul', 'report-outcomes');
    for (const item of r.accomplishments) outcomes.append(reportNode('li', '', item));
    entry.append(outcomes);
    if (r.summary) {
      const response = reportNode('details', 'report-recorded-response'), summary = reportNode('summary', '', 'Recorded response excerpt');
      summary.dataset.action = 'summary'; response.open = previous?.querySelector('details')?.open || false;
      response.append(summary, reportNode('p', 'report-response', r.summary)); entry.append(response);
    }
  } else reportResponse(entry, r.summary || 'Outcome text not recorded.', previous?.querySelector('.report-expand')?.getAttribute('aria-expanded') === 'true');
  if (r.errorMessage) entry.append(reportNode('p', 'project-error report-error', r.errorMessage));
  if (r.detailAvailable) {
    const open = reportNode('button', 'button report-open', 'Open request ↗'); open.type = 'button'; open.dataset.action = 'open';
    open.setAttribute('aria-label', `${r.projectName}: open this request`); open.onclick = () => reportOpen(r.sessionId, r.runId, r.projectId); entry.append(open);
  } else entry.append(reportNode('p', 'report-label', 'Daily excerpt saved; request details are no longer retained.'));
  return entry;
}
export function refreshDailyReport() {
  if (reportSource && reportDay(Date.now(), reportSource.timeZone) !== reportId('report-date').max) renderDailyReport(reportSource);
}
const reportEntryVersions = new WeakMap();
function positionReportNode(parent, node, index) { if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] || null); }
export function renderDailyReport(source) {
  if (!source) return;
  reportSource = { timeZone: source.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, records: source.records || [], limit: source.limit || 1000 };
  const today = reportDay(Date.now(), reportSource.timeZone), date = reportId('report-date');
  date.max = today; if (followToday) date.value = today;
  reportId('report-next').disabled = !date.value || date.value >= today;
  reportId('report-previous').disabled = !date.value;
  const records = reportSource.records.filter(r => !r.demo && r.day === date.value).sort((a, b) => a.firstAt.localeCompare(b.firstAt) || a.sessionId.localeCompare(b.sessionId) || a.runId.localeCompare(b.runId));
  const key = JSON.stringify([date.value, reportSource.timeZone, reportSource.limit, records]);
  if (key === reportKey) return;
  reportKey = key;
  const groups = new Map();
  for (const r of records) {
    const group = groups.get(r.projectId) || { projectId: r.projectId, projectName: r.projectName, records: [] };
    group.records.push(r); groups.set(r.projectId, group);
  }
  reportGroups = [...groups.values()].sort((a, b) => a.projectName.localeCompare(b.projectName, 'en') || a.projectId.localeCompare(b.projectId));
  reportId('report-results').textContent = date.value ? `${reportDateLabel(date.value)} · ${reportGroups.length} projects · ${records.length} recorded requests · ${records.filter(r => r.verdict === 'completed').length} responses finished · ${records.filter(r => r.verdict === 'failed').length} with errors` : 'Select a date to see recorded work.';
  reportId('report-scope').textContent = `Report timezone: ${reportSource.timeZone}. Up to ${reportSource.limit} recent daily/request records are retained. Only monitored work is included; older or uncaptured work may be missing. Responses and outcomes are reports, not proof of code quality or passing tests.`;
  reportId('report-copy').disabled = !records.length;
  reportId('report-copy-status').textContent = '';
  const list = reportId('report-list'), active = document.activeElement;
  const focusedEntry = list.contains(active) ? active.closest('.report-entry')?.dataset.key : undefined, focusedAction = active?.dataset.action;
  if (!records.length) {
    const empty = reportNode('div', 'empty-state');
    empty.append(reportNode('h2', '', 'No recorded work for this day.'), reportNode('p', '', 'Choose another date or work in a monitored Pi project. This does not mean you did nothing; PiScope only knows captured activity.'));
    list.replaceChildren(empty); return;
  }
  // Leave unchanged records in place: other projects' updates must not disturb reading or selection.
  const rows = new Map([...list.querySelectorAll('.report-project')].map(row => [row.dataset.project, row])), retainedRows = new Set();
  for (const [rowIndex, group] of reportGroups.entries()) {
    let row = rows.get(group.projectId);
    if (!row) { row = reportNode('article', 'report-project'); row.dataset.project = group.projectId;
      const heading = reportNode('div', 'report-project-name'); heading.append(reportNode('h2'), reportNode('p'));
      row.append(heading, reportNode('div', 'report-work'));
    }
    retainedRows.add(row); positionReportNode(list, row, rowIndex);
    const name = row.querySelector('h2'), count = row.querySelector('.report-project-name p');
    if (name.textContent !== group.projectName) name.textContent = group.projectName;
    const countText = `${group.records.length} recorded ${group.records.length === 1 ? 'request' : 'requests'}`;
    if (count.textContent !== countText) count.textContent = countText;
    const work = row.querySelector('.report-work'), entries = new Map([...work.children].map(entry => [entry.dataset.key, entry])), retainedEntries = new Set();
    for (const [entryIndex, r] of group.records.entries()) {
      const id = JSON.stringify([r.sessionId, r.runId]); let entry = entries.get(id);
      const version = JSON.stringify([r.day, r.projectName, r.firstAt, r.prompt, r.summary, r.accomplishments, r.errorMessage, r.verdict, r.detailAvailable, reportSource.timeZone]);
      if (!entry || reportEntryVersions.get(entry) !== version) {
        const next = reportEntry(r, entry); reportEntryVersions.set(next, version);
        if (entry) entry.replaceWith(next); entry = next;
      }
      retainedEntries.add(entry); positionReportNode(work, entry, entryIndex);
      if (id === focusedEntry && document.activeElement !== active) (entry.querySelector(`[data-action="${focusedAction}"]`) || entry.querySelector('h3')).focus({ preventScroll: true });
    }
    for (const entry of [...work.children]) if (!retainedEntries.has(entry)) entry.remove();
  }
  for (const row of [...list.children]) if (!retainedRows.has(row)) row.remove();
}
