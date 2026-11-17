import {measureFirstPages, MeasureDeps} from '../src/flow/measure';
import {startLog, picksPath} from '../src/profile';
import {pickedFor, recordPick, resetPicksForTests} from '../src/picks/device';
import {
  addPick,
  emptyPicks,
  pickedIds,
  pickKey,
  PICK_WORD_LIMIT,
  PICKS_PER_WORD,
  parsePicks,
  picksFirst,
  serializePicks,
} from '../src/picks/picks';
import {fail, MODULE_CODE} from '@ink-tools/sn-adapter/official';
import type {TextStore} from '@ink-tools/picture-search';
import type {SearchResult} from '@ink-tools/picture-search/types';

const result = (id: string): SearchResult => ({
  id,
  source: 'openclipart',
  title: id,
  thumbUrl: `https://openclipart.org/${id}.png`,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
});

const ids = (results: SearchResult[]) => results.map(item => item.id);

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

describe('the picks rule (#34)', () => {
  it('shares one key across case, accents and spaces', () => {
    expect(pickKey(' Maçã ')).toBe('maca');
    expect(pickKey('maca')).toBe('maca');
    expect(pickKey('Pão  de   Queijo')).toBe('pao de queijo');
    expect(pickKey('   ')).toBe('');
  });

  it('keeps the newest picks of a word first, a library tile as its source picture', () => {
    let picks = addPick(emptyPicks(), 'maçã', 'openclipart:1');
    picks = addPick(picks, 'Maca', 'library:commons:2');
    expect(pickedIds(picks, 'maçã')).toEqual(['commons:2', 'openclipart:1']);
    picks = addPick(picks, 'maçã', 'openclipart:1');
    expect(pickedIds(picks, 'MAÇÃ')).toEqual(['openclipart:1', 'commons:2']);
    expect(pickedIds(picks, 'pera')).toEqual([]);
  });

  it('keeps a bounded number of picks and words', () => {
    let picks = emptyPicks();
    for (let n = 0; n < PICKS_PER_WORD + 2; n++) {
      picks = addPick(picks, 'cat', `openclipart:${n}`);
    }
    expect(pickedIds(picks, 'cat')).toHaveLength(PICKS_PER_WORD);
    for (let n = 0; n < PICK_WORD_LIMIT + 5; n++) {
      picks = addPick(picks, `word ${n}`, 'openclipart:1');
    }
    expect(picks.words).toHaveLength(PICK_WORD_LIMIT);
    // The oldest word is the one dropped.
    expect(pickedIds(picks, 'cat')).toEqual([]);
  });

  it('changes nothing for the same pick again or a blank word', () => {
    const picks = addPick(emptyPicks(), 'cat', 'openclipart:1');
    expect(addPick(picks, 'Cat', 'openclipart:1')).toBe(picks);
    expect(addPick(picks, ' ', 'openclipart:2')).toBe(picks);
  });

  it('puts the picked results first, newest pick first, the rest in order', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map(result);
    expect(ids(picksFirst(list, ['d', 'b']))).toEqual([
      'd',
      'b',
      'a',
      'c',
      'e',
    ]);
    expect(picksFirst(list, ['x'])).toBe(list);
    expect(picksFirst(list, ['a'])).toBe(list);
    expect(ids(picksFirst([result('library:d'), result('a')], ['d']))).toEqual([
      'library:d',
      'a',
    ]);
  });

  it('reads back what it writes and refuses an unreadable file', () => {
    const picks = addPick(emptyPicks(), 'cat', 'openclipart:1');
    expect(parsePicks(serializePicks(picks))).toEqual({ok: true, picks});
    expect(parsePicks('{').ok).toBe(false);
    expect(parsePicks('{"version":2,"words":[]}').ok).toBe(false);
    expect(
      parsePicks('{"version":1,"words":[{"key":"cat","ids":[1]}]}').ok,
    ).toBe(false);
  });
});

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

describe('the measured order keeps a pick first (#34)', () => {
  beforeEach(() => startLog());

  it('leads with the pick after the pixel re-sort', async () => {
    const list = ['a', 'b', 'c', 'd'].map(result);
    const deps: MeasureDeps = {
      analyzer: {
        measure: async () => fail(MODULE_CODE, 'NOT_IMAGE', 'NOT_IMAGE'),
        toContour: async () => fail(MODULE_CODE, 'NOT_IMAGE', 'NOT_IMAGE'),
      },
      thumb: async item => `file:///p/thumbs/${item.id}`,
      limitMs: 1000,
      picked: async query => (query === 'cat' ? ['c'] : []),
    };
    expect(
      ids((await measureFirstPages(list, '/p', 'cat', deps)).results),
    ).toEqual(['c', 'a', 'b', 'd']);
    expect(
      ids((await measureFirstPages(list, '/p', 'dog', deps)).results),
    ).toEqual(['a', 'b', 'c', 'd']);
  });
});
