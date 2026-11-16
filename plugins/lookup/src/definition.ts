/**
 * «Insert definition» (#115), moved here from Ink2Pic, which is being retired: the lassoed word's
 * monolingual definition, from the shared `DictionaryProvider` chain of ink-core, inserted as a text
 * box below the word, with no plugin view. As Lingo's translate press (#128), a word with no
 * definition, or a dictionary that cannot be reached, inserts a sentence that says so; never a guess.
 *
 * Each step is logged with its time as `Lookup: …`, so a device round reads the recognition, the
 * dictionary wait and the insert from `snadb logs --plugin Lookup`.
 */
import {
  defineFirst,
  DefinitionResult,
  DEFINED_LANGUAGES,
  LanguageCode,
  LassoPlace,
  LassoQuery,
  Outcome,
  placeRect,
  readLassoQuery,
  Rect,
} from '@supernote-tools/ink-core';
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
import {definers, SOURCE_NAMES} from './dictionaries';
import {FIRST_BUTTON_ID, MODES} from './modes';

/** After the picture modes' ids, so every Lookup button keeps its own (src/modes.ts). */
export const DEFINE_BUTTON_ID = FIRST_BUTTON_ID + MODES.length;

/** The text size in page pixels, as Ink2Pic's definition box [INFERENCE]. */
export const FONT_SIZE = 32;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.5);
/** About how wide one character is, as a share of the font size [INFERENCE]. */
const CHAR_WIDTH = 0.55;
/**
 * The box's width in page pixels: at 200 px «Substantivo» broke inside the word on the tablet
 * (#115, device round 2026-11-16); 640 px is Ink2Pic's fixed width since d537180.
 */
export const BOX_WIDTH = 640;

/**
 * The languages a word is defined in, in this order. shortcut: fixed, as Lookup keeps no settings
 * file yet; read the person's search languages once the settings store moves in (#142).
 */
export const LANGUAGES: readonly LanguageCode[] = DEFINED_LANGUAGES;

export type DefineDeps = {
  read: () => Promise<Outcome<LassoQuery, CallFailure>>;
  define: (
    word: string,
    languages: readonly LanguageCode[],
  ) => Promise<DefinitionResult>;
  insert: (box: TextBoxInput) => Promise<Result<boolean>>;
  log: (line: string) => void;
  now: () => number;
};

const DEVICE: DefineDeps = {
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
  define: (word, languages) => defineFirst(definers(), word, languages),
  insert: insertText,
  log: line => console.log(`Lookup: ${line}`),
  now: Date.now,
};

/** The text box's text: the word and its part of speech, the numbered senses, the source. */
export function definitionText(word: string, result: DefinitionResult): string {
  const speech = result.definitions[0]?.partOfSpeech;
  const head = speech ? `${word} (${speech})` : word;
  const senses = result.definitions.map(
    (sense, index) => `${index + 1}. ${sense.text}`,
  );
  const source = result.providerId ? SOURCE_NAMES[result.providerId] : null;
  return [head, ...senses, ...(source ? [`(${source})`] : [])].join('\n');
}

/** The box below the lassoed word, BOX_WIDTH wide, as tall as its wrapped lines. */
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
    {width: BOX_WIDTH, height: lines * LINE_HEIGHT},
    place.pageSize,
    'below',
  );
}

export type Defined = {ok: boolean; text: string};

/** One press of «Insert definition»; the value says what was inserted, or why nothing was. */
export async function defineLasso(deps: DefineDeps = DEVICE): Promise<Defined> {
  const started = deps.now();
  const read = await deps.read();
  if (!read.ok) {
    deps.log(`define: lasso failed: ${read.code} ${read.message}`);
    return {ok: false, text: read.message};
  }
  const {query, place} = read.value;
  const recognized = deps.now();
  deps.log(`define: "${query}", lasso and recognition ${recognized - started} ms`);
  if (!place) {
    deps.log(`define: no lasso rect for "${query}"`);
    return {ok: false, text: copy['error.place']};
  }
  const result = await deps.define(query, LANGUAGES);
  const answered = deps.now();
  result.errors.forEach(error => deps.log(`define: ${error}`));
  const found = result.definitions.length > 0;
  deps.log(
    found
      ? `define: ${result.definitions.length} from ${result.providerId} ${result.language} in ${answered - recognized} ms`
      : `define: none for "${query}" in ${LANGUAGES.join(', ')}, ${answered - recognized} ms`,
  );
  const text = found
    ? definitionText(query, result)
    : result.errors.length > 0
    ? copy['definition.failed'](query)
    : copy['definition.none'](query);
  const rect = boxRect(text, place);
  if (!rect) {
    deps.log('define: no room below the lasso');
    return {ok: false, text: copy['error.place']};
  }
  const inserted = await deps.insert({text, rect, fontSize: FONT_SIZE});
  if (!inserted.ok || !inserted.value) {
    const why = inserted.ok
      ? 'answered false'
      : `${inserted.code} ${inserted.message}`;
    deps.log(`define: insertText ${why}`);
    return {ok: false, text: copy['error.insert']};
  }
  deps.log(
    `define: inserted at ${JSON.stringify(rect)}, insert ${deps.now() - answered} ms, total ${deps.now() - started} ms`,
  );
  return {ok: found, text};
}
