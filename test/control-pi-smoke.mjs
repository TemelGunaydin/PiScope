// Actual installed-Pi sendUserMessage integration. Input is intercepted before any model call.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createDashboard } from '../src/server.mjs';
import { saveConnection } from '../src/config.mjs';

const dir = mkdtempSync(join(tmpdir(), 'piscope-control-pi-'));
const token = randomBytes(32).toString('hex'), controlToken = randomBytes(32).toString('hex');
const dataDir = join(dir, 'dashboard'), agentDir = join(dir, 'pi'); mkdirSync(agentDir);
let app, child, handled = 0, diagnostic = '';
const waitFor = async (fn, label) => {
  const deadline = Date.now() + 12000;
  while (!fn()) { if (Date.now() > deadline) throw new Error(`Timed out: ${label}`); await new Promise(r => setTimeout(r, 50)); }
};
try {
  app = createDashboard({ dataDir, token, controlToken }); const url = await app.listen(0); saveConnection(dataDir, url, token, undefined, true);
  const probe = join(dir, 'probe.ts');
  writeFileSync(probe, `export default function(pi) {
    pi.on('input', (event, ctx) => {
      if (event.source === 'extension') {
        ctx.ui.notify(event.text === 'PISCOPE_CONTROL_SMOKE' ? 'CONTROL_INPUT_HANDLED' : 'UNEXPECTED_CONTROL_INPUT', 'info');
        return { action: 'handled' }; // Guarantees this check cannot reach a model.
      }
    });
  }`);
  child = spawn(process.env.PI_BIN || 'pi', ['--mode', 'rpc', '--offline', '--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--tools', 'workflow_report',
    '-e', fileURLToPath(new URL('../extensions/agent-dashboard/index.ts', import.meta.url)), '-e', probe],
    { cwd: dir, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, AGENT_DASHBOARD_HOME: dataDir, PI_OFFLINE: '1', PI_TELEMETRY: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', c => diagnostic += c);
  let commands;
  createInterface({ input: child.stdout }).on('line', line => {
    let e; try { e = JSON.parse(line); } catch { return; }
    if (e.type === 'response' && e.id === 'commands' && e.success) commands = e.data.commands;
    if (e.type === 'extension_ui_request' && e.message === 'CONTROL_INPUT_HANDLED') handled++;
    if (e.type === 'extension_ui_request' && e.message === 'UNEXPECTED_CONTROL_INPUT') diagnostic += 'unexpected input';
  });
  const send = packet => child.stdin.write(JSON.stringify(packet) + '\n');
  send({ id: 'commands', type: 'get_commands' });
  await waitFor(() => commands && app.store.sessions.size, 'Pi extension load');
  assert.ok(commands.some(c => c.name === 'dashboard-control'));
  const session = [...app.store.sessions.values()][0];
  // Synthetic retained terminal request proves adoption after a runtime reload.
  const record = (type, data) => app.store.append({ schemaVersion: 1, id: randomBytes(16).toString('hex'), time: new Date().toISOString(),
    type, data, sessionId: session.id, projectId: session.projectId, projectName: session.projectName, runId: 'synthetic-prior-run' });
  record('prompt.received', { prompt: 'Synthetic prior request' }); record('run.ended', { outcome: 'idle' }); record('run.settled', {});
  send({ id: 'enable', type: 'prompt', message: '/dashboard-control on' });
  await waitFor(() => app.control.snapshot().agents.some(a => a.idle), 'explicit local control opt-in');
  const paired = await fetch(url + '/api/control/login', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: controlToken }) });
  assert.equal(paired.status, 200);
  const headers = { Origin: url, 'Content-Type': 'application/json', Cookie: paired.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
  const request = { id: 'real-pi-approved', sessionId: session.id, projectId: session.projectId, runId: 'synthetic-prior-run', prompt: 'PISCOPE_CONTROL_SMOKE' };
  for (let i = 0; i < 2; i++) assert.equal((await fetch(url + '/api/control/requests', { method: 'POST', headers, body: JSON.stringify(request) })).status, 202);
  await waitFor(() => handled === 1 && app.control.requests.get(request.id)?.status === 'submitted', 'actual Pi input and acknowledgement');
  assert.equal(handled, 1); assert.equal(diagnostic, '');
  assert.equal(session.runs.length, 1, 'The intercepted input must never start a model run');
  send({ id: 'disable', type: 'prompt', message: '/dashboard-control off' });
  await waitFor(() => app.control.snapshot().agents.length === 0, 'control revocation');
  console.log('Installed Pi: explicit opt-in, retained-run adoption, real sendUserMessage/input delivery, exactly-once handoff and revocation passed. Input was intercepted; no model called.');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await new Promise(resolve => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000); child.once('close', () => { clearTimeout(timer); resolve(); }); });
  }
  if (app) await app.close();
  rmSync(dir, { recursive: true, force: true });
}
