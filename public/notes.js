const noteId = id => document.getElementById(id);
const noteNode = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
let notesSource, notesProjects = [], notesControl, notesActions, notesFilter = '';
const noteCards = new Map(), linkRows = new Map();
function text(node, value) { if (node.textContent !== value) node.textContent = value; }
function canUseNotePrompt(card, task) {
  return Boolean(notesControl?.enabled && notesActions.authorized() && notesSource.available && card.select.value && (card.editing ? card.input.value : task.title).trim());
}
function projectsSelect(select, value) {
  const signature = JSON.stringify(notesProjects);
  if (select.dataset.projects !== signature) {
    select.dataset.projects = signature; select.replaceChildren();
    const empty = noteNode('option', '', 'Choose a PiScope project'); empty.value = ''; select.append(empty);
    for (const p of notesProjects) { const option = noteNode('option', '', `${p.projectName} · ${p.projectId}`); option.value = p.projectId; select.append(option); }
  }
  select.value = notesProjects.some(p => p.projectId === value) ? value : '';
}
function reconcile(parent, children) {
  for (let i = 0; i < children.length; i++) if (parent.children[i] !== children[i]) parent.insertBefore(children[i], parent.children[i] || null);
  while (parent.children.length > children.length) parent.lastElementChild.remove();
}
export function initializeProjectNotes(actions) {
  notesActions = actions;
  noteId('notes-project').onchange = () => { notesFilter = noteId('notes-project').value; renderProjectNotes(notesSource, notesProjects, notesControl); };
  noteId('notes-status').onchange = () => renderProjectNotes(notesSource, notesProjects, notesControl);
}
export function filterProjectNotes(projectId) { notesFilter = projectId; }
export function projectNoteCount(source, projectId) {
  const labels = new Set(source?.labels?.filter(l => l.projectId === projectId).map(l => l.id));
  return source?.tasks?.filter(t => !t.completed && labels.has(t.labelId)).length || 0;
}
export function renderProjectNotes(source, projects = [], control) {
  if (!notesActions) return;
  notesSource = source || { enabled: false, tasks: [], labels: [] }; notesProjects = projects; notesControl = control;
  const writable = Boolean(control?.enabled && notesActions.authorized());
  noteId('notes-disabled').classList.toggle('hidden', notesSource.enabled);
  noteId('notes-content').classList.toggle('hidden', !notesSource.enabled);
  if (!notesSource.enabled) {
    noteCards.clear(); linkRows.clear(); noteId('notes-list').replaceChildren(); noteId('notes-link-list').replaceChildren();
    return;
  }
  text(noteId('notes-warning'), notesSource.warning || ''); noteId('notes-warning').classList.toggle('hidden', !notesSource.warning);
  text(noteId('notes-permission'), writable ? 'Edit prompt changes only a local draft. Use as prompt copies it into Other for the selected project; review and confirm there. Source notes are never changed.' : 'Source notes are read-only; draft editing stays in this page. Sending or saving links needs collector control and this browser’s separate Control pairing. The target Pi session must also opt in before sending.');
  const filter = noteId('notes-project'), signature = JSON.stringify(projects);
  if (filter.dataset.projects !== signature) {
    filter.dataset.projects = signature; filter.replaceChildren();
    const all = noteNode('option', '', 'All notes'); all.value = ''; filter.append(all);
    for (const p of projects) { const option = noteNode('option', '', `${p.projectName} · ${p.projectId}`); option.value = p.projectId; filter.append(option); }
  }
  if (notesFilter && !projects.some(p => p.projectId === notesFilter)) notesFilter = '';
  filter.value = notesFilter;
  const rows = [];
  for (const label of notesSource.labels || []) {
    let row = linkRows.get(label.id);
    if (!row) {
      row = noteNode('div', 'notes-link'); row.dataset.label = label.id;
      const name = noteNode('label', '', label.name), select = noteNode('select', ''); select.id = `note-link-${label.id}`; name.htmlFor = select.id;
      const save = noteNode('button', 'button', 'Save link'); save.type = 'button';
      row.meta = noteNode('p', 'report-label notes-link-meta');
      row.append(name, select, save, row.meta); row.select = select; row.label = name; row.save = save; linkRows.set(label.id, row);
      select.onchange = () => { row.chosen = true; renderProjectNotes(notesSource, notesProjects, notesControl); };
      save.onclick = async () => {
        if (!notesControl?.enabled || !notesActions.authorized() || !notesSource.available || row.saving) return;
        const target = select.value || null; row.saving = true; save.disabled = true; select.disabled = true;
        try {
          const response = await fetch('/api/control/todo-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labelId: label.id, projectId: target }) });
          const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Link unavailable');
          const currentLabel = notesSource.labels.find(l => l.id === label.id); if (currentLabel) currentLabel.projectId = target;
          row.chosen = false; text(noteId('notes-action-status'), 'Project link saved in PiScope. Terminal Todos was not changed.');
        } catch (error) { text(noteId('notes-action-status'), `Could not save link: ${error.message}`); }
        finally { row.saving = false; renderProjectNotes(notesSource, notesProjects, notesControl); }
      };
    }
    text(row.label, label.name);
    projectsSelect(row.select, row.chosen ? row.select.value : label.projectId);
    text(row.meta, row.select.value ? `Selected project ID: ${row.select.value}` : label.projectId ? `Saved target ${label.projectId} is no longer tracked. Choose a target or save with no selection to unlink.` : 'No saved link. Choose a target to link this label.');
    row.select.disabled = !writable || !notesSource.canLink || row.saving;
    row.save.disabled = !writable || !notesSource.canLink || row.saving;
    rows.push(row);
  }
  reconcile(noteId('notes-link-list'), rows);
  for (const [id] of linkRows) if (!notesSource.labels.some(l => l.id === id)) linkRows.delete(id);
  noteId('notes-links-empty').classList.toggle('hidden', rows.length > 0);
  const status = noteId('notes-status').value, labels = new Map((notesSource.labels || []).map(l => [l.id, l.projectId]));
  const tasks = (notesSource.tasks || []).filter(t => (!notesFilter || labels.get(t.labelId) === notesFilter) && (status === 'all' || t.completed === (status === 'done'))).sort((a, b) => Number(a.id) - Number(b.id));
  text(noteId('notes-results'), `${tasks.length} notes shown · ${notesSource.tasks.length} available · ID order${!notesSource.available ? ' · last read snapshot; sending disabled' : ''}`);
  const cards = [];
  for (const task of tasks) {
    let card = noteCards.get(task.ref);
    if (!card) {
      card = noteNode('article', 'notes-card'); card.dataset.note = task.id;
      card.meta = noteNode('p', 'report-label'); card.body = noteNode('p', 'notes-text'); card.body.tabIndex = 0;
      const label = noteNode('label', 'report-label', 'Send this note to project'), select = noteNode('select', ''); select.id = `note-target-${task.id}`; label.htmlFor = select.id;
      card.select = select; card.target = noteNode('p', 'report-label');
      card.editor = noteNode('div', 'notes-editor hidden'); card.editor.id = `note-editor-${task.id}`;
      const draftLabel = noteNode('label', 'report-label', 'Prompt draft'), help = noteNode('p', 'report-label', 'Draft only: add instructions or edit this copy. Use as prompt copies it into Other for review; Terminal Todos is not updated.');
      help.id = `note-draft-help-${task.id}`;
      card.input = noteNode('textarea', 'notes-prompt-draft'); card.input.id = `note-draft-${task.id}`; card.input.rows = 6; card.input.maxLength = 8000;
      card.input.setAttribute('aria-describedby', help.id); draftLabel.htmlFor = card.input.id;
      const cancel = noteNode('button', 'button', 'Cancel edit'); cancel.type = 'button';
      card.editor.append(draftLabel, help, card.input, cancel);
      card.edit = noteNode('button', 'button', 'Edit prompt'); card.edit.type = 'button';
      card.edit.setAttribute('aria-controls', card.editor.id); card.edit.setAttribute('aria-expanded', 'false');
      card.use = noteNode('button', 'button', 'Use as prompt'); card.use.type = 'button';
      const actions = noteNode('div', 'notes-prompt-actions'); actions.append(card.edit, card.use);
      card.activity = noteNode('section', 'notes-activity hidden');
      card.activityHeading = noteNode('h3', '', 'Latest Pi request'); card.activityHeading.id = `note-activity-${task.id}`;
      card.activity.setAttribute('aria-labelledby', card.activityHeading.id);
      card.badge = noteNode('span', 'badge'); card.activityMeta = noteNode('p', 'report-label'); card.reason = noteNode('p', 'report-label');
      card.reply = noteNode('div', 'notes-reply'); card.reply.tabIndex = 0; card.reply.setAttribute('role', 'region'); card.reply.setAttribute('aria-label', 'Captured Pi response excerpt');
      card.open = noteNode('button', 'button notes-result-open', 'View Pi request'); card.open.type = 'button';
      card.retention = noteNode('p', 'report-label');
      card.activity.append(card.activityHeading, card.badge, card.activityMeta, card.reason, card.reply, card.open, card.retention);
      card.append(card.meta, card.body, card.activity, label, select, card.target, card.editor, actions); noteCards.set(task.ref, card);
      card.open.onclick = () => {
        const result = notesActions.openResult(card.currentActivity); if (result) text(noteId('notes-action-status'), result);
      };
      select.onchange = () => { card.chosen = true; renderProjectNotes(notesSource, notesProjects, notesControl); };
      card.edit.onclick = () => {
        const current = notesSource.tasks.find(t => t.ref === task.ref);
        if (!notesSource.available || !current || card.editing) return;
        card.input.value = current.title; card.editing = true;
        renderProjectNotes(notesSource, notesProjects, notesControl);
        card.input.focus(); card.input.setSelectionRange(0, 0);
      };
      card.input.oninput = () => { card.use.disabled = !canUseNotePrompt(card, task); };
      cancel.onclick = () => {
        card.editing = false; card.input.value = '';
        renderProjectNotes(notesSource, notesProjects, notesControl);
        (card.edit.disabled ? card.body : card.edit).focus();
      };
      card.use.onclick = () => {
        const current = notesSource.tasks.find(t => t.ref === task.ref);
        if (!current || !canUseNotePrompt(card, current)) return;
        const result = notesActions.usePrompt(select.value, card.editing ? card.input.value : current.title, current.ref);
        if (result) text(noteId('notes-action-status'), result);
      };
    }
    text(card.meta, `#${task.id} · ${task.projectName} · ${task.completed ? 'Completed in Terminal Todos' : 'Open note'}`);
    text(card.body, task.title || '[Empty note]');
    const activity = notesSource.activity?.find(a => a.todoRef === task.ref); card.currentActivity = activity;
    card.activity.classList.toggle('hidden', !activity);
    if (activity) {
      const names = { queued: 'Pending', sent: 'Sent', running: 'Running', reply: 'Reply ready', error: 'Error', unknown: 'Unknown' };
      text(card.badge, names[activity.status] || 'Unknown'); card.badge.className = `badge ${activity.status === 'queued' ? 'pending' : activity.status === 'reply' ? 'idle' : activity.status}`;
      text(card.activityMeta, `Project ID: ${activity.projectId}\nPi session: ${activity.sessionId}\n${activity.model || 'Current Pi model'} · ${activity.createdAt}`);
      text(card.reason, activity.reason || (activity.status === 'queued' ? 'Waiting for the opted-in Pi session. Nothing is complete yet.' : 'Pi is working. This does not complete the source note.'));
      text(card.reply, activity.summary || ''); card.reply.classList.toggle('hidden', !activity.summary);
      card.open.disabled = !activity.detailAvailable;
      text(card.retention, activity.detailAvailable ? 'Open the exact linked request. The excerpt above is bounded and redacted.' : activity.runId ? 'Pi request detail is no longer retained. Only the saved excerpt is available.' : 'No linked Pi request has been observed yet. Check the terminal if delivery is uncertain.');
    }
    projectsSelect(card.select, card.chosen ? card.select.value : labels.get(task.labelId));
    text(card.target, card.select.value ? `Target project ID: ${card.select.value}` : 'Choose an explicit target; no project is guessed.');
    card.use.disabled = !canUseNotePrompt(card, task);
    card.edit.disabled = !notesSource.available; card.edit.classList.toggle('hidden', Boolean(card.editing));
    card.edit.setAttribute('aria-expanded', String(Boolean(card.editing)));
    card.editor.classList.toggle('hidden', !card.editing);
    card.select.disabled = !notesSource.available;
    cards.push(card);
  }
  reconcile(noteId('notes-list'), cards);
  for (const [ref] of noteCards) if (!notesSource.tasks.some(t => t.ref === ref)) noteCards.delete(ref);
  noteId('notes-empty').classList.toggle('hidden', cards.length > 0);
}
