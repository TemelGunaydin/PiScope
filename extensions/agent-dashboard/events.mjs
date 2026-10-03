import { redact } from './privacy.mjs';
import { workflowProfile } from './workflow.mjs';
import { evidenceRecord } from './evidence.mjs';

export const TYPES = new Set([
  'session.connected', 'session.disconnected', 'session.heartbeat',
  'prompt.received', 'run.started', 'run.ended', 'run.settled', 'model.selected',
  'message.completed', 'tool.started', 'tool.finished',
  'agent.started', 'agent.progress', 'agent.finished', 'workflow.updated', 'workflow.configured', 'tests.recorded', 'monitor.warning'
]);
const statuses = new Set(['pending', 'running', 'done', 'error', 'blocked', 'cancelled']);
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x, max = 240) => redact(x, max);
const number = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined;
function identifier(x, field) {
  if (typeof x !== 'string' || !/^[a-zA-Z0-9_.:\-]{1,160}$/.test(x)) throw new Error(`Invalid ${field}`);
  return x;
}
function usage(u) {
  if (!isObject(u)) return undefined;
  // Only reported tokens. No invented prices or subscription-to-dollar conversions.
  return Object.fromEntries(['input', 'output', 'cacheRead', 'cacheWrite'].map(k => [k, number(u[k])]).filter(([, v]) => v !== undefined));
}

export function recommendations(value = []) {
  if (!Array.isArray(value) || value.length > 5) throw new Error('At most five recommendations allowed');
  const ids = new Set();
  return value.map(r => {
    if (!isObject(r)) throw new Error('Invalid recommendation');
    const id = identifier(r.id, 'recommendation.id'), title = str(r.title), prompt = str(r.prompt, 4000);
    if (ids.has(id) || !title.trim() || !prompt.trim()) throw new Error('Recommendations need distinct IDs, titles and prompts');
    ids.add(id); return { id, title, prompt };
  });
}

/** Strict projection: unknown/sensitive fields are dropped before disk or browser. */
export function validateEvent(raw, now = new Date()) {
  if (!isObject(raw) || raw.schemaVersion !== 1 || !TYPES.has(raw.type)) throw new Error('Unsupported event schema/type');
  const date = Date.parse(raw.time);
  if (!Number.isFinite(date)) throw new Error('Invalid event time');
  const d = isObject(raw.data) ? raw.data : {};
  const data = {};
  for (const k of ['model', 'previousModel', 'agent', 'toolName', 'toolCallId', 'agentCallId', 'role', 'outcome', 'reason', 'file', 'status', 'stageId', 'source']) {
    if (typeof d[k] === 'string') data[k] = str(d[k], k === 'file' ? 512 : 300);
  }
  for (const k of ['prompt', 'summary', 'task', 'message']) if (typeof d[k] === 'string') data[k] = str(d[k], k === 'prompt' ? 12000 : 4000);
  for (const k of ['elapsedMs', 'exitCode', 'dropped']) if (number(d[k]) !== undefined) data[k] = d[k];
  for (const k of ['isError', 'final']) if (typeof d[k] === 'boolean') data[k] = d[k];
  if (usage(d.usage)) data.usage = usage(d.usage);
  if (Array.isArray(d.tools)) {
    data.tools = d.tools.slice(-50).filter(isObject).map(t => ({
      id: str(t.id, 160), name: str(t.name, 120), file: str(t.file, 512),
      status: t.status === 'running' ? 'running' : 'done'
    }));
  }
  if (raw.type === 'workflow.configured') data.workflow = workflowProfile(d.workflow);
  if (raw.type === 'tests.recorded') {
    identifier(raw.runId, 'runId');
    data.evidence = evidenceRecord(d.evidence);
  }
  if (raw.type === 'workflow.updated') {
    if (!Array.isArray(d.stages) || d.stages.length > 20 || !d.stages.length) throw new Error('Workflow needs 1–20 stages');
    const ids = new Set();
    data.stages = d.stages.map(stage => {
      if (!isObject(stage)) throw new Error('Invalid stage');
      const id = identifier(stage.id, 'stage.id');
      if (ids.has(id)) throw new Error('Duplicate stage id');
      ids.add(id);
      if (!statuses.has(stage.status)) throw new Error('Invalid stage status');
      return { id, title: str(stage.title), agent: str(stage.agent), model: str(stage.model, 300), status: stage.status };
    });
    data.recommendations = recommendations(d.recommendations);
    data.source = 'reported'; // Plans are assertions, never silently promoted to observations.
  }
  return {
    schemaVersion: 1, id: identifier(raw.id, 'id'), type: raw.type,
    sessionId: identifier(raw.sessionId, 'sessionId'),
    runId: raw.runId ? identifier(raw.runId, 'runId') : undefined,
    projectId: identifier(raw.projectId, 'projectId'), projectName: str(raw.projectName) || 'Proje',
    time: new Date(date).toISOString(), receivedAt: now.toISOString(),
    demo: raw.demo === true, recovered: raw.recovered === true, data
  };
}
