/**
 * The one place Lingo's dictionary chain is built (#128): feature code asks `translateFirst` over
 * these and never names a source. Wiktionary first, Apertium as the PT<->ES fallback (D29 B on #46,
 * #127); both keyless and online. The offline word list joins at the front once it exists.
 */
import {
  apertiumTranslator,
  DictionaryProvider,
  FetchText,
  wiktionaryDefiner,
} from '@supernote-tools/ink-core';
import {version} from '../package.json';

/** Wiktionary asks every client to name itself and a contact (its User-Agent policy). */
export const USER_AGENT = `Lingo/${version} (+https://github.com/martonpaulo/supernote-tools)`;

/** The credit a text box ends with, per provider id: Wiktionary's text is CC BY-SA. */
export const SOURCE_NAMES: Record<string, string> = {
  wiktionary: 'Wiktionary',
  apertium: 'Apertium',
};

/** GETs a body; a failed request or a status other than 2xx throws, never an empty body. */
export function fetchTextWith(fetcher: typeof fetch): FetchText {
  return async url => {
    const response = await fetcher(url, {headers: {'User-Agent': USER_AGENT}});
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  };
}

export function translators(
  fetcher: typeof fetch = globalThis.fetch,
): DictionaryProvider[] {
  const fetchText = fetchTextWith(fetcher);
  return [wiktionaryDefiner(fetchText), apertiumTranslator(fetchText)];
}
