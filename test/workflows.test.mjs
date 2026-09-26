import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventStore } from '../src/store.mjs';
import { workflowProfile, readWorkflowProfile } from '../extensions/agent-dashboard/workflow.mjs';
import { event, directory } from './helpers.mjs';

const profile = { schemaVersion: 1, id: 'implement-review', version: '1', label: 'Review workflow', taskSet: 'benchmark-1', roles: [{ role: 'review', agent: 'reviewer' }] };
const comparisons = store => store.snapshot().projects[0].workflows.live;
function run(store, id, { workflow = profile, model = 'custom-provider/model-a', mainModel = 'provider/main', agent = 'reviewer', outcome = 'idle', usage = { input: 10, output: 5 }, started = true, finished = true, source = 'observed', demo = false } = {}) {
  let tick = 0;
  const send = (type, data) => store.append(event(type, data, { runId: id, sessionId: demo ? 'demo-session' : 'session-a', demo, time: new Date(1800000000000 + tick++ * 1000).toISOString() }));
  send('prompt.received', { prompt: 'Read-only benchmark' });
  if (workflow) send('workflow.configured', { workflow });
  if (started) send('run.started', { model: mainModel });
  send('agent.started', { agentCallId: 'child', agent, model: 'requested/model', source: 'requested' });
  send('agent.progress', { agentCallId: 'child', agent, model, source, usage });
  if (finished) send('agent.finished', { agentCallId: 'child', agent, model, source, usage, isError: false });
  if (outcome) send('run.ended', { outcome });
}

test('model swaps split workflow groups while previous snapshots survive restart', t => {
  const dir = directory(t), store = new EventStore(dir);
  run(store, 'one');
  run(store, 'two', { model: 'another-provider/model-b' });
  run(store, 'three');
  const before = comparisons(store);
  assert.equal(before.groups.length, 2);
  assert.equal(before.groups[0].total, 2);
  assert.equal(before.groups[1].total, 1);
  assert.deepEqual(before.groups[0].models.find(m => m.role === 'review').models, ['custom-provider/model-a']);
  assert.equal(before.groups[0].meanReportedTokens, 15, 'Cumulative child usage counted once');
  assert.equal(before.groups[0].durationSamples, 2);
  assert.deepEqual(comparisons(new EventStore(dir)), before);
});

test('workflow identity, version, task set and main model define separate groups', t => {
  const store = new EventStore(directory(t));
  run(store, 'one');
  run(store, 'two', { workflow: { ...profile, version: '2' } });
  run(store, 'three', { workflow: { ...profile, id: 'different-workflow' } });
  run(store, 'four', { workflow: { ...profile, taskSet: 'benchmark-2' } });
  run(store, 'five', { mainModel: 'other/main' });
  assert.equal(comparisons(store).groups.length, 5);
});

test('role identity does not depend on a model-named agent alias', t => {
  const store = new EventStore(directory(t));
  run(store, 'one');
  run(store, 'two', { agent: 'renamed-reviewer', workflow: { ...profile, roles: [{ role: 'review', agent: 'renamed-reviewer' }] } });
  assert.equal(comparisons(store).groups.length, 1);
  assert.equal(comparisons(store).groups[0].total, 2);
});

test('unknown runs are excluded from rates and measurement averages', t => {
  const store = new EventStore(directory(t));
  run(store, 'one');
  run(store, 'two', { outcome: undefined, finished: false, usage: { input: 9000 } });
  const group = comparisons(store).groups[0];
  assert.equal(group.unknown, 1); assert.equal(group.terminal, 1);
  assert.equal(group.technicalCompletionRatio, 1);
  assert.equal(group.meanReportedTokens, 15); assert.equal(group.tokenSamples, 1);
  assert.equal(group.durationSamples, 1);
});

test('missing measurements remain absent and explicitly reported zero remains zero', t => {
  const store = new EventStore(directory(t));
  run(store, 'one', { started: false, usage: {} });
  const missing = comparisons(store).groups[0];
  assert.equal(missing.meanElapsedMs, undefined); assert.equal(missing.durationSamples, 0);
  assert.equal(missing.meanReportedTokens, undefined); assert.equal(missing.tokenSamples, 0);
  run(store, 'two', { started: false, usage: { input: 0 } });
  const zero = comparisons(store).groups[0];
  assert.equal(zero.meanReportedTokens, 0); assert.equal(zero.tokenSamples, 1);
});

test('requested model is not observed and unbound agents are not relabeled', t => {
  const store = new EventStore(directory(t));
  run(store, 'one', { agent: 'extra', source: 'requested' });
  const group = comparisons(store).groups[0];
  assert.deepEqual(group.models.find(m => m.role === 'review').models, []);
  assert.deepEqual(group.models.find(m => m.role === 'unmapped:extra').models, []);
  assert.ok(!JSON.stringify(group.models).includes('requested/model'));
});

test('mid-run primary model switches are retained in workflow identity', t => {
  const store = new EventStore(directory(t));
  run(store, 'one', { outcome: null });
  store.append(event('model.selected', { model: 'second-provider/second-model' }, { runId: 'one' }));
  store.append(event('run.ended', { outcome: 'idle' }, { runId: 'one' }));
  assert.deepEqual(comparisons(store).groups[0].models.find(m => m.role === 'primary').models, ['provider/main', 'second-provider/second-model']);
});

test('profile-less and conflicting runs stay outside comparisons; first profile is retained', t => {
  const store = new EventStore(directory(t));
  run(store, 'legacy', { workflow: null }); run(store, 'one');
  store.append(event('workflow.configured', { workflow: { ...profile, version: '2' } }, { runId: 'one' }));
  assert.deepEqual(comparisons(store), { unconfigured: 1, conflicted: 1, groups: [] });
  assert.equal(store.snapshot().sessions[0].runs[1].workflow.version, '1');
});

test('demo and live comparisons are separate and duplicate delivery is idempotent', t => {
  const store = new EventStore(directory(t)); run(store, 'live'); run(store, 'demo', { demo: true });
  const e = event('message.completed', { usage: { input: 20 } }, { runId: 'live' });
  store.append(e); store.append(e);
  const { live, demo } = store.snapshot().projects[0].workflows;
  assert.equal(live.groups[0].total, 1); assert.equal(demo.groups[0].total, 1);
  assert.equal(live.groups[0].meanReportedTokens, 35); assert.equal(demo.groups[0].meanReportedTokens, 15);
});

test('profile reader projects safe fields and rejects ambiguous or oversized bindings', t => {
  const dir = directory(t); assert.equal(readWorkflowProfile(dir), undefined);
  mkdirSync(join(dir, '.pi'));
  const path = join(dir, '.pi', 'agent-dashboard.workflow.json');
  writeFileSync(path, JSON.stringify({ ...profile, apiKey: 'not-collected', models: { private: 'ignored' } }));
  assert.deepEqual(readWorkflowProfile(dir), workflowProfile(profile));
  assert.throws(() => workflowProfile({ ...profile, roles: [...profile.roles, { role: 'implementation', agent: 'reviewer' }] }), /unique/);
  assert.throws(() => workflowProfile({ ...profile, roles: [{ role: 'primary', agent: 'parent' }] }), /unique/);
  assert.throws(() => workflowProfile({ ...profile, version: 1 }), /version/);
  writeFileSync(path, ' '.repeat(17000)); assert.throws(() => readWorkflowProfile(dir), /16 KB/);
});
