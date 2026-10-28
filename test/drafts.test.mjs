import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectDrafts, PROJECT_DRAFTS_KEY } from '../public/workspace.js';

function storage(raw) {
  const values = new Map(raw === undefined ? [] : [[PROJECT_DRAFTS_KEY, raw]]);
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
}

test('project drafts survive reload by exact project ID, with note identity but without approval', () => {
  const disk = storage(), drafts = new ProjectDrafts(disk), ref = 'a'.repeat(64);
  const text = '  Exact draft\nTürkçe 🦀 <script>literal</script>  ';
  drafts.set('full-project', text, ref); drafts.set('full-project-extra', 'A separate draft');
  const reload = new ProjectDrafts(disk);
  assert.deepEqual(reload.get('full-project'), { text, todoRef: ref });
  assert.deepEqual(reload.get('full-project-extra'), { text: 'A separate draft', todoRef: undefined });
  assert.equal(reload.get('unknown-project'), undefined);
  assert.deepEqual(JSON.parse(disk.getItem(PROJECT_DRAFTS_KEY)), { version: 1, drafts: [['full-project', text, ref], ['full-project-extra', 'A separate draft', null]] });
});

test('clearing one draft does not clear another, and overlong source-note drafts are retained without truncation', () => {
  const disk = storage(), drafts = new ProjectDrafts(disk), long = 'x'.repeat(64000);
  assert.equal(drafts.set('note-project', long, 'b'.repeat(64)), true);
  drafts.set('other-project', 'Keep this'); drafts.set('note-project', '');
  assert.equal(new ProjectDrafts(disk).get('note-project'), undefined);
  assert.equal(new ProjectDrafts(disk).get('other-project').text, 'Keep this');
  drafts.set('note-project', long);
  assert.equal(new ProjectDrafts(disk).get('note-project').text, long);
  assert.equal(drafts.set('note-project', long + 'x'), false);
  assert.equal(drafts.get('note-project').text, long);
});

test('corrupt or forged stored drafts do not become usable text or approval', () => {
  for (const raw of ['{broken', JSON.stringify({ version: 2, drafts: [['p', 'text', null]] }),
    JSON.stringify({ version: 1, drafts: [['<script>', 'text', null]] }),
    JSON.stringify({ version: 1, drafts: [['p', 'text', 'invalid-note-ref']] }),
    JSON.stringify({ version: 1, drafts: [['p', 'text', null, { approved: true }]] }), 'x'.repeat(512 * 1024 + 1)]) {
    assert.equal(new ProjectDrafts(storage(raw)).entries.size, 0);
  }
  const drafts = new ProjectDrafts(storage());
  assert.equal(drafts.set('<script>', 'bad identity'), false);
  assert.equal(drafts.set('valid', 'text', 'other-project-note'), false);
});

test('blocked or full browser storage preserves page-local drafts and reports the persistence failure', () => {
  for (const disk of [undefined, { getItem() { throw Error('blocked'); } }, { getItem() {}, setItem() { throw Error('quota'); } }]) {
    const drafts = new ProjectDrafts(disk); drafts.set('project', 'Keep in this page');
    assert.equal(drafts.get('project').text, 'Keep in this page'); assert.equal(drafts.persistent, false);
  }
  const disk = storage(), drafts = new ProjectDrafts(disk), save = disk.setItem;
  disk.setItem = () => { throw Error('temporary'); }; drafts.set('p', 'Recover me'); assert.equal(drafts.persistent, false);
  disk.setItem = save; drafts.set('p', 'Recover me'); assert.equal(drafts.persistent, true);
  assert.equal(new ProjectDrafts(disk).get('p').text, 'Recover me');
});

test('draft retention is bounded and keeps the most recently edited projects', () => {
  const disk = storage(), drafts = new ProjectDrafts(disk);
  for (let n = 0; n < 110; n++) drafts.set('project-' + n, 'Text ' + n);
  assert.equal(drafts.entries.size, 100); assert.equal(drafts.get('project-0'), undefined); assert.equal(drafts.get('project-109').text, 'Text 109');
  for (let n = 0; n < 12; n++) drafts.set('large-' + n, '\n'.repeat(64000));
  assert.ok(disk.getItem(PROJECT_DRAFTS_KEY).length <= 512 * 1024);
  assert.equal(new ProjectDrafts(disk).get('large-11').text.length, 64000);
});
