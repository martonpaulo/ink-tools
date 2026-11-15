/**
 * The dictionary and translation engine's seam, shared by `lingo` and `lookup`'s definition mode
 * (docs/plugin-scope.md, "Dictionary and translation engine (shared)"). Concrete sources (an offline
 * word list, an online keyless API, later a paid opt-in one) are implementations; feature code
 * never names one. A definition is the same seam's second, optional call (#115): a source that
 * only translates (Apertium) leaves it out.
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

export interface DefinitionQuery {
  word: string;
  /** The language the word is in, and the definition is written in: monolingual. */
  language: LanguageCode;
}

export interface Definition {
  text: string;
  /** The part of speech the source files the sense under, such as «substantivo». */
  partOfSpeech?: string;
}

export interface DictionaryProvider {
  /** Stable, for logs and Settings: `wiktionary`, `offline`. */
  readonly id: string;
  /**
   * Translations of `query.word`, best first. A word the source does not know is an empty list;
   * a failed read (network, parse) throws, never an empty list.
   */
  translate(query: TranslationQuery): Promise<Translation[]>;
  /**
   * Monolingual definitions of `query.word`, best first, under the same rule as `translate`.
   * Absent when the source has no definitions.
   */
  define?(query: DefinitionQuery): Promise<Definition[]>;
}

export interface LookupResult {
  translations: Translation[];
  /** The provider that answered, or null when none had the word. */
  providerId: string | null;
  /** One line per provider that failed, so an empty answer after a failure is never silent. */
  errors: string[];
}

export interface DefinitionResult {
  definitions: Definition[];
  /** The provider that answered, or null when none had the word. */
  providerId: string | null;
  /** The language of the definitions, or null when none had the word. */
  language: LanguageCode | null;
  /** One line per provider and language that failed. */
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

/** The first non-empty answer of `asks`, in order, with every failure kept as `<label>: <message>`. */
async function firstHit<T, A extends {label: string}>(
  asks: readonly A[],
  ask: (item: A) => Promise<T[]>,
): Promise<{hits: T[]; item: A | null; errors: string[]}> {
  const errors: string[] = [];
  for (const item of asks) {
    try {
      const hits = await ask(item);
      if (hits.length > 0) return {hits, item, errors};
    } catch (error) {
      errors.push(`${item.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {hits: [], item: null, errors};
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
  const asks = providers.map(provider => ({label: provider.id, provider}));
  const {hits, item, errors} = await firstHit(asks, ({provider}) => provider.translate(checked));
  return {translations: hits, providerId: item?.provider.id ?? null, errors};
}

/**
 * The same rule for a definition, over each language in the person's order (#115): every
 * provider that defines is asked for the first language, then for the next. A provider without
 * `define` is skipped; an empty word or an unknown language is refused.
 */
export async function defineFirst(
  providers: readonly DictionaryProvider[],
  word: string,
  languages: readonly LanguageCode[],
): Promise<DefinitionResult> {
  const trimmed = word.trim();
  if (trimmed === '') throw new Error('define: the word is empty');
  const unknown = languages.find(language => !isLanguage(language));
  if (unknown !== undefined) throw new Error(`define: unknown language ${unknown}`);
  const asks = languages.flatMap(language =>
    providers
      .filter(provider => provider.define !== undefined)
      .map(provider => ({label: `${provider.id} ${language}`, provider, language})),
  );
  const {hits, item, errors} = await firstHit(asks, ({provider, language}) =>
    // The filter above keeps only providers that define.
    (provider.define as NonNullable<DictionaryProvider['define']>)({word: trimmed, language}),
  );
  return {
    definitions: hits,
    providerId: item?.provider.id ?? null,
    language: item?.language ?? null,
    errors,
  };
}
