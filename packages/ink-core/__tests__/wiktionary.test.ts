/**
 * Most fixtures are cut from each Wiktionary's style guide (the cloud proxy refuses
 * `*.wiktionary.org`). The `-recorded` ones are real `action=parse` answers recorded on the Mac on
 * 2026-11-16: pt «maçã» revision 3188657, es «manzana» revision 6383798 and pt «苹果» revision
 * 3019617, the page a Chinese word is translated from (CC BY-SA 4.0, see packages/ink-core/NOTICE.md).
 * pt «manga» revision 3238687 and es «aprovechar» revision 6427832 were recorded on 2026-11-17 from
 * `index.php?action=raw` and wrapped in the `action=parse` shape, as NOTICE.md says (#127).
 */
import ptPage from './fixtures/wiktionary-pt.json';
import ptRecorded from './fixtures/wiktionary-pt-recorded.json';
import esRecorded from './fixtures/wiktionary-es-recorded.json';
import esPage from './fixtures/wiktionary-es.json';
import missingPage from './fixtures/wiktionary-missing.json';
import zhPage from './fixtures/wiktionary-zh.json';
import zhRecorded from './fixtures/wiktionary-zh-recorded.json';
import mangaRecorded from './fixtures/wiktionary-pt-manga-recorded.json';
import aprovecharRecorded from './fixtures/wiktionary-es-aprovechar-recorded.json';
import {
  MAX_SENSES,
  MAX_TRANSLATIONS,
  parseDefinitions,
  parseTranslations,
  parseUrl,
  plainText,
  readParseAnswer,
  wiktionaryDefiner,
} from '../src/wiktionary';
import {apertiumTranslator} from '../src/apertium';
import {defineFirst, translateFirst} from '../src/dictionary';

const FIXTURES: Record<string, unknown> = {
  'wiktionary-pt.json': ptPage,
  'wiktionary-es.json': esPage,
  'wiktionary-missing.json': missingPage,
  'wiktionary-zh.json': zhPage,
  'wiktionary-pt-recorded.json': ptRecorded,
  'wiktionary-es-recorded.json': esRecorded,
  'wiktionary-zh-recorded.json': zhRecorded,
  'wiktionary-pt-manga-recorded.json': mangaRecorded,
  'wiktionary-es-aprovechar-recorded.json': aprovecharRecorded,
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

test('pt recorded: only part-of-speech senses, never the anagram list (#115)', () => {
  // The live page ends with `==Anagrama==` and `# [[cama]]`; dev.18 showed «2. cama».
  expect(parseDefinitions(wikitext('wiktionary-pt-recorded.json'), 'pt')).toEqual([
    {text: 'o fruto comestível da macieira', partOfSpeech: 'Substantivo'},
  ]);
});

test('es recorded: the three senses of the sustantivo femenino section', () => {
  const senses = parseDefinitions(wikitext('wiktionary-es-recorded.json'), 'es');
  expect(senses).toHaveLength(MAX_SENSES);
  expect(senses.every(sense => sense.partOfSpeech === 'sustantivo femenino')).toBe(true);
  expect(senses[0].text).toMatch(/^fruta comestible del manzano/);
  expect(senses[1].text).toMatch(/^Conjunto de construcciones/);
});

test('a sense line under a heading that is not a part of speech is left out', () => {
  const page = ['={{-pt-}}=', '==Substantivo==', '# fruto', '==Anagrama==', '# [[cama]]'].join('\n');
  expect(parseDefinitions(page, 'pt').map(sense => sense.text)).toEqual(['fruto']);
  expect(parseDefinitions(['={{-pt-}}=', '# sem título'].join('\n'), 'pt')).toEqual([]);
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

test('a failed read throws into the errors; zh is not defined', async () => {
  const definer = wiktionaryDefiner(async () => {
    throw new Error('HTTP 503');
  });
  const result = await defineFirst([definer], 'manzana', ['es', 'zh']);
  expect(result).toEqual({definitions: [], providerId: null, language: null, errors: ['wiktionary es: HTTP 503']});
  await expect(definer.translate({word: 'maçã', from: 'pt', to: 'es'})).rejects.toThrow(/HTTP 503/);
});

test('pt: the target language\'s table lines only, split, with the sense and the pinyin', () => {
  const text = wikitext('wiktionary-pt.json');
  expect(parseTranslations(text, 'pt', 'es')).toEqual([
    {text: 'manzana', sense: 'fruto'},
    {text: 'poma', sense: 'fruto'},
  ]);
  expect(parseTranslations(text, 'pt', 'zh')).toEqual([
    {text: '苹果', reading: 'píngguǒ', sense: 'fruto'},
  ]);
});

test('es: numbered `t` arguments are the words; another language\'s line is not', () => {
  expect(parseTranslations(wikitext('wiktionary-es.json'), 'es', 'pt')).toEqual([
    {text: 'maçã'},
    {text: 'quarteirão'},
  ]);
  expect(parseTranslations(wikitext('wiktionary-es.json'), 'es', 'zh')).toEqual([]);
});

test('no table, no section, or too many lines: empty or capped, never a guess', () => {
  expect(parseTranslations('={{-pt-}}=\n# sem tabela', 'pt', 'es')).toEqual([]);
  expect(parseTranslations(wikitext('wiktionary-pt.json'), 'es', 'pt')).toEqual([]);
  const many = '={{-pt-}}=\n{{tradini}}\n* {{trad|es|a, b, c, d, e}}\n{{tradfim}}';
  expect(parseTranslations(many, 'pt', 'es')).toHaveLength(MAX_TRANSLATIONS);
});

test('zh to pt: the Chinese section of the pt page, its senses as translations', async () => {
  const asked: string[] = [];
  const wiktionary = wiktionaryDefiner(async url => {
    asked.push(url);
    return fixture('wiktionary-zh.json');
  });
  const result = await translateFirst([wiktionary], {word: '苹果', from: 'zh', to: 'pt'});
  expect(result.translations).toEqual([{text: 'maçã'}, {text: 'macieira'}]);
  expect(asked).toEqual([parseUrl('苹果', 'pt')]);
});

test('Wiktionary first, Apertium only when it has no line; zh never asks Apertium', async () => {
  const asked: string[] = [];
  const fetchText = async (url: string) => {
    asked.push(url);
    if (url.includes('apertium')) {
      return '{"responseData":{"translatedText":"aproveitar"},"responseStatus":200}';
    }
    return fixture('wiktionary-missing.json');
  };
  const providers = [wiktionaryDefiner(fetchText), apertiumTranslator(fetchText)];
  const es = await translateFirst(providers, {word: 'aprovechar', from: 'es', to: 'pt'});
  expect(es).toMatchObject({providerId: 'apertium', errors: []});
  expect(es.translations[0].text).toBe('aproveitar');
  asked.length = 0;
  const zh = await translateFirst(providers, {word: '苹果', from: 'zh', to: 'pt'});
  expect(zh).toEqual({translations: [], providerId: null, errors: []});
  expect(asked.some(url => url.includes('apertium'))).toBe(false);
});

test('recorded pages: the pt, es and zh translation lines as the live Wiktionaries write them (#127)', async () => {
  // pt lists the Chinese words as arguments, with their readings after the template; they were
  // one word «苹果|林檎» before.
  expect(parseTranslations(wikitext('wiktionary-pt-recorded.json'), 'pt', 'zh')).toEqual([
    {text: '苹果', reading: 'píngguǒ'},
    {text: '林檎', reading: 'línqín'},
  ]);
  expect(parseTranslations(wikitext('wiktionary-pt-recorded.json'), 'pt', 'es')).toEqual([
    {text: 'manzana'},
  ]);
  expect(parseTranslations(wikitext('wiktionary-es-recorded.json'), 'es', 'pt')).toEqual([
    {text: 'maçã'},
  ]);
  expect(parseTranslations(wikitext('wiktionary-es-recorded.json'), 'es', 'zh')).toEqual([
    {text: '苹果'},
  ]);
  const wiktionary = wiktionaryDefiner(async () => fixture('wiktionary-zh-recorded.json'));
  const zh = await translateFirst([wiktionary], {word: '苹果', from: 'zh', to: 'pt'});
  expect(zh.translations).toEqual([{text: 'maçã'}]);
});

test('pt «manga» recorded: the first three noun senses, never the Galician or verb-form ones (#127)', () => {
  expect(parseDefinitions(wikitext('wiktionary-pt-manga-recorded.json'), 'pt')).toEqual([
    {
      text: 'fruto tropical, doce e comestível da mangueira (Mangifera indica)',
      partOfSpeech: 'Substantivo',
    },
    {text: 'peça de vestuário que cobre o braço', partOfSpeech: 'Substantivo'},
    {text: 'filtro para líquidos', partOfSpeech: 'Substantivo'},
  ]);
});

test('pt «manga» recorded: `{{t}}` keeps only its word, the transliteration as the reading (#127)', () => {
  const page = wikitext('wiktionary-pt-manga-recorded.json');
  // `{{t|zh|芒果||mángguǒ}}`: the fourth argument is the reading, never a second word.
  expect(parseTranslations(page, 'pt', 'zh')).toEqual([
    {text: '芒果', reading: 'mángguǒ', sense: 'De 1: fruto comestível'},
  ]);
  // The page writes `{{t|de|Mango|f}}`: the third argument is the gender, never a word.
  const gendered = ['={{-pt-}}=', '{{tradini|fruto}}', '* {{t|es|mango|m}}', '{{tradfim}}'].join('\n');
  expect(parseTranslations(gendered, 'pt', 'es')).toEqual([{text: 'mango', sense: 'fruto'}]);
  expect(parseTranslations(page, 'pt', 'es').map(t => t.text)).toEqual(['mango', 'manga', 'mangó']);
});

test('es «aprovechar» recorded: the `;1:` sense of a verb, and no Portuguese row gives no translation (#127)', () => {
  const page = wikitext('wiktionary-es-aprovechar-recorded.json');
  expect(parseDefinitions(page, 'es')).toEqual([
    {text: 'Tomar ventaja. No desperdiciar una oportunidad.', partOfSpeech: 'verbo transitivo'},
  ]);
  expect(parseTranslations(page, 'es', 'pt')).toEqual([]);
});
