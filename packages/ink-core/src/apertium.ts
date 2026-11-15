/**
 * Apertium as a `DictionaryProvider` that translates (D29 B on #46, #127): the fallback for PT<->ES
 * when Wiktionary has no line (`aprovechar` gives `aproveitar`). Keyless, through APy's public
 * instance. The contract is read from APy's own handler (apertium/apertium-apy,
 * `apertium_apy/handlers/translate.py`): `GET /translate?langpair=spa|por&q=...` answers
 * `{"responseData": {"translatedText": ...}, "responseStatus": 200}`, and with `markUnknown=yes`
 * a word the pair does not know comes back as `*word`.
 *
 * shortcut: the tests use answers of that shape, not recorded ones, because the cloud proxy refuses
 * apertium.org; record one on the Mac when the lasso flow lands (#128).
 */
import type {
  DictionaryProvider,
  LanguageCode,
  Translation,
  TranslationQuery,
} from './dictionary';
import type {FetchText} from './wiktionary';

export const APY_URL = 'https://apertium.org/apy/translate';

/** APy names languages by ISO 639-3; only the pairs Apertium has for the engine's languages. */
const APY_CODES: Partial<Record<LanguageCode, string>> = {es: 'spa', pt: 'por'};

/** The request for a pair Apertium has, or null for one it has not (Chinese). */
export function translateUrl({word, from, to}: TranslationQuery): string | null {
  const a = APY_CODES[from];
  const b = APY_CODES[to];
  if (a === undefined || b === undefined) return null;
  return `${APY_URL}?langpair=${a}%7C${b}&markUnknown=yes&q=${encodeURIComponent(word)}`;
}

/**
 * The translation in an answer body. An unknown word (marked `*`) is an empty list, never the word
 * given back as its own translation; a cognate the pair knows (`café`) is kept. Any other shape
 * throws.
 */
export function readTranslateAnswer(body: string): Translation[] {
  let answer: unknown;
  try {
    answer = JSON.parse(body);
  } catch {
    throw new Error('apertium: the answer is not JSON');
  }
  const fields = (answer ?? {}) as {
    responseData?: {translatedText?: unknown};
    responseStatus?: unknown;
  };
  const text = fields.responseData?.translatedText;
  if (fields.responseStatus !== 200 || typeof text !== 'string') {
    throw new Error(`apertium: unexpected answer (status ${String(fields.responseStatus)})`);
  }
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.includes('*')) {
    return [];
  }
  return [{text: trimmed}];
}

/** The provider; it only translates, so it has no `define`. */
export function apertiumTranslator(fetchText: FetchText): DictionaryProvider {
  return {
    id: 'apertium',
    async translate(query: TranslationQuery): Promise<Translation[]> {
      const url = translateUrl(query);
      if (url === null) return [];
      return readTranslateAnswer(await fetchText(url));
    },
  };
}
