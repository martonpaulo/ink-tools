/**
 * «Insert illustration» and «Insert photo» (#111) over picture-search's shared «Insert best
 * picture» flow (#142): the mode's measured split decides what goes in, a press that inserts
 * nothing writes its sentence below the word, and one press runs at a time.
 */
import {LassoPlace} from '@supernote-tools/ink-core';
import {Measures, pixelKind, SearchResult} from '@supernote-tools/picture-search';
import {fail, ok} from '@supernote-tools/sn-adapter/official';
import {copy, pictureCopy} from '../src/copy';
import {MODES} from '../src/modes';
import {
  LOOKUP_PICTURES,
  modeDeps,
  modeSearchSettings,
  PICTURE_WIDTH,
  PictureDeps,
  pictureLasso,
} from '../src/pictures';
import {
  insertBest,
  MeasuredPages,
  picturesDir,
  QuickInsert,
  QuickInsertDeps,
} from '../src/profile';
import {defaultSettings} from '../src/settings';
import * as insertTier from '@supernote-tools/picture-search/insert';

// The shared insert, watched for the options each button passes (#35); it runs as it is.
jest.mock('@supernote-tools/picture-search/insert', () => {
  const actual = jest.requireActual('@supernote-tools/picture-search/insert');
  return {...actual, insertPicture: jest.fn(actual.insertPicture)};
});

const [illustration, photoMode] = MODES;

const paper: Measures = {
  width: 400,
  height: 400,
  mean: 255,
  dark: 0,
  white: 1,
  mid: 0,
  border: 1,
  borderMedian: 255,
  ink: 0,
  inkLeft: 0,
  inkTop: 0,
  inkWidth: 0,
  inkHeight: 0,
  bands: 0,
  lineAspect: 0,
  thickness: 0,
  edge: 0,
  edgeBox: 0,
  colours: 1,
  objectShare: 0,
  fragments: 0,
  darkest: 255,
  faintLines: false,
  ms: 1,
};
const outline: Measures = {
  ...paper,
  white: 0.8,
  dark: 0.05,
  ink: 0.08,
  objectShare: 0.2,
  bands: 3,
  lineAspect: 1,
  thickness: 2,
};
const photo: Measures = {
  ...paper,
  mean: 140,
  border: 0.1,
  mid: 0.6,
  objectShare: 0.9,
};

const result = (id: string): SearchResult => ({
  id: `commons:${id}`,
  source: 'commons',
  title: id,
  thumbUrl: `https://upload.wikimedia.org/${id}.png`,
  license: 'CC0 1.0',
  attribution: 'Commons',
});

const place: LassoPlace = {
  rect: {left: 372, top: 300, right: 572, bottom: 380},
  page: 0,
  pageSize: {width: 1920, height: 2560},
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

/** The mode's flow with the search, the measures and the insert replaced; the split stays real. */
function flow(
  mode: (typeof MODES)[number],
  measured: Record<string, Measures>,
) {
  const found = Object.keys(measured).map(result);
  const measure = jest.fn(
    async (
      results: SearchResult[],
      ..._rest: unknown[]
    ): Promise<MeasuredPages> => ({
      results,
      measures: new Map(results.map(r => [r.id, measured[r.title]])),
      contourThumbs: new Map(),
    }),
  );
  const insert = jest.fn(
    async (picked: SearchResult, ..._rest: unknown[]) =>
      ({ok: true, value: `/pictures/${picked.title}.png`} as const),
  );
  const deps: QuickInsertDeps = {
    ...modeDeps(mode, measure as never),
    search: async () => ({
      outcome: {
        results: found,
        statuses: {},
        sourceDown: false,
        allFailed: false,
      },
      thumbDir: '/p',
    }),
    insert,
    early: picked => ({id: picked.id, started: 0, raw: Promise.resolve(null)}),
    options: async () => ({width: 640, placement: 'below', contour: false}),
  };
  return {deps, insert, measure};
}

describe('the measured split decides what a mode inserts (#111)', () => {
  test('«Insert photo» on clip art only inserts nothing and says so, never a drawing', async () => {
    const {deps, insert} = flow(photoMode, {a: outline, b: outline});
    const done = await insertBest('apple', place, deps, pictureCopy.photo);
    expect(done).toEqual({ok: false, text: 'no photo found.'});
    expect(insert).not.toHaveBeenCalled();
  });

  test('«Insert illustration» passes over a photo that leads the search', async () => {
    const {deps, insert} = flow(illustration, {a: photo, b: outline});
    expect(
      await insertBest('apple', place, deps, pictureCopy.illustration),
    ).toEqual(ok('/pictures/b.png'));
    expect(insert.mock.calls[0][0].title).toBe('b');
  });

  test('an Illustrations page of the Choose screen holds no photo (#169)', async () => {
    // A photo cut out on white measures as clip art; its soft shading marks it (#169).
    const cutOut: Measures = {
      ...outline,
      border: 0.99,
      white: 0.72,
      mid: 0.25,
      colours: 324,
      shading: 0.77,
    };
    const measured = {a: photo, b: cutOut, c: outline, d: {...outline, shading: 0.1}};
    const page = async (mode: (typeof MODES)[number]) => {
      const {deps} = flow(mode, measured);
      const pages = await deps.measure(
        Object.keys(measured).map(result),
        '/p',
        'banana',
        undefined,
        () => {},
        true,
      );
      return pages.results.map(r => r.title);
    };
    const drawings = await page(illustration);
    expect(drawings).toEqual(['c', 'd']);
    expect(
      drawings.map(title => pixelKind(measured[title as keyof typeof measured])),
    ).not.toContain('photo');
    expect(await page(photoMode)).toEqual(['a', 'b']);
  });

  test('«Insert photo» takes the first photo, below the word', async () => {
    const {deps, insert, measure} = flow(photoMode, {a: outline, b: photo});
    expect((await insertBest('apple', place, deps, pictureCopy.photo)).ok).toBe(
      true,
    );
    expect(insert.mock.calls[0][0].title).toBe('b');
    // The measure stops once the first photo is fixed, judged by the mode's own split (#19).
    expect(measure.mock.calls[0][5]).toBe(true);
    const fits = measure.mock.calls[0][6] as (
      r: SearchResult,
      m: Measures,
    ) => boolean;
    expect(fits(result('b'), photo)).toBe(true);
    expect(fits(result('a'), outline)).toBe(false);
  });

  test('the Choose grid waits for every tile: its measure does not stop at the leader (#219)', async () => {
    const {deps, measure} = flow(illustration, {a: outline, b: outline});
    await deps.measure([result('a'), result('b')], '/p', 'apple', undefined, () => {}, false);
    expect(measure.mock.calls[0][5]).toBe(false);
  });
});

test('each mode searches with its own style; Lookup keeps its pictures in MyStyle/Lookup', async () => {
  expect(modeSearchSettings(illustration, defaultSettings).photos).toBe(false);
  expect(modeSearchSettings(photoMode, defaultSettings).photos).toBe(true);
  // English too, after the definition's languages: «apple» is the fruit there, not the brand (#13).
  expect(modeSearchSettings(illustration, defaultSettings).languages).toEqual([
    'pt',
    'es',
    'en',
  ]);
  expect(LOOKUP_PICTURES.dir()).toBe(picturesDir());
  expect(picturesDir('/storage/emulated/0')).toBe(
    '/storage/emulated/0/MyStyle/Lookup/pictures',
  );
  expect(await LOOKUP_PICTURES.options()).toEqual({
    width: PICTURE_WIDTH,
    placement: 'below',
    contour: false,
  });
});

test("the owner's presets (#105): one small size, and the search reads Picture sources and Data saver", () => {
  expect(PICTURE_WIDTH).toBe(200);
  const saver = modeSearchSettings(illustration, {
    ...defaultSettings,
    sourcesOff: ['openmoji'],
    dataSaver: true,
  });
  expect(saver.dataSaver).toBe(true);
  expect(saver.sourceOn('openmoji')).toBe(false);
  expect(saver.sourceOn('commons')).toBe(true);
  const plain = modeSearchSettings(illustration, defaultSettings);
  expect(plain.dataSaver).toBe(false);
  expect(plain.sourceOn('openmoji')).toBe(true);
});

describe('a press (#111)', () => {
  function press(
    over: Partial<PictureDeps> = {},
  ): PictureDeps & {[K in keyof PictureDeps]: jest.Mock} {
    return {
      settings: jest.fn(async () => defaultSettings),
      folder: jest.fn(async () => ok('/data/lookup')),
      missing: jest.fn(async () => []),
      read: jest.fn(async () => ok({query: 'maçã', place})),
      insert: jest.fn(
        async (): Promise<QuickInsert> => ({
          ok: true,
          value: '/pictures/a.png',
        }),
      ),
      write: jest.fn(async () => ok(true)),
      show: jest.fn(async () => ok(true)),
      ...over,
    } as PictureDeps & {[K in keyof PictureDeps]: jest.Mock};
  }

  test('inserts at the lasso, read again before the picture is lassoed', async () => {
    const d = press();
    expect(await pictureLasso(photoMode, d)).toEqual(ok('/pictures/a.png'));
    expect(d.insert).toHaveBeenCalledWith(
      photoMode,
      'maçã',
      {...place, recheck: true},
      expect.objectContaining({deadline: expect.any(Number)}),
    );
    expect(d.write).not.toHaveBeenCalled();
  });

  test('a press that inserts nothing writes its sentence below the word', async () => {
    const d = press({
      insert: jest.fn(
        async (): Promise<QuickInsert> => ({
          ok: false,
          text: 'no photo found.',
        }),
      ),
    });
    await pictureLasso(photoMode, d);
    const box = d.write.mock.calls[0][0];
    expect(box.text).toBe('maçã: no photo found.');
    expect(box.rect.top).toBeGreaterThanOrEqual(place.rect.bottom);
  });

  test('a switch turned off ignores a queued press', async () => {
    const d = press({
      settings: jest.fn(async () => ({...defaultSettings, photo: false})),
    });
    expect(await pictureLasso(photoMode, d)).toBeNull();
    expect(d.read).not.toHaveBeenCalled();
  });

  test('a missing permission opens the view, which asks for it', async () => {
    const d = press({
      missing: jest.fn(async () => ['plugin.permission.FILE:WRITE']),
    });
    expect(await pictureLasso(illustration, d)).toBeNull();
    expect(d.show).toHaveBeenCalled();
    expect(d.read).not.toHaveBeenCalled();
  });

  test('a lasso with no handwriting inserts nothing', async () => {
    const d = press({read: jest.fn(async () => fail(1, 'empty'))});
    expect(await pictureLasso(illustration, d)).toBeNull();
    expect(d.insert).not.toHaveBeenCalled();
    expect(d.write).not.toHaveBeenCalled();
  });

  test("a pasted selection's local rect places nothing and shows a toast (#165)", async () => {
    const toast = jest.fn();
    const pasted = {...place, rect: {left: -40, top: 0, right: 140, bottom: 181}};
    const d = press({read: jest.fn(async () => ok({query: 'apple', place: pasted})), toast});
    expect(await pictureLasso(illustration, d)).toBeNull();
    expect(d.insert).not.toHaveBeenCalled();
    expect(d.write).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(copy['error.unplaced']);
  });

  test('a recognition with no letter searches nothing and says so below it (#166)', async () => {
    const d = press({
      read: jest.fn(async () => ok({query: '• :.\n÷\n÷:.\n.\n.', place})),
    });
    expect(await pictureLasso(illustration, d)).toBeNull();
    expect(d.insert).not.toHaveBeenCalled();
    const box = d.write.mock.calls[0][0];
    expect(box.text).toBe(copy['error.unreadable']);
    expect(box.rect.top).toBeGreaterThanOrEqual(place.rect.bottom);
  });

  test('a multi-line recognition searches its words (#166)', async () => {
    const d = press({read: jest.fn(async () => ok({query: 'apple\npie\n.', place}))});
    await pictureLasso(photoMode, d);
    expect(d.insert.mock.calls[0][1]).toBe('apple pie');
  });

  test('one press at a time across both buttons', async () => {
    let finish: () => void = () => {};
    const slow = press({
      insert: jest.fn(
        () =>
          new Promise<QuickInsert>(resolve => {
            finish = () => resolve({ok: true, value: '/pictures/a.png'});
          }),
      ),
    });
    const first = pictureLasso(illustration, slow);
    const other = press();
    expect(await pictureLasso(photoMode, other)).toBeNull();
    expect(other.read).not.toHaveBeenCalled();
    await new Promise(resolve => setImmediate(resolve));
    finish();
    expect((await first)?.ok).toBe(true);
    // Once it ends, the next press runs.
    expect((await pictureLasso(photoMode, press()))?.ok).toBe(true);
  });
});

test('a picture left unselected over the ink says so in a short toast (#168)', () => {
  const {ToastAndroid} =
    jest.requireActual<typeof import('react-native')>('react-native');
  const show = jest.spyOn(ToastAndroid, 'show').mockImplementation(() => {});
  LOOKUP_PICTURES.lassoSkipped?.();
  expect(show).toHaveBeenCalledWith(
    'The picture touches your writing, so it is not selected.',
    ToastAndroid.SHORT,
  );
  show.mockRestore();
});

test('«Insert Sticker» asks for a sticker, «Insert Image» for a picture (#35)', async () => {
  expect(illustration.sticker).toBe(true);
  expect(photoMode.sticker).toBe(false);
  expect(await modeDeps(illustration).options()).toMatchObject({sticker: true});
  expect(await modeDeps(photoMode).options()).toMatchObject({sticker: false});
  const shared = insertTier.insertPicture as jest.Mock;
  shared.mockResolvedValueOnce({ok: true, value: '/p/x.png'});
  shared.mockResolvedValueOnce({ok: true, value: '/p/x.png'});
  const picked = {id: 'openmoji:1F34E', source: 'openmoji', title: 'apple'} as SearchResult;
  const plain = {width: 200, placement: 'below' as const, contour: false};
  await modeDeps(illustration).insert(picked, 'apple', place, false, plain, null, () => null);
  await modeDeps(photoMode).insert(picked, 'apple', place, false, plain, null, () => null);
  expect(shared.mock.calls.map(call => call[5]?.sticker)).toEqual([true, false]);
});
