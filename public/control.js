const controlEl = (tag, className, text) => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };
const controlId = id => document.getElementById(id);
let authorized = false, current, draft, sending = false, receipt, recommendationsKey = '';

export function modelError(run) {
  if (typeof run?.errorMessage === 'string') return run.errorMessage;
  return run?.outcome === 'error' ? 'Pi reported a model/provider error. No error details were recorded.' : '';
}

function unavailable() {
  if (!current?.control?.enabled) return 'Control is off. Start PiScope with AGENT_DASHBOARD_CONTROL=1.';
  if (!authorized) return 'Viewing only. Open the separate control pairing link in this browser to send work.';
  const a = current.control.agents?.find(a => a.sessionId === current.s.id && a.projectId === current.s.projectId);
  if (!a || a.until <= Date.now()) return 'Pi control is offline. In this project’s Pi session, use /dashboard-control on.';
  if (a.runId !== current.r.id || current.s.runs.at(-1)?.id !== current.r.id) return 'This is an older request. Open the latest request to continue.';
  if (a.limited) return 'Pi control limit reached. Use /dashboard-control off, then on in Pi.';
  if (!a.idle || !current.r.settled || current.r.status === 'running') return 'Pi is busy or still settling. Wait until it finishes.';
  if (current.control.reservations?.some(r => r.sessionId === current.s.id && r.runId === current.r.id)) return 'A request was already sent for this run. Check its receipt or the latest Pi request.';
  return '';
}
function review(prompt, recommendationId) {
  if (sending || unavailable()) return;
  receipt = undefined; controlId('control-receipt').textContent = '';
  draft = { id: crypto.randomUUID(), sessionId: current.s.id, projectId: current.s.projectId, runId: current.r.id,
    ...(recommendationId ? { recommendationId, expectedPrompt: prompt } : { prompt }) };
  controlId('control-review-target').textContent = `Send to ${current.s.projectName} · ${current.s.model || current.r.model || 'current Pi model'} · session ${current.s.id.slice(0, 7)}`;
  controlId('control-review-prompt').textContent = prompt;
  controlId('control-review').classList.remove('hidden');
  controlId('control-confirm').disabled = false;
  controlId('control-confirm').focus();
}
export async function initializeControls(onSubmitted) {
  const capability = await fetch('/api/control');
  authorized = capability.ok && (await capability.json()).canSubmit === true;
  controlId('control-other-form').onsubmit = e => { e.preventDefault(); const prompt = controlId('control-other-prompt').value; if (prompt.trim()) review(prompt); };
  controlId('control-cancel').onclick = () => { draft = undefined; controlId('control-review').classList.add('hidden'); controlId('control-other-prompt').focus(); };
  controlId('control-confirm').onclick = async () => {
    if (!draft || sending || unavailable()) return;
    const request = draft; sending = true; controlId('control-confirm').disabled = true;
    controlId('control-receipt').textContent = 'Sending…';
    try {
      const response = await fetch('/api/control/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Request rejected');
      receipt = result; draft = undefined;
      controlId('control-review').classList.add('hidden');
      controlId('control-other-prompt').value = '';
      onSubmitted(result);
    } catch (error) {
      // Preserve the same id and preview on network uncertainty; retries are idempotent.
      controlId('control-receipt').textContent = `Not confirmed: ${error.message}. Check Pi before retrying.`;
    } finally { sending = false; if (current) renderControls(current.s, current.r, current.control); }
  };
}
export function renderControls(s, r, control) {
  if (!s || !r) return;
  if (current && (current.s.id !== s.id || current.r.id !== r.id)) {
    draft = undefined; controlId('control-review').classList.add('hidden');
    controlId('control-other-prompt').value = ''; recommendationsKey = '';
    controlId('control-response-text').scrollTop = 0;
    controlId('control-receipt').textContent = ''; if (!sending) receipt = undefined;
  }
  current = { s, r, control };
  const response = r.summary || (r.status === 'running' ? 'Pi is working. Its response will appear here.' : 'No model response recorded for this request.');
  const responseText = controlId('control-response-text');
  if (responseText.textContent !== response) responseText.textContent = response;
  const error = modelError(r), errorText = controlId('control-error-text');
  if (errorText.textContent !== error) errorText.textContent = error;
  controlId('control-error').classList.toggle('hidden', !error);
  const reason = unavailable();
  controlId('control-status').textContent = reason || `Ready for your approval · ${s.projectName} · ${s.model || r.model || 'current Pi model'}`;
  const key = JSON.stringify(r.recommendations || []);
  if (key !== recommendationsKey) {
    recommendationsKey = key;
    const list = controlId('control-recommendations'); list.replaceChildren();
    for (const recommendation of r.recommendations || []) {
      const row = controlEl('article', 'control-recommendation', '');
      row.append(controlEl('h3', '', recommendation.title), controlEl('p', '', recommendation.prompt));
      const button = controlEl('button', 'button control-start', 'Review and start'); button.type = 'button';
      button.setAttribute('aria-label', `Review and start: ${recommendation.title}`);
      button.onclick = () => review(recommendation.prompt, recommendation.id); row.append(button); list.append(row);
    }
    if (!list.children.length) list.append(controlEl('p', 'control-note', 'No recommendations reported. Use Other to write your own request. Suggestions are agent reports, not automatic decisions.'));
  }
  for (const button of controlId('control-recommendations').querySelectorAll('button')) button.disabled = sending || Boolean(reason);
  controlId('control-other-prompt').disabled = sending || Boolean(reason);
  controlId('control-other-review').disabled = sending || Boolean(reason);
  controlId('control-confirm').disabled = sending || Boolean(reason) || !draft;
  const known = control?.requests?.find(r => r.id === (receipt?.id || draft?.id));
  if (known) { receipt = known; draft = undefined; controlId('control-review').classList.add('hidden'); }
  const latest = (known || receipt)?.sessionId === s.id ? known || receipt : undefined;
  if (latest && !sending) {
    controlId('control-receipt').textContent = `${latest.title}: ${latest.status}. ${latest.reason || 'Waiting for the opted-in Pi session.'}`;
  }
}
