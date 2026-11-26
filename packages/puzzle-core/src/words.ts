/**
 * The Puzzles word lists (#381): one per language, in the language's grid letters, most frequent
 * first, with a fill score per word and the word-search themes. `scripts/build_word_lists.py`
 * writes them from the sources in `words/sources.json`; this module only reads and checks them.
 *
 * The lists are large (about 270 kB each), so `index.ts` does not export them: a caller imports
 * `words-data.ts`, which bundles all five, or one `words/<lang>.json` itself.
 */

export const WORD_LANGUAGES = ['en', 'pt', 'es', 'de', 'fr'] as const;
export type WordLanguage = (typeof WORD_LANGUAGES)[number];

export type ThemeTier = 'easy' | 'medium' | 'hard';

export interface WordTheme {
  tier: ThemeTier;
  name: string;
  words: string[];
}

export interface WordList {
  language: WordLanguage;
  /** Every letter a word of this language may hold in a grid. */
  alphabet: string;
  /** The ids in `words/sources.json` this list was built from. */
  sources: string[];
  words: string[];
  /** Fill score per word, 1 to 100, highest for the most frequent. */
  scores: number[];
  themes: WordTheme[];
}

/** The pattern every word of a language matches: A to Z, and Ñ for Spanish. */
export function gridPattern(language: WordLanguage): RegExp {
  return language === 'es' ? /^[A-ZÑ]+$/ : /^[A-Z]+$/;
}

export interface SourceEntry {
  name: string;
  licence: string;
  attribution: string;
  url?: string;
  path?: string;
}

export interface SourceManifest {
  allowedLicences: string[];
  sources: Record<string, SourceEntry>;
}

/**
 * What keeps a bundled list from shipping: a list naming no source, a source the manifest does not
 * record, a source with no licence or attribution, a licence outside the allowed set, or a source
 * NOTICE.md does not name. An empty answer means every list is accounted for.
 */
export function licenceProblems(manifest: SourceManifest, lists: readonly Pick<WordList, 'language' | 'sources'>[], notice: string): string[] {
  const problems: string[] = [];
  for (const list of lists) {
    if (list.sources.length === 0) problems.push(`${list.language}: names no source`);
    for (const id of list.sources) {
      const source = manifest.sources[id];
      if (!source) {
        problems.push(`${list.language}: source «${id}» is not in words/sources.json`);
        continue;
      }
      if (!source.licence || !source.attribution) problems.push(`${id}: no licence or attribution`);
      else if (!manifest.allowedLicences.includes(source.licence)) problems.push(`${id}: licence «${source.licence}» is not allowed`);
      if (!notice.includes(source.name)) problems.push(`${id}: NOTICE.md does not name «${source.name}»`);
    }
  }
  return problems;
}
