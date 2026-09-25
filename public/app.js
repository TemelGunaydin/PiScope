const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = String(text); return node; };
let snapshot = { sessions: [] }, sessionId = '', runId = '', demo = false, eventSource;
const labels = { running: 'Çalışıyor', starting: 'İstek gönderildi', pending: 'Bekliyor', idle: 'Yanıt tamamlandı', done: 'Bitti', error: 'Hata', blocked: 'Engellendi', cancelled: 'İptal' };
const time = value => value ? new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const count = n => new Intl.NumberFormat('tr-TR', { notation: n > 99999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
function duration(start, end) { if (!start) return '—'; const n = Math.max(0, Math.floor(((end ? Date.parse(end) : Date.now()) - Date.parse(start)) / 1000)); return n < 60 ? `${n} sn` : `${Math.floor(n / 60)} dk ${n % 60} sn`; }
function modelLabel(model) {
  if (!model) return 'Model henüz bildirilmedi';
  if (/mimo/i.test(model)) return 'MiMo'; if (/qwen/i.test(model)) return 'Qwen'; if (/sol/i.test(model)) return 'Sol';
  if (/glm/i.test(model)) return 'GLM'; return model.split('/').slice(-1)[0];
}
function badge(status) { return el('span', `badge ${status}`, labels[status] || status); }
function filteredSessions() { return snapshot.sessions.filter(s => Boolean(s.demo) === demo); }
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
  $('project-count').textContent = new Set(all.map(s => s.projectId)).size;
  $('sessions').replaceChildren();
  if (!all.length) $('sessions').append(el('p', 'sessions-empty', demo ? 'Demo henüz gönderilmedi.' : 'Henüz oturum bağlanmadı.'));
  for (const s of all) {
    const button = el('button', `session-item ${s.id === sessionId ? 'active' : ''}`); button.type = 'button';
    button.append(el('strong', '', s.projectName), el('small', '', `${s.id.slice(0, 7)} · ${s.runs.length} istek`));
    button.addEventListener('click', () => { sessionId = s.id; runId = ''; render(); });
    $('sessions').append(button);
  }
}
function renderStages(r) {
  $('stages').replaceChildren();
  if (!r.stages.length) $('stages').append(el('p', 'stage-empty', 'Plan henüz bildirilmedi. workflow_report aracı çağrıldığında görev sırası burada görünür. Araç ve model olayları bunun dışında otomatik izlenir.'));
  r.stages.forEach((stage, index) => {
    const box = el('article', `stage ${stage.status}`);
    const heading = el('div', 'stage-index'); heading.append(el('span', '', `${String(index + 1).padStart(2, '0')}`), el('span', '', stage.status === 'done' ? '✓' : stage.status === 'running' ? '●' : stage.status === 'error' ? '!' : '○'));
    box.append(heading, el('h3', '', stage.title), el('p', 'stage-model', stage.agent || modelLabel(stage.model)), el('p', 'stage-status', labels[stage.status]));
    $('stages').append(box);
  });
  $('stage-reason').textContent = r.stageReason || '';
  const next = r.stages.find(s => s.status === 'pending');
  $('next-task').replaceChildren();
  if (next) $('next-task').append(el('span', 'next-arrow', '↗'), el('h3', 'next-task-name', next.title), el('p', 'next-task-model', next.agent || modelLabel(next.model)), el('p', 'next-note', 'Bu bir plan kaydıdır. Modelin gerçekten başlaması ayrı bir Pi olayıyla gösterilir.'));
  else $('next-task').append(el('p', 'next-note', r.stages.length ? 'Bekleyen aşama bildirilmedi. Bu durum tek başına görevin doğrulandığı anlamına gelmez.' : 'Henüz görev sırası bildirilmedi. Tahmini bir sonraki adım gösterilmez.'));
}
function renderModels(s, r) {
  const agents = Object.values(r.agents);
  const active = agents.some(a => ['running', 'starting'].includes(a.status));
  const cards = [{ model: r.model || s.model, agent: 'Ana oturum', status: r.status === 'running' ? (active ? 'pending' : 'running') : r.status,
    task: active ? 'Alt agent sonuçlarını bekliyor.' : 'Ana oturum · planlama, koordinasyon ve yanıt', main: true }];
  // Most recent invocation per agent, without misreporting parallel work as a model switch.
  const byAgent = new Map(); for (const a of agents) byAgent.set(a.agent || a.id, a);
  cards.push(...byAgent.values());
  $('models').replaceChildren();
  for (const card of cards) {
    const label = modelLabel(card.model); const node = el('article', 'model-card'); const heading = el('div', 'model-card-head');
    const avatar = el('div', `model-avatar ${label.toLowerCase()}`, label[0]);
    const name = el('div'); name.append(el('h3', '', label), el('p', 'model-role', card.agent));
    heading.append(avatar, name, badge(card.status));
    node.append(heading, el('span', 'model-id', card.model || 'Alt agent ilerleme olayı bekleniyor'), el('p', 'model-task', card.task || card.summary || 'Görev bilgisi bildirilmedi.'));
    const currentTools = (card.tools || []).filter(t => t.status === 'running');
    node.append(el('p', 'model-source', card.main ? 'Pi ana oturumundan gözlendi' : currentTools.length ? `Aktif: ${currentTools.map(t => t.name + (t.file ? ' · ' + t.file : '')).join(', ')}` : card.modelSource === 'requested' ? 'Talep edilen model; henüz çalıştığı doğrulanmadı' : card.model ? 'Alt agent ilerleme / sonuç kaydından' : 'Model kimliği bekleniyor'));
    if (card.summary) { const details = el('details', 'model-result'); details.append(el('summary', '', 'Alt agent sonucunu gör'), el('p', '', card.summary)); node.append(details); }
    $('models').append(node);
  }
}
function eventPresentation(e) {
  const d = e.data; const title = {
    'prompt.received': 'Yeni istek alındı', 'run.started': 'Ana model çalışmaya başladı',
    'model.selected': 'Ana oturum modeli değişti', 'tool.started': `${d.toolName || 'Araç'} başladı`,
    'tool.finished': `${d.toolName || 'Araç'} ${d.isError ? 'hata döndürdü' : 'tamamlandı'}`,
    'agent.started': `${d.agent || 'Alt agent'} için görev gönderildi`, 'agent.finished': `${d.agent || 'Alt agent'} ${d.isError ? 'başarısız oldu' : 'sonuç döndürdü'}`,
    'message.completed': 'Model yanıtı kaydedildi', 'workflow.updated': 'Görev planı güncellendi',
    'run.ended': d.outcome === 'error' ? 'Ana çalışma hata ile durdu' : d.outcome === 'aborted' ? 'Ana çalışma iptal edildi' : 'Ana model yanıtını bitirdi',
    'run.settled': 'Pi otomatik devam döngüsü sonlandı', 'monitor.warning': 'İzleme uyarısı', 'session.disconnected': 'Pi bağlantısı kapandı'
  }[e.type] || e.type;
  const detail = (e.type === 'agent.finished' ? [d.model, d.summary].filter(Boolean).join('\n') : '') || d.file || d.task || d.reason || d.message || d.model || (['message.completed', 'run.ended'].includes(e.type) ? d.summary : '') || '';
  return { title, detail, icon: e.type.startsWith('agent.') ? '↗' : e.type === 'tool.finished' ? (d.isError ? '!' : '✓') : e.type === 'workflow.updated' ? '≡' : '·' };
}
function renderTimeline(r) {
  const query = $('event-search').value.toLocaleLowerCase('tr');
  const events = [...r.events].reverse().filter(e => { const p = eventPresentation(e); return `${p.title} ${p.detail} ${e.type}`.toLocaleLowerCase('tr').includes(query); });
  $('timeline').replaceChildren();
  if (!events.length) $('timeline').append(el('p', 'event-empty', 'Eşleşen olay yok.'));
  for (const e of events) {
    const p = eventPresentation(e); const item = el('article', `event ${e.type.startsWith('agent.') ? 'agent' : ''} ${e.data.isError ? 'error' : ''}`);
    const body = el('div', 'event-body'), top = el('div', 'event-top');
    top.append(el('span', 'event-title', p.title), el('time', '', time(e.time)));
    body.append(top, el('p', 'event-detail', p.detail), el('p', 'event-kind', `${e.type}${e.type === 'workflow.updated' ? ' · AGENT BİLDİRİMİ' : ' · GÖZLENEN OLAY'}`));
    item.append(el('div', 'event-icon', p.icon), body); $('timeline').append(item);
  }
}
function updateDuration() {
  const { s, r } = selected(); if (!s || !r) return;
  const fresh = s.connected && Date.now() - Date.parse(s.lastSeen) < 30000;
  $('freshness').textContent = demo ? 'Örnek veri' : fresh ? '● Pi sinyali güncel' : `○ Pi sinyali eski / kapalı · ${time(s.lastSeen)}`;
  if (!demo && !fresh && r.status === 'running') $('run-status').textContent = 'Bağlantı yok · son durum: çalışıyor';
  else $('run-status').textContent = labels[r.status] || r.status;
  $('metric-duration').textContent = duration(r.startedAt, r.endedAt || (!fresh && !demo ? s.lastSeen : undefined));
  $('duration-label').textContent = !fresh && !r.endedAt && !demo ? 'Son sinyaldeki süre; sonuç bilinmiyor' : 'Duvar saati süresi';
}
function render() {
  const { s, r } = selected(); renderSidebar();
  $('demo-banner').classList.toggle('hidden', !demo);
  $('live-mode').classList.toggle('selected', !demo); $('demo-mode').classList.toggle('selected', demo);
  $('project-name').textContent = s?.projectName || 'Pi oturumları';
  $('empty').classList.toggle('hidden', Boolean(r)); $('run-content').classList.toggle('hidden', !r);
  const options = s ? [...s.runs].reverse() : [];
  const select = $('run-select'); select.replaceChildren();
  for (const entry of options) { const o = el('option', '', `${time(entry.startedAt)} · ${entry.prompt.slice(0, 32) || 'İstek'}`); o.value = entry.id; o.selected = entry.id === runId; select.append(o); }
  if (!options.length) select.append(el('option', '', 'Henüz istek yok'));
  $('storage-warning').classList.toggle('hidden', !snapshot.warnings?.length);
  $('storage-warning').textContent = snapshot.warnings?.join(' · ') || '';
  if (!r) return;
  $('prompt').textContent = r.prompt || 'İstek metni henüz bildirilmedi.';
  $('run-status').replaceWith(Object.assign(badge(r.status), { id: 'run-status' }));
  $('run-time').textContent = time(r.startedAt); $('run-id').textContent = `RUN ${r.id.slice(0, 8)}`;
  const subTools = Object.values(r.agents).flatMap(a => a.tools || []);
  $('metric-tools').textContent = count(Object.keys(r.tools).length + subTools.length);
  $('metric-agents').textContent = count(Object.keys(r.agents).length);
  const uses = Object.values(r.usage);
  $('metric-tokens').textContent = uses.length ? count(uses.reduce((sum, u) => sum + (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0), 0)) : '—';
  $('summary').textContent = r.summary || 'Henüz tamamlanmış bir metin yanıtı yok.';
  renderStages(r); renderModels(s, r); renderTimeline(r); updateDuration();
}
function connect() {
  eventSource?.close();
  eventSource = new EventSource('/api/events');
  eventSource.addEventListener('snapshot', e => {
    try { snapshot = JSON.parse(e.data); $('pairing').classList.add('hidden'); render(); $('last-update').textContent = `Güncellendi ${time(snapshot.now)}`; } catch { $('connection-label').textContent = 'Geçersiz veri'; }
  });
  eventSource.onopen = () => { $('connection-label').textContent = 'Dashboard bağlı'; $('connection-dot').classList.add('online'); };
  eventSource.onerror = () => { $('connection-label').textContent = 'Yeniden bağlanıyor'; $('connection-dot').classList.remove('online'); };
}
$('live-mode').onclick = () => { demo = false; sessionId = ''; runId = ''; render(); };
$('demo-mode').onclick = () => { demo = true; sessionId = ''; runId = ''; render(); };
$('run-select').onchange = e => { runId = e.target.value; render(); };
$('event-search').oninput = () => { const { r } = selected(); if (r) renderTimeline(r); };
try { document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark'; } catch {}
$('theme').onclick = () => { const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('theme', theme); } catch {} };
setInterval(updateDuration, 1000);
async function boot() {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (token) {
    history.replaceState(null, '', location.pathname);
    const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    if (!response.ok) throw new Error('Pairing failed');
  }
  const response = await fetch('/api/state');
  if (!response.ok) { $('pairing').classList.remove('hidden'); $('connection-label').textContent = 'Eşleştirme gerekli'; return; }
  snapshot = await response.json(); render(); connect();
}
boot().catch(() => { $('pairing').classList.remove('hidden'); $('connection-label').textContent = 'Bağlantı kurulamadı'; });
