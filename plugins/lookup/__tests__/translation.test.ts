/** «Insert translation» in Lookup (#158): one button over every switched-on pair. */
import {
  LassoPlace,
  LookupResult,
  PinyinIndex,
  TranslationQuery,
} from '@supernote-tools/ink-core';
import {fail, ok} from '@supernote-tools/sn-adapter/official';
import {
  ButtonDeps,
  resetButtonsForTests,
  settingsChanged,
} from '../src/buttons';
import {copy} from '../src/copy';
import {TRANSLATE_BUTTON_ID} from '../src/modes';
import {defaultSettings, LookupSettings} from '../src/settings';
import {TranslateDeps, translateLasso} from '../src/translation';

const place: LassoPlace = {
  rect: {left: 372, top: 300, right: 572, bottom: 380},
  page: 0,
  pageSize: {width: 1920, height: 2560},
};

/** A two-word index in CC-CEDICT's shape: 苹果 is the best `pingguo`. */
const INDEX = new PinyinIndex({
  entries: ['pingguo 苹果ping2guo3 平锅ping2guo1'],
});

const answer = (texts: string[], errors: string[] = []): LookupResult => ({
  translations: texts.map(text => ({text})),
  providerId: texts.length ? 'wiktionary' : null,
  errors,
});

const withPairs = (pairs: Record<string, boolean>): LookupSettings => ({
  ...defaultSettings,
  translation: true,
  pairs: {...defaultSettings.pairs, ...pairs},
});

function run(
  query: string,
  settings: LookupSettings,
  lookup: (q: TranslationQuery) => LookupResult,
) {
  const asked: TranslationQuery[] = [];
  const insert = jest.fn(async () => ok(true));
  const deps: TranslateDeps = {
    read: async () => ok({query, place}),
    settings: async () => settings,
    translate: async q => {
      asked.push(q);
      return lookup(q);
    },
    pinyin: () => INDEX,
    insert,
    log: () => {},
  };
  return {deps, asked, insert};
}

test('no pair on: the box asks for one and nothing is looked up', async () => {
  const {deps, asked, insert} = run('casa', withPairs({}), () => answer([]));
  const result = await translateLasso(deps);
  expect(result).toEqual({ok: false, text: copy['translation.noPair']('casa')});
  expect(asked).toEqual([]);
  expect(insert).toHaveBeenCalledTimes(1);
});

test('both directions of a pair are asked; each that finds one is a line, in PAIRS order', async () => {
  const {deps, asked, insert} = run('casa', withPairs({'es-pt': true}), q =>
    answer([q.to === 'pt' ? 'casa' : 'hogar']),
  );
  const result = await translateLasso(deps);
  expect(asked.map(q => `${q.from}-${q.to}`).sort()).toEqual([
    'es-pt',
    'pt-es',
  ]);
  expect(result).toEqual({
    ok: true,
    text: 'ES→PT casa → casa (Wiktionary)\nPT→ES casa → hogar (Wiktionary)',
  });
  const box = (insert.mock.calls[0] as unknown[])[0] as {
    rect: {top: number};
  };
  expect(box.rect.top).toBeGreaterThanOrEqual(place.rect.bottom);
});

test('one direction fails, another finds: the found line is inserted', async () => {
  const {deps} = run('aprovechar', withPairs({'es-pt': true}), q =>
    q.from === 'es'
      ? answer(['aproveitar'])
      : answer([], ['wiktionary: HTTP 503']),
  );
  expect(await translateLasso(deps)).toEqual({
    ok: true,
    text: 'ES→PT aprovechar → aproveitar (Wiktionary)',
  });
});

test('every lookup fails: «could not be reached», never «no translation»', async () => {
  const {deps} = run('casa', withPairs({'es-pt': true}), () =>
    answer([], ['wiktionary: HTTP 503']),
  );
  expect(await translateLasso(deps)).toEqual({
    ok: false,
    text: copy['translation.failed']('casa'),
  });
});

test('no lookup knows the word and none failed: «no translation found»', async () => {
  const {deps} = run('xyzzy', withPairs({'es-pt': true}), () => answer([]));
  expect((await translateLasso(deps)).text).toBe(
    copy['translation.none']('xyzzy'),
  );
});

test('ZH pinyin is read to characters on the ZH→PT direction', async () => {
  const {deps} = run('pingguo', withPairs({'zh-pt': true}), q =>
    q.word === '苹果' && q.from === 'zh' ? answer(['maçã']) : answer([]),
  );
  expect((await translateLasso(deps)).text).toBe(
    'ZH→PT 苹果 (ping2guo3) → maçã (Wiktionary)',
  );
});

test('a failed lasso read inserts nothing', async () => {
  const {deps, insert} = run('casa', withPairs({'es-pt': true}), () =>
    answer([]),
  );
  deps.read = async () => fail(1503, 'no permission');
  expect(await translateLasso(deps)).toEqual({
    ok: false,
    text: 'no permission',
  });
  expect(insert).not.toHaveBeenCalled();
});

test('a refused insert says the translation could not be inserted', async () => {
  const {deps} = run('casa', withPairs({'es-pt': true}), () =>
    answer(['hogar']),
  );
  deps.insert = async () => ok(false);
  expect(await translateLasso(deps)).toEqual({
    ok: false,
    text: copy['translation.insert'],
  });
});

test('the «Insert translation» switch registers its button and asks for Internet and file read', async () => {
  resetButtonsForTests();
  const deps = {
    register: jest.fn(async () => ok(true as const)),
    unregister: jest.fn(async () => ok(true as const)),
    hasPermission: jest.fn(async () => ok(false)),
    requestPermission: jest.fn(async (_permission: string, _reason?: string) =>
      ok(2),
    ),
    log: () => {},
  } satisfies ButtonDeps;
  await settingsChanged(
    {
      ...defaultSettings,
      illustration: false,
      photo: false,
      choose: false,
      translation: true,
    },
    deps,
  );
  expect(deps.register).toHaveBeenCalledWith(
    2,
    ['NOTE'],
    expect.objectContaining({
      id: TRANSLATE_BUTTON_ID,
      name: 'Insert translation',
    }),
  );
  expect(deps.requestPermission.mock.calls.map(call => call[1])).toEqual([
    copy['permission.translate'],
    copy['permission.files'],
  ]);
});
