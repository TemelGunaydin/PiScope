import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/store.mjs';
import { directory, event } from './helpers.mjs';

const perf = store => store.snapshot().sessions[0].runs[0].performance;
const project = store => store.snapshot().projects[0];

test('terminal idle run with finished child is technical completion only', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.started', { agentCallId: 'a1', agent: 'mimo', model: 'p/mimo', source: 'observed' }));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', model: 'p/mimo', isError: false, elapsedMs: 1200, usage: { input: 10, output: 2 } }));
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.equal(p.verdict, 'completed');
  assert.deepEqual(p.agents, { finished: 1, failed: 0, unresolved: 0 });
  assert.equal(p.invocations[0].elapsedMs, 1200);
  assert.equal(p.invocations[0].usage.input, 10);
  assert.equal(p.toolFailureCount, 0);
  const h = project(store).live;
  assert.equal(h.completed, 1); assert.equal(h.terminal, 1); assert.equal(h.technicalCompletionRatio, 1);
});

test('parent error outcome is a failed run', t => {
  const store = new EventStore(directory(t));
  store.append(event('run.ended', { outcome: 'error' }));
  assert.equal(perf(store).verdict, 'failed');
  const h = project(store).live;
  assert.equal(h.failed, 1); assert.equal(h.completed, 0); assert.equal(h.unknown, 0);
});

test('child failure despite an idle parent is not success', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', isError: true }));
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.equal(p.verdict, 'failed');
  assert.deepEqual(p.agents, { finished: 0, failed: 1, unresolved: 0 });
  const h = project(store).live;
  assert.equal(h.failed, 1); assert.equal(h.completed, 0);
});

test('started-but-unfinished and progress-done agents stay unresolved', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.started', { agentCallId: 'a1', agent: 'mimo' }));
  store.append(event('agent.progress', { agentCallId: 'a1', agent: 'mimo', status: 'done' }));
  let p = perf(store);
  assert.deepEqual(p.agents, { finished: 0, failed: 0, unresolved: 1 });
  assert.equal(p.invocations[0].status, 'unresolved');
  assert.equal(p.invocations[0].elapsedMs, undefined);
  assert.equal(p.invocations[0].usage, undefined);
  store.append(event('run.ended', { outcome: 'idle' }));
  p = perf(store);
  assert.equal(p.verdict, 'unknown');
  assert.equal(project(store).live.completed, 0);
  assert.equal(project(store).live.unknown, 1);
});

test('parent cancellation is recorded as cancelled', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', isError: false }));
  store.append(event('run.ended', { outcome: 'aborted' }));
  assert.equal(perf(store).verdict, 'cancelled');
  const h = project(store).live;
  assert.equal(h.cancelled, 1); assert.equal(h.completed, 0);
});

test('reported workflow stages are never observed completion', t => {
  const store = new EventStore(directory(t));
  store.append(event('workflow.updated', { stages: [{ id: 'x', title: 'Build', status: 'done' }, { id: 'y', title: 'Test', status: 'done' }] }));
  const p = perf(store);
  assert.equal(p.verdict, 'unknown');
  assert.equal(project(store).live.unknown, 1);
  assert.equal(project(store).live.completed, 0);
});

test('missing run.ended and automatic continuation never fake a success', t => {
  const store = new EventStore(directory(t));
  store.append(event('run.ended', { outcome: 'idle' }));
  assert.equal(perf(store).verdict, 'completed');
  store.append(event('run.started', { model: 'p/m' })); // automatic continuation
  assert.equal(perf(store).verdict, 'unknown');
  store.append(event('run.settled')); // settled without an observed final run.ended
  assert.equal(perf(store).verdict, 'unknown');
  assert.equal(project(store).live.completed, 0);
  assert.equal(project(store).live.unknown, 1);
});

test('derived verdicts survive journal replay and restart', t => {
  const dir = directory(t); const a = new EventStore(dir);
  a.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', isError: false, elapsedMs: 500 }));
  a.append(event('run.ended', { outcome: 'idle' }));
  a.append(event('run.ended', { outcome: 'error' }, { runId: 'run-b' }));
  a.append(event('run.ended', { outcome: 'aborted' }, { runId: 'run-c' }));
  const before = a.snapshot().projects[0].live;
  const b = new EventStore(dir);
  const restored = b.snapshot();
  assert.deepEqual(restored.projects[0].live, before);
  assert.equal(restored.sessions[0].runs[0].performance.verdict, 'completed');
  assert.equal(restored.sessions[0].runs[0].performance.invocations[0].elapsedMs, 500);
  assert.equal(restored.sessions[0].connected, false);
});

test('duplicate events and agent retries are not double counted', t => {
  const store = new EventStore(directory(t));
  const finished = event('agent.finished', { agentCallId: 'a1', agent: 'mimo', isError: false, usage: { input: 5 } });
  store.append(finished); store.append(finished);
  store.append(event('agent.started', { agentCallId: 'retry-1', agent: 'mimo' }));
  store.append(event('agent.finished', { agentCallId: 'retry-1', agent: 'mimo', isError: true }));
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.equal(p.invocationsTotal, 2); // retry of the same agent is a separate call
  assert.deepEqual(p.agents, { finished: 1, failed: 1, unresolved: 0 });
  const r = store.snapshot().sessions[0].runs[0];
  assert.equal(Object.keys(r.usage).length, 1);
  const h = project(store).live;
  assert.equal(h.failed, 1); assert.equal(h.completed, 0); assert.equal(h.total, 1);
});

test('observed tool failures are not duplicated by subagent failures', t => {
  const store = new EventStore(directory(t));
  store.append(event('tool.started', { toolCallId: 't1', toolName: 'bash' }));
  store.append(event('tool.finished', { toolCallId: 't1', toolName: 'bash', isError: true }));
  store.append(event('tool.finished', { toolCallId: 'sub1', toolName: 'subagent', isError: true }));
  store.append(event('agent.finished', { agentCallId: 'sub1', agent: 'mimo', isError: true }));
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.equal(p.toolFailureCount, 1); // child failure counted once, as an agent failure
  assert.deepEqual(p.agents, { finished: 0, failed: 1, unresolved: 0 });
});

test('demo runs are excluded from the live project aggregate', t => {
  const store = new EventStore(directory(t));
  store.append(event('run.ended', { outcome: 'idle' }, { runId: 'live-1' }));
  store.append(event('run.ended', { outcome: 'error' }, { runId: 'demo-1', sessionId: 'session-demo', demo: true }));
  const p = project(store);
  assert.equal(p.live.total, 1); assert.equal(p.live.completed, 1); assert.equal(p.live.failed, 0);
  assert.equal(p.demo.total, 1); assert.equal(p.demo.failed, 1);
});

test('history aggregate reflects bounded retained runs without inventing data', t => {
  const store = new EventStore(directory(t));
  for (let i = 0; i < 31; i++) store.append(event('run.ended', { outcome: 'idle' }, { runId: `run-${i}` }));
  const h = project(store).live;
  assert.equal(h.total, 30); // MAX_RUNS per session; older runs dropped, never guessed
  assert.equal(h.completed, 30);
  assert.equal(h.technicalCompletionRatio, 1);
  const empty = new EventStore(directory(t)).snapshot().projects;
  assert.deepEqual(empty, []);
});

test('unrecognized run.ended outcomes are unknown, never completed', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', isError: false }));
  store.append(event('run.ended', { outcome: 'timeout' })); // authenticated but not a known terminal outcome
  const r = store.snapshot().sessions[0].runs[0];
  assert.equal(r.performance.verdict, 'unknown');
  assert.equal(r.status, 'unknown'); // no mismatched 'idle' status in the UI either
  const h = project(store).live;
  assert.equal(h.completed, 0); assert.equal(h.failed, 0); assert.equal(h.unknown, 1);
  assert.equal(h.terminal, 0); assert.equal(h.technicalCompletionRatio, undefined);
});

test('missing start keeps duration missing; reported elapsedMs is preserved', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', isError: false })); // first-seen finish, no start
  let r = store.snapshot().sessions[0].runs[0];
  assert.equal(r.agents.a1.startedAt, undefined);
  assert.equal(r.agents.a1.endedAt !== undefined, true);
  assert.equal(r.performance.invocations[0].elapsedMs, undefined); // never a false 0 ms
  store.append(event('agent.finished', { agentCallId: 'a2', agent: 'mimo', isError: false, elapsedMs: 800 }));
  assert.equal(perf(store).invocations[1].elapsedMs, 800); // observed duration survives
});

test('progress without a start or reported elapsed never fabricates a duration', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.progress', { agentCallId: 'a1', agent: 'mimo', status: 'running' }));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', isError: false }));
  const invocation = perf(store).invocations[0];
  assert.equal(invocation.elapsedMs, undefined);
  assert.equal(store.snapshot().sessions[0].runs[0].agents.a1.startedAt, undefined);
});

test('subagent tool error without a matching failed agent is never hidden success', t => {
  const store = new EventStore(directory(t));
  store.append(event('tool.finished', { toolCallId: 'sub1', toolName: 'subagent', isError: true })); // no agent.started/finished at all
  store.append(event('run.ended', { outcome: 'idle' })); // idle parent must not launder the failure
  const p = perf(store);
  assert.equal(p.toolFailureCount, 1); // hidden only when a matching failed terminal agent is counted
  assert.equal(p.verdict, 'failed'); // observed error evidence: conservatively failed, never completed
  const h = project(store).live;
  assert.equal(h.completed, 0); assert.equal(h.failed, 1);
});

test('started-but-unfinished child with a subagent tool error is not completed', t => {
  const store = new EventStore(directory(t));
  store.append(event('tool.finished', { toolCallId: 'sub1', toolName: 'subagent', isError: true }));
  store.append(event('agent.started', { agentCallId: 'sub1', agent: 'mimo' })); // no matching agent.finished
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.equal(p.toolFailureCount, 1);
  assert.equal(p.verdict, 'failed');
  assert.equal(project(store).live.completed, 0);
});

test('run.ended with an empty/missing outcome is unknown, never idle success', t => {
  const store = new EventStore(directory(t));
  store.append(event('run.ended', {})); // empty data: outcome absent (schema allows it)
  store.append(event('run.ended', { outcome: '' }, { runId: 'run-b' })); // empty-string outcome
  for (const r of store.snapshot().sessions[0].runs) {
    assert.equal(r.status, 'unknown'); // no 'Yanıt tamamlandı' from a missing outcome
    assert.equal(r.outcome, 'unknown'); // never invented 'idle'
    assert.equal(r.performance.verdict, 'unknown');
  }
  const h = project(store).live;
  assert.equal(h.unknown, 2); assert.equal(h.completed, 0); assert.equal(h.failed, 0); assert.equal(h.cancelled, 0);
  assert.equal(h.terminal, 0); // denominator is completed + failed + cancelled only
  assert.equal(h.technicalCompletionRatio, undefined);
});

test('run.settled without a matching run.ended never shows idle completion', t => {
  const store = new EventStore(directory(t));
  store.append(event('run.settled', {}, { runId: 'run-a' })); // settled alone: no run.ended observed
  store.append(event('run.ended', { outcome: 'error' }, { runId: 'run-b' }));
  store.append(event('run.settled', {}, { runId: 'run-b' })); // known terminal status must survive
  store.append(event('run.ended', { outcome: 'idle' }, { runId: 'run-c' }));
  store.append(event('run.settled', {}, { runId: 'run-c' })); // known terminal status must survive
  store.append(event('run.ended', { outcome: 'idle' }, { runId: 'run-d' }));
  store.append(event('run.started', { model: 'p/m' }, { runId: 'run-d' })); // automatic continuation
  store.append(event('run.settled', {}, { runId: 'run-d' })); // continued run ended without a new run.ended
  const runs = Object.fromEntries(store.snapshot().sessions[0].runs.map(r => [r.id, r]));
  assert.equal(runs['run-a'].status, 'unknown');
  assert.equal(runs['run-a'].performance.verdict, 'unknown');
  assert.equal(runs['run-b'].status, 'error');
  assert.equal(runs['run-c'].status, 'idle');
  assert.equal(runs['run-c'].performance.verdict, 'completed');
  assert.equal(runs['run-d'].status, 'unknown'); // continuation without an end outcome stays unknown
  assert.equal(runs['run-d'].performance.verdict, 'unknown');
  const h = project(store).live;
  assert.equal(h.unknown, 2); assert.equal(h.completed, 1); assert.equal(h.failed, 1); assert.equal(h.terminal, 2);
});

test('agent.finished with an observed error status is a failure without isError', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', status: 'error' })); // isError omitted, no exitCode
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.deepEqual(p.agents, { finished: 0, failed: 1, unresolved: 0 });
  assert.equal(p.verdict, 'failed'); // observed error status is failure, never technical completion
  const h = project(store).live;
  assert.equal(h.failed, 1); assert.equal(h.completed, 0);
});

test('a progress-only error status is not terminal and not a silent success', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.started', { agentCallId: 'a1', agent: 'mimo' }));
  store.append(event('agent.progress', { agentCallId: 'a1', agent: 'mimo', status: 'error' }));
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.deepEqual(p.agents, { finished: 0, failed: 0, unresolved: 1 }); // progress is never a terminal mark
  assert.equal(p.verdict, 'unknown'); // not failed, and never completed
  const h = project(store).live;
  assert.equal(h.unknown, 1); assert.equal(h.failed, 0); assert.equal(h.completed, 0);
});

test('finished records with cancelled/failed/blocked status are failures, never done', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', status: 'cancelled', isError: false })); // explicit non-success wins over isError: false
  store.append(event('agent.finished', { agentCallId: 'a2', agent: 'mimo', status: 'failed' })); // isError omitted
  store.append(event('agent.finished', { agentCallId: 'a3', agent: 'mimo', status: 'blocked' })); // isError missing
  store.append(event('run.ended', { outcome: 'idle' })); // idle parent must not launder these into completion
  const p = perf(store);
  assert.deepEqual(p.agents, { finished: 0, failed: 3, unresolved: 0 });
  assert.equal(p.invocations.every(i => i.status === 'failed'), true);
  assert.equal(p.verdict, 'failed'); // counts and verdict agree
  assert.equal(store.snapshot().sessions[0].runs[0].agents.a1.status, 'error'); // UI vocabulary, no 'done'
  const h = project(store).live;
  assert.equal(h.failed, 1); assert.equal(h.completed, 0); assert.equal(h.terminal, 1);
});

test('unknown or in-progress literals in a finished record never claim success', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', status: 'queued' })); // in-progress literal in a finished record
  store.append(event('agent.finished', { agentCallId: 'a2', agent: 'mimo', status: 'timeout' })); // unknown literal
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.deepEqual(p.agents, { finished: 0, failed: 0, unresolved: 2 });
  assert.equal(p.invocations.every(i => i.status === 'unresolved'), true);
  assert.equal(p.verdict, 'unknown'); // counts and verdict agree: never completed
  assert.equal(store.snapshot().sessions[0].runs[0].agents.a1.status, 'unknown');
  const h = project(store).live;
  assert.equal(h.completed, 0); assert.equal(h.failed, 0); assert.equal(h.unknown, 1); assert.equal(h.terminal, 0);
});

test('an explicit failure wins over an unknown finished status', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', status: 'mystery', isError: true }));
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.deepEqual(p.agents, { finished: 0, failed: 1, unresolved: 0 });
  assert.equal(p.verdict, 'failed');
});

test('a finished record without any status is done only with explicit isError: false', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', isError: false })); // preserved legacy success
  store.append(event('agent.finished', { agentCallId: 'a2', agent: 'mimo' })); // no status, no isError: not success evidence
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.equal(p.invocations[0].status, 'finished');
  assert.deepEqual(p.agents, { finished: 1, failed: 0, unresolved: 1 });
  assert.equal(p.verdict, 'unknown'); // one unresolved child: never technical completion
});

test('the known done literal stays a finished success', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', status: 'done' })); // adapter success literal
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.deepEqual(p.agents, { finished: 1, failed: 0, unresolved: 0 });
  assert.equal(p.verdict, 'completed');
});

test('a progress-only non-success status is never terminal', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.started', { agentCallId: 'a1', agent: 'mimo' }));
  store.append(event('agent.progress', { agentCallId: 'a1', agent: 'mimo', status: 'cancelled' }));
  store.append(event('agent.progress', { agentCallId: 'a1', agent: 'mimo', status: 'error' })); // progress-only error stays non-terminal
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.deepEqual(p.agents, { finished: 0, failed: 0, unresolved: 1 }); // neither progress terminates nor succeeds
  assert.equal(p.verdict, 'unknown');
  assert.equal(project(store).live.completed, 0);
});

test('a late progress status cannot regress a normalized finished record', t => {
  const store = new EventStore(directory(t));
  store.append(event('agent.finished', { agentCallId: 'a1', agent: 'mimo', status: 'blocked' })); // normalized failure
  store.append(event('agent.progress', { agentCallId: 'a1', agent: 'mimo', status: 'done' })); // late progress must not overwrite
  store.append(event('run.ended', { outcome: 'idle' }));
  const p = perf(store);
  assert.deepEqual(p.agents, { finished: 0, failed: 1, unresolved: 0 });
  assert.equal(p.verdict, 'failed');
});
