/**
 * «Choose picture» (#156): the press keeps the word and opens the view, each mode lists only its
 * own tiles, an old list never shows in the new tab, a tap inserts once and closes the view.
 */
import type {SearchResult} from '@supernote-tools/picture-search';
import {fail, ok} from '@supernote-tools/sn-adapter/official';
import {
  ChooseDeps,
  chooseResults,
  closeChoose,
  currentChoice,
  insertChosen,
  onChoice,
  openChoose,
  resetChooseForTests,
} from '../src/choose';
import {copy, pictureCopy} from '../src/copy';
import {MODES} from '../src/modes';
import type {QuickInsertDeps} from '../src/profile';

const [illustration, photo] = MODES;
const place = {
  rect: {left: 100, top: 200, right: 300, bottom: 260},
  page: 1,
  pageSize: {width: 1920, height: 2560},
};

function result(id: string): SearchResult {
  return {
    id,
    source: 'commons',
    title: id,
    thumbUrl: `https://example.org/${id}.png`,
    license: 'CC0',
    attribution: '',
  } as SearchResult;
}

/** A measure for each result; the values do not matter to Choose, only that one exists. */
function measuredAll(results: readonly SearchResult[]): Map<string, never> {
  return new Map(results.map(r => [r.id, {} as never]));
}

function flow(
  ids: string[],
  over: Partial<QuickInsertDeps> = {},
): QuickInsertDeps {
  return {
    search: jest.fn(async () => ({
      outcome: {
        results: ids.map(result),
        statuses: {},
        query: 'apple',
      } as never,
      thumbDir: '/MyStyle/Lookup',
    })),
    // Every tile measured: the list is whole, so it is kept (#219).
    measure: jest.fn(async (results: SearchResult[]) => ({
      results,
      measures: measuredAll(results),
      contourThumbs: new Map(),
    })),
    insert: jest.fn(async () => ({ok: true as const, value: '/p.png'})),
    early: jest.fn(),
    options: jest.fn(async () => ({}) as never),
    ...over,
  };
}

function deps(over: Partial<ChooseDeps> = {}): ChooseDeps {
  return {
    missing: async () => [],
    folder: async () => ok('/MyStyle/Lookup'),
    read: async () => ok({query: 'apple', place}),
    show: jest.fn(async () => ok(true)),
    close: jest.fn(async () => ok(true)),
    flow: () => flow(['a', 'b']),
    thumb: async r => `file:///thumbs/${r.id}.png`,
    ...over,
  };
}

beforeEach(() => {
  resetChooseForTests();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

test('the press keeps the word and its place, then opens the view', async () => {
  const seen: unknown[] = [];
  onChoice(next => seen.push(next));
  const d = deps();
  expect(await openChoose(d)).toBe(true);
  expect(currentChoice()).toEqual({word: 'apple', place});
  expect(seen).toEqual([{word: 'apple', place}]);
  expect(d.show).toHaveBeenCalled();
});

test('a failed lasso read opens no view; a missing permission opens Settings', async () => {
  const unread = deps({read: async () => fail(-4, 'empty lasso')});
  expect(await openChoose(unread)).toBe(false);
  expect(unread.show).not.toHaveBeenCalled();
  const asking = deps({missing: async () => ['INTERNET']});
  expect(await openChoose(asking)).toBe(false);
  expect(asking.show).toHaveBeenCalled();
  expect(currentChoice()).toBeNull();
});

test('a word with no photo says so, never shows a drawing', async () => {
  const list = await chooseResults(
    photo,
    'apple',
    deps({flow: () => flow([])}),
  );
  expect(list).toEqual({tiles: [], text: pictureCopy.photo['search.empty']});
});

test('each tile shows its stored thumbnail, or the contour drawing that is inserted', async () => {
  const contour = 'file:///thumbs/b.contour.png';
  const list = await chooseResults(
    illustration,
    'apple',
    deps({
      flow: () =>
        flow(['a', 'b'], {
          measure: jest.fn(async results => ({
            results,
            measures: new Map(),
            contourThumbs: new Map([['b', contour]]),
          })),
        }),
    }),
  );
  expect(list?.tiles.map(tile => [tile.uri, tile.contour])).toEqual([
    ['file:///thumbs/a.png', false],
    [contour, true],
  ]);
});

test('a reopen on the same answer shows the kept tiles with no new measure (#205)', async () => {
  const banana = flow(['a', 'b']);
  const d = deps({flow: () => banana});
  const first = await chooseResults(illustration, 'banana', d);
  const second = await chooseResults(illustration, 'banana', d);
  expect(banana.measure).toHaveBeenCalledTimes(1);
  expect(second).toEqual(first);
  // Another answer, another word or the other mode is measured again.
  await chooseResults(photo, 'banana', d);
  await chooseResults(illustration, 'apple', d);
  expect(banana.measure).toHaveBeenCalledTimes(3);
  const updated = flow(['c', 'a']);
  await chooseResults(illustration, 'apple', deps({flow: () => updated}));
  expect(updated.measure).toHaveBeenCalledTimes(1);
});

test('a list cut short by a failed thumbnail is measured again on the next open (#219)', async () => {
  // «b»'s thumbnail did not download or measure: it has no measure and is left out.
  const short = flow(['a', 'b'], {
    measure: jest.fn(async (results: SearchResult[]) => ({
      results: results.slice(0, 1),
      measures: measuredAll(results.slice(0, 1)),
      contourThumbs: new Map(),
    })),
  });
  const d = deps({flow: () => short});
  const first = await chooseResults(illustration, 'banana', d);
  expect(first?.tiles.map(tile => tile.result.id)).toEqual(['a']);
  await chooseResults(illustration, 'banana', d);
  expect(short.measure).toHaveBeenCalledTimes(2);
});

test('a tile the mode rule rejected still lets the list be kept (#219)', async () => {
  // «b» is measured, then left out by the mode's split: the list is whole.
  const split = flow(['a', 'b'], {
    measure: jest.fn(async (results: SearchResult[]) => ({
      results: results.slice(0, 1),
      measures: measuredAll(results),
      contourThumbs: new Map(),
    })),
  });
  const d = deps({flow: () => split});
  await chooseResults(illustration, 'banana', d);
  await chooseResults(illustration, 'banana', d);
  expect(split.measure).toHaveBeenCalledTimes(1);
});

test('an empty list is searched and said again on the next open (#205)', async () => {
  const none = flow([]);
  const d = deps({flow: () => none});
  await chooseResults(photo, 'banana', d);
  await chooseResults(photo, 'banana', d);
  expect(none.measure).toHaveBeenCalledTimes(2);
});

test('a switch of tab while a search runs drops the old answer', async () => {
  let finish!: () => void;
  const slow = flow(['old'], {
    search: jest.fn(
      () =>
        new Promise(resolve => {
          finish = () =>
            resolve({
              outcome: {results: [result('old')], statuses: {}} as never,
              thumbDir: null,
            });
        }),
    ),
  });
  const first = chooseResults(illustration, 'apple', deps({flow: () => slow}));
  const second = await chooseResults(photo, 'apple', deps());
  finish();
  expect(await first).toBeNull();
  expect(second?.tiles.map(tile => tile.result.id)).toEqual(['a', 'b']);
});

test('a tap inserts at the kept place once, then closes the view', async () => {
  const bound = flow(['a']);
  const d = deps({flow: () => bound});
  await openChoose(d);
  const tile = {result: result('a'), uri: 'file:///a.png', contour: false};
  const [firstTap, secondTap] = await Promise.all([
    insertChosen(illustration, tile, d),
    insertChosen(illustration, tile, d),
  ]);
  expect(firstTap).toEqual({ok: true, value: '/p.png'});
  expect(secondTap).toBeNull();
  expect(bound.insert).toHaveBeenCalledTimes(1);
  expect(bound.insert).toHaveBeenCalledWith(
    tile.result,
    'apple',
    place,
    false,
    {},
    null,
    expect.any(Function),
  );
  expect(d.close).toHaveBeenCalled();
  expect(currentChoice()).toBeNull();
});

test('a failed insert keeps the view open with its sentence', async () => {
  const failing = flow(['a'], {
    insert: jest.fn(async () => ({
      ok: false as const,
      code: -1,
      message: 'disk',
      step: 'save' as never,
    })),
  });
  const d = deps({flow: () => failing});
  await openChoose(d);
  const answer = await insertChosen(
    illustration,
    {result: result('a'), uri: 'u', contour: false},
    d,
  );
  expect(answer?.ok).toBe(false);
  expect(d.close).not.toHaveBeenCalled();
  expect(currentChoice()).not.toBeNull();
});

test('Close drops the word and inserts nothing', async () => {
  const bound = flow(['a']);
  const d = deps({flow: () => bound});
  await openChoose(d);
  await closeChoose(d);
  expect(currentChoice()).toBeNull();
  expect(bound.insert).not.toHaveBeenCalled();
  expect(
    await insertChosen(
      illustration,
      {result: result('a'), uri: 'u', contour: false},
      d,
    ),
  ).toBeNull();
});

test('a pasted rect or a text with no letter opens no view (#165, #166)', async () => {
  const toast = jest.fn();
  const pasted = {...place, rect: {left: -40, top: 0, right: 140, bottom: 181}};
  const unplaced = deps({read: async () => ok({query: 'apple', place: pasted}), toast});
  expect(await openChoose(unplaced)).toBe(false);
  const unreadable = deps({read: async () => ok({query: '÷:.', place}), toast});
  expect(await openChoose(unreadable)).toBe(false);
  expect(unplaced.show).not.toHaveBeenCalled();
  expect(unreadable.show).not.toHaveBeenCalled();
  expect(toast.mock.calls).toEqual([[copy['error.unplaced']], [copy['error.unreadable']]]);
  expect(currentChoice()).toBeNull();
});
