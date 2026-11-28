/**
 * The TypeScript reader of the language registry (#500): every tool's one folding rule and one
 * code format, from Unicode CLDR through `scripts/language_registry.py`. `registry/languages/cases.json`
 * is the case table it shares with the Python, Java and Swift readers.
 *
 * Inside, a language is its BCP 47 tag (`pt-BR`); each outside form is made only here: `pt_BR` on
 * the tablet, `pt` for Wikipedia, `por` for Apertium, `PT` in a label, `es-ES>pt-BR` for a pair.
 */
import {LANGUAGE_REGISTRY} from './languages.generated';
import type {LanguageEntry, LanguageRegistry} from './languageTypes';

export type {LanguageEntry, LanguageRegistry} from './languageTypes';

const MARKS = /\p{M}+/gu;

function entry(language: string, registry: LanguageRegistry): LanguageEntry {
  const found = registry.languages[language.split('-')[0]];
  if (!found) throw new RangeError(`${language}: not in the language registry`);
  return found;
}

const stripMarks = (ch: string): string => ch.normalize('NFD').replace(MARKS, '');

/** The letters a grid of the language shows: CLDR's index set, upper case. */
export function gridLetters(language: string, registry: LanguageRegistry = LANGUAGE_REGISTRY): readonly string[] {
  return entry(language, registry).letters;
}

/** Whether `ch`, in upper case, is one of the language's grid letters (Spanish Ñ, say). */
export function isGridLetter(language: string, registry: LanguageRegistry = LANGUAGE_REGISTRY): (ch: string) => boolean {
  const letters = new Set(entry(language, registry).letters);
  return ch => letters.has(ch.toUpperCase());
}

/**
 * The text with each Latin letter in ASCII and its case kept: «Limão» reads «Limao», «Æ» «AE».
 * A character `keep` accepts stays as it is, such as a grid letter or one a font draws.
 */
export function withoutAccents(
  text: string,
  keep: (ch: string) => boolean = () => false,
  registry: LanguageRegistry = LANGUAGE_REGISTRY,
): string {
  return [...text.normalize('NFC')]
    .map(ch => {
      if (keep(ch)) return ch;
      const upper = ch.toUpperCase();
      const replaced = [...upper].length === 1 ? registry.latinAscii[upper] : undefined;
      if (replaced === undefined) return stripMarks(ch);
      return ch === upper ? replaced : replaced.toLowerCase();
    })
    .join('');
}

/**
 * The text in the language's grid letters, upper case, or null when a letter has no place in the
 * grid: a grid letter stays, any other goes through the language's own CLDR transform, then
 * Latin-ASCII, then loses its marks.
 */
export function foldToGrid(text: string, language: string, registry: LanguageRegistry = LANGUAGE_REGISTRY): string | null {
  const found = entry(language, registry);
  const letters = new Set(found.letters);
  const own = found.fold ?? {};
  const folded = [...text.normalize('NFC').toUpperCase()]
    .map(ch => (letters.has(ch) ? ch : own[ch] ?? registry.latinAscii[ch] ?? stripMarks(ch)))
    .join('');
  return folded !== '' && [...folded].every(ch => letters.has(ch)) ? folded : null;
}

/** The BCP 47 tag with CLDR's likely region: `pt` → `pt-BR`; a tag with a region stays. */
export function languageTag(language: string, registry: LanguageRegistry = LANGUAGE_REGISTRY): string {
  if (language.includes('-')) return language;
  const {region} = entry(language, registry);
  return region ? `${language}-${region}` : language;
}

/** The tablet's form of a tag: `pt_BR`. */
export const tabletLocale = (language: string, registry: LanguageRegistry = LANGUAGE_REGISTRY): string =>
  languageTag(language, registry).replace('-', '_');

/** The Wikipedia subdomain: the base code, unless the registry names another. */
export function wikipediaCode(language: string, registry: LanguageRegistry = LANGUAGE_REGISTRY): string {
  const code = language.split('-')[0];
  return registry.exceptions.wikipedia?.[code]?.value ?? code;
}

/** Apertium's ISO 639-3 code: `por`. */
export const apertiumCode = (language: string, registry: LanguageRegistry = LANGUAGE_REGISTRY): string =>
  entry(language, registry).alpha3;

/** The short label a button shows: `PT`. */
export const languageLabel = (language: string): string => language.split('-')[0].toUpperCase();

/** A translation pair's id: `es-ES>pt-BR`. */
export const pairId = (source: string, target: string, registry: LanguageRegistry = LANGUAGE_REGISTRY): string =>
  `${languageTag(source, registry)}>${languageTag(target, registry)}`;
