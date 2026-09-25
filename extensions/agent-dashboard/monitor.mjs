import { createHash, randomUUID } from 'node:crypto';
import { basename, relative, isAbsolute } from 'node:path';
import { MonitorClient } from './client.mjs';
import { redact } from './privacy.mjs';

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
export function registerMonitor(pi, { schema, client = new MonitorClient(), now = () => new Date(), capturePrompts = process.env.AGENT_DASHBOARD_CAPTURE_PROMPTS !== '0' } = {}) {
  let context; let runId; let identity; let heartbeat; let droppedReported = 0;
  const toolCalls = new Map(), fingerprints = new Map();
  function identify(ctx) {
    const cwd = ctx.cwd || process.cwd();
    const session = ctx.sessionManager?.getSessionId?.() || ctx.sessionManager?.getSessionFile?.() || `process-${process.pid}`;
    return { sessionId: hash(`${cwd}\0${session}`), projectId: hash(cwd), projectName: basename(cwd) || cwd };
  }
  function emit(type, data = {}, ctx = context) {
    if (!ctx) return;
    identity ||= identify(ctx);
    client.enqueue({ schemaVersion: 1, id: randomUUID(), type, ...identity, runId,
      time: now().toISOString(), data });
  }
  const listen = (event, handler) => pi.on(event, (e, ctx) => {
    try { return handler(e, ctx); } catch (error) {
      // Telemetry must not mutate/block a tool call or terminate a coding run.
      client.lastError = `Monitor: ${error.message}`;
    }
  });
  listen('session_start', (_e, ctx) => {
    context = ctx; identity = identify(ctx); runId = undefined;
    toolCalls.clear(); fingerprints.clear(); clearInterval(heartbeat); client.start();
    emit('session.connected', { model: modelName(ctx.model) }, ctx);
    heartbeat = setInterval(() => {
      emit('session.heartbeat');
      if (client.dropped > droppedReported) {
        const dropped = client.dropped - droppedReported; droppedReported = client.dropped;
        emit('monitor.warning', { message: 'Some monitor events were dropped while offline or overloaded', dropped });
      }
    }, 10000); heartbeat.unref();
  });
  listen('before_agent_start', (e, ctx) => {
    context = ctx; identity = identify(ctx); runId = randomUUID();
    toolCalls.clear(); fingerprints.clear();
    emit('prompt.received', { prompt: capturePrompts ? redact(e.prompt, 12000) : '[Prompt capture disabled]' }, ctx);
  });
  listen('agent_start', (_e, ctx) => {
    context = ctx; runId ||= randomUUID();
    emit('run.started', { model: modelName(ctx.model) }, ctx);
  });
  listen('model_select', (e, ctx) => emit('model.selected', {
    model: modelName(e.model), previousModel: modelName(e.previousModel), source: e.source
  }, ctx));
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
    const isError = Boolean(e.isError || detail?.isError || (typeof detail?.exitCode === 'number' && detail.exitCode !== 0));
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
      ctx.ui?.notify?.(`Agent Desk: ${client.status}; queued=${client.queue.length}; dropped=${client.dropped}${client.lastError && client.status !== 'connected' ? `; ${client.lastError}` : ''}`, client.status === 'connected' ? 'info' : 'warning');
    }
  });
  if (schema) pi.registerTool({
    name: 'workflow_report', label: 'Workflow report',
    description: 'Report the real plan/stage state to the local dashboard. Observation only: does not run code, switch models, delegate, or prove tests passed. Send the full stage list when it changes. Never include secrets.',
    promptSnippet: 'Report real task stages and upcoming work to the local dashboard.',
    promptGuidelines: ['For multi-step work, report the full plan with workflow_report before starting and after stage transitions. Report state only; actual delegation still uses subagent. Never imply tests passed without evidence.'],
    parameters: schema,
    async execute(_id, params, _signal, _update, ctx) {
      emit('workflow.updated', { stages: params.stages, reason: redact(params.reason || '', 500), source: 'reported' }, ctx);
      return { content: [{ type: 'text', text: 'Workflow update queued for the local monitor. No work was executed.' }], details: { recorded: true } };
    }
  });
  return { client };
}
