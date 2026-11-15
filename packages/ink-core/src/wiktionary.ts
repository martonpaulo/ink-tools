/**
 * Wiktionary as a `DictionaryProvider` that defines (#115): the word's page on its own language's
 * Wiktionary, read through the MediaWiki Action API (`action=parse&prop=wikitext`, keyless), and
 * only the definition lines of that language's section kept. The source the owner chose for the
 * shared engine (D29 B on #46).
 *
 * The page layout is a community convention, not an API, so the parse fails closed: a page with no
 * definition line for the language is an empty list, never a guess. The layouts follow each
 * Wiktionary's style guide (pt «Wikcionário:Livro de estilo», es «Wikcionario:Estructura");
 * shortcut: the fixtures are cut from those guides, because the cloud proxy refuses
 * `*.wiktionary.org`; replace them with recorded pages on the Mac (#115 Tasks).
 */
import type {Definition, DefinitionQuery, DictionaryProvider, LanguageCode} from './dictionary';

/** GETs a text body, or throws with a sentence; the plugin passes its own fetcher here. */
export type FetchText = (url: string) => Promise<string>;

/** The most senses one definition gives: a text box under a word, not a dictionary page. */
export const MAX_SENSES = 3;

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

/** One sense line's text: pt `# text`, es `;1 {{csem|…}}: text`; null for any other line. */
function senseText(line: string, language: LanguageCode): string | null {
  if (language === 'es') {
    const es = /^;\s*\d+[^:]*:(.*)$/.exec(line);
    return es ? es[1] : null;
  }
  const pt = /^#(?![:*#])\s*(.*)$/.exec(line);
  return pt ? pt[1] : null;
}

/** The definitions of one page's section for `language`, at most `MAX_SENSES`, in page order. */
export function parseDefinitions(wikitext: string, language: LanguageCode): Definition[] {
  const section = languageSection(wikitext, language);
  if (section === null) return [];
  const definitions: Definition[] = [];
  let speech: string | null = null;
  for (const raw of section.split('\n')) {
    const line = raw.trim();
    const heading = partOfSpeech(line);
    if (heading !== null) {
      speech = heading;
      continue;
    }
    const sense = senseText(line, language);
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

/**
 * The provider. It defines `pt` and `es`; translation is #46's and throws until then. A
 * handwritten capital («Maçã») is tried again in lower case when the page is missing.
 */
export function wiktionaryDefiner(fetchText: FetchText): DictionaryProvider {
  const page = async (word: string, language: LanguageCode): Promise<string | null> =>
    readParseAnswer(await fetchText(parseUrl(word, language)));
  return {
    id: 'wiktionary',
    // Not an empty list: that would say every word is unknown (#46 builds translation).
    async translate() {
      throw new Error('wiktionary: translation is not built yet');
    },
    async define({word, language}: DefinitionQuery): Promise<Definition[]> {
      if (!DEFINED_LANGUAGES.includes(language)) return [];
      let wikitext = await page(word, language);
      const lower = word.toLocaleLowerCase(language);
      if (wikitext === null && lower !== word) {
        wikitext = await page(lower, language);
      }
      return wikitext === null ? [] : parseDefinitions(wikitext, language);
    },
  };
}
