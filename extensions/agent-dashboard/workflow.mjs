import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { redact } from './privacy.mjs';

// A profile describes workflow roles, never provider credentials or routing.
// Used both before delivery and at ingestion so the installed adapter is standalone.
export function workflowProfile(input) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const key = (value, field) => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(value) || redact(value, 80) !== value) throw new Error(`Invalid workflow ${field}`);
    return value;
  };
  if (!object(input) || input.schemaVersion !== 1) throw new Error('Workflow profile requires schemaVersion 1');
  if (!Array.isArray(input.roles) || input.roles.length > 20) throw new Error('Workflow profile requires at most 20 roles');
  const ids = new Set(['primary']), agents = new Set();
  const roles = input.roles.map(binding => {
    if (!object(binding)) throw new Error('Invalid workflow role');
    const role = key(binding.role, 'role'), agent = key(binding.agent, 'agent');
    if (ids.has(role) || agents.has(agent)) throw new Error('Workflow role and agent bindings must be unique');
    ids.add(role); agents.add(agent); return { role, agent };
  }).sort((a, b) => a.role.localeCompare(b.role));
  return { schemaVersion: 1, id: key(input.id, 'id'), version: key(input.version, 'version'),
    label: redact(typeof input.label === 'string' ? input.label : input.id, 120),
    taskSet: input.taskSet === undefined || input.taskSet === '' ? '' : key(input.taskSet, 'taskSet'), roles };
}

export function readWorkflowProfile(cwd) {
  const file = join(cwd, '.pi', 'agent-dashboard.workflow.json');
  try {
    if (statSync(file).size > 16 * 1024) throw new Error('Workflow profile exceeds 16 KB');
    return workflowProfile(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
