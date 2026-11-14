/**
 * The dictionary and translation engine's seam, shared by `lingo` and `lookup`'s definition mode
 * (docs/plugin-scope.md, "Dictionary and translation engine (shared)"). Concrete sources (an offline
 * word list, an online keyless API, later a paid opt-in one) are implementations; feature code
 * never names one. Lookup's definition call joins this interface with #45.
 */

/** The languages the engine knows, as ISO 639-1 codes. The one owner of this list. */
export const LANGUAGES = ['pt', 'es', 'zh'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const isLanguage = (value: unknown): value is LanguageCode =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

export interface TranslationQuery {
  word: string;
  from: LanguageCode;
  to: LanguageCode;
}

export interface Translation {
  text: string;
  /** A reading aid when the source has one, such as pinyin for Chinese. */
  reading?: string;
  /** Which meaning this translation is for, when the source says. */
  sense?: string;
}

export interface DictionaryProvider {
  /** Stable, for logs and Settings: `wiktionary`, `offline`. */
  readonly id: string;
  /**
   * Translations of `query.word`, best first. A word the source does not know is an empty list;
   * a failed read (network, parse) throws, never an empty list.
   */
  translate(query: TranslationQuery): Promise<Translation[]>;
}

export interface LookupResult {
  translations: Translation[];
  /** The provider that answered, or null when none had the word. */
  providerId: string | null;
  /** One line per provider that failed, so an empty answer after a failure is never silent. */
  errors: string[];
}

/** The query as a provider receives it: trimmed, and refused when it cannot mean anything. */
export function checkQuery(query: TranslationQuery): TranslationQuery {
  const word = query.word.trim();
  if (word === '') throw new Error('translate: the word is empty');
  if (!isLanguage(query.from) || !isLanguage(query.to)) {
    throw new Error(`translate: unknown language ${query.from}->${query.to}`);
  }
  if (query.from === query.to) throw new Error(`translate: ${query.from} to itself`);
  return {...query, word};
}

/**
 * The hybrid rule: ask each provider in order (offline first, online as the fallback) and stop at
 * the first that knows the word. A provider that fails is recorded and the next one is asked.
 */
export async function translateFirst(
  providers: readonly DictionaryProvider[],
  query: TranslationQuery,
): Promise<LookupResult> {
  const checked = checkQuery(query);
  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const translations = await provider.translate(checked);
      if (translations.length > 0) return {translations, providerId: provider.id, errors};
    } catch (error) {
      errors.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {translations: [], providerId: null, errors};
}
