/**
 * The fixtures are cut from each Wiktionary's style guide, not recorded (the cloud proxy refuses
 * `*.wiktionary.org`); #115's Mac task replaces them with recorded pages.
 */
import ptPage from './fixtures/wiktionary-pt.json';
import esPage from './fixtures/wiktionary-es.json';
import missingPage from './fixtures/wiktionary-missing.json';
import {
  MAX_SENSES,
  parseDefinitions,
  parseUrl,
  plainText,
  readParseAnswer,
  wiktionaryDefiner,
} from '../src/wiktionary';
import {defineFirst} from '../src/dictionary';

const FIXTURES: Record<string, unknown> = {
  'wiktionary-pt.json': ptPage,
  'wiktionary-es.json': esPage,
  'wiktionary-missing.json': missingPage,
};
/** The answer body as the API sends it. */
const fixture = (name: string) => JSON.stringify(FIXTURES[name]);
const wikitext = (name: string) => readParseAnswer(fixture(name)) as string;

test('pt: the senses of the Portuguese section only, markup out, at most three', () => {
  const senses = parseDefinitions(wikitext('wiktionary-pt.json'), 'pt');
  expect(senses).toHaveLength(MAX_SENSES);
  expect(senses[0]).toEqual({
    text: 'fruto da macieira, de polpa firme',
    partOfSpeech: 'Substantivo',
  });
  expect(senses[1].text).toBe('parte saliente do rosto, abaixo dos olhos; maçã do rosto');
  expect(senses.map(sense => sense.text).join(' ')).not.toMatch(/lanche|exemplo|mazá|quarto/);
});

test('es: numbered senses with their field label dropped and link templates kept as words', () => {
  expect(parseDefinitions(wikitext('wiktionary-es.json'), 'es')).toEqual([
    {text: 'fruto del manzano, de forma redondeada.', partOfSpeech: 'sustantivo femenino'},
    {text: 'Espacio urbano limitado por calles.', partOfSpeech: 'sustantivo femenino'},
  ]);
});

test('a page with no section for the language is empty, never another language', () => {
  expect(parseDefinitions(wikitext('wiktionary-pt.json'), 'es')).toEqual([]);
  expect(parseDefinitions('no headings at all', 'pt')).toEqual([]);
});

test('the answer: a missing page is null; an error or a body without wikitext throws', () => {
  expect(readParseAnswer(fixture('wiktionary-missing.json'))).toBeNull();
  expect(() => readParseAnswer('<html>')).toThrow(/not JSON/);
  expect(() => readParseAnswer('{"error":{"code":"ratelimited","info":"slow down"}}')).toThrow(
    /ratelimited slow down/,
  );
  expect(() => readParseAnswer('{"parse":{}}')).toThrow(/no wikitext/);
});

test('markup: nested templates, piped links and bold go; the text stays', () => {
  expect(plainText("{{a|{{b}}}}'''[[casa|Casas]]''' e [[rua]]<br/>.")).toBe('Casas e rua.');
});

test('the provider asks the word, then its lower case when the page is missing', async () => {
  const asked: string[] = [];
  const definer = wiktionaryDefiner(async url => {
    asked.push(url);
    return url.includes(encodeURIComponent('Maçã'))
      ? fixture('wiktionary-missing.json')
      : fixture('wiktionary-pt.json');
  });
  const result = await defineFirst([definer], 'Maçã', ['pt']);
  expect(result.providerId).toBe('wiktionary');
  expect(result.definitions).toHaveLength(MAX_SENSES);
  expect(asked).toEqual([parseUrl('Maçã', 'pt'), parseUrl('maçã', 'pt')]);
  expect(asked[0]).toMatch(/^https:\/\/pt\.wiktionary\.org\/w\/api\.php\?action=parse&page=/);
});

test('a failed read throws into the errors; zh is not defined; translation is not claimed', async () => {
  const definer = wiktionaryDefiner(async () => {
    throw new Error('HTTP 503');
  });
  const result = await defineFirst([definer], 'manzana', ['es', 'zh']);
  expect(result).toEqual({definitions: [], providerId: null, language: null, errors: ['wiktionary es: HTTP 503']});
  await expect(definer.translate({word: 'maçã', from: 'pt', to: 'es'})).rejects.toThrow(/not built/);
});
