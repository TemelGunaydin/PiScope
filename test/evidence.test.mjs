import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseJUnit, readJUnitReport, evidenceRecord, MAX_REPORT_BYTES } from '../extensions/agent-dashboard/evidence.mjs';
import { validateEvent } from '../src/events.mjs';
import { EventStore } from '../src/store.mjs';
import { MonitorClient } from '../extensions/agent-dashboard/client.mjs';
import { directory, event, fixture } from './helpers.mjs';

const xml = (result = '', name = 'case') => `<testsuite name="suite"><testcase name="${name}" classname="Unit">${result}</testcase></testsuite>`;
function report(t, content = xml()) {
  const dir = directory(t), file = join(dir, 'junit.xml'); writeFileSync(file, content);
  return readJUnitReport(dir, 'junit.xml', 0);
}
const workflow = { schemaVersion: 1, id: 'flow', version: '1', roles: [], taskSet: 'same-tasks' };
function run(store, runId, evidence, options = {}) {
  for (const [type, data] of [['run.started', { model: 'any/model' }], ['workflow.configured', { workflow }],
    ['workflow.updated', { stages: [{ id: 'test', title: 'Tests passed (agent claim)', status: 'done' }] }], ['run.ended', { outcome: 'idle' }]]) store.append(event(type, data, { runId, ...options }));
  if (evidence) store.append(event('tests.recorded', { evidence }, { runId, ...options }));
}
const group = store => store.snapshot().projects[0].workflows.live.groups[0];

test('JUnit counts actual nested cases without counting aggregate suites twice', () => {
  const result = parseJUnit(`<?xml version="1.0" encoding="UTF-8"?>
    <testsuites tests="4" failures="1" errors="1" skipped="1">
      <testsuite name="outer" tests="4"><testsuite name="inner" tests="4">
        <testcase name="passes &amp; escapes"/><testcase name="fails"><failure><![CDATA[<private>]]></failure></testcase>
        <testcase name="errors"><error message="SECRET">trace</error></testcase><testcase name="skips"><skipped/></testcase>
      </testsuite></testsuite><system-out>PRIVATE OUTPUT</system-out>
    </testsuites>`);
  assert.deepEqual({ ...result, suiteHash: undefined }, { tests: 4, passed: 1, failures: 1, errors: 1, skipped: 1, suiteHash: undefined });
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('test identity is stable across ordering/outcomes, and changes with test names', () => {
  const a = parseJUnit('<testsuite name="s"><testcase name="a"/><testcase name="b"><failure/></testcase></testsuite>');
  const b = parseJUnit('<testsuite name="s"><testcase name="b"/><testcase name="a"/></testsuite>');
  assert.equal(a.suiteHash, b.suiteHash); assert.notEqual(a.suiteHash, parseJUnit(xml()).suiteHash);
});
test('malformed, summary-only, unsupported and inconsistent XML cannot fabricate passing evidence', () => {
  for (const invalid of [
    '<testsuite tests="1" failures="0"/>', '<testsuite tests="0"><testcase name="a"/></testsuite>',
    '<testsuite><testcase name="a"></testsuite>', '<testsuite/><testsuite/>',
    '<!DOCTYPE testsuite [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuite/>',
    '<testsuite><testcase name="&custom;"/></testsuite>', '<testsuite><testcase name="&#0;"/></testsuite>',
    '<testsuite><testcase name="a" name="b"/></testsuite>', '<testsuite><testcase/></testsuite>',
    '<testsuite><testcase name="a"><flakyFailure/></testcase></testsuite>',
    '<testsuite><testcase name="a" status="unknown"/></testsuite>', '<testsuite>unfinished output</testsuite>',
    '<testsuite disabled="1"/>', '<testsuite><testcase name="a"><failure/></testcase>',
    '<testsuite failures="0"><testcase name="a"><failure/></testcase></testsuite>',
    '<testsuite>'.repeat(65) + '</testsuite>'.repeat(65), ' '.repeat(MAX_REPORT_BYTES + 1)
  ]) assert.throws(() => parseJUnit(invalid), undefined, invalid.slice(0, 100));
});
test('native Node JUnit reporter output is read from an actual passing and failing test process', t => {
  const dir = directory(t), file = join(dir, 'sample.test.mjs');
  writeFileSync(file, `import {test,describe} from 'node:test'; import assert from 'node:assert/strict';
    describe('real suite',()=>{test('pass',()=>{});test('skip',{skip:true},()=>{});test('failure',()=>assert.equal(1,2));});`);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=junit', file], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1, result.stderr);
  writeFileSync(join(dir, 'junit.xml'), result.stdout);
  const evidence = readJUnitReport(dir, 'junit.xml', 0);
  assert.equal(evidence.tests, 3); assert.equal(evidence.passed, 1); assert.equal(evidence.failures, 1); assert.equal(evidence.skipped, 1);
});
test('only bounded, fresh, project-local regular files are imported', t => {
  const dir = directory(t), outside = directory(t), file = join(dir, 'report with spaces.xml');
  writeFileSync(file, xml());
  const read = path => readJUnitReport(dir, path, Date.now() - 10000);
  assert.equal(read('report with spaces.xml').tests, 1);
  writeFileSync(join(outside, 'other.xml'), xml()); symlinkSync(join(outside, 'other.xml'), join(dir, 'escape.xml'));
  assert.throws(() => read('escape.xml'), /inside the current project/);
  assert.throws(() => read(outside), /inside the current project/);
  utimesSync(file, 1, 1); assert.throws(() => read('report with spaces.xml'), /latest request/);
  utimesSync(file, Date.now() / 1000 + 60, Date.now() / 1000 + 60); assert.throws(() => read('report with spaces.xml'), /latest request/);
  writeFileSync(file, 'x'.repeat(MAX_REPORT_BYTES + 1)); assert.throws(() => read('report with spaces.xml'), /2 MiB/);
  writeFileSync(file, Buffer.from([0xff, 0xff])); assert.throws(() => read('report with spaces.xml'));
});
test('event projection rejects unbound/inconsistent evidence and strips arbitrary payloads', t => {
  const good = report(t);
  const raw = event('tests.recorded', { evidence: { ...good, stdout: 'SECRET', command: 'PRIVATE' } });
  assert.deepEqual(validateEvent(raw).data.evidence, good);
  for (const override of [{ passed: 2 }, { tests: -1 }, { tests: 0.5 }, { sha256: 'no' }, { source: 'verified' }, { file: '../outside' }]) assert.throws(() => evidenceRecord({ ...good, ...override }));
  assert.throws(() => validateEvent({ ...raw, runId: undefined }), /runId/);
});
test('evidence remains separate from agent assertions and technical completion', t => {
  const store = new EventStore(directory(t)); run(store, 'claim'); run(store, 'failure', report(t, xml('<failure/>')));
  const g = group(store); assert.equal(g.completed, 2); assert.equal(g.testEvidence.coveredRuns, 1); assert.equal(g.testEvidence.missingRuns, 1);
  assert.equal(g.testEvidence.sets[0].failed, 1); assert.equal(g.testEvidence.sets[0].passed, 0);
});
test('empty/all-skipped reports are inconclusive and different test sets are never pooled', t => {
  const store = new EventStore(directory(t));
  run(store, 'empty', report(t, '<testsuite tests="0"/>')); run(store, 'skip', report(t, xml('<skipped/>')));
  run(store, 'pass', report(t, xml())); run(store, 'different', report(t, xml('', 'other case')));
  const sets = group(store).testEvidence.sets;
  assert.equal(sets.length, 3); assert.equal(sets.reduce((n, s) => n + s.inconclusive, 0), 2);
  assert.equal(sets.find(s => s.suiteHash === parseJUnit(xml()).suiteHash).passed, 1);
});
test('same-file retries replace the latest summary; copies count once and failures win', t => {
  const store = new EventStore(directory(t)), fail = report(t, xml('<failure/>')), pass = report(t);
  run(store, 'retry', fail);
  const e = event('tests.recorded', { evidence: pass }, { runId: 'retry' }); store.append(e); store.append(e);
  assert.equal(store.snapshot().sessions[0].runs[0].testEvidence.reports.length, 1);
  assert.equal(group(store).testEvidence.sets[0].passed, 1);
  store.append(event('tests.recorded', { evidence: { ...pass, reportKey: 'a'.repeat(64), file: 'copy.xml' } }, { runId: 'retry' }));
  assert.equal(group(store).testEvidence.sets[0].passed, 1);
  store.append(event('tests.recorded', { evidence: { ...fail, reportKey: 'b'.repeat(64), file: 'another.xml' } }, { runId: 'retry' }));
  assert.equal(group(store).testEvidence.sets[0].passed, 0); assert.equal(group(store).testEvidence.sets[0].failed, 1);
});
test('report retention is bounded; incomplete evidence is excluded from comparisons', t => {
  const store = new EventStore(directory(t)), evidence = report(t); run(store, 'many');
  for (let i = 0; i < 21; i++) store.append(event('tests.recorded', { evidence: { ...evidence, reportKey: i.toString(16).padStart(64, '0'), file: `report-${i}.xml` } }, { runId: 'many' }));
  const saved = store.snapshot().sessions[0].runs[0].testEvidence;
  assert.equal(saved.reports.length, 20); assert.equal(saved.truncated, true);
  assert.equal(group(store).testEvidence.unusableRuns, 1); assert.equal(group(store).testEvidence.sets.length, 0);
});
test('journal restart preserves evidence, per-run binding and live/demo separation', t => {
  const dir = directory(t), store = new EventStore(dir);
  run(store, 'live', report(t)); run(store, 'demo', report(t, xml('<failure/>')), { demo: true, sessionId: 'demo-session' });
  const before = store.snapshot().projects[0].workflows;
  const after = new EventStore(dir).snapshot().projects[0].workflows;
  assert.deepEqual(after, before);
  assert.equal(after.live.groups[0].testEvidence.sets[0].passed, 1); assert.equal(after.demo.groups[0].testEvidence.sets[0].failed, 1);
  assert.ok(!readFileSync(store.logPath, 'utf8').includes('PRIVATE'));
});
test('real HTTP delivery after offline recovery exposes evidence in state and export', async t => {
  const f = await fixture(t), dir = directory(t), configPath = join(dir, 'connection.json');
  writeFileSync(configPath, JSON.stringify({ url: f.url, token: 'a'.repeat(64) }));
  const a = new MonitorClient({ configPath, fetchImpl: async () => { throw new Error('offline'); } });
  a.enqueue(event('run.started', { model: 'any/model' })); a.enqueue(event('workflow.configured', { workflow }));
  a.enqueue(event('tests.recorded', { evidence: report(t, xml('<failure message="PRIVATE"/>')) })); await a.stop();
  const b = new MonitorClient({ configPath }); t.after(() => b.stop()); await b.flush(true);
  assert.equal(b.queue.length, 0);
  const state = await (await f.request('/api/state')).json(), exported = await (await f.request('/api/export')).json();
  assert.equal(state.sessions[0].runs[0].testEvidence.reports[0].failures, 1);
  assert.equal(state.projects[0].workflows.live.groups[0].testEvidence.sets[0].failed, 1);
  assert.equal(exported.sessions[0].runs[0].testEvidence.reports[0].failures, 1);
  assert.ok(!JSON.stringify(exported).includes('PRIVATE'));
});
