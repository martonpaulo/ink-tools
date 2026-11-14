import {checkQuery, DictionaryProvider, Translation, translateFirst} from '../src/dictionary';

const provider = (id: string, answer: Translation[] | Error): DictionaryProvider & {calls: number} => {
  const p = {
    id,
    calls: 0,
    async translate() {
      p.calls += 1;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return p;
};

const query = {word: ' manzana ', from: 'es', to: 'pt'} as const;

test('the query is trimmed, and an empty word, unknown language or same language is refused', () => {
  expect(checkQuery(query).word).toBe('manzana');
  expect(() => checkQuery({...query, word: '  '})).toThrow(/empty/);
  expect(() => checkQuery({...query, to: 'en' as never})).toThrow(/unknown language/);
  expect(() => checkQuery({...query, to: 'es'})).toThrow(/to itself/);
});

test('the first provider that knows the word answers; later ones are not asked', async () => {
  const offline = provider('offline', []);
  const online = provider('online', [{text: 'maçã'}]);
  const spare = provider('spare', [{text: 'other'}]);
  const result = await translateFirst([offline, online, spare], query);
  expect(result).toEqual({translations: [{text: 'maçã'}], providerId: 'online', errors: []});
  expect(spare.calls).toBe(0);
});

test('a failing provider is recorded and the next one is asked', async () => {
  const result = await translateFirst(
    [provider('offline', new Error('word list missing')), provider('online', [{text: 'maçã'}])],
    query,
  );
  expect(result.providerId).toBe('online');
  expect(result.errors).toEqual(['offline: word list missing']);
});

test('no provider has the word: an empty answer, with every failure kept', async () => {
  expect(await translateFirst([provider('offline', [])], query)).toEqual({
    translations: [],
    providerId: null,
    errors: [],
  });
  const failed = await translateFirst([provider('online', new Error('HTTP 503'))], query);
  expect(failed).toEqual({translations: [], providerId: null, errors: ['online: HTTP 503']});
});
