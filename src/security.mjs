import { timingSafeEqual } from 'node:crypto';

export function equalSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export { redact } from '../extensions/agent-dashboard/privacy.mjs';

export function cookieValue(header, key) {
  for (const part of (header || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === key) return rest.join('=');
  }
  return '';
}
