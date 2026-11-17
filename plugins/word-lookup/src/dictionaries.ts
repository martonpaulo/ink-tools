/**
 * The one place Lookup's dictionary chains are built (#115, #158): feature code asks `defineFirst`
 * or `translateFirst` over these and never names a source (AGENTS.md › Rules). Definitions come
 * from Wiktionary; translations from Wiktionary, then Apertium as the PT-ES fallback (D29 B on
 * #46, #127). All keyless and online; the offline word list joins at the front once it exists.
 */
import {
  apertiumTranslator,
  DictionaryProvider,
  fetchTextWith,
  LanguageCode,
  summarizeFirst,
  SummaryResult,
  wiktionaryDefiner,
} from '@ink-tools/ink-core';
import {version} from '../package.json';

/** Wiktionary asks every client to name itself and a contact (its User-Agent policy). */
export const USER_AGENT = `Lookup/${version} (+https://github.com/martonpaulo/supernote-tools)`;

/** The credit a text box ends with, per provider id: Wiktionary's text is CC BY-SA. */
export const SOURCE_NAMES: Record<string, string> = {
  wiktionary: 'Wiktionary',
  apertium: 'Apertium',
};

export function definers(
  fetcher: typeof fetch = globalThis.fetch,
): DictionaryProvider[] {
  return [wiktionaryDefiner(fetchTextWith(fetcher, USER_AGENT))];
}

/** The term's Wikipedia summary (#114): its text is CC BY-SA, credited in the box. */
export function summarize(
  term: string,
  languages: readonly LanguageCode[],
  fetcher: typeof fetch = globalThis.fetch,
): Promise<SummaryResult> {
  return summarizeFirst(fetchTextWith(fetcher, USER_AGENT), term, languages);
}

export function translators(
  fetcher: typeof fetch = globalThis.fetch,
): DictionaryProvider[] {
  const fetchText = fetchTextWith(fetcher, USER_AGENT);
  return [wiktionaryDefiner(fetchText), apertiumTranslator(fetchText)];
}
