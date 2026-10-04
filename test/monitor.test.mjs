import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { registerMonitor } from '../extensions/agent-dashboard/monitor.mjs';
import { MonitorClient } from '../extensions/agent-dashboard/client.mjs';
import { directory, event } from './helpers.mjs';
import { EventStore } from '../src/store.mjs';

function setup(t, options = {}) {
  const handlers = new Map(), tools = new Map(), commands = new Map();
  const pi = { on(name, f) { handlers.set(name, f); }, registerTool(tool) { tools.set(tool.name, tool); }, registerCommand(name, command) { commands.set(name, command); } };
  const client = { queue: [], dropped: 0, status: 'connected', enqueue(e) { this.queue.push(e); }, start() {}, async stop() {}, async flush() {} };
  const monitor = registerMonitor(pi, { schema: {}, client, ...options });
  const ctx = { cwd: '/projects/swift-app', model: { provider: 'provider', id: 'sol' }, sessionManager: { getSessionId: () => 'pi-session' }, ui: { notify() {} } };
  handlers.get('session_start')({}, ctx);
  t.after(async () => handlers.get('session_shutdown')({}, ctx));
  const emit = (type, e = {}) => handlers.get(type)?.({ type, ...e }, ctx);
  return { emit, client, ctx, tools, commands, pi, monitor };
}
test('Pi prompt, model, tool and shutdown events produce monitor records', t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'Fix the test' }); f.emit('agent_start');
  f.emit('model_select', { model: { provider: 'local', id: 'qwen' }, source: 'set' });
  f.emit('tool_execution_start', { toolCallId: 'tool1', toolName: 'read', args: { path: '/projects/swift-app/Sources/App.swift' } });
  f.emit('tool_execution_end', { toolCallId: 'tool1', toolName: 'read', isError: false, result: {} });
  const events = f.client.queue; assert.equal(events.find(e => e.type === 'prompt.received').data.prompt, 'Fix the test');
  assert.equal(events.find(e => e.type === 'tool.started').data.file, 'Sources/App.swift');
  assert.equal(events.find(e => e.type === 'model.selected').data.model, 'local/qwen');
});
test('raw command arguments, source code and thinking blocks are never collected', t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'hello' });
  f.emit('tool_execution_start', { toolCallId: 't', toolName: 'write', args: { path: 'a.swift', content: 'PRIVATE SOURCE', command: 'PRIVATE COMMAND' } });
  f.emit('message_end', { message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'PRIVATE REASONING' }, { type: 'text', text: 'Public summary' }] } });
  const serialized = JSON.stringify(f.client.queue); for (const x of ['PRIVATE SOURCE', 'PRIVATE COMMAND', 'PRIVATE REASONING']) assert.ok(!serialized.includes(x));
  assert.ok(serialized.includes('Public summary'));
});
test('Pi assistant errors expose only a bounded, redacted provider message', t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'Synthetic work' }); f.emit('agent_start');
  const message = { role: 'assistant', provider: 'openai-codex', model: 'fixture', stopReason: 'error', content: [],
    errorMessage: 'Codex error: Our servers are currently overloaded. Please try again later. api_key=PRIVATE_SECRET',
    stack: 'PRIVATE_STACK', response: { body: 'PRIVATE_BODY' } };
  f.emit('message_end', { message }); f.emit('agent_end', { messages: [message] });
  const observed = f.client.queue.filter(e => ['message.completed', 'run.ended'].includes(e.type));
  for (const e of observed) { assert.match(e.data.errorMessage, /servers are currently overloaded/); assert.ok(!e.data.errorMessage.includes('PRIVATE_SECRET')); }
  assert.equal(observed.at(-1).data.outcome, 'error');
  assert.ok(!JSON.stringify(f.client.queue).includes('PRIVATE_STACK')); assert.ok(!JSON.stringify(f.client.queue).includes('PRIVATE_BODY'));
});
test('disabled prompt capture hides provider-echoed details but still reports an error', t => {
  const f = setup(t, { capturePrompts: false }); f.emit('before_agent_start', { prompt: 'PRIVATE_PROMPT' });
  const message = { role: 'assistant', stopReason: 'error', content: [], errorMessage: 'PRIVATE_PROVIDER_ECHO' };
  f.emit('message_end', { message }); f.emit('agent_end', { messages: [message] });
  assert.match(f.client.queue.at(-1).data.errorMessage, /Details omitted/); assert.equal(f.client.queue.at(-1).data.outcome, 'error');
  assert.ok(!JSON.stringify(f.client.queue).includes('PRIVATE_'));
});
test('ordinary reply text and user cancellation do not become provider errors', t => {
  for (const stopReason of ['stop', 'aborted']) {
    const f = setup(t); f.emit('before_agent_start', { prompt: 'Synthetic work' });
    const message = { role: 'assistant', stopReason, errorMessage: 'NOT_A_PROVIDER_ERROR', content: [{ type: 'text', text: 'Error is discussed in this normal reply.' }] };
    f.emit('message_end', { message }); f.emit('agent_end', { messages: [message] });
    assert.equal(f.client.queue.at(-1).data.errorMessage, ''); assert.notEqual(f.client.queue.at(-1).data.outcome, 'error');
    assert.ok(!JSON.stringify(f.client.queue).includes('NOT_A_PROVIDER_ERROR'));
  }
});
test('pi-open-agents structured progress reveals actual child model and error', t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'work' });
  f.emit('tool_execution_start', { toolCallId: 'child1', toolName: 'subagent', args: { agent: 'mimo', task: 'Implement' } });
  const detail = { agent: 'mimo', model: 'provider/mimo', status: 'running', tools: [{ id: 'x', name: 'edit', args: { path: 'a.swift', content: 'private' }, status: 'running' }], usage: { input: 10, output: 2 }, elapsedMs: 20 };
  f.emit('tool_execution_update', { toolCallId: 'child1', toolName: 'subagent', partialResult: { details: detail } });
  f.emit('tool_execution_update', { toolCallId: 'child1', toolName: 'subagent', partialResult: { details: { ...detail, elapsedMs: 500, output: 'token delta only' } } });
  assert.equal(f.client.queue.filter(e => e.type === 'agent.progress').length, 1);
  assert.equal(f.client.queue.find(e => e.type === 'agent.started').data.model, '');
  assert.equal(f.client.queue.find(e => e.type === 'agent.progress').data.model, 'provider/mimo');
  f.emit('tool_execution_end', { toolCallId: 'child1', toolName: 'subagent', isError: false, result: { details: { ...detail, status: 'error', isError: true, exitCode: 1 } } });
  assert.equal(f.client.queue.find(e => e.type === 'agent.finished').data.isError, true);
});
test('completed subagent result with an observed error status is a failure', t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'work' });
  f.emit('tool_execution_start', { toolCallId: 'child1', toolName: 'subagent', args: { agent: 'mimo', task: 'Implement' } });
  // isError omitted/false and no exitCode: only details.status says 'error'.
  f.emit('tool_execution_end', { toolCallId: 'child1', toolName: 'subagent', isError: false, result: { details: { agent: 'mimo', model: 'provider/mimo', status: 'error' } } });
  const finished = f.client.queue.find(e => e.type === 'agent.finished');
  assert.equal(finished.data.status, 'error');
  assert.equal(finished.data.isError, true); // never a done/technical-completion record
});
test('a progress-only error status never fabricates a terminal mark', t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'work' });
  f.emit('tool_execution_start', { toolCallId: 'child1', toolName: 'subagent', args: { agent: 'mimo', task: 'Implement' } });
  f.emit('tool_execution_update', { toolCallId: 'child1', toolName: 'subagent', partialResult: { details: { agent: 'mimo', status: 'error' } } });
  assert.equal(f.client.queue.find(e => e.type === 'agent.progress').data.status, 'error'); // observed status passes through
  assert.equal(f.client.queue.some(e => e.type === 'agent.finished'), false); // only tool_execution_end is terminal
});
test('prompt capture can be explicitly disabled', t => {
  const f = setup(t, { capturePrompts: false }); f.emit('before_agent_start', { prompt: 'SENSITIVE PROMPT' });
  f.emit('message_end', { message: { role: 'assistant', content: [{ type: 'text', text: 'SENSITIVE ANSWER' }] } });
  assert.ok(!JSON.stringify(f.client.queue).includes('SENSITIVE'));
});
test('reported recommendations obey disabled prompt capture', async t => {
  const f = setup(t, { capturePrompts: false }); f.emit('before_agent_start', { prompt: 'PRIVATE_PROMPT' });
  await f.tools.get('workflow_report').execute('report', { stages: [{ id: 'a', title: 'Respond', status: 'done' }], recommendations: [{ id: 'next', title: 'PRIVATE_TITLE', prompt: 'PRIVATE_RECOMMENDATION' }] }, undefined, undefined, f.ctx);
  assert.deepEqual(f.client.queue.find(e => e.type === 'workflow.updated').data.recommendations, []);
  assert.ok(!JSON.stringify(f.client.queue).includes('PRIVATE_'));
});
test('local control opt-in is revoked on session-tree navigation', async t => {
  const f = setup(t); f.pi.sendUserMessage = () => assert.fail('No prompt is approved');
  f.ctx.isIdle = () => true; f.ctx.hasPendingMessages = () => false;
  const advertised = []; f.client.controlRequest = async p => { advertised.push(p); return { command: null }; };
  await f.commands.get('dashboard-control').handler('on', f.ctx); assert.equal(f.monitor.control.enabled, true);
  f.emit('session_tree'); assert.equal(f.monitor.control.enabled, false); assert.equal(advertised.at(-1).enabled, false);
});
test('workflow tool reports only; it cannot spawn a model or alter code', async t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'work' });
  const result = await f.tools.get('workflow_report').execute('x', { stages: [{ id: 'x', title: 'Plan', status: 'pending' }] }, undefined, undefined, f.ctx);
  assert.equal(result.details.recorded, true); assert.equal(f.client.queue.at(-1).type, 'workflow.updated');
});
test('workflow report acknowledges persistence failure without pretending to record a plan', async t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'work' });
  f.client.enqueue = () => false;
  const result = await f.tools.get('workflow_report').execute('x', { stages: [{ id: 'x', title: 'Plan', status: 'pending' }] }, undefined, undefined, f.ctx);
  assert.equal(result.details.recorded, false); assert.match(result.content[0].text, /could not be persisted/);
});
test('a new Pi session gets a different dashboard identity', t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'first' });
  const first = f.client.queue.at(-1).sessionId;
  f.ctx.sessionManager.getSessionId = () => 'another-session'; f.emit('session_start'); f.emit('before_agent_start', { prompt: 'second' });
  assert.notEqual(f.client.queue.at(-1).sessionId, first);
});
test('workflow profiles are captured per prompt and idle model changes cannot rewrite old runs', t => {
  let profile = { schemaVersion: 1, id: 'flow', version: '1', roles: [] };
  const f = setup(t, { readProfile: () => structuredClone(profile) });
  f.emit('before_agent_start', { prompt: 'first' }); f.emit('agent_start');
  const firstRun = f.client.queue.at(-1).runId;
  f.emit('agent_end');
  f.emit('model_select', { model: { provider: 'another', id: 'model' }, source: 'set' });
  assert.equal(f.client.queue.at(-1).runId, undefined);
  profile.version = '2'; f.emit('before_agent_start', { prompt: 'second' });
  const records = f.client.queue.filter(e => e.type === 'workflow.configured');
  assert.equal(records[0].data.workflow.version, '1'); assert.equal(records[0].runId, firstRun);
  assert.equal(records[1].data.workflow.version, '2'); assert.notEqual(records[1].runId, firstRun);
});
test('invalid workflow configuration cannot block ordinary Pi monitoring', t => {
  const f = setup(t, { readProfile: () => { throw new Error('invalid JSON'); } });
  f.emit('before_agent_start', { prompt: 'work' }); f.emit('agent_start');
  assert.ok(f.client.queue.some(e => e.type === 'monitor.warning'));
  assert.ok(f.client.queue.some(e => e.type === 'run.started'));
  assert.ok(!f.client.queue.some(e => e.type === 'workflow.configured'));
});
test('JUnit user command binds an explicitly selected fresh report to the completed request', async t => {
  let clock = new Date(Date.now() - 1000);
  const f = setup(t, { now: () => clock }); f.ctx.cwd = directory(t); f.emit('session_start');
  const notices = []; f.ctx.ui.notify = (text, level) => notices.push({ text, level });
  const command = f.commands.get('dashboard-evidence');
  assert.ok(command); assert.equal(f.tools.has('dashboard-evidence'), false);
  await command.handler('report.xml', f.ctx); assert.match(notices.at(-1).text, /Finish a request/);
  f.emit('before_agent_start', { prompt: 'work' }); f.emit('agent_start');
  await command.handler('report.xml', f.ctx); assert.match(notices.at(-1).text, /Finish a request/);
  f.emit('agent_end'); const id = f.client.queue.at(-1).runId;
  writeFileSync(join(f.ctx.cwd, 'report with spaces.xml'), '<testsuite><testcase name="a"/></testsuite>');
  clock = new Date();
  await command.handler('"report with spaces.xml"', f.ctx);
  assert.equal(notices.at(-1).level, 'info');
  const e = f.client.queue.at(-1); assert.equal(e.type, 'tests.recorded'); assert.equal(e.runId, id);
  assert.equal(e.data.evidence.passed, 1);
  f.emit('before_agent_start', { prompt: 'new work' }); f.emit('agent_end');
  utimesSync(join(f.ctx.cwd, 'report with spaces.xml'), 1, 1);
  const count = f.client.queue.length; await command.handler('report with spaces.xml', f.ctx);
  assert.equal(f.client.queue.length, count); assert.match(notices.at(-1).text, /latest request/);
  f.emit('session_start'); await command.handler('report with spaces.xml', f.ctx);
  assert.match(notices.at(-1).text, /Finish a request/);
});
test('JUnit import reports disk rejection and never records parser failures as passing tests', async t => {
  const f = setup(t, { now: () => new Date(Date.now() - 100) }); f.ctx.cwd = directory(t); f.emit('session_start');
  const notices = []; f.ctx.ui.notify = text => notices.push(text);
  f.emit('before_agent_start', { prompt: 'work' }); f.emit('agent_end');
  const path = join(f.ctx.cwd, 'report.xml'), command = f.commands.get('dashboard-evidence');
  writeFileSync(path, '<testsuite tests="10" failures="0"/>');
  const count = f.client.queue.length; await command.handler('report.xml', f.ctx);
  assert.equal(f.client.queue.length, count); assert.match(notices.at(-1), /disagrees/);
  writeFileSync(path, '<testsuite><testcase name="a"/></testsuite>');
  f.client.enqueue = () => false; await command.handler('report.xml', f.ctx);
  assert.match(notices.at(-1), /could not be persisted/);
});
test('client queue is bounded and transient delivery failure is retryable', async t => {
  const dir = directory(t); const file = join(dir, 'connection.json');
  writeFileSync(file, JSON.stringify({ url: 'http://127.0.0.1:7331', token: 'a'.repeat(64) }));
  let count = 0;
  const client = new MonitorClient({ configPath: file, maxQueue: 3, fetchImpl: async () => { count++; if (count === 1) throw new Error('offline'); return Response.json({ accepted: 3 }); } });
  t.after(() => client.stop());
  for (let i = 0; i < 5; i++) client.enqueue(event('run.started', {}, { id: String(i) }));
  assert.equal(client.queue.length, 3); assert.equal(client.dropped, 2);
  await client.flush(true); assert.equal(client.status, 'disconnected'); assert.equal(client.queue.length, 3);
  await client.flush(true); assert.equal(client.status, 'connected'); assert.equal(client.queue.length, 0);
});
test('client refuses non-local collector endpoints', async t => {
  const file = join(directory(t), 'connection.json');
  writeFileSync(file, JSON.stringify({ url: 'https://example.com', token: 'a'.repeat(64) }));
  let called = false; const client = new MonitorClient({ configPath: file, fetchImpl: async () => { called = true; } });
  t.after(() => client.stop());
  client.enqueue(event('run.started', {}, { id: 'x' })); await client.flush(true); assert.equal(called, false); assert.equal(client.status, 'disconnected');
});

const captured = JSON.parse(readFileSync(new URL('./fixtures/pi-open-agents-0.1.22.json', import.meta.url), 'utf8'));
for (const scenario of captured.cases) test(`captured Pi ${captured.provenance.pi}: ${scenario.name}`, t => {
  const f = setup(t);
  f.ctx.model = { provider: 'openai-codex', id: 'gpt-6-sol' };
  f.emit('before_agent_start', { prompt: 'Read-only fixture verification' }); f.emit('agent_start');
  const store = new EventStore(directory(t));
  let consumed = 0;
  const snapshot = () => {
    while (consumed < f.client.queue.length) store.append(f.client.queue[consumed++]);
    return store.snapshot().sessions[0].runs[0];
  };
  for (const record of scenario.events) {
    f.emit(record.type, record);
    const run = snapshot();
    if (record.type === 'tool_execution_update') {
      assert.equal(run.agents[record.toolCallId].finished, false, 'Terminal-looking progress is not a finish');
    }
    if (record.type === 'tool_execution_end') {
      const details = record.result.details;
      const agent = run.agents[record.toolCallId];
      assert.equal(agent.finished, true);
      assert.equal(agent.model, details.model, 'Preserve observed IDs; do not invent missing provider prefixes');
      assert.equal(agent.elapsedMs, details.elapsedMs);
      assert.deepEqual(agent.usage, details.usage, 'Cumulative progress and final usage must not be added twice');
    }
  }
  f.emit('agent_end', { messages: [{ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Finished smoke check' }] }] });
  f.emit('agent_settled');
  const run = snapshot();
  assert.equal(run.performance.verdict, scenario.expectedVerdict);
  assert.equal(run.performance.agents.unresolved, 0);
  assert.equal(run.performance.toolFailureCount, 0, 'A child error must not also count as a separate tool failure');
  if (scenario.expectedVerdict === 'failed') {
    assert.equal(run.outcome, 'idle', 'A normal parent response does not hide the observed child failure');
    assert.equal(run.performance.agents.failed, 1);
  } else assert.equal(run.performance.agents.finished, 2);
});
