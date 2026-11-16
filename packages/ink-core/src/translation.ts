/**
 * The translation flow of a lasso press, shared by Lingo's direction buttons (#128) and Lookup's
 * «Insert translation» (#158): which words a query stands for (a ZH input is read through the
 * pinyin index, #129), the first of them the engine translates, and the line written on the note.
 * Pure: the plugin passes the engine, the index and the fetcher.
 */
import type {LookupResult, TranslationQuery} from './dictionary';
import type {Direction} from './pairs';
import {ChineseCandidate, PinyinIndex, readChineseInput} from './pinyin';
import type {FetchText} from './wiktionary';

/** The pinyin candidates asked, best first: a box under a word, not a dictionary page. */
export const MAX_CANDIDATES = 3;

export type Translate = (query: TranslationQuery) => Promise<LookupResult>;

/** `ES→PT`. */
export const directionName = ({from, to}: Direction): string =>
  `${from.toUpperCase()}→${to.toUpperCase()}`;

/** The words to translate: the recognized text, or a ZH input's candidates; empty when unreadable. */
export function wordsOf(
  query: string,
  {from}: Direction,
  pinyin: () => PinyinIndex,
): ChineseCandidate[] {
  if (from !== 'zh') {
    return [{word: query}];
  }
  return readChineseInput(query, pinyin()).candidates.slice(0, MAX_CANDIDATES);
}

export type Translated =
  | {word: ChineseCandidate; result: LookupResult}
  | {errors: string[]};

/** The first candidate the engine translates, with every lookup's failures kept. */
export async function firstTranslated(
  words: readonly ChineseCandidate[],
  direction: Direction,
  translate: Translate,
): Promise<Translated> {
  const errors: string[] = [];
  for (const word of words) {
    const result = await translate({...direction, word: word.word});
    if (result.translations.length > 0) {
      return {word, result};
    }
    errors.push(...result.errors);
  }
  return {errors};
}

/**
 * `palavra → word; other (Wiktionary)`, with a reading after the word or a translation; the source
 * is named from `sourceNames` by the answering provider's id.
 */
export function translationText(
  word: ChineseCandidate,
  result: LookupResult,
  sourceNames: Readonly<Record<string, string>>,
): string {
  const head = word.reading ? `${word.word} (${word.reading})` : word.word;
  const texts = result.translations.map(t =>
    t.reading ? `${t.text} (${t.reading})` : t.text,
  );
  const source = result.providerId ? sourceNames[result.providerId] : null;
  return `${head} → ${texts.join('; ')}${source ? ` (${source})` : ''}`;
}

/** What one direction gave a query: its translated line, or the failures of every lookup. */
export type DirectionOutcome = {direction: Direction} & Translated;

/** Every direction asked at once, the outcomes in `directions` order. */
export function translateAll(
  query: string,
  directions: readonly Direction[],
  translate: Translate,
  pinyin: () => PinyinIndex,
): Promise<DirectionOutcome[]> {
  return Promise.all(
    directions.map(async direction => ({
      direction,
      ...(await firstTranslated(
        wordsOf(query, direction, pinyin),
        direction,
        translate,
      )),
    })),
  );
}

/**
 * GETs a body with `userAgent`, which Wiktionary's policy asks every client to send; a failed
 * request or a status other than 2xx throws, never an empty body.
 */
export function fetchTextWith(fetcher: typeof fetch, userAgent: string): FetchText {
  return async url => {
    const response = await fetcher(url, {headers: {'User-Agent': userAgent}});
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  };
}
