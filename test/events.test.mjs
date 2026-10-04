import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../src/events.mjs';
import { redact, equalSecret } from '../src/security.mjs';
import { event } from './helpers.mjs';

test('event projection drops credentials, code and arbitrary object fields', () => {
  const raw = event('tool.started', { toolName: 'write', file: 'Source.swift', content: 'uncollected file', apiKey: 'secret', headers: { authorization: 'secret' } });
  const value = validateEvent(raw);
  assert.equal(value.data.file, 'Source.swift');
  assert.equal(value.data.apiKey, undefined); assert.equal(value.data.content, undefined); assert.equal(value.data.headers, undefined);
});
test('provider error projection is type-bound, redacted, bounded and rejects raw objects', () => {
  for (const type of ['message.completed', 'run.ended']) {
    const value = validateEvent(event(type, { errorMessage: 'Codex overloaded. api_key=PRIVATE_VALUE ' + 'x'.repeat(4000), stack: 'PRIVATE_STACK' }));
    assert.equal(value.data.errorMessage.length, 2000); assert.ok(!JSON.stringify(value).includes('PRIVATE_VALUE')); assert.equal(value.data.stack, undefined);
    assert.equal(validateEvent(event(type, { errorMessage: { message: 'RAW_OBJECT' } })).data.errorMessage, undefined);
  }
  assert.equal(validateEvent(event('tool.started', { errorMessage: 'UNRELATED' })).data.errorMessage, undefined);
});
test('common credentials are redacted from prompt text', () => {
  const s = redact('Authorization: Bearer abcdefghijkl API_KEY=hello sk-12345678901234567890123');
  assert.ok(!s.includes('abcdefghijkl')); assert.ok(!s.includes('hello')); assert.ok(!s.includes('sk-123'));
});
test('private key blocks and controls are removed', () => {
  const s = redact('a\u0000 -----BEGIN RSA PRIVATE KEY-----\nSECRET\n-----END RSA PRIVATE KEY-----');
  assert.ok(!s.includes('SECRET')); assert.ok(!s.includes('\u0000'));
});
test('unrecognized events and invalid identities are rejected', () => {
  assert.throws(() => validateEvent(event('invented.event')));
  assert.throws(() => validateEvent(event('run.started', {}, { sessionId: '../escape' })));
  assert.throws(() => validateEvent(event('run.started', {}, { time: 'invalid' })));
});
test('workflow is labeled reported and requires valid distinct stages', () => {
  const raw = event('workflow.updated', { source: 'observed', stages: [{ id: 'review', title: 'Review', status: 'pending' }] });
  assert.equal(validateEvent(raw).data.source, 'reported');
  raw.data.stages.push(raw.data.stages[0]); assert.throws(() => validateEvent(raw));
  assert.throws(() => validateEvent(event('workflow.updated', { stages: [{ id: 'x', title: 'x', status: 'perfect' }] })));
});
test('prompt length is capped and non-finite token counts ignored', () => {
  const value = validateEvent(event('message.completed', { prompt: 'a'.repeat(20000), usage: { input: -1, output: Infinity, cacheRead: 3 } }));
  assert.equal(value.data.prompt.length, 12000); assert.deepEqual(value.data.usage, { cacheRead: 3 });
});
test('secret comparison handles invalid inputs without exceptions', () => {
  assert.equal(equalSecret('a', 'a'), true); assert.equal(equalSecret('a', 'b'), false);
  assert.equal(equalSecret('', 'a'), false); assert.equal(equalSecret(undefined, 'a'), false);
});
