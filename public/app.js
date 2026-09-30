const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = String(text); return node; };
let snapshot = { sessions: [] }, sessionId = '', runId = '', demo = false, overview = true, eventSource, projectRenderKey = '';
const labels = { running: 'Çalışıyor', starting: 'İstek gönderildi', pending: 'Bekliyor', idle: 'Yanıt tamamlandı', done: 'Bitti', error: 'Hata', blocked: 'Engellendi', cancelled: 'İptal', unknown: 'Sonuç bilinmiyor' };
const time = value => value ? new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const count = n => new Intl.NumberFormat('tr-TR', { notation: n > 99999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
function duration(start, end) { if (!start) return '—'; const n = Math.max(0, Math.floor(((end ? Date.parse(end) : Date.now()) - Date.parse(start)) / 1000)); return n < 60 ? `${n} sn` : `${Math.floor(n / 60)} dk ${n % 60} sn`; }
function modelLabel(model) {
  if (!model) return 'Model henüz bildirilmedi';
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
  return el('span', 'badge unknown', 'Sonuç bilinmiyor / bitiş bekleniyor');
}
const invocationLabels = { finished: ['done', 'Bitti'], failed: ['error', 'Hata'], unresolved: ['idle', 'Sonuçsuz'] };
const msDuration = ms => ms === undefined ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} sn` : `${Math.floor(ms / 60000)} dk ${Math.round((ms % 60000) / 1000)} sn`;
const tokenLabel = u => u ? `${count((u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0))} token` : '—';
function filteredSessions() { return snapshot.sessions.filter(s => Boolean(s.demo) === demo); }
const projectStates = { running: ['running', 'Çalışıyor'], waiting: ['pending', 'Bekleyen iş'], attention: ['error', 'İlgilenilmeli'], finished: ['idle', 'Son istek bitti'], cancelled: ['cancelled', 'İptal'], unknown: ['unknown', 'Sonuç bilinmiyor'] };
const fullDate = value => new Date(value).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const excerpt = (text, max) => text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
function sinceWork(value, now) {
  if (!value) return 'Henüz çalışma kaydı yok';
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  return minutes < 1 ? 'Az önce' : minutes < 60 ? `${minutes} dakika önce` : minutes < 1440 ? `${Math.floor(minutes / 60)} saat önce` : `${Math.floor(minutes / 1440)} gün önce`;
}
function projectsNow() {
  const now = Date.now();
  return (snapshot.projectOverview?.items || []).filter(p => Boolean(p.demo) === demo).map(p => {
    // Expire the working badge even if the collector or tab stops receiving SSE.
    const activeSessions = (p.activeUntil || []).filter(until => until > now).length;
    return { ...p, activeSessions, status: activeSessions ? 'running' : p.idleStatus,
      stale: Boolean(p.lastWorkedAt && now - Date.parse(p.lastWorkedAt) >= 7 * 86400000), ago: sinceWork(p.lastWorkedAt, now) };
  });
}
function renderProjects() {
  if (!overview) return;
  const projects = projectsNow(), query = $('project-search').value.trim().toLocaleLowerCase('tr'), filter = $('project-filter').value;
  // Heartbeats should not replace focused cards or collapse their saved summaries.
  const key = JSON.stringify([demo, query, filter, projects.map(({ activeUntil, ...p }) => p)]);
  if (key === projectRenderKey) return;
  projectRenderKey = key;
  $('project-totals').replaceChildren();
  for (const [label, total] of [['Kayıtlı proje', projects.length], ['Çalışıyor', projects.filter(p => p.status === 'running').length], ['Bekleyen iş', projects.filter(p => p.status === 'waiting').length], ['7+ gündür dokunulmadı', projects.filter(p => p.stale).length]]) {
    const metric = el('article'); metric.append(el('span', 'metric-label', label), el('strong', '', count(total))); $('project-totals').append(metric);
  }
  const matches = projects.filter(p => (!filter || (filter === 'stale' ? p.stale : p.status === filter)) &&
    `${p.projectName} ${p.latest?.prompt || ''} ${p.latest?.summary || ''} ${p.nextStep?.title || ''}`.toLocaleLowerCase('tr').includes(query));
  $('project-results').textContent = `${matches.length} proje gösteriliyor · Son çalışmaya göre`;
  const list = $('project-list'), expanded = new Set([...list.querySelectorAll('details[open]')].map(d => d.dataset.project));
  const focus = document.activeElement, focusedProject = list.contains(focus) ? focus.closest('[data-project]')?.dataset.project : undefined;
  const focusedTag = focus?.tagName;
  list.replaceChildren();
  if (!matches.length) {
    const empty = el('div', 'empty-state');
    empty.append(el('h2', '', projects.length ? 'Eşleşen proje yok.' : 'Projelerin burada birikecek.'),
      el('p', '', projects.length ? 'Aramayı veya durum filtresini değiştir.' : demo ? 'Örnek projeleri görmek için terminalde npm run demo -- --fast çalıştır.' : 'Pi’de izleme eklentisi kurulu bir projede çalışmaya başla. Geri geldiğinde son istek ve bildirilen plan burada kalır.'));
    if (!projects.length && !demo) empty.append(el('code', '', 'npm run install:pi -- /tam/yol/projen'));
    list.append(empty);
  }
  for (const p of matches) {
    const card = el('article', 'project-card'); card.dataset.project = p.projectId;
    const heading = el('div', 'project-card-head'), [tone, label] = projectStates[p.status] || projectStates.unknown;
    heading.append(el('h2', '', p.projectName), el('span', `badge ${tone}`, label));
    const when = el('p', 'project-when');
    if (p.lastWorkedAt) { const date = el('time', '', `${p.ago} · ${fullDate(p.lastWorkedAt)}`); date.dateTime = p.lastWorkedAt; when.append(date); }
    else when.textContent = p.ago;
    if (p.activeSessions) when.append(el('span', '', ` · ${p.activeSessions} çalışan oturum`));
    card.append(heading, when, el('p', 'project-field-label', 'Son istek'), el('p', 'project-prompt', excerpt(p.latest?.prompt || 'İstek metni kaydedilmedi.', 220)),
      el('p', 'project-field-label', 'Son yanıt'), el('p', 'project-answer', excerpt(p.latest?.summary || 'Yanıt özeti kaydedilmedi.', 220)));
    const next = el('div', 'project-next');
    next.append(el('span', 'project-field-label', 'Devam edilecek · bildirilen plan'), el('p', '', p.nextStep?.title || 'Bekleyen adım bildirilmedi.'));
    if (p.pendingCount > 1) next.append(el('small', '', `${p.pendingCount} bitmemiş aşama`));
    card.append(next);
    if (p.latest?.prompt || p.latest?.summary) {
      const details = el('details', 'project-saved'); details.dataset.project = p.projectId; details.open = expanded.has(p.projectId);
      details.append(el('summary', '', 'Kayıtlı özeti oku'), el('p', 'project-field-label', 'Son istek'), el('p', '', p.latest.prompt || 'Metin kaydedilmedi.'),
        el('p', 'project-field-label', 'Son yanıt'), el('p', '', p.latest.summary || 'Yanıt kaydedilmedi.'));
      card.append(details);
    }
    if (p.detailAvailable) {
      const button = el('button', 'button project-open', 'Son isteğe git ↗'); button.type = 'button'; button.setAttribute('aria-label', `${p.projectName}: son isteğe git`);
      button.onclick = () => { sessionId = p.latest.sessionId; runId = p.latest.runId; overview = false; render(); $('detail-heading').focus(); };
      card.append(button);
    } else if (p.latest) card.append(el('p', 'project-archive', 'Özet saklanıyor; ayrıntılı olay kaydı artık tutulmuyor.'));
    list.append(card);
    if (focusedProject === p.projectId && ['SUMMARY', 'BUTTON'].includes(focusedTag)) card.querySelector(focusedTag.toLowerCase())?.focus({ preventScroll: true });
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
  $('project-count').textContent = (snapshot.projectOverview?.items || []).filter(p => Boolean(p.demo) === demo).length;
  $('overview-button').classList.toggle('active', overview); $('overview-button').setAttribute('aria-pressed', String(overview));
  $('sessions').replaceChildren();
  if (!all.length) $('sessions').append(el('p', 'sessions-empty', demo ? 'Demo henüz gönderilmedi.' : 'Henüz oturum bağlanmadı.'));
  for (const s of all) {
    const button = el('button', `session-item ${!overview && s.id === sessionId ? 'active' : ''}`); button.type = 'button';
    button.append(el('strong', '', s.projectName), el('small', '', `${s.id.slice(0, 7)} · ${s.runs.length} istek`));
    button.addEventListener('click', () => { sessionId = s.id; runId = ''; overview = false; render(); });
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
  // Only the observed agent.finished mark settles an invocation: an agent
  // without it keeps the main session waiting, whatever its progress-only
  // status literal claims.
  const active = agents.some(a => !a.finished);
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
    heading.append(avatar, name, cardBadge(card));
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
    'message.completed': 'Model yanıtı kaydedildi', 'workflow.updated': 'Görev planı güncellendi', 'workflow.configured': 'Workflow profili kaydedildi',
    'tests.recorded': 'JUnit test raporu eklendi',
    'run.ended': d.outcome === 'error' ? 'Ana çalışma hata ile durdu' : d.outcome === 'aborted' ? 'Ana çalışma iptal edildi' : d.outcome === 'idle' ? 'Ana model yanıtını bitirdi' : d.outcome ? `Ana çalışma bilinmeyen bir sonuçla durdu (${d.outcome})` : 'Ana çalışma sonuç bilgisi olmadan durdu',
    'run.settled': 'Pi otomatik devam döngüsü sonlandı', 'monitor.warning': 'İzleme uyarısı', 'session.disconnected': 'Pi bağlantısı kapandı'
  }[e.type] || e.type;
  const reportDetail = e.type === 'tests.recorded' ? `${d.evidence.file} · ${d.evidence.passed} geçti / ${d.evidence.failures + d.evidence.errors} başarısız / ${d.evidence.skipped} atlandı · SHA-256 ${d.evidence.sha256.slice(0, 12)}` : '';
  const detail = reportDetail || (e.type === 'workflow.configured' ? `${d.workflow.label} · ${d.workflow.id} @ ${d.workflow.version}` : '') || (e.type === 'agent.finished' ? [d.model, d.summary].filter(Boolean).join('\n') : '') || d.file || d.task || d.reason || d.message || d.model || (['message.completed', 'run.ended'].includes(e.type) ? d.summary : '') || '';
  return { title, detail, icon: e.type.startsWith('agent.') ? '↗' : e.type === 'tool.finished' ? (d.isError ? '!' : '✓') : e.type === 'workflow.updated' ? '≡' : '·' };
}
function renderPerf(s, r) {
  const p = r.performance, box = $('perf'); box.replaceChildren();
  if (!p) return;
  const verdicts = { completed: ['completed', 'Teknik tamamlanma'], failed: ['error', 'Hata ile sonuçlandı'], cancelled: ['cancelled', 'İptal edildi'], unknown: ['unknown', 'Sonuç bilinmiyor'] };
  const [tone, title] = verdicts[p.verdict];
  const head = el('div', 'perf-verdict');
  head.append(el('span', `perf-dot ${tone}`), el('strong', '', title));
  if (p.verdict === 'completed') head.append(el('span', 'tag', 'KALİTE / TEST DOĞRULANMADI'));
  box.append(head);
  const notes = [];
  if (p.verdict === 'completed') notes.push('Teknik tamamlanma: gözlenen olaylarda istek sona erdi ve tüm alt agent çağrıları hatasız bitti. Görevin doğru yapıldığı veya testlerin geçtiği anlamına gelmez.');
  if (p.verdict === 'failed') notes.push(p.outcome === 'error' ? 'Ana çalışma hata ile durdu (run.ended: error gözlendi).' : 'Ana oturum yanıtı sona erdi; ancak en az bir alt agent çağrısı hata döndürdü — istek başarı sayılmaz.');
  if (p.verdict === 'cancelled') notes.push('Ana çalışma iptal edildi (run.ended: aborted gözlendi).');
  if (p.verdict === 'unknown') {
    if (!p.outcome) notes.push(p.settled ? 'Otomatik devam döngüsü sona erdi; ancak run.ended kaydı gözlenmedi, kesin sonuç yok.' : 'run.ended henüz gözlenmedi; istek sonucu bilinmiyor.');
    else if (p.outcome !== 'idle') notes.push(p.outcome === 'unknown' ? 'run.ended sonucu boş veya eksik geldi; bilinen bir terminal sonuç yok, istek başarı sayılmaz.' : `run.ended sonucu "${p.outcome}" bilinen bir terminal sonuç değil; istek başarı sayılmaz.`);
    if (p.agents.unresolved) notes.push(`${count(p.agents.unresolved)} alt agent çağrısı başlamış ama bitmemiş; başarı sayılmaz.`);
    if (!p.fresh) notes.push('Pi sinyali güncel değil; son durum belirsiz.');
  }
  for (const note of notes) box.append(el('p', 'perf-note', note));
  const rows = el('div', 'perf-rows');
  const row = (label, value) => { const line = el('div', 'perf-row'); line.append(el('span', '', label), el('strong', '', value)); rows.append(line); };
  row('Alt agent çağrıları', `${count(p.agents.finished)} bitti · ${count(p.agents.failed)} başarısız · ${count(p.agents.unresolved)} sonuçsuz`);
  row('Araç hataları (gözlenen)', p.toolFailureCount ? count(p.toolFailureCount) : 'Yok');
  box.append(rows);
  if (p.toolFailures.length) box.append(el('p', 'perf-note', `Hatalı araçlar: ${p.toolFailures.map(t => t.name + (t.file ? ' · ' + t.file : '')).join(', ')}`));
  if (p.invocations.length) {
    box.append(el('p', 'perf-sub', 'Çağrı bazlı geçen süre · bildirilen token'));
    const list = el('ul', 'perf-list');
    for (const i of p.invocations) {
      const item = el('li', 'perf-item'), main = el('div', 'perf-item-main'), meta = el('div', 'perf-item-meta');
      main.append(el('strong', '', i.agent || 'Bilinmeyen agent'), el('small', '', [modelLabel(i.model), i.task].filter(Boolean).join(' · ') || 'Görev bilgisi yok'));
      const [statusTone, statusText] = invocationLabels[i.status];
      meta.append(el('span', `badge ${statusTone}`, statusText), el('span', '', msDuration(i.elapsedMs)), el('span', '', tokenLabel(i.usage)));
      item.append(main, meta); list.append(item);
    }
    box.append(list);
    if (p.invocationsTotal > p.invocations.length) box.append(el('p', 'perf-note', `Son ${count(p.invocations.length)} çağrı gösteriliyor (toplam ${count(p.invocationsTotal)} kayıt).`));
  }
  box.append(el('p', 'perf-note', 'Bildirilen plan aşamaları (workflow_report) bu ölçüme dahil edilmez; “Görev akışı” bölümünde ayrı gösterilir. Araç sonucu, model yanıtı veya agent raporu test/kalite doğrulaması değildir.'));
}
function renderHistory(s) {
  const box = $('history'); box.replaceChildren();
  const project = (snapshot.projects || []).find(p => p.projectId === s.projectId);
  const h = project ? project[demo ? 'demo' : 'live'] : null;
  if (!h || !h.total) {
    box.append(el('p', 'perf-note', demo ? 'Bu proje için demo istek kaydı yok.' : 'Bu proje için canlı istek kaydı yok. Demo verileri canlı toplamdan hariçtir.'));
    return;
  }
  const rows = el('div', 'perf-rows');
  const row = (label, value) => { const line = el('div', 'perf-row'); line.append(el('span', '', label), el('strong', '', value)); rows.append(line); };
  row('Kayıtlı istekler', count(h.total));
  row('Teknik tamamlanma', count(h.completed));
  row('Hata', count(h.failed));
  row('İptal', count(h.cancelled));
  row('Sonuçsuz / bilinmiyor', count(h.unknown));
  box.append(rows);
  const ratio = el('div', 'perf-verdict');
  ratio.append(el('strong', '', h.terminal ? `Teknik tamamlanma oranı: %${Math.round(h.technicalCompletionRatio * 100)}` : 'Oran için sonuçlanmış istek yok'));
  box.append(ratio);
  box.append(el('p', 'perf-note', `Payda: sonuçlanmış istekler = tamamlanan + hata + iptal (${count(h.terminal)}). Sonuçsuz istekler (${count(h.unknown)}) orana dahil edilmez ve başarı sayılmaz.`));
  box.append(el('p', 'perf-note', demo ? 'Bu sayılar yalnızca demo verisidir.' : 'Demo verileri bu toplama dahil edilmez. Yalnızca kayıtlı son istekler sayılır (oturum başına en fazla 30 istek); eskiyen journal kayıtları toplamdan düşebilir.'));
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
    body.append(top, el('p', 'event-detail', p.detail), el('p', 'event-kind', `${e.type}${e.type === 'workflow.updated' ? ' · AGENT BİLDİRİMİ' : e.type === 'workflow.configured' ? ' · YAPILANDIRMA' : e.type === 'tests.recorded' ? ' · İÇE AKTARILAN RAPOR' : ' · GÖZLENEN OLAY'}`));
    item.append(el('div', 'event-icon', p.icon), body); $('timeline').append(item);
  }
}
function renderWorkflowComparison(s, r) {
  const box = $('workflow-comparison'); box.replaceChildren();
  const data = snapshot.projects?.find(p => p.projectId === s.projectId)?.workflows?.[demo ? 'demo' : 'live'];
  const filter = $('workflow-task-set'), previous = filter.value;
  filter.replaceChildren(Object.assign(el('option', '', 'Tüm kayıtlar'), { value: '' }));
  for (const name of [...new Set((data?.groups || []).map(g => g.taskSet).filter(Boolean))].sort()) {
    filter.append(Object.assign(el('option', '', name), { value: name }));
  }
  filter.value = [...filter.options].some(o => o.value === previous) ? previous : '';
  box.append(el('p', 'perf-note', r.workflow ? `Seçili istek: ${r.workflow.label} · ${r.workflow.id} @ ${r.workflow.version}${r.workflowConflict ? ' · profil çakışması; karşılaştırma dışında' : ''}` : 'Seçili istekte workflow profili kaydedilmemiş.'));
  if (!data?.groups.length) {
    box.append(el('p', 'perf-note', 'Henüz karşılaştırılabilir profil kaydı yok. Projendeki .pi/agent-dashboard.workflow.json dosyasıyla rolleri tanımla; sonraki istekler otomatik gruplanır.'));
    return;
  }
  const wrap = el('div', 'comparison-scroll'), table = el('table', 'comparison-table');
  wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Workflow sonuçları; dar ekranda yatay kaydırılabilir');
  const head = el('tr');
  for (const title of ['Workflow / modeller', 'İstek', 'Teknik tamamlanma', 'Ort. süre', 'Ort. bildirilen token', 'JUnit sonuçları']) head.append(el('th', '', title));
  const thead = el('thead'); thead.append(head); table.append(thead);
  const body = el('tbody');
  for (const group of data.groups.filter(g => !filter.value || g.taskSet === filter.value)) {
    const row = el('tr'), identity = el('td');
    identity.append(el('strong', '', `${group.label} · v${group.version}`), el('small', '', `${group.id} · ${group.taskSet || 'Görev kümesi belirtilmedi'}`));
    for (const assignment of group.models) identity.append(el('small', '', `${assignment.role}: ${assignment.models.join(', ') || 'Model gözlenmedi'}`));
    const total = el('td', '', count(group.total));
    total.append(el('small', '', `${group.failed} hata · ${group.cancelled} iptal · ${group.unknown} sonuçsuz`));
    const ratio = el('td', '', group.terminal ? `%${Math.round(group.technicalCompletionRatio * 100)}` : '—');
    ratio.append(el('small', '', `${group.completed} / ${group.terminal} sonuçlanmış`));
    const elapsed = el('td', '', msDuration(group.meanElapsedMs)); elapsed.append(el('small', '', `${group.durationSamples} ölçüm`));
    const tokens = el('td', '', group.meanReportedTokens === undefined ? '—' : count(Math.round(group.meanReportedTokens))); tokens.append(el('small', '', `${group.tokenSamples} ölçüm`));
    const tests = el('td', 'comparison-evidence'), evidence = group.testEvidence;
    tests.append(el('span', '', evidence?.coveredRuns ? `${evidence.coveredRuns} / ${group.total} istekte rapor` : 'Rapor yok'));
    for (const set of evidence?.sets || []) tests.append(el('small', '', `${set.suiteHash.slice(0, 8)} · ${set.tests} test: ${set.passed} geçti / ${set.failed} kaldı / ${set.inconclusive} belirsiz istek`));
    if (evidence?.unusableRuns) tests.append(el('small', '', `${evidence.unusableRuns} isteğin raporları sınırı aştı; hariç tutuldu`));
    row.append(identity, total, ratio, elapsed, tokens, tests); body.append(row);
  }
  table.append(body); wrap.append(table); box.append(wrap);
  const scope = el('details', 'model-result'); scope.append(el('summary', '', 'Ölçüm kapsamı'));
  scope.append(el('p', 'perf-note', 'Aynı görev kümesiyle karşılaştır. Süre ve token ortalamaları yalnızca sonuçlanmış ve ilgili ölçümü bulunan istekleri kapsar; eksik veri sıfır sayılmaz. Model listeleri gözlenen kimliklerdir, yürütme sırası değildir.'));
  scope.append(el('p', 'perf-note', 'JUnit sonuçları test adları kümesine göre ayrıdır; aynı kısa kimlik aynı test adlarını belirtir, test kodunun veya çalıştırma koşullarının eşitliğini doğrulamaz. Raporu olmayan, boş veya yalnızca atlanmış testli istekler geçti sayılmaz.'));
  scope.append(el('p', 'perf-note', `Kalite ve ücret ölçülmez. Profil olmayan ${data.unconfigured}, çakışan veya model kaydı sınırını aşan ${data.conflicted} istek tablo dışındadır. Yalnızca elde tutulan kayıtlar${demo ? ' ve demo verileri' : ''} gösterilir.`));
  box.append(scope);
}
function renderEvidence(r) {
  const box = $('test-evidence'); box.replaceChildren();
  const evidence = r.testEvidence, reports = evidence?.reports || [];
  if (!reports.length) box.append(el('p', 'perf-note', 'Bu isteğe test raporu eklenmedi. İstek bittikten sonra Pi’de /dashboard-evidence path/to/junit.xml kullan.'));
  if (evidence?.truncated) box.append(el('p', 'perf-note', 'Rapor sayısı sınırı aşıldı; bu isteğin test sonuçları karşılaştırma dışında.'));
  for (const report of reports) {
    const row = el('article', 'evidence-report'), failed = report.failures + report.errors;
    row.append(el('strong', '', report.file), el('span', `badge ${failed ? 'error' : report.passed ? 'done' : 'unknown'}`, failed ? 'Raporda başarısız' : report.passed ? 'Raporda geçti' : 'Sonuç belirsiz'));
    row.append(el('p', 'perf-note', `${report.tests} test · ${report.passed} geçti · ${report.failures} başarısız · ${report.errors} hata · ${report.skipped} atlandı`));
    const details = el('details', 'model-result'); details.append(el('summary', '', 'Rapor kaynağı ve dosya özeti'));
    details.append(el('p', '', `JUnit XML · kullanıcı komutuyla içe aktarıldı\nTest kümesi: ${report.suiteHash}\nSHA-256: ${report.sha256}\nDosya: ${report.bytes} byte · değişiklik: ${report.modifiedAt}\nİçe aktarma: ${report.importedAt}`));
    row.append(details); box.append(row);
  }
  if (reports.length) box.append(el('p', 'perf-note', 'Son içe aktarılan rapor dosya başına gösterilir; önceki özetler aktivite kaydındadır. Rapor içeriği testin gerçekten çalıştırıldığını, güncel kodu veya görev kalitesini tek başına kanıtlamaz.'));
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
  $('project-overview').classList.toggle('hidden', !overview); $('workspace-details').classList.toggle('hidden', overview);
  renderProjects();
  $('demo-banner').classList.toggle('hidden', !demo);
  $('live-mode').classList.toggle('selected', !demo); $('demo-mode').classList.toggle('selected', demo);
  $('project-name').textContent = overview ? 'Projelerim' : s?.projectName || 'Pi oturumları';
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
  renderStages(r); renderModels(s, r); renderPerf(s, r); renderHistory(s); renderEvidence(r); renderWorkflowComparison(s, r); renderTimeline(r); updateDuration();
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
$('overview-button').onclick = () => { overview = true; render(); $('overview-heading').focus(); };
$('project-search').oninput = renderProjects;
$('project-filter').onchange = renderProjects;
$('run-select').onchange = e => { runId = e.target.value; render(); };
$('event-search').oninput = () => { const { r } = selected(); if (r) renderTimeline(r); };
$('workflow-task-set').onchange = () => { const { s, r } = selected(); if (r) renderWorkflowComparison(s, r); };
setInterval(updateDuration, 1000);
setInterval(renderProjects, 1000);
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
