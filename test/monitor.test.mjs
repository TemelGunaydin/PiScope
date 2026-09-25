import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerMonitor } from '../extensions/agent-dashboard/monitor.mjs';
import { MonitorClient } from '../extensions/agent-dashboard/client.mjs';
import { directory } from './helpers.mjs';

function setup(t, options = {}) {
  const handlers = new Map(), tools = new Map(), commands = new Map();
  const pi = { on(name, f) { handlers.set(name, f); }, registerTool(tool) { tools.set(tool.name, tool); }, registerCommand(name, command) { commands.set(name, command); } };
  const client = { queue: [], dropped: 0, status: 'connected', enqueue(e) { this.queue.push(e); }, start() {}, async stop() {}, async flush() {} };
  registerMonitor(pi, { schema: {}, client, ...options });
  const ctx = { cwd: '/projects/swift-app', model: { provider: 'provider', id: 'sol' }, sessionManager: { getSessionId: () => 'pi-session' }, ui: { notify() {} } };
  handlers.get('session_start')({}, ctx);
  t.after(async () => handlers.get('session_shutdown')({}, ctx));
  const emit = (type, e = {}) => handlers.get(type)?.({ type, ...e }, ctx);
  return { emit, client, ctx, tools, commands };
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
test('prompt capture can be explicitly disabled', t => {
  const f = setup(t, { capturePrompts: false }); f.emit('before_agent_start', { prompt: 'SENSITIVE PROMPT' });
  f.emit('message_end', { message: { role: 'assistant', content: [{ type: 'text', text: 'SENSITIVE ANSWER' }] } });
  assert.ok(!JSON.stringify(f.client.queue).includes('SENSITIVE'));
});
test('workflow tool reports only; it cannot spawn a model or alter code', async t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'work' });
  const result = await f.tools.get('workflow_report').execute('x', { stages: [{ id: 'x', title: 'Plan', status: 'pending' }] }, undefined, undefined, f.ctx);
  assert.equal(result.details.recorded, true); assert.equal(f.client.queue.at(-1).type, 'workflow.updated');
});
test('a new Pi session gets a different dashboard identity', t => {
  const f = setup(t); f.emit('before_agent_start', { prompt: 'first' });
  const first = f.client.queue.at(-1).sessionId;
  f.ctx.sessionManager.getSessionId = () => 'another-session'; f.emit('session_start'); f.emit('before_agent_start', { prompt: 'second' });
  assert.notEqual(f.client.queue.at(-1).sessionId, first);
});
test('client queue is bounded and transient delivery failure is retryable', async t => {
  const dir = directory(t); const file = join(dir, 'connection.json');
  writeFileSync(file, JSON.stringify({ url: 'http://127.0.0.1:7331', token: 'a'.repeat(64) }));
  let count = 0;
  const client = new MonitorClient({ configPath: file, maxQueue: 3, fetchImpl: async () => { count++; if (count === 1) throw new Error('offline'); return new Response('{}', { status: 200 }); } });
  for (let i = 0; i < 5; i++) client.enqueue({ id: String(i) });
  assert.equal(client.queue.length, 3); assert.equal(client.dropped, 2);
  await client.flush(true); assert.equal(client.status, 'disconnected'); assert.equal(client.queue.length, 3);
  await client.flush(true); assert.equal(client.status, 'connected'); assert.equal(client.queue.length, 0);
});
test('client refuses non-local collector endpoints', async t => {
  const file = join(directory(t), 'connection.json');
  writeFileSync(file, JSON.stringify({ url: 'https://example.com', token: 'a'.repeat(64) }));
  let called = false; const client = new MonitorClient({ configPath: file, fetchImpl: async () => { called = true; } });
  client.enqueue({ id: 'x' }); await client.flush(true); assert.equal(called, false); assert.equal(client.status, 'disconnected');
});
