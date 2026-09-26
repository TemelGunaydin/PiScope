// Installed-Pi integration: offline shutdown, restart, delivery and TypeBox.
// No model calls or user configuration changes.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { createDashboard } from '../src/server.mjs';
import { saveConnection } from '../src/config.mjs';

const dir = mkdtempSync(join(tmpdir(), 'agent-desk-pi-smoke-'));
const agentDir = join(dir, 'pi'); mkdirSync(agentDir, { mode: 0o700 });
const dataDir = join(dir, 'dashboard');
const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, AGENT_DASHBOARD_HOME: dataDir, PI_OFFLINE: '1', PI_TELEMETRY: '0' };
const binary = process.env.PI_BIN || 'pi';
let app, child, timeout;
async function probe(online) {
  const adapter = fileURLToPath(new URL('../extensions/agent-dashboard/index.ts', import.meta.url));
  child = spawn(binary, ['--mode', 'rpc', '--offline', '--no-session', '--no-extensions', '--no-skills',
    '--no-prompt-templates', '--no-themes', '--no-context-files', '--tools', 'workflow_report',
    '-e', adapter, '-e', join(dir, 'probe.ts')], { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', tools = false, status = '', command = false, evidenceGuard = false, timedOut = false;
  child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  timeout = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 15000);
  const lines = createInterface({ input: child.stdout });
  const send = value => child.stdin.write(JSON.stringify(value) + '\n');
  child.stdin.on('error', () => {});
  lines.on('line', line => {
    let event; try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'extension_ui_request' && event.method === 'notify') {
      if (event.message === '["workflow_report"]') tools = true;
      if (event.message.startsWith('Agent Desk:')) status = event.message;
      if (event.message.includes('Finish a request in this Pi session')) evidenceGuard = true;
    }
    if (event.type !== 'response' || !event.success) return;
    if (event.id === 'commands') {
      command = ['dashboard-status', 'dashboard-evidence'].every(name => event.data.commands.some(c => c.name === name));
      send({ id: 'tools', type: 'prompt', message: '/probe-tools' });
    } else if (event.id === 'tools') send({ id: 'evidence', type: 'prompt', message: '/dashboard-evidence missing.xml' });
    else if (event.id === 'evidence') send({ id: 'status', type: 'prompt', message: '/dashboard-status' });
    else if (event.id === 'status') child.stdin.end();
  });
  send({ id: 'commands', type: 'get_commands' });
  const code = await closed; clearTimeout(timeout);
  assert.equal(timedOut, false, 'Pi RPC check timed out');
  assert.equal(code, 0, stderr); assert.equal(stderr, '', 'Unexpected Pi diagnostic');
  assert.ok(command, 'dashboard-status command was not registered');
  assert.ok(tools, 'workflow_report/TypeBox did not load');
  assert.ok(evidenceGuard, 'Evidence import without a completed request must be refused');
  if (online) {
    assert.match(status, /^Agent Desk: connected; queued=0; dropped=0/);
    assert.match(status, /recovered=2(?:;|$)/);
  } else {
    assert.match(status, /^Agent Desk: disconnected; queued=1; dropped=0/);
    assert.match(status, /persisted=1(?:;|$)/);
  }
}
try {
  const version = spawnSync(binary, ['--version'], { env, encoding: 'utf8', timeout: 10000 });
  if (version.error) throw new Error(`Pi is required for this optional check: ${version.error.message}`);
  assert.equal(version.status, 0, version.stderr);
  const token = randomBytes(32).toString('hex');
  app = createDashboard({ dataDir, token });
  saveConnection(dataDir, await app.listen(0), token);
  await app.close(); // First Pi process must queue while the dashboard is offline.
  writeFileSync(join(dir, 'probe.ts'), `export default function(pi) {
    pi.registerCommand('probe-tools', {
      handler: async (_args, ctx) => ctx.ui.notify(JSON.stringify(pi.getAllTools().map(t => t.name)), 'info')
    });
  }`);
  await probe(false);
  app = createDashboard({ dataDir, token });
  saveConnection(dataDir, await app.listen(0), token);
  await probe(true);
  const state = app.store.snapshot();
  assert.equal(state.sessions.length, 2);
  assert.ok(state.sessions.every(s => s.runs.length === 0 && !s.connected), 'No model run or stale live connection');
  assert.equal(app.store.sequence, 4, 'Expected both processes to connect and disconnect');
  const recorded = readFileSync(join(dataDir, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(recorded.filter(e => e.recovered).length, 2);
  assert.deepEqual(recorded.map(e => e.type), ['session.connected', 'session.disconnected', 'session.connected', 'session.disconnected']);
  console.log(`Pi ${version.stdout.trim()}: TypeBox, commands, evidence import guard, offline persistence, process restart, ordered recovery and HTTP delivery passed. No model called.`);
} finally {
  clearTimeout(timeout);
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL'); await new Promise(resolve => child.once('close', resolve));
  }
  if (app) await app.close();
  rmSync(dir, { recursive: true, force: true });
}
