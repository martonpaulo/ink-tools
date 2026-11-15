/** A direction button's press: recognize, read a ZH input, translate, insert beside (#128, #129). */
import {
  LookupResult,
  PinyinIndex,
  TranslationQuery,
} from '@supernote-tools/ink-core';
import {ok} from '@supernote-tools/sn-adapter/official';
import {TranslateDeps, translateLasso} from '../src/translate';

const place = {
  rect: {left: 100, top: 100, right: 300, bottom: 160},
  page: 0,
  pageSize: {width: 1404, height: 1872},
};

/** A two-word index in CC-CEDICT's shape: 苹果 is the best `pingguo`. */
const INDEX = new PinyinIndex({
  entries: ['pingguo 苹果ping2guo3 平锅ping2guo1'],
});

const answer = (
  translations: LookupResult['translations'],
  errors: string[] = [],
): LookupResult => ({
  translations,
  providerId: translations.length ? 'wiktionary' : null,
  errors,
});

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
  };
  return {deps, asked, insert};
}

test('a word is translated and inserted beside the lasso with its source', async () => {
  const {deps, asked, insert} = run('aprovechar', () =>
    answer([{text: 'aproveitar'}]),
  );
  const result = await translateLasso({from: 'es', to: 'pt'}, deps);
  expect(result).toEqual({
    ok: true,
    text: 'aprovechar → aproveitar (Wiktionary)',
  });
  expect(asked).toEqual([{from: 'es', to: 'pt', word: 'aprovechar'}]);
  const box = (insert.mock.calls[0] as unknown[])[0] as {rect: {left: number}};
  expect(box.rect.left).toBeGreaterThan(place.rect.right);
});

test('ZH characters go straight to translation', async () => {
  const {deps, asked} = run('苹果', () => answer([{text: 'maçã'}]));
  const result = await translateLasso({from: 'zh', to: 'pt'}, deps);
  expect(asked.map(q => q.word)).toEqual(['苹果']);
  expect(result.text).toBe('苹果 → maçã (Wiktionary)');
});

test('ZH pinyin, with or without tones, is looked up to characters first', async () => {
  for (const spelling of ['pingguo', 'píngguǒ', 'ping2guo3']) {
    const {deps, asked} = run(spelling, q =>
      answer(q.word === '苹果' ? [{text: 'maçã'}] : []),
    );
    const result = await translateLasso({from: 'zh', to: 'pt'}, deps);
    expect(asked[0].word).toBe('苹果');
    expect(result).toEqual({
      ok: true,
      text: '苹果 (ping2guo3) → maçã (Wiktionary)',
    });
  }
});

test('the next pinyin candidate is asked when the first has no translation', async () => {
  const {deps, asked} = run('pingguo', q =>
    answer(q.word === '平锅' ? [{text: 'frigideira'}] : []),
  );
  const result = await translateLasso({from: 'zh', to: 'pt'}, deps);
  expect(asked.map(q => q.word)).toEqual(['苹果', '平锅']);
  expect(result.text).toBe('平锅 (ping2guo1) → frigideira (Wiktionary)');
});

test('a word with no translation says so on the note, never a guess', async () => {
  const {deps, insert} = run('xyzzy', () => answer([]));
  const result = await translateLasso({from: 'es', to: 'pt'}, deps);
  expect(result).toEqual({
    ok: false,
    text: 'xyzzy: no ES→PT translation found',
  });
  expect(insert).toHaveBeenCalledTimes(1);
});

test('unreadable ZH input asks nothing and says there is no translation', async () => {
  const {deps, asked} = run('qqq!', () => answer([{text: 'never'}]));
  const result = await translateLasso({from: 'zh', to: 'pt'}, deps);
  expect(asked).toEqual([]);
  expect(result.text).toBe('qqq!: no ZH→PT translation found');
});

test('a failed lookup says the dictionaries could not be reached', async () => {
  const {deps} = run('casa', () => answer([], ['wiktionary: HTTP 503']));
  const result = await translateLasso({from: 'es', to: 'pt'}, deps);
  expect(result.text).toBe('casa: the dictionaries could not be reached');
});

test('a failed lasso read inserts nothing', async () => {
  const {deps, insert} = run('casa', () => answer([{text: 'casa'}]));
  deps.read = async () => ({
    ok: false,
    code: -4,
    message: 'the lasso holds no handwriting',
  });
  const result = await translateLasso({from: 'es', to: 'pt'}, deps);
  expect(result.ok).toBe(false);
  expect(insert).not.toHaveBeenCalled();
});
