/**
 * Apertium translator (#127). The answers follow APy's handler shape (apertium_apy/handlers/
 * translate.py), not recorded ones: the cloud proxy refuses apertium.org.
 */
import {apertiumTranslator, readTranslateAnswer, translateUrl} from '../src/apertium';
import {translateFirst} from '../src/dictionary';

const answer = (translatedText: unknown, responseStatus: unknown = 200) =>
  JSON.stringify({responseData: {translatedText}, responseDetails: null, responseStatus});

test('asks APy with ISO 639-3 codes, the word encoded and unknown words marked', () => {
  expect(translateUrl({word: 'de nada', from: 'es', to: 'pt'})).toBe(
    'https://apertium.org/apy/translate?langpair=spa%7Cpor&markUnknown=yes&q=de%20nada',
  );
  expect(translateUrl({word: 'café', from: 'pt', to: 'es'})).toContain(
    'langpair=por%7Cspa&markUnknown=yes&q=caf%C3%A9',
  );
});

test('a pair Apertium has not (Chinese) is no request and no answer', async () => {
  expect(translateUrl({word: '苹果', from: 'zh', to: 'pt'})).toBeNull();
  const fetchText = jest.fn();
  await expect(apertiumTranslator(fetchText).translate({word: '苹果', from: 'zh', to: 'pt'})).resolves.toEqual([]);
  expect(fetchText).not.toHaveBeenCalled();
});

test('reads the translation, keeps a cognate and drops a word marked unknown', () => {
  expect(readTranslateAnswer(answer('aproveitar'))).toEqual([{text: 'aproveitar'}]);
  expect(readTranslateAnswer(answer('café'))).toEqual([{text: 'café'}]);
  expect(readTranslateAnswer(answer('*xyzzy'))).toEqual([]);
  expect(readTranslateAnswer(answer('  '))).toEqual([]);
});

test('an answer of another shape throws, never an empty list', () => {
  expect(() => readTranslateAnswer('<html>')).toThrow('not JSON');
  expect(() => readTranslateAnswer(answer('x', 400))).toThrow('status 400');
  expect(() => readTranslateAnswer(JSON.stringify({}))).toThrow('unexpected answer');
});

test('translateFirst falls back to Apertium after a provider that does not know the word', async () => {
  const none = {id: 'wiktionary', translate: async () => []};
  const apertium = apertiumTranslator(async () => answer('aproveitar'));
  await expect(
    translateFirst([none, apertium], {word: 'aprovechar', from: 'es', to: 'pt'}),
  ).resolves.toEqual({translations: [{text: 'aproveitar'}], providerId: 'apertium', errors: []});
});

test('a failed read is recorded by translateFirst, not hidden', async () => {
  const apertium = apertiumTranslator(async () => {
    throw new Error('HTTP 503');
  });
  const result = await translateFirst([apertium], {word: 'hola', from: 'es', to: 'pt'});
  expect(result.translations).toEqual([]);
  expect(result.errors).toEqual(['apertium: HTTP 503']);
});
