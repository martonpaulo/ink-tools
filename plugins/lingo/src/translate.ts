/**
 * A direction button's press (#128): the lassoed word is recognized, translated through the shared
 * engine and inserted as a text box beside the lasso, with no plugin view. A ZH input is read
 * first (#129): characters go straight to translation, pinyin is looked up to the words it spells.
 * A word with no translation, or a failed lookup, inserts a sentence that says so; never a guess.
 *
 * Whether the press arrives with no view, the text box's look and whether recognition returns tone
 * marks are TO TEST on the device (Ink2Pic's docs/brief.md, section 10.5).
 */
import {
  ChineseCandidate,
  Direction,
  LassoPlace,
  LassoQuery,
  LookupResult,
  MIN_PLACE_BAND,
  Outcome,
  PinyinIndex,
  placeRect,
  readChineseInput,
  readLassoQuery,
  Rect,
  translateFirst,
  TranslationQuery,
} from '@supernote-tools/ink-core';
import {cedictPinyinIndex} from '@supernote-tools/ink-core/pinyin-data';
import {
  CallFailure,
  EMPTY_LASSO_CODE,
  fail,
  getCurrentFilePath,
  getCurrentPageNum,
  getLassoElements,
  getLassoRect,
  getPageSize,
  insertText,
  recognizeElements,
  Result,
  TextBoxInput,
  THROWN_CODE,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';
import {SOURCE_NAMES, translators} from './dictionaries';

/** The text size in page pixels, as Ink2Pic's definition box [INFERENCE]. */
export const FONT_SIZE = 32;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.5);
/** About how wide one character is, as a share of the font size [INFERENCE]. */
const CHAR_WIDTH = 0.55;
/** The box's width in page pixels; narrower wrapped after every word in Ink2Pic (#115). */
export const BOX_WIDTH = 480;
/** The pinyin candidates asked, best first: a box under a word, not a dictionary page. */
export const MAX_CANDIDATES = 3;

export type TranslateDeps = {
  read: () => Promise<Outcome<LassoQuery, CallFailure>>;
  translate: (query: TranslationQuery) => Promise<LookupResult>;
  pinyin: () => PinyinIndex;
  insert: (box: TextBoxInput) => Promise<Result<boolean>>;
  log: (line: string) => void;
};

const DEVICE: TranslateDeps = {
  read: () =>
    readLassoQuery<CallFailure>({
      getLassoElements,
      getLassoRect,
      getCurrentFilePath,
      getCurrentPageNum,
      getPageSize,
      recognizeElements,
      emptyLasso: message => fail(EMPTY_LASSO_CODE, message),
      failure: message => fail(THROWN_CODE, message),
    }),
  translate: query => translateFirst(translators(), query),
  pinyin: cedictPinyinIndex,
  insert: insertText,
  log: line => console.log(`Lingo: ${line}`),
};

const directionName = ({from, to}: Direction): string =>
  `${from.toUpperCase()}→${to.toUpperCase()}`;

/** The words to translate: the recognized text, or a ZH input's candidates; empty when unreadable. */
function wordsOf(
  query: string,
  {from}: Direction,
  pinyin: () => PinyinIndex,
): ChineseCandidate[] {
  if (from !== 'zh') {
    return [{word: query}];
  }
  return readChineseInput(query, pinyin()).candidates.slice(0, MAX_CANDIDATES);
}

/** The first candidate the engine translates, with every lookup's failures kept. */
async function firstTranslated(
  words: ChineseCandidate[],
  direction: Direction,
  translate: TranslateDeps['translate'],
): Promise<
  {word: ChineseCandidate; result: LookupResult} | {errors: string[]}
> {
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

/** `palavra → word; other (Wiktionary)`, with a reading after the word or a translation. */
export function translationText(
  word: ChineseCandidate,
  result: LookupResult,
): string {
  const head = word.reading ? `${word.word} (${word.reading})` : word.word;
  const texts = result.translations.map(t =>
    t.reading ? `${t.text} (${t.reading})` : t.text,
  );
  const source = result.providerId ? SOURCE_NAMES[result.providerId] : null;
  return `${head} → ${texts.join('; ')}${source ? ` (${source})` : ''}`;
}

/**
 * The box beside the lassoed word, BOX_WIDTH wide, as tall as its wrapped lines and at least
 * MIN_PLACE_BAND, which placeRect needs beside a word: a shorter one falls back below it.
 */
export function boxRect(text: string, place: LassoPlace): Rect | null {
  const perLine = Math.max(1, Math.floor(BOX_WIDTH / (FONT_SIZE * CHAR_WIDTH)));
  const lines = text
    .split('\n')
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)),
      0,
    );
  return placeRect(
    place.rect,
    {width: BOX_WIDTH, height: Math.max(MIN_PLACE_BAND, lines * LINE_HEIGHT)},
    place.pageSize,
    'beside',
  );
}

export type Translated = {ok: boolean; text: string};

/** The press of `direction`'s button; the value says what was inserted, or why nothing was. */
export async function translateLasso(
  direction: Direction,
  deps: TranslateDeps = DEVICE,
): Promise<Translated> {
  const name = directionName(direction);
  const read = await deps.read();
  if (!read.ok) {
    deps.log(`${name}: lasso failed: ${read.code} ${read.message}`);
    return {ok: false, text: read.message};
  }
  const {query, place} = read.value;
  if (!place) {
    // Without the lasso's rect there is nowhere beside the word to write.
    deps.log(`${name}: no lasso rect for "${query}"`);
    return {ok: false, text: copy['error.place']};
  }
  const words = wordsOf(query, direction, deps.pinyin);
  const found = await firstTranslated(words, direction, deps.translate);
  let ok = false;
  let text: string;
  if ('word' in found) {
    found.result.errors.forEach(error => deps.log(`${name}: ${error}`));
    ok = true;
    text = translationText(found.word, found.result);
  } else {
    found.errors.forEach(error => deps.log(`${name}: ${error}`));
    text =
      found.errors.length > 0
        ? copy['translate.failed'](query)
        : copy['translate.none'](name, query);
  }
  const rect = boxRect(text, place);
  if (!rect) {
    deps.log(`${name}: no room beside the lasso`);
    return {ok: false, text: copy['error.place']};
  }
  const inserted = await deps.insert({text, rect, fontSize: FONT_SIZE});
  if (!inserted.ok || !inserted.value) {
    const why = inserted.ok
      ? 'answered false'
      : `${inserted.code} ${inserted.message}`;
    deps.log(`${name}: insertText ${why}`);
    return {ok: false, text: copy['error.insert']};
  }
  deps.log(`${name}: inserted "${text}"`);
  return {ok, text};
}
