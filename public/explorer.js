import { attentionRequests, retainedRequests, searchRequests, workspacePath } from './workspace.js';

const explorerId = id => document.getElementById(id);
const explorerNode = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
let explorerSnapshot, explorerOpen, explorerSaved, explorerKey = '', attentionKey = '', historyLimit = 50;
const historyFields = ['history-query', 'history-project', 'history-model', 'history-verdict', 'history-from', 'history-to'];

function rememberHistoryFilters() {
  try { history.replaceState({ ...history.state, historyFilters: Object.fromEntries(historyFields.map(id => [id, explorerId(id).value])) }, '', location.href); } catch { /* Opaque test/embedded contexts may disable history. */ }
}
export function restoreHistoryFilters(saved) {
  if (!saved || typeof saved !== 'object') return;
  for (const id of historyFields) {
    const value = saved[id], input = explorerId(id);
    if (typeof value !== 'string' || value.length > 4000) continue;
    if (input.tagName === 'SELECT' && ![...input.options].some(o => o.value === value)) input.append(new Option(value, value));
    input.value = value;
  }
  historyLimit = 50;
}

function explorerDate(value) { return value ? new Date(value).toLocaleString('en-US', { timeZone: explorerSnapshot?.dailyReport?.timeZone, dateStyle: 'medium', timeStyle: 'short' }) : 'Time not recorded'; }
function explorerSelect(id, values, all) {
  const select = explorerId(id), current = select.value;
  const signature = JSON.stringify(values);
  if (select.dataset.options === signature) return;
  select.dataset.options = signature; select.replaceChildren(new Option(all, ''));
  for (const [value, label] of values) select.append(new Option(label, value));
  // Keep an explicit filter if its session was evicted during a live update.
  if (current && !values.some(([value]) => value === current)) select.append(new Option('No longer retained', current));
  select.value = current;
}
function explorerCard(item, attention) {
  const card = explorerNode('article', 'request-card');
  card.dataset.project = item.projectId; card.dataset.session = item.sessionId; card.dataset.request = item.runId;
  const heading = explorerNode('div', 'request-card-head'), name = explorerNode('h2', '', item.projectName), badges = explorerNode('div', 'request-badges');
  for (const reason of item.reasons || [item.status === 'running' ? 'Running / last observed' : ({ completed: 'Last request finished', failed: 'Error', cancelled: 'Cancelled', unknown: 'Outcome unknown' }[item.verdict])]) badges.append(explorerNode('span', `badge ${attention ? item.tone : item.verdict === 'failed' ? 'error' : item.verdict === 'completed' ? 'done' : 'unknown'}`, reason));
  heading.append(name, badges);
  const meta = explorerNode('p', 'request-meta', `${explorerDate(item.startedAt)}${item.models?.length ? ' · ' + item.models.join(', ') : ''}`);
  const identities = explorerNode('details', 'request-identities'); identities.append(explorerNode('summary', '', 'Request identity'), explorerNode('p', '', `Project: ${item.projectId}\nSession: ${item.sessionId}\nRequest: ${item.runId}`));
  const prompt = explorerNode('p', 'request-prompt', item.prompt || 'Request text not captured.');
  const response = explorerNode('p', 'request-excerpt', item.errorMessage || item.summary || 'No captured response text.');
  const actions = explorerNode('div', 'request-actions');
  const route = { view: 'request', projectId: item.projectId, sessionId: item.sessionId, runId: item.runId };
  const open = explorerNode('a', 'button', item.retained ? 'Open request' : 'View saved summary');
  open.href = workspacePath(route); open.setAttribute('aria-label', `${item.projectName}: ${item.retained ? 'open request' : 'view saved summary'}`);
  open.onclick = e => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); (item.retained ? explorerOpen : explorerSaved)(item);
  };
  actions.append(open);
  if (!item.retained) actions.append(explorerNode('span', 'request-meta', 'Detailed history has expired.'));
  card.append(heading, meta, prompt, response, identities, actions); return card;
}

export function initializeExplorer({ open, saved }) {
  explorerOpen = open; explorerSaved = saved;
  for (const id of historyFields) {
    explorerId(id).addEventListener(id === 'history-query' ? 'input' : 'change', () => { historyLimit = 50; rememberHistoryFilters(); renderRequestHistory(); });
  }
  explorerId('history-clear').onclick = () => {
    for (const id of historyFields) explorerId(id).value = '';
    historyLimit = 50; rememberHistoryFilters(); renderRequestHistory(); explorerId('history-query').focus();
  };
  explorerId('history-more').onclick = () => { historyLimit += 50; renderRequestHistory(); };
}

export function renderExplorer(snapshot, reads, activeView) {
  explorerSnapshot = snapshot;
  const items = attentionRequests(snapshot.projectOverview?.items || [], snapshot.sessions || [], reads);
  const count = explorerId('attention-count'); count.textContent = String(items.length); count.classList.toggle('hidden', !items.length);
  if (activeView === 'attention') {
    const key = JSON.stringify(items);
    if (key !== attentionKey) {
      attentionKey = key;
      explorerId('attention-list').replaceChildren(...items.map(item => explorerCard(item, true)));
    }
    explorerId('attention-results').textContent = `${items.length} ${items.length === 1 ? 'request needs' : 'requests need'} your attention.`;
    explorerId('attention-empty').classList.toggle('hidden', Boolean(items.length));
  }
  if (activeView === 'history') renderRequestHistory();
}

function renderRequestHistory() {
  if (!explorerSnapshot) return;
  const entries = retainedRequests(explorerSnapshot), names = new Map();
  for (const entry of entries) { const set = names.get(entry.projectName) || new Set(); set.add(entry.projectId); names.set(entry.projectName, set); }
  const projects = [...new Map(entries.map(r => [r.projectId, r.projectName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'en') || a[0].localeCompare(b[0]));
  explorerSelect('history-project', projects.map(([id, name]) => [id, names.get(name).size > 1 ? `${name} · ${id}` : name]), 'All projects');
  explorerSelect('history-model', [...new Set(entries.flatMap(r => r.models))].sort().map(model => [model, model]), 'All observed models');
  const filters = Object.fromEntries([['query', 'history-query'], ['projectId', 'history-project'], ['model', 'history-model'], ['verdict', 'history-verdict'], ['from', 'history-from'], ['to', 'history-to']].map(([key, id]) => [key, explorerId(id).value]));
  const invalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  explorerId('history-date-error').classList.toggle('hidden', !invalid);
  const matches = invalid ? [] : searchRequests(entries, filters, explorerSnapshot.dailyReport?.timeZone);
  const visible = matches.slice(0, historyLimit), key = JSON.stringify(visible);
  if (key !== explorerKey) { explorerKey = key; explorerId('history-list').replaceChildren(...visible.map(item => explorerCard(item, false))); }
  explorerId('history-results').textContent = `${matches.length} matching ${matches.length === 1 ? 'request' : 'requests'} · Showing ${visible.length} of ${entries.length} retained requests.`;
  explorerId('history-zone').textContent = `Dates use ${explorerSnapshot.dailyReport?.timeZone || 'your browser timezone'}.`;
  explorerId('history-more').classList.toggle('hidden', visible.length >= matches.length);
  explorerId('history-empty').classList.toggle('hidden', Boolean(matches.length) || invalid);
}
