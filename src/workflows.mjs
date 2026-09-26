import { createHash } from 'node:crypto';
import { aggregateRuns, runVerdict } from './metrics.mjs';
import { aggregateEvidence } from './evidence.mjs';

function assignments(run) {
  const roles = new Map([['primary', new Set(run.primaryModels || [])]]);
  const bindings = new Map(run.workflow.roles.map(b => [b.agent, b.role]));
  for (const { role } of run.workflow.roles) roles.set(role, new Set());
  for (const agent of Object.values(run.agents || {})) {
    // Unbound agents remain visible, and cannot silently join a declared role.
    const role = bindings.get(agent.agent) || `unmapped:${agent.agent || 'unknown'}`;
    if (!roles.has(role)) roles.set(role, new Set());
    for (const model of agent.observedModels || []) roles.get(role).add(model);
  }
  return [...roles].sort(([a], [b]) => a.localeCompare(b)).map(([role, models]) => ({ role, models: [...models].sort() }));
}

function measurements(runs) {
  const durations = [], tokens = [];
  for (const run of runs) {
    if (runVerdict(run) === 'unknown') continue;
    const elapsed = Date.parse(run.endedAt) - Date.parse(run.observedStartedAt);
    if (Number.isFinite(elapsed) && elapsed >= 0) durations.push(elapsed);
    const reported = Object.values(run.usage || {}).flatMap(u => ['input', 'output', 'cacheRead', 'cacheWrite']
      .map(k => u[k]).filter(n => Number.isFinite(n) && n >= 0));
    if (reported.length) tokens.push(reported.reduce((sum, n) => sum + n, 0));
  }
  const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : undefined;
  return { meanElapsedMs: mean(durations), durationSamples: durations.length,
    meanReportedTokens: mean(tokens), tokenSamples: tokens.length };
}

// Compare retained runs within one project and one live/demo scope. Identity is
// role-based, with exact reported model IDs; no assumptions about model vendors.
export function compareWorkflows(runs) {
  const groups = new Map(); let unconfigured = 0, conflicted = 0;
  for (const run of runs) {
    if (!run.workflow) { unconfigured++; continue; }
    if (run.workflowConflict || run.modelsTruncated) { conflicted++; continue; }
    const { id, version, label, taskSet } = run.workflow;
    const models = assignments(run);
    const key = createHash('sha256').update(JSON.stringify({ id, version, taskSet, models })).digest('hex').slice(0, 24);
    if (!groups.has(key)) groups.set(key, { key, id, version, label, taskSet, models, runs: [] });
    groups.get(key).runs.push(run);
  }
  return { unconfigured, conflicted, groups: [...groups.values()].map(({ runs: entries, ...group }) => ({
    ...group, ...aggregateRuns(entries), ...measurements(entries), testEvidence: aggregateEvidence(entries)
  })) };
}
