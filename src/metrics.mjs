// Derived execution measurements, computed at the store/snapshot boundary from
// reduced, observed event state only. Measurement scope is execution evidence:
// a completed run is "technical completion", never validated task quality.
// Missing data stays missing: no invented zero tokens, prices or quality scores.

const AGENT_INVOCATION_LIMIT = 50, TOOL_FAILURE_LIMIT = 20;

// Conservative terminal-status normalization for a finished agent record.
// Success is explicit only: the known adapter success literal `done`, or a
// finished record with no status literal and an explicit `isError: false`.
// Known failure literals (`error`, `failed`, `blocked`, `cancelled`) and an
// explicit `isError: true` are failure evidence even when the other is
// missing. Any other (unknown or in-progress) literal in a finished record
// never claims success: it stays unresolved, or failed when explicitly
// failed. A missing literal without `isError: false` is unresolved too — a
// missing signal is not proof of success.
const SUCCESS_STATUSES = new Set(['done']);
const FAILURE_STATUSES = new Set(['error', 'failed', 'blocked', 'cancelled']);

export function terminalStatus(status, isError) {
  if (isError === true || FAILURE_STATUSES.has(status)) return 'error';
  if (SUCCESS_STATUSES.has(status) || (!status && isError === false)) return 'done';
  return 'unknown';
}

const INVOCATION_STATUS = { done: 'finished', error: 'failed', unknown: 'unresolved' };

// Only agent.finished is terminal. A progress "done" or an inferred state from a
// subagent tool result is never a finished invocation.
function invocationOf(a) {
  const elapsedMs = Number.isFinite(a.elapsedMs) ? a.elapsedMs
    : a.startedAt && a.endedAt ? Math.max(0, Date.parse(a.endedAt) - Date.parse(a.startedAt)) : undefined;
  const usage = a.usage && Object.keys(a.usage).length ? a.usage : undefined;
  return { id: a.id, agent: a.agent || '', model: a.model || '', task: a.task || '',
    status: a.finished ? INVOCATION_STATUS[terminalStatus(a.status, a.isError)] : 'unresolved',
    elapsedMs, usage };
}

// The subagent tool call represents its child invocation, which is counted in
// the agent buckets. Its tool error is excluded here only while the same call
// id is already counted as a failed terminal agent, so one failure is never
// counted twice — and never hidden when that terminal record is missing.
function countedAgentFailure(run, t) {
  const a = (run.agents || {})[t.id];
  return Boolean(a && invocationOf(a).status === 'failed');
}
function unmatchedSubagentFailure(run, t) {
  return t.status === 'error' && t.name === 'subagent' && !countedAgentFailure(run, t);
}

function toolFailuresOf(run) {
  return Object.values(run.tools || {})
    .filter(t => t.status === 'error' && !(t.name === 'subagent' && countedAgentFailure(run, t)))
    .map(t => ({ name: t.name || '', file: t.file || '', at: t.endedAt || t.startedAt }));
}

/**
 * Classify one run from observed events. Verdicts match the aggregate buckets.
 * Rules:
 * - Only known terminal `run.ended` outcomes count: error -> failed, aborted ->
 *   cancelled (terminal cause wins), idle -> settled below. A missing end or an
 *   unrecognized outcome (e.g. `timeout`) is not terminal evidence -> unknown.
 * - On an idle end: any failed subagent invocation -> failed, any
 *   started-but-not-finished invocation -> unknown. A finished invocation whose
 *   status is not explicit success is unresolved (see `terminalStatus`), so it
 *   never claims completion either. Only a terminal end with zero failed and
 *   zero unresolved invocations is "completed" (technical only).
 * - An observed subagent tool error without a matching counted failed agent is
 *   kept as failure evidence (conservatively failed, never silently completed).
 */
export function runVerdict(run) {
  if (run.outcome === 'error') return 'failed';
  if (run.outcome === 'aborted') return 'cancelled';
  if (run.outcome !== 'idle') return 'unknown';
  let failed = 0, unresolved = 0;
  // Same per-invocation normalization as the reported counts, so the verdict
  // and the `agents` counters can never disagree.
  for (const a of Object.values(run.agents || {})) {
    const status = invocationOf(a).status;
    if (status === 'failed') failed++;
    else if (status === 'unresolved') unresolved++;
  }
  const orphanedFailure = Object.values(run.tools || {}).some(t => unmatchedSubagentFailure(run, t));
  return failed || orphanedFailure ? 'failed' : unresolved ? 'unknown' : 'completed';
}

/** Per-run execution performance for the dashboard; derived, never stored. */
export function runPerformance(run, { now = Date.now(), lastSeen, connected = false } = {}) {
  const invocations = Object.values(run.agents || {}).map(invocationOf);
  const agents = { finished: 0, failed: 0, unresolved: 0 };
  for (const i of invocations) agents[i.status]++;
  const toolFailures = toolFailuresOf(run);
  return {
    verdict: runVerdict(run),
    outcome: run.outcome || '',
    ended: Boolean(run.endedAt), settled: Boolean(run.settled),
    fresh: Boolean(connected) && now - Date.parse(lastSeen || 0) < 30000,
    agents,
    invocations: invocations.slice(-AGENT_INVOCATION_LIMIT), invocationsTotal: invocations.length,
    toolFailures: toolFailures.slice(-TOOL_FAILURE_LIMIT), toolFailureCount: toolFailures.length
  };
}

/**
 * Bounded project history over retained runs only (journal/memory retention).
 * The completion ratio denominator is explicitly `terminal` = completed + failed
 * + cancelled. Unknown/in-progress runs are never successes and never in the
 * denominator.
 */
export function aggregateRuns(runs) {
  const counts = { completed: 0, failed: 0, cancelled: 0, unknown: 0 };
  for (const run of runs) counts[runVerdict(run)]++;
  const terminal = counts.completed + counts.failed + counts.cancelled;
  return { ...counts, total: runs.length, terminal,
    technicalCompletionRatio: terminal ? counts.completed / terminal : undefined };
}
