/** The Digest store over an in-memory Knowledge provider (#42). */
import type {DigestEntry, Row} from '@supernote-tools/sn-adapter';
import type {ContentRows} from '../src/deviceStores';
import {createDeviceDigest} from '../src/digestStore';

const BASE = 'content://com.ratta.supernote.knowledge.provider';
const INSERT = `${BASE}/knowledge/insert`;
const COUNT = `${BASE}/knowledge/count/by_unique_identifier/`;
const UPDATE = `${BASE}/knowledge/update/by_unique_identifier`;

const entry = (over: Partial<DigestEntry> = {}): DigestEntry => ({
  sourceId: 'a1',
  title: 'A page title',
  text: 'The excerpt.',
  url: 'https://example.com/a',
  savedAt: 1_700_000_000_000,
  ...over,
});

/** Answers the three paths the store calls, as the provider does; a delete is always refused. */
function knowledge(count?: (id: string) => Row[]) {
  const rows: Row[] = [];
  const idOf = (row: Row) => JSON.parse(String(row.metadata)).unique_identifier as string;
  const provider: ContentRows = {
    query: async uri => {
      if (!uri.startsWith(COUNT)) {throw new Error(`Unknown URI: ${uri}`);}
      const id = uri.slice(COUNT.length);
      return count ? count(id) : [{count: rows.filter(r => idOf(r) === id).length}];
    },
    insert: async (uri, row) => {
      if (uri !== INSERT) {throw new Error(`Unknown URI: ${uri}`);}
      rows.push({...row});
      return String(rows.length);
    },
    update: async (uri, _where, row) => {
      if (uri !== UPDATE) {throw new Error(`Unknown URI: ${uri}`);}
      const hit = rows.filter(r => idOf(r) === row.knowledge_unique_identifier);
      hit.forEach(r => Object.assign(r, row));
      return hit.length;
    },
    remove: async () => {
      throw new Error('Permission denied: you are not authorized to invoke this interface.');
    },
  };
  return {provider, rows};
}

test('a new entry is inserted once, and a second write updates it (#42)', async () => {
  const {provider, rows} = knowledge();
  const digest = createDeviceDigest(provider);
  expect(await digest.write([entry()])).toEqual({inserted: 1, updated: 0, failed: []});
  expect(await digest.write([entry({text: 'Edited.'})])).toEqual({inserted: 0, updated: 1, failed: []});
  expect(rows).toHaveLength(1);
  expect(rows[0].content).toBe('A page title\n\nEdited.');
  expect(rows[0].source_type).toBe(4);
});

test('the collection given goes on the entry; an empty one leaves the default', async () => {
  const kb = knowledge();
  await createDeviceDigest(kb.provider, 'kb-saved').write([entry()]);
  expect(kb.rows[0].knowledge_base_unique_attribute).toBe('kb-saved');
  const plain = knowledge();
  await createDeviceDigest(plain.provider).write([entry()]);
  expect(plain.rows[0]).not.toHaveProperty('knowledge_base_unique_attribute');
});

test('a missing count is a failure, never an insert that would duplicate', async () => {
  const {provider, rows} = knowledge(() => []);
  const result = await createDeviceDigest(provider).write([entry()]);
  expect(result.inserted).toBe(0);
  expect(result.failed).toEqual([{sourceId: 'a1', reason: expect.stringContaining('no count')}]);
  expect(rows).toHaveLength(0);
});

test('one refused entry is reported and the others still run', async () => {
  const {provider, rows} = knowledge();
  const result = await createDeviceDigest(provider).write([
    entry({sourceId: 'bad_id'}),
    entry({sourceId: 'b2', title: '', text: ''}),
    entry({sourceId: 'c3'}),
  ]);
  expect(result.inserted).toBe(1);
  expect(result.failed.map(f => f.sourceId)).toEqual(['bad_id', 'b2']);
  expect(rows).toHaveLength(1);
});

test('an update the provider applied to no entry is a failure', async () => {
  const {provider} = knowledge(() => [{count: 1}]);
  const result = await createDeviceDigest(provider).write([entry()]);
  expect(result).toEqual({inserted: 0, updated: 0, failed: [{sourceId: 'a1', reason: expect.stringContaining('changed no entry')}]});
});
