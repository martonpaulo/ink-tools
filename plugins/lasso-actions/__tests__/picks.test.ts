/**
 * «Remember my pick» (#292): a picture chosen for a word is kept in the private plugin folder and
 * leads the next search for that word, also after a restart.
 */
import {picksFirst, type SearchResult, type TextStore} from '@ink-tools/picture-search';
import {ok} from '@ink-tools/sn-adapter/official';
import {pickedFor, recordPick, resetPicksForTests} from '../src/picks';

const PRIVATE = '/data/plugin/lookup';

function memory(files: Record<string, string> = {}) {
  const store: TextStore = {
    readText: async path => files[path] ?? null,
    writeText: async (path, text) => {
      files[path] = text;
    },
  };
  return {files, store};
}

function boot(files: Record<string, string>) {
  const mem = memory(files);
  resetPicksForTests({storage: mem.store, folder: async () => ok(PRIVATE)});
  return mem;
}

const result = (id: string) => ({id}) as SearchResult;

test('a chosen picture is recorded in the private folder and leads the next search', async () => {
  const mem = boot({});
  await recordPick('Apple', 'commons:2');
  expect(Object.keys(mem.files)).toEqual([`${PRIVATE}/picks.json`]);
  // A new runtime reads the file back.
  boot(mem.files);
  const ids = await pickedFor('apple');
  expect(ids).toEqual(['commons:2']);
  const ordered = picksFirst([result('commons:1'), result('commons:2')], ids);
  expect(ordered.map(r => r.id)).toEqual(['commons:2', 'commons:1']);
});

test('an unreadable picks file is kept, never written over', async () => {
  const mem = boot({[`${PRIVATE}/picks.json`]: 'not json'});
  await recordPick('apple', 'commons:2');
  expect(mem.files[`${PRIVATE}/picks.json`]).toBe('not json');
});

test('a failed write never rejects', async () => {
  resetPicksForTests({
    storage: {
      readText: async () => null,
      writeText: async () => {
        throw new Error('disk full');
      },
    },
    folder: async () => ok(PRIVATE),
  });
  await expect(recordPick('apple', 'commons:2')).resolves.toBeUndefined();
});
