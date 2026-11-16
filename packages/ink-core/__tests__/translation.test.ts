/** The shared translation flow of a lasso press (#128, #129, #158). */
import type {LookupResult, TranslationQuery} from '../src/dictionary';
import {PinyinIndex} from '../src/pinyin';
import {
  directionName,
  fetchTextWith,
  translateAll,
  translationText,
  wordsOf,
} from '../src/translation';

/** A two-word index in CC-CEDICT's shape: 苹果 is the best `pingguo`. */
const INDEX = new PinyinIndex({
  entries: ['pingguo 苹果ping2guo3 平锅ping2guo1'],
});
const pinyin = () => INDEX;

const answer = (texts: string[], errors: string[] = []): LookupResult => ({
  translations: texts.map(text => ({text})),
  providerId: texts.length ? 'wiktionary' : null,
  errors,
});

test('a direction reads as ES→PT', () => {
  expect(directionName({from: 'es', to: 'pt'})).toBe('ES→PT');
});

test('a ZH query in pinyin stands for its characters; another language for itself', () => {
  expect(wordsOf('pingguo', {from: 'zh', to: 'pt'}, pinyin)[0]).toEqual({
    word: '苹果',
    reading: 'ping2guo3',
  });
  expect(wordsOf('casa', {from: 'pt', to: 'es'}, pinyin)).toEqual([
    {word: 'casa'},
  ]);
});

test('every direction is asked, the outcomes in the order given', async () => {
  const asked: TranslationQuery[] = [];
  const outcomes = await translateAll(
    'casa',
    [
      {from: 'es', to: 'pt'},
      {from: 'pt', to: 'es'},
    ],
    async query => {
      asked.push(query);
      return query.from === 'pt' ? answer(['casa']) : answer([], ['down']);
    },
    pinyin,
  );
  expect(asked.map(q => q.from).sort()).toEqual(['es', 'pt']);
  expect(outcomes[0]).toEqual({direction: {from: 'es', to: 'pt'}, errors: ['down']});
  expect(outcomes[1]).toMatchObject({direction: {from: 'pt', to: 'es'}, word: {word: 'casa'}});
});

test('the line names the word, its reading, the translations and the source', () => {
  expect(
    translationText({word: '苹果', reading: 'ping2guo3'}, answer(['maçã', 'pomo']), {
      wiktionary: 'Wiktionary',
    }),
  ).toBe('苹果 (ping2guo3) → maçã; pomo (Wiktionary)');
});

test('the fetcher sends the User-Agent and throws on a status other than 2xx', async () => {
  const fetcher = jest.fn(async () => ({ok: false, status: 503, text: async () => ''}));
  const fetchText = fetchTextWith(fetcher as unknown as typeof fetch, 'Test/1');
  await expect(fetchText('https://example.org')).rejects.toThrow('HTTP 503');
  expect(fetcher).toHaveBeenCalledWith('https://example.org', {
    headers: {'User-Agent': 'Test/1'},
  });
});
