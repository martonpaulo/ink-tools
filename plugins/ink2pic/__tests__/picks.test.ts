/**
 * Ink2Pic's picks store on the device (#34). The picks rule and the measured order's pick run in
 * the packages gate, packages/picture-search/__tests__/picks.test.ts (#142, D63 A).
 */
import {startLog, picksPath} from '../src/profile';
import {pickedFor, recordPick, resetPicksForTests} from '../src/picks/device';
import {parsePicks} from '../src/picks/picks';
import type {TextStore} from '@ink-tools/picture-search';

function memoryStorage(files: Record<string, string> = {}): TextStore & {
  files: Record<string, string>;
  writes: number;
} {
  const store = {
    files,
    writes: 0,
    readText: async (path: string) => files[path] ?? null,
    writeText: async (path: string, text: string) => {
      store.writes += 1;
      files[path] = text;
    },
  };
  return store;
}


describe('the picks on the device (#34)', () => {
  beforeEach(() => startLog());

  it('saves a grid pick to picks.json and leads the next search with it', async () => {
    const store = memoryStorage();
    resetPicksForTests(store);
    await recordPick('maçã', 'commons:7');
    expect(parsePicks(store.files[picksPath()])).toEqual({
      ok: true,
      picks: {words: [{key: 'maca', ids: ['commons:7']}]},
    });
    // A new session reads the file.
    resetPicksForTests(store);
    expect(await pickedFor('Maçã')).toEqual(['commons:7']);
    // The same pick again writes nothing.
    await recordPick('maçã', 'commons:7');
    expect(store.writes).toBe(1);
  });

  it('never writes over an unreadable file', async () => {
    const store = memoryStorage({[picksPath()]: 'not json'});
    resetPicksForTests(store);
    await recordPick('cat', 'openclipart:1');
    expect(store.files[picksPath()]).toBe('not json');
    // The pick still counts for this session.
    expect(await pickedFor('cat')).toEqual(['openclipart:1']);
  });

  it('answers no picks when the file cannot be read', async () => {
    resetPicksForTests({
      readText: async () => {
        throw new Error('IO');
      },
      writeText: async () => {},
    });
    expect(await pickedFor('cat')).toEqual([]);
  });
});

