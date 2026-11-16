/**
 * The one place Lookup's dictionary chain is built (#115): feature code asks `defineFirst` over
 * these and never names a source (AGENTS.md › Rules). Wiktionary only, keyless and online; the
 * offline word list joins at the front once it exists (#46).
 */
import {
  DictionaryProvider,
  FetchText,
  wiktionaryDefiner,
} from '@supernote-tools/ink-core';
import {version} from '../package.json';

/** Wiktionary asks every client to name itself and a contact (its User-Agent policy). */
export const USER_AGENT = `Lookup/${version} (+https://github.com/martonpaulo/supernote-tools)`;

/** The credit a text box ends with, per provider id: Wiktionary's text is CC BY-SA. */
export const SOURCE_NAMES: Record<string, string> = {
  wiktionary: 'Wiktionary',
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

export function definers(
  fetcher: typeof fetch = globalThis.fetch,
): DictionaryProvider[] {
  return [wiktionaryDefiner(fetchTextWith(fetcher))];
}
