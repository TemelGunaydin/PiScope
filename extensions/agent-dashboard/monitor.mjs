import { createHash, randomUUID } from 'node:crypto';
import { basename, relative, isAbsolute } from 'node:path';
import { MonitorClient } from './client.mjs';
import { redact } from './privacy.mjs';
import { readWorkflowProfile } from './workflow.mjs';
import { readJUnitReport } from './evidence.mjs';

const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 28);
const textOnly = message => (Array.isArray(message?.content) ? message.content.filter(p => p.type === 'text').map(p => p.text).join('\n') : typeof message?.content === 'string' ? message.content : '');
function modelName(model) { return model ? (model.provider ? `${model.provider}/${model.id}` : model.id || '') : ''; }
function fileName(args, cwd) {
  const path = args?.path || args?.file_path;
  if (typeof path !== 'string') return '';
  const rel = isAbsolute(path) ? relative(cwd, path) : path;
  return redact(rel.startsWith('..') ? `(outside-project)/${basename(path)}` : rel, 512);
}
function usage(u) {
  if (!u) return undefined;
  return Object.fromEntries(['input', 'output', 'cacheRead', 'cacheWrite'].filter(k => Number.isFinite(u[k]) && u[k] >= 0).map(k => [k, u[k]]));
}

/** Pi adapter separated from schema imports so its behavior is unit-testable. */
export function registerMonitor(pi, { schema, client = new MonitorClient(), now = () => new Date(), capturePrompts = process.env.AGENT_DASHBOARD_CAPTURE_PROMPTS !== '0', readProfile = readWorkflowProfile } = {}) {
  let context; let runId; let identity; let heartbeat; let droppedReported = 0; let running = false;
  let runStartedAt; const reportKeys = new Set();
  const toolCalls = new Map(), fingerprints = new Map();
  function identify(ctx) {
    const cwd = ctx.cwd || process.cwd();
    const session = ctx.sessionManager?.getSessionId?.() || ctx.sessionManager?.getSessionFile?.() || `process-${process.pid}`;
    return { sessionId: hash(`${cwd}\0${session}`), projectId: hash(cwd), projectName: basename(cwd) || cwd };
  }
  function emit(type, data = {}, ctx = context, runScoped = true) {
    if (!ctx) return;
    identity ||= identify(ctx);
    return client.enqueue({ schemaVersion: 1, id: randomUUID(), type, ...identity, runId: runScoped ? runId : undefined,
      time: now().toISOString(), data });
  }
  const listen = (event, handler) => pi.on(event, (e, ctx) => {
    try { return handler(e, ctx); } catch (error) {
      // Telemetry must not mutate/block a tool call or terminate a coding run.
      client.lastError = `Monitor: ${error.message}`;
    }
  });
  listen('session_start', (_e, ctx) => {
    context = ctx; identity = identify(ctx); runId = undefined; running = false;
    runStartedAt = undefined; reportKeys.clear();
    toolCalls.clear(); fingerprints.clear(); clearInterval(heartbeat); client.start();
    emit('session.connected', { model: modelName(ctx.model) }, ctx);
    heartbeat = setInterval(() => {
      emit('session.heartbeat');
      if (client.dropped > droppedReported) {
        const dropped = client.dropped - droppedReported; droppedReported = client.dropped;
        emit('monitor.warning', { message: 'Some monitor events were not queued or were quarantined; check /dashboard-status', dropped });
      }
    }, 10000); heartbeat.unref();
  });
  listen('before_agent_start', (e, ctx) => {
    context = ctx; identity = identify(ctx); runId = randomUUID(); running = true;
    runStartedAt = now().getTime(); reportKeys.clear();
    toolCalls.clear(); fingerprints.clear();
    emit('prompt.received', { prompt: capturePrompts ? redact(e.prompt, 12000) : '[Prompt capture disabled]' }, ctx);
    try {
      const workflow = readProfile(ctx.cwd || process.cwd());
      if (workflow) emit('workflow.configured', { workflow }, ctx);
    } catch {
      emit('monitor.warning', { message: 'Workflow profile invalid or unreadable; this run is excluded from workflow comparisons.' }, ctx);
    }
  });
  listen('agent_start', (_e, ctx) => {
    context = ctx; runId ||= randomUUID(); running = true;
    emit('run.started', { model: modelName(ctx.model) }, ctx);
  });
  listen('model_select', (e, ctx) => emit('model.selected', {
    model: modelName(e.model), previousModel: modelName(e.previousModel), source: e.source
  }, ctx, running));
  listen('message_end', (e, ctx) => {
    if (e.message?.role !== 'assistant') return;
    const m = e.message;
    const model = m.provider && m.model ? `${m.provider}/${m.model}` : modelName(ctx.model);
    emit('message.completed', { model, summary: capturePrompts ? redact(textOnly(m), 4000) : '', usage: usage(m.usage) }, ctx);
  });
  listen('tool_execution_start', (e, ctx) => {
    const entry = { toolName: e.toolName, toolCallId: e.toolCallId,
      file: fileName(e.args, ctx.cwd), model: modelName(ctx.model),
      agent: typeof e.args?.agent === 'string' ? e.args.agent : '',
      task: capturePrompts ? redact(e.args?.task, 4000) : '', requestedModel: e.args?.model };
    toolCalls.set(e.toolCallId, entry);
    emit('tool.started', entry, ctx);
    if (e.toolName === 'subagent') emit('agent.started', {
      agentCallId: e.toolCallId, agent: entry.agent, task: entry.task,
      model: typeof entry.requestedModel === 'string' ? entry.requestedModel : '', source: 'requested'
    }, ctx);
  });
  function progress(e, ctx, final = false) {
    const detail = (final ? e.result : e.partialResult)?.details;
    const entry = toolCalls.get(e.toolCallId) || {};
    // Observed detail status 'error' is failure evidence too: a completed
    // subagent result may omit isError and exitCode entirely. Progress-only
    // updates are never terminal here; only the final record marks the finish.
    const isError = Boolean(e.isError || detail?.isError || detail?.status === 'error' || (typeof detail?.exitCode === 'number' && detail.exitCode !== 0));
    const data = {
      agentCallId: e.toolCallId, agent: detail?.agent || entry.agent || '',
      task: entry.task, model: typeof detail?.model === 'string' ? detail.model : '',
      status: detail?.status || (final ? (isError ? 'error' : 'done') : 'running'),
      elapsedMs: detail?.elapsedMs, usage: usage(detail?.usage), isError,
      source: detail?.model ? 'observed' : 'unknown',
      tools: Array.isArray(detail?.tools) ? detail.tools.slice(-50).map(t => ({
        id: t.id, name: t.name, file: fileName(t.args, ctx.cwd), status: t.status
      })) : [],
      summary: final && capturePrompts ? redact(detail?.output || textOnly(e.result), 4000) : ''
    };
    // Ignore output-token-only updates; capture identity, tool and usage changes.
    const fingerprint = JSON.stringify({ ...data, elapsedMs: undefined });
    if (!final && fingerprints.get(e.toolCallId) === fingerprint) return;
    fingerprints.set(e.toolCallId, fingerprint);
    emit(final ? 'agent.finished' : 'agent.progress', data, ctx);
  }
  listen('tool_execution_update', (e, ctx) => { if (e.toolName === 'subagent') progress(e, ctx); });
  listen('tool_execution_end', (e, ctx) => {
    const entry = toolCalls.get(e.toolCallId) || {};
    const isError = Boolean(e.isError || e.result?.details?.isError);
    emit('tool.finished', { ...entry, toolName: e.toolName, toolCallId: e.toolCallId, isError }, ctx);
    if (e.toolName === 'subagent') progress(e, ctx, true);
    toolCalls.delete(e.toolCallId); fingerprints.delete(e.toolCallId);
  });
  listen('agent_end', (e, ctx) => {
    const last = [...(e.messages || [])].reverse().find(m => m.role === 'assistant');
    emit('run.ended', {
      outcome: last?.stopReason === 'error' ? 'error' : last?.stopReason === 'aborted' ? 'aborted' : 'idle',
      summary: capturePrompts ? redact(textOnly(last), 4000) : ''
    }, ctx);
    running = false;
  });
  listen('agent_settled', (_e, ctx) => emit('run.settled', {}, ctx));
  // New session/reload tears down timers. No disk/HTTP handles remain in Pi.
  pi.on('session_shutdown', async (_e, ctx) => {
    clearInterval(heartbeat); heartbeat = undefined;
    emit('session.disconnected', {}, ctx); await client.stop();
  });
  pi.registerCommand('dashboard-status', {
    description: 'Show the local Agent Desk connection; does not start model work',
    handler: async (_args, ctx) => {
      await client.flush(true);
      const storage = client.spool ? `; persisted=${client.spool.records.length}; bytes=${client.spool.bytes}; recovered=${client.spool.recovered}; quarantined=${client.spool.quarantined}` : '';
      const error = client.persistenceError ? `; ${client.persistenceError}` : '';
      ctx.ui?.notify?.(`Agent Desk: ${client.status}; queued=${client.queue.length}; dropped=${client.dropped}${storage}${error}${client.lastError && client.status !== 'connected' ? `; ${client.lastError}` : ''}`, client.status === 'connected' && !client.persistenceError && !client.dropped ? 'info' : 'warning');
    }
  });
  pi.registerCommand('dashboard-evidence', {
    description: 'Import a project-local JUnit XML report for the latest completed request (does not run tests)',
    handler: async (args, ctx) => {
      try {
        if (!runId || runStartedAt === undefined || running || identify(ctx).sessionId !== identity?.sessionId) throw new Error('Finish a request in this Pi session before importing its report');
        let path = args.trim();
        if (path.startsWith('"') && path.endsWith('"') || path.startsWith("'") && path.endsWith("'")) path = path.slice(1, -1);
        if (!path) throw new Error('Usage: /dashboard-evidence path/to/junit.xml');
        const evidence = readJUnitReport(ctx.cwd || process.cwd(), path, runStartedAt, now().getTime());
        if (!reportKeys.has(evidence.reportKey) && reportKeys.size >= 20) throw new Error('At most 20 report files can be attached to one request');
        if (emit('tests.recorded', { evidence }, ctx) === false) throw new Error('Report summary could not be persisted; check /dashboard-status');
        reportKeys.add(evidence.reportKey);
        ctx.ui?.notify?.(`JUnit report queued: ${evidence.tests} tests; ${evidence.passed} passed, ${evidence.failures} failed, ${evidence.errors} errors, ${evidence.skipped} skipped. This imports a report; it does not execute or certify tests.`, 'info');
      } catch (error) {
        // Do not echo raw paths, XML, assertion messages or stack traces into Pi.
        ctx.ui?.notify?.(`Agent Desk: ${error.code ? `Report could not be read (${error.code})` : redact(error.message, 300)}`, 'warning');
      }
    }
  });
  if (schema) pi.registerTool({
    name: 'workflow_report', label: 'Workflow report',
    description: 'Report the real plan/stage state to the local dashboard. Observation only: does not run code, switch models, delegate, or prove tests passed. Send the full stage list when it changes. Never include secrets.',
    promptSnippet: 'Report real task stages and upcoming work to the local dashboard.',
    promptGuidelines: ['For multi-step work, report the full plan with workflow_report before starting and after stage transitions. Report state only; actual delegation still uses subagent. Never imply tests passed without evidence.'],
    parameters: schema,
    async execute(_id, params, _signal, _update, ctx) {
      const recorded = emit('workflow.updated', { stages: params.stages, reason: redact(params.reason || '', 500), source: 'reported' }, ctx) !== false;
      return { content: [{ type: 'text', text: recorded ? 'Workflow update queued for the local monitor. No work was executed.' : 'Workflow update could not be persisted. Check /dashboard-status. No work was executed.' }], details: { recorded } };
    }
  });
  return { client };
}
