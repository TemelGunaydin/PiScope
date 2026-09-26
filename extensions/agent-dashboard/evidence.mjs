import { createHash } from 'node:crypto';
import { openSync, closeSync, fstatSync, readSync, realpathSync, constants } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { redact } from './privacy.mjs';

export const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest('hex');
const fields = ['tests', 'passed', 'failures', 'errors', 'skipped'];
const counts = () => Object.fromEntries(fields.map(k => [k, 0]));
const children = {
  testsuites: ['testsuite', 'properties', 'system-out', 'system-err'],
  testsuite: ['testsuite', 'testcase', 'properties', 'system-out', 'system-err'],
  testcase: ['failure', 'error', 'skipped', 'properties', 'system-out', 'system-err'],
  properties: ['property'], property: [], failure: [], error: [], skipped: [], 'system-out': [], 'system-err': []
};
function entities(text) {
  return text.replace(/&([^&;]*);|&/g, (match, name) => {
    const predefined = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(predefined, name)) return predefined[name];
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(name || '')) throw new Error('Unsupported XML entity');
    const n = name[1] === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    if (!(n === 9 || n === 10 || n === 13 || n >= 32 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) && n !== 0xfffe && n !== 0xffff)) throw new Error('Invalid XML character');
    return String.fromCodePoint(n);
  });
}

/** Strict, bounded JUnit subset. No DTDs, external entities or stdout parsing.
 * Count actual testcase elements; summary-only/inconsistent reports cannot pass.
 * Unsupported outcome extensions fail closed rather than guessing success. */
export function parseJUnit(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > MAX_REPORT_BYTES) throw new Error('JUnit report exceeds 2 MiB');
  xml = xml.replace(/^\uFEFF/, '');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(xml)) throw new Error('Invalid XML character');
  const stack = [], identities = []; let result, roots = 0, pos = 0, nodes = 0;
  function finish() {
    const node = stack.pop(), parent = stack.at(-1);
    if (node.name === 'testcase') {
      const c = node.counts; c.tests = 1;
      c[node.error ? 'errors' : node.failure ? 'failures' : node.skipped ? 'skipped' : 'passed'] = 1;
    }
    if (['testsuite', 'testsuites'].includes(node.name)) {
      for (const k of ['tests', 'failures', 'errors', 'skipped']) {
        if (node.attrs[k] === undefined) continue;
        if (!/^\d+$/.test(node.attrs[k]) || Number(node.attrs[k]) !== node.counts[k]) throw new Error(`JUnit ${k} total disagrees with testcase records`);
      }
      if (node.attrs.disabled && node.attrs.disabled !== '0') throw new Error('Unsupported JUnit disabled total; use explicit skipped testcases');
    }
    if (parent) for (const k of fields) parent.counts[k] += node.counts[k];
    else result = node.counts;
  }
  while (pos < xml.length) {
    if (xml[pos] !== '<') {
      const end = xml.indexOf('<', pos), text = xml.slice(pos, end < 0 ? xml.length : end);
      entities(text);
      if (text.includes(']]>') || text.trim() && (!stack.length || ['testsuite', 'testsuites', 'testcase', 'properties'].includes(stack.at(-1).name))) throw new Error('Unexpected XML text');
      pos += text.length; continue;
    }
    if (xml.startsWith('<!--', pos)) {
      const end = xml.indexOf('-->', pos + 4);
      if (end < 0 || xml.slice(pos + 4, end).includes('--')) throw new Error('Invalid XML comment');
      pos = end + 3; continue;
    }
    if (xml.startsWith('<![CDATA[', pos)) {
      const end = xml.indexOf(']]>', pos + 9);
      if (end < 0 || !stack.length || children[stack.at(-1).name].length) throw new Error('Invalid XML CDATA');
      pos = end + 3; continue;
    }
    if (xml.startsWith('<?xml ', pos) && !roots && !xml.slice(0, pos).trim()) {
      const end = xml.indexOf('?>', pos);
      if (end < 0 || !/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?(?:\s+standalone=["'](?:yes|no)["'])?\s*\?>$/i.test(xml.slice(pos, end + 2))) throw new Error('Unsupported XML declaration');
      pos = end + 2; continue;
    }
    const close = /^<\/([\w.-]+)\s*>/.exec(xml.slice(pos));
    if (close) {
      if (stack.at(-1)?.name !== close[1]) throw new Error('Mismatched XML closing tag');
      finish(); pos += close[0].length; continue;
    }
    const start = /^<([A-Za-z_][\w.-]*)/.exec(xml.slice(pos));
    if (!start) throw new Error('Unsupported XML markup (DTD/entities are disabled)');
    const name = start[1], parent = stack.at(-1);
    if (!Object.hasOwn(children, name) || (parent ? !children[parent.name].includes(name) : ++roots !== 1 || !['testsuite', 'testsuites'].includes(name))) throw new Error('Unsupported JUnit element or nesting');
    if (++nodes > 100000 || stack.length >= 64) throw new Error('JUnit structure limit exceeded');
    pos += start[0].length; const attrs = Object.create(null);
    while (!/^\s*\/?\>/.test(xml.slice(pos))) {
      const attr = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(xml.slice(pos));
      if (!attr || Object.hasOwn(attrs, attr[1])) throw new Error('Invalid XML attribute');
      attrs[attr[1]] = entities(attr[2] ?? attr[3]); pos += attr[0].length;
    }
    const end = /^\s*(\/?)>/.exec(xml.slice(pos)); pos += end[0].length;
    const node = { name, attrs, counts: counts() };
    if (name === 'testcase') {
      if (!attrs.name) throw new Error('JUnit testcase requires a name');
      if (attrs.status && !['run', 'passed', 'success', 'notrun', 'skipped', 'disabled'].includes(attrs.status)) throw new Error('Unsupported JUnit testcase status');
      if (attrs.result && !['completed', 'suppressed', 'skipped'].includes(attrs.result) || attrs.success && attrs.success !== 'true') throw new Error('Unsupported JUnit testcase result');
      node.skipped = ['notrun', 'skipped', 'disabled'].includes(attrs.status) || ['suppressed', 'skipped'].includes(attrs.result);
      identities.push(JSON.stringify([stack.filter(n => n.name === 'testsuite').map(n => n.attrs.name || ''), attrs.classname || '', attrs.name]));
    }
    if (['error', 'failure', 'skipped'].includes(name)) parent[name] = true;
    stack.push(node); if (end[1]) finish();
  }
  if (stack.length || roots !== 1 || !result) throw new Error('Incomplete JUnit report');
  return { ...result, suiteHash: digest(JSON.stringify(identities.sort())) };
}

export function evidenceRecord(input) {
  if (!input || input.format !== 'junit' || input.source !== 'imported-report') throw new Error('Unsupported test evidence');
  const out = { format: 'junit', source: 'imported-report' };
  for (const key of ['reportKey', 'sha256', 'suiteHash']) {
    if (!/^[a-f0-9]{64}$/.test(input[key])) throw new Error(`Invalid evidence ${key}`);
    out[key] = input[key];
  }
  if (typeof input.file !== 'string' || !input.file || isAbsolute(input.file) || input.file.split(/[\\/]/).includes('..')) throw new Error('Evidence needs a project-relative file');
  out.file = redact(input.file, 512);
  for (const key of fields) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > 100000) throw new Error(`Invalid evidence ${key}`);
    out[key] = input[key];
  }
  if (out.tests !== out.passed + out.failures + out.errors + out.skipped) throw new Error('Inconsistent evidence counts');
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_REPORT_BYTES || !Number.isFinite(Date.parse(input.modifiedAt))) throw new Error('Invalid evidence file metadata');
  return { ...out, bytes: input.bytes, modifiedAt: new Date(input.modifiedAt).toISOString() };
}

/** Only called by an explicit Pi user command. No discovery or shell execution. */
export function readJUnitReport(cwd, path, since, now = Date.now()) {
  const root = realpathSync(cwd), file = realpathSync(resolve(root, path));
  const rel = relative(root, file);
  if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Select a report inside the current project');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size < 1 || before.size > MAX_REPORT_BYTES) throw new Error('Select a regular JUnit file of at most 2 MiB');
    if (!Number.isFinite(since) || before.mtimeMs < since || before.mtimeMs > now + 1000) throw new Error('Report must be generated during or after the latest request');
    const buffer = Buffer.alloc(before.size + 1); let size = 0, n;
    while ((n = readSync(fd, buffer, size, buffer.length - size, null)) > 0) { size += n; if (size === buffer.length) break; }
    const after = fstatSync(fd);
    if (size !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error('Report changed while reading; retry after tests finish');
    const raw = buffer.subarray(0, size), xml = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    return evidenceRecord({ format: 'junit', source: 'imported-report', reportKey: digest(rel), file: rel,
      sha256: digest(raw), bytes: size, modifiedAt: before.mtime.toISOString(), ...parseJUnit(xml) });
  } finally { closeSync(fd); }
}
