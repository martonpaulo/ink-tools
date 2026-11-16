/**
 * The one place Lingo's dictionary chain is built (#128): feature code asks `translateFirst` over
 * these and never names a source. Wiktionary first, Apertium as the PT<->ES fallback (D29 B on #46,
 * #127); both keyless and online. The offline word list joins at the front once it exists.
 */
import {
  apertiumTranslator,
  DictionaryProvider,
  fetchTextWith,
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

export function translators(
  fetcher: typeof fetch = globalThis.fetch,
): DictionaryProvider[] {
  const fetchText = fetchTextWith(fetcher, USER_AGENT);
  return [wiktionaryDefiner(fetchText), apertiumTranslator(fetchText)];
}
