/** «Translate ES→PT» and its siblings in Lookup (#174): one button and one direction per press. */
import {
  Direction,
  LassoPlace,
  LookupResult,
  PinyinIndex,
  TranslationQuery,
} from '@ink-tools/ink-core';
import {fail, ok} from '@ink-tools/sn-adapter/official';
import {
  ButtonDeps,
  resetButtonsForTests,
  settingsChanged,
} from '../src/buttons';
import {copy} from '../src/copy';
import {CHOOSE_BUTTON_ID, TRANSLATIONS} from '../src/modes';
import {defaultSettings} from '../src/settings';
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

const ES_PT: Direction = {from: 'es', to: 'pt'};
const PT_ES: Direction = {from: 'pt', to: 'es'};
const ZH_PT: Direction = {from: 'zh', to: 'pt'};

function run(query: string, lookup: (q: TranslationQuery) => LookupResult) {
  const asked: TranslationQuery[] = [];
  const insert = jest.fn(async () => ok(true));
  const deps: TranslateDeps = {
    read: async () => ok({query, place}),
    translate: async q => {
      asked.push(q);
      return lookup(q);
    },
    pinyin: () => INDEX,
    insert,
    log: () => {},
    fail: jest.fn(),
  };
  return {deps, asked, insert};
}

test('a press asks only its own direction and inserts its one line below the word', async () => {
  const {deps, asked, insert} = run('casa', q =>
    answer([q.to === 'pt' ? 'casa' : 'hogar']),
  );
  const result = await translateLasso(PT_ES, deps);
  expect(asked.map(q => `${q.from}-${q.to}`)).toEqual(['pt-es']);
  expect(result).toEqual({ok: true, text: 'PT→ES casa → hogar (Wiktionary)'});
  const box = (insert.mock.calls[0] as unknown[])[0] as {
    rect: {top: number};
  };
  expect(box.rect.top).toBeGreaterThanOrEqual(place.rect.bottom);
});

test('the lookup fails: «could not be reached», never «no translation»', async () => {
  const {deps} = run('casa', () => answer([], ['wiktionary: HTTP 503']));
  expect(await translateLasso(ES_PT, deps)).toEqual({
    ok: false,
    text: copy['translation.failed']('casa'),
  });
});

test('no lookup knows the word and none failed: «no translation found»', async () => {
  const {deps} = run('xyzzy', () => answer([]));
  expect((await translateLasso(ES_PT, deps)).text).toBe(
    copy['translation.none']('xyzzy'),
  );
});

test('ZH pinyin is read to characters on the ZH→PT direction', async () => {
  const {deps} = run('pingguo', q =>
    q.word === '苹果' && q.from === 'zh' ? answer(['maçã']) : answer([]),
  );
  expect((await translateLasso(ZH_PT, deps)).text).toBe(
    'ZH→PT 苹果 (ping2guo3) → maçã (Wiktionary)',
  );
});

test('a failed lasso read inserts nothing', async () => {
  const {deps, insert} = run('casa', () => answer([]));
  deps.read = async () => fail(1503, 'no permission');
  expect(await translateLasso(ES_PT, deps)).toEqual({
    ok: false,
    text: 'no permission',
  });
  expect(insert).not.toHaveBeenCalled();
});

test('a refused insert says the translation could not be inserted', async () => {
  const {deps} = run('casa', () => answer(['hogar']));
  deps.insert = async () => ok(false);
  expect(await translateLasso(ES_PT, deps)).toEqual({
    ok: false,
    text: copy['translation.insert'],
  });
});

test('one button per direction, named after it, with fixed ids after Choose Image', () => {
  expect(TRANSLATIONS.map(t => [t.key, t.buttonId, t.name])).toEqual([
    ['es-ES>pt-BR', CHOOSE_BUTTON_ID + 1, 'Translate ES→PT'],
    ['pt-BR>es-ES', CHOOSE_BUTTON_ID + 2, 'Translate PT→ES'],
    ['zh-CN>pt-BR', CHOOSE_BUTTON_ID + 3, 'Translate ZH→PT'],
    ['pt-BR>zh-CN', CHOOSE_BUTTON_ID + 4, 'Translate PT→ZH'],
  ]);
});

test('the default directions register their buttons, PT→ES stays off, and Internet and file read are asked', async () => {
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
      summary: false,
    },
    deps,
  );
  const names = deps.register.mock.calls.map(
    call => (call as unknown as [number, string[], {name: string}])[2].name,
  );
  expect(names).toEqual([
    'Translate ES→PT',
    'Translate ZH→PT',
    'Translate PT→ZH',
  ]);
  expect(deps.requestPermission.mock.calls.map(call => call[1])).toEqual([
    copy['permission.translate'],
    copy['permission.files'],
  ]);
});
