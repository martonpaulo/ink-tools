/**
 * Wiktionary as a `DictionaryProvider` that defines (#115) and translates (#127): the word's page on its own language's
 * Wiktionary, read through the MediaWiki Action API (`action=parse&prop=wikitext`, keyless), and
 * only the definition or translation-table lines of that language's section kept. The source the owner chose for the
 * shared engine (D29 B on #46).
 *
 * The page layout is a community convention, not an API, so the parse fails closed: a page with no
 * definition line for the language is an empty list, never a guess. The layouts follow each
 * Wiktionary's style guide (pt «Wikcionário:Livro de estilo», es «Wikcionario:Estructura");
 * Some fixtures are cut from those guides, because the cloud proxy refuses `*.wiktionary.org`;
 * the `-recorded` ones are real pt, es and zh pages, recorded on the Mac (#115, #127).
 */
import type {
  Definition,
  DefinitionQuery,
  DictionaryProvider,
  LanguageCode,
  Translation,
  TranslationQuery,
} from './dictionary';

/** GETs a text body, or throws with a sentence; the plugin passes its own fetcher here. */
export type FetchText = (url: string) => Promise<string>;

/** The most senses one definition gives: a text box under a word, not a dictionary page. */
export const MAX_SENSES = 3;

/** The most translations one answer gives, for the same reason. */
export const MAX_TRANSLATIONS = 3;

/** The languages whose Wiktionary layout this parse reads. */
export const DEFINED_LANGUAGES: readonly LanguageCode[] = ['pt', 'es'];

export function parseUrl(word: string, language: LanguageCode): string {
  const params = [
    'action=parse',
    `page=${encodeURIComponent(word)}`,
    'prop=wikitext',
    'redirects=1',
    'format=json',
    'formatversion=2',
  ].join('&');
  return `https://${language}.wiktionary.org/w/api.php?${params}`;
}

/** Templates whose text is the word they link, kept as their last plain argument. */
const LINK_TEMPLATES = new Set(['l', 'l+', 'plm', 'link', 'vínculo']);

/** Wikitext markup to plain text: links to their label, link templates to their word, the rest out. */
export function plainText(wikitext: string): string {
  let text = wikitext.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  // Innermost templates first, so a template inside another goes before its parent.
  let previous = '';
  while (previous !== text) {
    previous = text;
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_, body: string) => {
      const parts = body.split('|').map(part => part.trim());
      const name = parts[0].toLowerCase();
      if (!LINK_TEMPLATES.has(name)) return '';
      const words = parts.slice(1).filter(part => part !== '' && !part.includes('='));
      return words.length > 0 ? words[words.length - 1] : '';
    });
  }
  return text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

/** The section of the page for `language`, from its heading to the next language's heading. */
function languageSection(wikitext: string, language: LanguageCode): string | null {
  const lines = wikitext.split('\n');
  // pt: `={{-pt-}}=`; es: `== {{lengua|es}} ==`.
  const heading = (line: string): string | null => {
    const pt = /^=\s*\{\{-([a-z]{2,3})-\}\}\s*=\s*$/.exec(line);
    if (pt) return pt[1];
    const es = /^==\s*\{\{lengua\|([a-z]{2,3})\}\}\s*==\s*$/.exec(line);
    return es ? es[1] : null;
  };
  const start = lines.findIndex(line => heading(line.trim()) === language);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => heading(line.trim()) !== null);
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** A part-of-speech heading's name: `==Substantivo==` or `==== {{sustantivo femenino|es}} ====`. */
function partOfSpeech(line: string): string | null {
  const match = /^(={2,6})\s*(.*?)\s*\1$/.exec(line);
  if (!match) return null;
  const template = /^\{\{([^|}]+)/.exec(match[2]);
  return (template ? template[1] : plainText(match[2])).trim() || null;
}

/**
 * Part-of-speech headings, by the start of their name: a sense line counts only under one of
 * these. Every other heading (pt `Anagrama`, `Tradução`, `Etimologia`; es `Etimología`,
 * `Traducciones`) holds `#` or `;1` lines that are not senses: the recorded pt.wiktionary page of
 * «maçã» lists the anagram «cama» as `# [[cama]]` (#115, device round 2026-11-16). Unknown
 * headings are left out, so the parse fails closed.
 */
const SPEECH_HEADINGS =
  /^(substantivo|adjetivo|verbo|adv[ée]rbio|pronome|artigo|numeral|preposição|conjunção|interjeição|locução|forma(?= |$)|contração|sigla|abreviatura|prefixo|sufixo|sustantivo|pronombre|artículo|preposición|conjunción|interjección|locución|contracción|prefijo|sufijo|onomatopeya)/i;

/** One sense line's text: pt `# text`, es `;1 {{csem|…}}: text`; null for any other line. */
function senseText(line: string, layout: LanguageCode): string | null {
  if (layout === 'es') {
    const es = /^;\s*\d+[^:]*:(.*)$/.exec(line);
    return es ? es[1] : null;
  }
  const pt = /^#(?![:*#])\s*(.*)$/.exec(line);
  return pt ? pt[1] : null;
}

/**
 * The definitions of one page's section for `language`, at most `MAX_SENSES`, in page order.
 * `layout` is the Wiktionary the page comes from, when it is not `language`'s own.
 */
export function parseDefinitions(
  wikitext: string,
  language: LanguageCode,
  layout: LanguageCode = language,
): Definition[] {
  const section = languageSection(wikitext, language);
  if (section === null) return [];
  const definitions: Definition[] = [];
  let speech: string | null = null;
  for (const raw of section.split('\n')) {
    const line = raw.trim();
    const heading = partOfSpeech(line);
    if (heading !== null) {
      speech = SPEECH_HEADINGS.test(heading) ? heading : null;
      continue;
    }
    if (speech === null) continue;
    const sense = senseText(line, layout);
    const text = sense === null ? '' : plainText(sense);
    if (text === '') continue;
    definitions.push(speech ? {text, partOfSpeech: speech} : {text});
    if (definitions.length === MAX_SENSES) break;
  }
  return definitions;
}

/** The page's wikitext, or null when the page does not exist; any other answer throws. */
export function readParseAnswer(body: string): string | null {
  let answer: unknown;
  try {
    answer = JSON.parse(body);
  } catch {
    throw new Error('wiktionary: the answer is not JSON');
  }
  const fields = (answer ?? {}) as {
    parse?: {wikitext?: unknown};
    error?: {code?: unknown; info?: unknown};
  };
  if (fields.error) {
    if (fields.error.code === 'missingtitle') return null;
    throw new Error(`wiktionary: ${String(fields.error.code)} ${String(fields.error.info ?? '')}`.trim());
  }
  if (typeof fields.parse?.wikitext !== 'string') {
    throw new Error('wiktionary: the answer has no wikitext');
  }
  return fields.parse.wikitext;
}

/** A reading in brackets, such as pinyin: Latin letters with their tone marks. */
const READING = /[(（]\s*([\p{Script=Latin}\s'’]+)\s*[)）]/u;

/** One translation's text: `[[maçã]]` or `苹果 (píngguǒ)`, its reading split out. */
function translationOf(
  raw: string,
  sense: string | null,
  after?: string,
): Translation | null {
  const text = plainText(raw);
  if (text === '') return null;
  // A reading in brackets after the word, such as pinyin: Latin letters with their tone marks.
  const reading = new RegExp(`^(.*?)\\s*${READING.source}$`, 'u').exec(text);
  const translation: Translation = reading
    ? {text: reading[1].trim(), reading: reading[2].trim()}
    : after
      ? {text, reading: after}
      : {text};
  if (translation.text === '') return null;
  return sense ? {...translation, sense} : translation;
}

/** One word of a translation template, with the reading the template itself gives, if any. */
interface TemplateWord {
  word: string;
  reading?: string;
}

/**
 * The `to` translations of one template line: pt `{{trad|es|[[manzana]], [[poma]]}}` or
 * `{{t|zh|芒果||mángguǒ}}`, es `{{t|pt|a1=1|t1=maçã}}` or `{{t+|pt|1|maçã}}`. A template for another
 * language is null.
 */
function templateTranslations(name: string, args: string[], to: LanguageCode): TemplateWord[] | null {
  if (args[0] !== to) return null;
  const rest = args.slice(1);
  // Each argument is a word, and one argument may list several: the recorded pt «maçã» has
  // `{{trad|zh|苹果|林檎}}`, which gave the one word «苹果|林檎» (#127).
  if (name === 'trad') return rest.join(',').split(/[,;]/).map(word => ({word}));
  const numbered = rest.filter(arg => /^t\d+\s*=/.test(arg)).map(arg => arg.replace(/^t\d+\s*=/, ''));
  if (numbered.length > 0) return numbered.map(word => ({word}));
  // pt `t`: the word, its gender, then its transliteration; the recorded pt «manga» has
  // `{{t|zh|芒果||mángguǒ}}` and `{{t|de|Mango|f}}`, which gave «mángguǒ» and «f» as words (#127).
  if (name === 't') {
    const positional = rest.filter(arg => !arg.includes('='));
    if (positional.length === 0) return [];
    const reading = positional[2]?.trim();
    return [reading ? {word: positional[0], reading} : {word: positional[0]}];
  }
  // `t+`: a sense number, then the words; a named argument is not a word.
  return rest.filter(arg => !arg.includes('=') && !/^[\d,\s]+$/.test(arg)).map(word => ({word}));
}

/** A table's opening template, whose first argument names the sense: pt `tradini`, es `trad-arriba`. */
const TABLE_START = /^\{\{\s*(?:tradini|trad-arriba)\s*(?:\|([^{}]*))?\}\}/;

/** The translations into `to` in the translation tables of the page's section for `from`. */
export function parseTranslations(
  wikitext: string,
  from: LanguageCode,
  to: LanguageCode,
): Translation[] {
  const section = languageSection(wikitext, from);
  if (section === null) return [];
  const translations: Translation[] = [];
  let sense: string | null = null;
  for (const raw of section.split('\n')) {
    const line = raw.trim();
    const table = TABLE_START.exec(line);
    if (table) {
      sense = table[1] ? plainText(table[1]) || null : null;
      continue;
    }
    // Translation templates: pt `trad`, es `t` and `t+`; a link inside keeps its brackets.
    for (const match of line.matchAll(/\{\{\s*(trad|t\+?)\s*\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/g)) {
      const name = match[1];
      const args = match[2].split(/\|(?![^[]*\]\])/).map(arg => arg.trim());
      // pt writes the readings after the template, in the words' order: `{{trad|zh|苹果|林檎}}
      // (píngguǒ), (línqín)` (#127).
      const end = (match.index ?? 0) + match[0].length;
      const tail = line.slice(end).split('{{')[0];
      const readings = [...tail.matchAll(new RegExp(READING.source, 'gu'))].map(r => r[1].trim());
      const words = templateTranslations(name, args, to) ?? [];
      for (const [i, {word, reading}] of words.entries()) {
        const translation = translationOf(word, sense, reading ?? readings[i]);
        if (translation === null) continue;
        if (translations.some(known => known.text === translation.text)) continue;
        translations.push(translation);
        if (translations.length === MAX_TRANSLATIONS) return translations;
      }
    }
  }
  return translations;
}

/**
 * The provider. It defines `pt` and `es`, and translates a `pt` or `es` word from its page's
 * translation tables. A Chinese word has no table this parse reads: it is translated from its
 * section on the target language's page, whose senses are written in that language. A handwritten
 * capital («Maçã») is tried again in lower case when the page is missing.
 */
export function wiktionaryDefiner(fetchText: FetchText): DictionaryProvider {
  const page = async (word: string, language: LanguageCode): Promise<string | null> => {
    const wikitext = readParseAnswer(await fetchText(parseUrl(word, language)));
    const lower = word.toLocaleLowerCase(language);
    if (wikitext !== null || lower === word) return wikitext;
    return readParseAnswer(await fetchText(parseUrl(lower, language)));
  };
  return {
    id: 'wiktionary',
    async translate({word, from, to}: TranslationQuery): Promise<Translation[]> {
      if (DEFINED_LANGUAGES.includes(from)) {
        const wikitext = await page(word, from);
        return wikitext === null ? [] : parseTranslations(wikitext, from, to);
      }
      if (!DEFINED_LANGUAGES.includes(to)) return [];
      const wikitext = await page(word, to);
      if (wikitext === null) return [];
      return parseDefinitions(wikitext, from, to)
        .slice(0, MAX_TRANSLATIONS)
        .map(({text}) => ({text}));
    },
    async define({word, language}: DefinitionQuery): Promise<Definition[]> {
      if (!DEFINED_LANGUAGES.includes(language)) return [];
      const wikitext = await page(word, language);
      return wikitext === null ? [] : parseDefinitions(wikitext, language);
    },
  };
}
