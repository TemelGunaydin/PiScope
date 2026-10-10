import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, event, token, snapshots } from './helpers.mjs';
import { EventStore } from '../src/store.mjs';
import { validateEvent } from '../extensions/agent-dashboard/events.mjs';
import { reportPrompt } from '../src/report-prompt.mjs';
const controlToken = 'b'.repeat(64);
const presence = { sessionId: 'session-a', projectId: 'project-a', owner: 'report-owner', runId: 'run-a', idle: true, canReport: true, model: 'synthetic/current' };
async function setup(t) {
  const f = await fixture(t, { controlToken });
  for (const e of [event('prompt.received', { prompt: 'Add calendar navigation.' }), event('run.started', { model: 'synthetic/current' }), event('run.ended', { outcome: 'idle', summary: 'Calendar navigation was added; no independent test evidence.' }), event('run.settled')]) f.app.store.append(e);
  const paired = await fetch(f.url + '/api/control/login', { method: 'POST', headers: { Origin: f.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: controlToken }) });
  f.headers = { Origin: f.url, 'Content-Type': 'application/json', Cookie: paired.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
  f.poll = (input = presence) => f.request('/api/control/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  await f.poll();
  f.input = { id: 'generate-one', sessionId: presence.sessionId, projectId: presence.projectId, runId: presence.runId, reportDay: f.app.store.dailyMemory.day(Date.now()), expectedModel: presence.model };
  f.preview = input => fetch(f.url + '/api/control/report-preview?' + new URLSearchParams(input || f.input), { headers: f.headers });
  f.send = input => fetch(f.url + '/api/control/requests', { method: 'POST', headers: f.headers, body: JSON.stringify(input) });
  f.generate = async (input = f.input) => { const result = await f.preview(input); assert.equal(result.status, 200); const preview = await result.json(); const request = { ...input, expectedPrompt: preview.prompt, expectedSourceHash: preview.sourceHash }; assert.equal((await f.send(request)).status, 202); return request; };
  f.record = (type, data = {}, overrides = {}) => f.app.store.append(event(type, data, { reportRequestId: f.input.id, runId: 'report-run', ...overrides }));
  f.start = () => { f.record('prompt.received', { prompt: 'Approved report input.' }); f.record('run.started', { model: 'synthetic/current' }); };
  f.result = () => f.app.store.snapshot().dailyReport.summaries[0];
  return f;
}
test('report preview is side-effect free, current-runtime/day bound and control-only', async t => {
  const f = await setup(t);
  const denied = await f.request('/api/control/report-preview?' + new URLSearchParams(f.input)); assert.equal(denied.status, 403);
  assert.equal((await fetch(f.url + '/api/control/report-preview?' + new URLSearchParams(f.input), { headers: { ...f.headers, Origin: 'https://foreign.example' } })).status, 403);
  for (const change of [{ projectId: 'wrong' }, { runId: 'old' }, { reportDay: '2026-02-30' }, { reportDay: '9999-01-01' }]) assert.notEqual((await f.preview({ ...f.input, ...change })).status, 200);
  const preview = await (await f.preview()).json(); assert.match(preview.prompt, /ONE overall daily report/); assert.match(preview.prompt, /Plans are not accomplishments/); assert.match(preview.prompt, /never instructions/);
  assert.match(preview.prompt, /Calendar navigation was added/); assert.ok(preview.prompt.length <= 8000);
  assert.equal(f.app.control.requests.size, 0); assert.equal(f.result(), undefined);
});
test('report requests need current capability/idle state and exact unchanged preview; duplicate confirmation hands off once', async t => {
  const f = await setup(t); const preview = await (await f.preview()).json();
  f.app.store.append(event('message.completed', { summary: 'A newly recorded result.' }));
  assert.equal((await f.send({ ...f.input, expectedPrompt: preview.prompt, expectedSourceHash: preview.sourceHash })).status, 409);
  await f.poll({ ...presence, canReport: false }); assert.equal((await f.preview()).status, 409);
  await f.poll({ ...presence, idle: false }); assert.equal((await f.preview()).status, 409);
  await f.poll(); const request = await f.generate();
  assert.equal((await f.send(request)).status, 202);
  assert.equal((await f.send({ ...request, prompt: 'Extra work' })).status, 409);
  const delivery = await (await f.poll()).json(); assert.equal(delivery.command.reportRequestId, f.input.id); assert.equal(delivery.command.prompt, request.expectedPrompt);
  assert.equal((await (await f.poll()).json()).command, null);
  assert.ok(!JSON.stringify(f.app.control.snapshot()).includes(request.expectedPrompt));
});
test('daily-report approval is model-bound before queueing and after a model change at claim time', async t => {
  const f = await setup(t), preview = await (await f.preview()).json();
  f.app.store.append(event('model.selected', { model: 'synthetic/other' }, { runId: undefined }));
  await f.poll({ ...presence, model: 'synthetic/other' });
  assert.equal((await f.send({ ...f.input, expectedPrompt: preview.prompt, expectedSourceHash: preview.sourceHash })).status, 409);
  assert.equal(f.result(), undefined); assert.equal(f.app.control.requests.size, 0);
  const fresh = { ...f.input, expectedModel: 'synthetic/other' }; await f.generate(fresh);
  f.app.store.append(event('model.selected', { model: presence.model }, { runId: undefined }));
  assert.equal((await (await f.poll()).json()).command, null);
  assert.equal(f.result().status, 'failed'); assert.equal(f.app.control.reservations.size, 0);
});
test('generated summaries require the bound typed result and completed run, not a normal model reply', async t => {
  const f = await setup(t); await f.generate(); f.start();
  f.record('daily.reported', { summary: 'Wrong project' }, { projectId: 'another' });
  f.record('daily.reported', { summary: 'Wrong run' }, { runId: 'another' });
  f.record('message.completed', { summary: 'Normal response is not a daily summary.' });
  f.record('run.ended', { outcome: 'idle', summary: 'Normal response is not a daily summary.' });
  assert.equal(f.result().status, 'unknown'); assert.equal(f.result().summary, '');
  assert.equal(f.app.store.snapshot().dailyReport.records.length, 1, 'Generation must never become captured coding work');
});
test('published summary is redacted, scoped, persistent and separate from response history', async t => {
  const f = await setup(t); await f.generate(); f.start();
  f.record('daily.reported', { summary: 'Calendar navigation and reminders were improved. api_key=PRIVATE_SUMMARY', remaining: 'Export remains blocked. password=PRIVATE_REMAINING', thinking: 'PRIVATE_THOUGHT' });
  assert.equal(f.result().summary, '', 'Typed text is provisional until terminal completion');
  f.record('run.ended', { outcome: 'idle', summary: 'Unrelated normal chat answer.' }); f.record('run.settled');
  const result = f.result(); assert.equal(result.status, 'ready'); assert.equal(result.model, 'synthetic/current'); assert.equal(result.contentIncluded, 1); assert.equal(result.stale, false);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_')); assert.ok(!JSON.stringify(result).includes('draftSummary'));
  f.app.store.close(); const restored = new EventStore(f.dir); t.after(() => restored.close());
  assert.equal(restored.snapshot().dailyReport.summaries[0].summary, result.summary);
  assert.equal(restored.snapshot().dailyReport.records.length, 1);
  assert.equal(statSync(join(f.dir, 'generated-reports.json')).mode & 0o777, 0o600);
  const file = readFileSync(join(f.dir, 'generated-reports.json'), 'utf8'); assert.ok(!file.includes('PRIVATE_')); assert.ok(!file.includes('Unrelated normal chat answer'));
});
test('new recorded work marks a summary stale; metadata and generation work do not', async t => {
  const f = await setup(t); await f.generate(); f.start(); f.record('daily.reported', { summary: 'Calendar improved.' }); f.record('run.ended', { outcome: 'idle' });
  f.app.store.append(event('session.heartbeat')); assert.equal(f.result().stale, false);
  f.app.store.append(event('prompt.received', { prompt: 'New feature.' }, { runId: 'next-work', sessionId: 'session-b' }));
  assert.equal(f.result().stale, true); assert.equal(f.result().summary, 'Calendar improved.');
});
test('provider failures and cancellation never publish provisional generated text', async t => {
  for (const [outcome, expected] of [['error', 'failed'], ['aborted', 'cancelled']]) {
    const f = await setup(t); await f.generate(); f.start(); f.record('daily.reported', { summary: 'Do not publish this.' });
    f.record('run.ended', { outcome, errorMessage: outcome === 'error' ? 'Provider overloaded. api_key=PRIVATE_ERROR' : '' });
    assert.equal(f.result().status, expected); assert.equal(f.result().summary, ''); assert.ok(!f.result().errorMessage.includes('PRIVATE_ERROR'));
  }
});
test('expired or uncertain control delivery never becomes generation success', async t => {
  for (const claimed of [false, true]) {
    const f = await setup(t); await f.generate(); if (claimed) await f.poll();
    f.app.control.requests.get(f.input.id).deadline = Date.now() - 1; f.app.control.sweep();
    assert.equal(f.result().status, claimed ? 'unknown' : 'failed'); assert.equal(f.result().summary, '');
  }
});
test('submitted report without a bound run becomes Unknown; only a fresh explicit approval can replace it', async t => {
  const f = await setup(t); let now = Date.now(); f.app.control.now = () => now;
  const second = { ...presence, sessionId: 'session-b', projectId: 'project-b', runId: 'run-b', owner: 'owner-b' };
  const fresh = p => {
    f.app.store.reduce(validateEvent(event('session.heartbeat', {}, { sessionId: p.sessionId, projectId: p.projectId, time: new Date(now).toISOString() }), new Date(now)));
    f.app.control.agent(p);
  };
  for (const [type, data] of [['session.connected', { model: presence.model }], ['prompt.received', { prompt: 'Other project work' }], ['run.ended', { outcome: 'idle' }], ['run.settled', {}]]) f.app.store.append(event(type, data, { sessionId: second.sessionId, projectId: second.projectId, runId: second.runId }));
  f.app.control.agent(second);
  const request = await f.generate(); assert.ok((await (await f.poll()).json()).command);
  await f.poll({ ...presence, ack: { id: request.id, status: 'submitted' } });
  const next = { ...f.input, id: 'new-explicit-report', ...second }; delete next.owner; delete next.idle; delete next.canReport;
  assert.equal((await f.preview(next)).status, 409);
  now += 31001; fresh(presence); fresh(second);
  assert.equal((await f.preview(next)).status, 200, 'An unstarted delivery must not lock the report day indefinitely');
  assert.equal(f.result().status, 'unknown'); assert.equal(f.result().summary, ''); assert.equal(f.result().runId, undefined);
  assert.match(f.result().errorMessage, /No bound Pi request|No matching Pi request/); assert.match(f.result().errorMessage, /nothing.*retried|Nothing.*retried/);
  assert.equal(f.app.control.requests.size, 1, 'Preview and timeout must not send another command');
  assert.equal(f.app.control.requests.get(request.id).status, 'submitted');
  assert.match(f.app.control.ready(presence.sessionId, presence.projectId, presence.runId), /already sent|pending/);
  assert.equal((await (await f.poll()).json()).command, null);
  assert.equal((await f.send(request)).status, 202, 'Duplicate confirmation retains the original receipt');
  assert.equal(f.app.control.requests.size, 1); assert.equal(f.result().status, 'unknown');
  const replacement = await f.generate(next); assert.equal(f.app.control.requests.size, 2);
  assert.equal(f.result().id, replacement.id); assert.equal(f.result().status, 'queued');
  f.record('prompt.received'); f.record('daily.reported', { summary: 'Late superseded result' }); f.record('run.ended', { outcome: 'idle' });
  assert.equal(f.result().id, replacement.id); assert.equal(f.result().summary, ''); assert.equal(f.result().status, 'queued');
});
test('report snapshots independently expire unstarted delivery without clearing an earlier published report', async t => {
  const f = await setup(t); let now = Date.now(); f.app.control.now = () => now;
  await f.generate(); await f.poll(); await f.poll({ ...presence, ack: { id: f.input.id, status: 'submitted' } });
  f.start(); f.record('daily.reported', { summary: 'Earlier good report' }); f.record('run.ended', { outcome: 'idle' }); f.record('run.settled');
  now += 20000;
  await f.poll({ ...presence, runId: 'report-run' });
  const retry = { ...f.input, id: 'unstarted-second', runId: 'report-run' };
  await f.generate(retry); assert.equal([...f.app.store.reportMemory.entries.values()][0].submittedAt, undefined);
  await f.poll({ ...presence, runId: 'report-run' });
  await f.poll({ ...presence, runId: 'report-run', ack: { id: retry.id, status: 'submitted' } });
  const memory = f.app.store.reportMemory;
  const result = memory.snapshot(f.app.store.dailyMemory, f.app.store.reportProjects(), now + 31001)[0];
  assert.equal(result.status, 'unknown'); assert.equal(result.summary, 'Earlier good report'); assert.equal(result.runId, undefined);
  memory.flush(); const saved = JSON.parse(readFileSync(memory.path, 'utf8')).reports[0]; assert.equal(saved.status, 'unknown');
  f.record('prompt.received', {}, { reportRequestId: retry.id, runId: 'late-current' });
  f.record('run.started', {}, { reportRequestId: retry.id, runId: 'late-current' });
  f.record('daily.reported', { summary: 'Late but still current completed report' }, { reportRequestId: retry.id, runId: 'late-current' });
  f.record('run.ended', { outcome: 'idle' }, { reportRequestId: retry.id, runId: 'late-current' });
  assert.equal(f.result().status, 'ready'); assert.equal(f.result().summary, 'Late but still current completed report');
});
test('report start timeout counts from the first submitted ACK and never expires a bound run', async t => {
  const f = await setup(t); let now = Date.now(); f.app.control.now = () => now;
  await f.generate(); now += 14000; await f.poll();
  await f.poll({ ...presence, ack: { id: f.input.id, status: 'submitted' } });
  const memory = f.app.store.reportMemory, r = [...memory.entries.values()][0], submittedAt = r.submittedAt;
  assert.equal(submittedAt, new Date(now).toISOString());
  now += 17000; memory.delivery(f.input.id, 'submitted', '', now); f.app.control.sweep();
  assert.equal(r.submittedAt, submittedAt); assert.equal(f.result().status, 'queued', 'A delayed ACK still gets the complete observation window');
  f.start(); memory.snapshot(f.app.store.dailyMemory, f.app.store.reportProjects(), now + 3600000);
  assert.equal(f.result().status, 'generating'); assert.equal(f.result().runId, 'report-run');
});
test('report timeout reaches SSE without a new Pi event or receipt change', async t => {
  const f = await setup(t); await f.generate(); await f.poll();
  await f.poll({ ...presence, ack: { id: f.input.id, status: 'submitted' } });
  // Drain any API-triggered announcement first; only the timer may publish the timeout.
  await new Promise(resolve => setTimeout(resolve, 350));
  const controller = new AbortController();
  const response = await f.request('/api/events', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
  const stream = snapshots(response.body);
  try {
    const first = (await stream.next()).value; assert.equal(first.dailyReport.summaries[0].status, 'queued');
    const r = [...f.app.store.reportMemory.entries.values()][0]; r.submittedAt = new Date(Date.now() - 31000).toISOString();
    let snapshot;
    do { snapshot = (await stream.next()).value; } while (snapshot.dailyReport.summaries[0].status !== 'unknown');
    assert.match(snapshot.dailyReport.summaries[0].errorMessage, /No bound Pi request/); assert.equal(snapshot.sequence, first.sequence);
    assert.equal(f.app.control.requests.get(f.input.id).status, 'submitted'); assert.equal(f.app.control.requests.size, 1);
  } finally { await stream.return(); controller.abort(); }
});
test('a retry cannot publish an earlier failed draft without a fresh typed result', async t => {
  const f = await setup(t); await f.generate(); f.start(); f.record('daily.reported', { summary: 'Failed provisional text.' });
  f.record('run.ended', { outcome: 'error' }); f.record('run.started', { model: 'synthetic/current' }); f.record('run.ended', { outcome: 'idle', summary: 'A normal retry answer.' });
  assert.equal(f.result().status, 'unknown'); assert.equal(f.result().summary, '');
});
test('generated file count and UTF-8 byte bounds preserve recent private entries', async t => {
  const f = await setup(t); await f.generate(); const memory = f.app.store.reportMemory, base = [...memory.entries.values()][0];
  for (let i = 0; i < 600; i++) {
    const time = new Date(Date.now() + i).toISOString();
    memory.entries.set(String(i), { ...base, scope: undefined, id: `report-${i}`, projectId: `project-${i}`, status: 'ready', createdAt: time, generatedAt: time, summary: '界'.repeat(2400), remaining: '界'.repeat(800), contentSourceHash: base.sourceHash, contentIncluded: 1, contentTotal: 1 });
  }
  memory.dirty = true; memory.flush();
  assert.ok(memory.entries.size < 500); assert.equal([...memory.entries.values()][0].id, 'report-599');
  assert.ok(statSync(join(f.dir, 'generated-reports.json')).size <= 2 * 1024 * 1024 + 1024);
});
test('restart never replays a queued generation; delivery uncertainty remains visible', async t => {
  const f = await setup(t); await f.generate(); f.app.store.close();
  const restored = new EventStore(f.dir); t.after(() => restored.close());
  const r = restored.snapshot().dailyReport.summaries[0]; assert.equal(r.status, 'unknown'); assert.match(r.errorMessage, /restarted/);
  assert.equal(r.summary, ''); assert.equal(restored.snapshot().dailyReport.records.length, 1);
});
test('late output from an older generation cannot replace a newer summary or use another day', async t => {
  const f = await setup(t); await f.generate(); f.start(); f.record('daily.reported', { summary: 'First summary.' }); f.record('run.ended', { outcome: 'idle' }); f.record('run.settled');
  await f.poll({ ...presence, runId: 'report-run' });
  const input = { ...f.input, id: 'generate-two', runId: 'report-run' }; await f.generate(input);
  f.record('daily.reported', { summary: 'Late old report.' }); f.record('run.ended', { outcome: 'idle' });
  assert.equal(f.result().summary, 'First summary.'); assert.equal(f.result().id, input.id); assert.equal(f.result().status, 'queued');
  f.record('prompt.received', {}, { reportRequestId: input.id, runId: 'report-two' }); f.record('run.started', { model: 'synthetic/current' }, { reportRequestId: input.id, runId: 'report-two' });
  f.record('daily.reported', { summary: 'New consolidated summary.' }, { reportRequestId: input.id, runId: 'report-two' }); f.record('run.ended', { outcome: 'idle' }, { reportRequestId: input.id, runId: 'report-two' });
  assert.equal(f.result().summary, 'New consolidated summary.'); assert.equal(f.result().day, f.input.reportDay);
});
test('one bounded daily request includes other projects but excludes demo and other-day work', async t => {
  const f = await setup(t);
  for (const scope of [{ demo: true }, { time: '2020-01-01T12:00:00Z' }]) f.app.store.append(event('prompt.received', { prompt: 'EXCLUDED_CONTEXT' }, { sessionId: 'excluded-' + Object.keys(scope)[0], ...scope }));
  assert.ok(!(await (await f.preview()).json()).prompt.includes('EXCLUDED_CONTEXT'));
  f.app.store.append(event('prompt.received', { prompt: 'INCLUDED_OTHER_PROJECT' }, { projectId: 'other', projectName: 'Another project', sessionId: 'other-session' }));
  f.app.store.append(event('session.connected', {}, { projectId: 'inactive', projectName: 'Inactive project', sessionId: 'inactive-session' }));
  const all = await (await f.preview()).json(); assert.match(all.prompt, /INCLUDED_OTHER_PROJECT/); assert.match(all.prompt, /Inactive project/); assert.equal(all.totalProjects, 3);
  assert.equal(f.app.control.requests.size, 0); await f.generate(); assert.equal(f.app.control.requests.size, 1);
  const records = Array.from({ length: 1000 }, (_, i) => ({ projectId: 'p', sessionId: 's', runId: `r-${i}`, lastAt: '2026-01-01T12:00:00Z', prompt: 'p'.repeat(600), summary: 'r'.repeat(1000), accomplishments: [], errorMessage: '', verdict: 'unknown' }));
  const preview = reportPrompt(records, { id: 'bounded', day: '2026-01-01', timeZone: 'UTC', projects: [{ projectId: 'p', projectName: 'Test' }] });
  assert.ok(preview.included < preview.total); assert.ok(preview.prompt.length <= 8000); assert.match(preview.prompt, new RegExp(`${preview.included} of 1000`));
});
test('a different Pi runtime cannot duplicate a pending day and regeneration replaces one daily slot', async t => {
  const f = await setup(t);
  for (const e of [event('prompt.received', { prompt: 'Other project work.' }, { projectId: 'project-b', projectName: 'Other', sessionId: 'session-b', runId: 'run-b' }), event('run.ended', { outcome: 'idle' }, { projectId: 'project-b', projectName: 'Other', sessionId: 'session-b', runId: 'run-b' }), event('run.settled', {}, { projectId: 'project-b', projectName: 'Other', sessionId: 'session-b', runId: 'run-b' })]) f.app.store.append(e);
  f.app.store.append(event('model.selected', { model: presence.model }, { projectId: 'project-b', projectName: 'Other', sessionId: 'session-b', runId: undefined }));
  await f.poll({ ...presence, projectId: 'project-b', sessionId: 'session-b', runId: 'run-b', owner: 'owner-b' });
  const input = { ...f.input, id: 'from-second-runtime', projectId: 'project-b', sessionId: 'session-b', runId: 'run-b' };
  await f.generate(); assert.equal((await f.preview(input)).status, 409); assert.equal(f.app.control.requests.size, 1);
  f.start(); f.record('daily.reported', { summary: 'All projects, first report.' }); f.record('run.ended', { outcome: 'idle' });
  await f.generate(input); assert.equal(f.result().summary, 'All projects, first report.');
  const binding = { reportRequestId: input.id, projectId: 'project-b', projectName: 'Other', sessionId: 'session-b', runId: 'second-report' };
  f.record('prompt.received', {}, binding); f.record('run.started', {}, binding); f.record('daily.reported', { summary: 'All projects, regenerated report.' }, binding); f.record('run.ended', { outcome: 'idle' }, binding);
  assert.equal(f.app.store.snapshot().dailyReport.summaries.length, 1); assert.equal(f.result().summary, 'All projects, regenerated report.'); assert.equal(f.result().scope, 'all');
});
test('global context is shared fairly and zero-record projects never borrow older work', async t => {
  const f = await setup(t); const preview = await (await f.preview()).json();
  f.app.store.append(event('prompt.received', { prompt: 'Work in another project.' }, { projectId: 'other', projectName: 'Other', sessionId: 'other-session' }));
  assert.equal((await f.send({ ...f.input, expectedPrompt: preview.prompt, expectedSourceHash: preview.sourceHash })).status, 409);
  const records = Array.from({ length: 100 }, (_, i) => ({ projectId: 'busy', sessionId: 's', runId: `r-${i}`, lastAt: '2026-01-01T12:00:00Z', prompt: 'p'.repeat(600), summary: 'r'.repeat(1000), accomplishments: [], errorMessage: '', verdict: 'unknown' }));
  records.unshift({ ...records[0], projectId: 'quiet', summary: 'QUIET_PROJECT_INCLUDED' });
  const generated = reportPrompt(records, { id: 'fair', day: '2026-01-01', timeZone: 'UTC', projects: [{ projectId: 'busy', projectName: 'Busy' }, { projectId: 'quiet', projectName: 'Quiet' }, { projectId: 'inactive', projectName: 'Inactive' }] });
  assert.match(generated.prompt, /QUIET_PROJECT_INCLUDED/); assert.match(generated.prompt, /totalRecords=0 means no captured work/); assert.equal(generated.includedProjects, 3); assert.ok(generated.included < generated.total);
});
test('source changes outside shortened excerpts still require a fresh approval', async t => {
  const f = await setup(t); f.app.store.append(event('message.completed', { summary: 'r'.repeat(320) + ' old tail' }));
  const old = await (await f.preview()).json(); f.app.store.append(event('message.completed', { summary: 'r'.repeat(320) + ' changed tail' }));
  const fresh = await (await f.preview()).json(); assert.equal(old.prompt, fresh.prompt); assert.notEqual(old.sourceHash, fresh.sourceHash);
  assert.equal((await f.send({ ...f.input, expectedPrompt: old.prompt, expectedSourceHash: old.sourceHash })).status, 409); assert.equal(f.app.control.requests.size, 0);
});
test('legacy per-project reports remain stored separately from the new all-project day', async t => {
  const f = await setup(t); await f.generate(); f.start(); f.record('daily.reported', { summary: 'Current all-project report.' }); f.record('run.ended', { outcome: 'idle' });
  const memory = f.app.store.reportMemory, current = [...memory.entries.values()][0];
  memory.entries.set('legacy', { ...current, scope: undefined, id: 'legacy-report', summary: 'Previous project summary.' }); memory.dirty = true; memory.flush();
  f.app.store.close(); const restored = new EventStore(f.dir); t.after(() => restored.close());
  const saved = restored.snapshot().dailyReport.summaries; assert.equal(saved.length, 2); assert.equal(saved.find(r => r.scope === 'all').summary, 'Current all-project report.'); assert.equal(saved.find(r => !r.scope).summary, 'Previous project summary.');
});
test('daily event projection rejects malformed/unbound text and discards arbitrary fields', () => {
  const value = validateEvent(event('daily.reported', { summary: 's'.repeat(3000), remaining: 'x'.repeat(1000), output: 'PRIVATE_RAW' }, { reportRequestId: 'generated' }));
  assert.equal(value.data.summary.length, 2400); assert.equal(value.data.remaining.length, 800); assert.equal(value.data.output, undefined);
  assert.throws(() => validateEvent(event('daily.reported', { summary: 'No binding' })), /daily summary/);
  assert.throws(() => validateEvent(event('daily.reported', { summary: {}, remaining: {} }, { reportRequestId: 'generated' })), /daily summary/);
});
test('corrupt generated report file is preserved without discarding captured work', async t => {
  const f = await setup(t); await f.generate(); f.app.store.close(); writeFileSync(join(f.dir, 'generated-reports.json'), '{broken');
  const restored = new EventStore(f.dir); t.after(() => restored.close());
  assert.equal(restored.snapshot().dailyReport.records.length, 1); assert.equal(restored.snapshot().dailyReport.summaries.length, 0);
  assert.ok(readdirSync(f.dir).some(n => n.startsWith('generated-reports.json.invalid-')));
});
test('report storage failure queues no command and a missing request prefix cannot publish completion', async t => {
  const f = await setup(t); const preview = await (await f.preview()).json(); const flush = f.app.store.reportMemory.flush.bind(f.app.store.reportMemory);
  f.app.store.reportMemory.flush = () => { throw new Error('Synthetic disk failure'); };
  assert.equal((await f.send({ ...f.input, expectedPrompt: preview.prompt, expectedSourceHash: preview.sourceHash })).status, 500); assert.equal(f.app.control.requests.size, 0); assert.equal(f.result(), undefined);
  f.app.store.reportMemory.flush = flush; await f.generate(); f.start(); f.record('daily.reported', { summary: 'Partial result.' }); f.app.store.sessions.clear(); f.record('run.ended', { outcome: 'idle' });
  assert.equal(f.result().status, 'unknown'); assert.equal(f.result().summary, '');
});
