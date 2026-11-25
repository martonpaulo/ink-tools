import {measureFirstPages, MeasureDeps} from '../src/insert';
import '../testing/profile';
import {startLog} from '../src/log/memory';
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
} from '../src/picks';
import {fail, MODULE_CODE} from '@ink-tools/sn-adapter/official';
import type {SearchResult} from '../src/types';

const result = (id: string): SearchResult => ({
  id,
  source: 'openclipart',
  title: id,
  thumbUrl: `https://openclipart.org/${id}.png`,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
});

const ids = (results: SearchResult[]) => results.map(item => item.id);
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

describe('the measured order keeps a pick first (#34)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    startLog();
  });

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
