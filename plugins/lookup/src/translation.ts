/**
 * «Insert translation» (#158), moved here from the Lingo plugin's direction buttons (#128): one
 * lasso button for every language pair switched on in Settings. A plugin cannot tell which
 * language the word was written in, so a press asks every direction the pairs allow, in `PAIRS`
 * order, through ink-core's shared flow (a ZH input read through the pinyin index, #129), and the
 * text box below the word has one line per direction that found a translation. A word with no
 * translation, or dictionaries that cannot be reached, inserts a sentence that says so; never a
 * guess. No pair on: the box says to turn one on, and nothing is looked up.
 *
 * Each step is logged as `Lookup: translate: …`, read with `snadb logs --plugin Lookup`.
 */
import {
  Direction,
  directionName,
  DirectionOutcome,
  enabledDirections,
  LassoQuery,
  LookupResult,
  Outcome,
  PinyinIndex,
  translateAll,
  translateFirst,
  translationText,
  TranslationQuery,
} from '@supernote-tools/ink-core';
import {cedictPinyinIndex} from '@supernote-tools/ink-core/pinyin-data';
import {
  CallFailure,
  insertText,
  Result,
  TextBoxInput,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';
import {SOURCE_NAMES, translators} from './dictionaries';
import {getSettings} from './profile';
import type {LookupSettings} from './settings';
import {insertBox, readLasso} from './textBox';

export type TranslateDeps = {
  read: () => Promise<Outcome<LassoQuery, CallFailure>>;
  settings: () => Promise<LookupSettings>;
  translate: (query: TranslationQuery) => Promise<LookupResult>;
  pinyin: () => PinyinIndex;
  insert: (box: TextBoxInput) => Promise<Result<boolean>>;
  log: (line: string) => void;
};

const DEVICE: TranslateDeps = {
  read: readLasso,
  settings: getSettings,
  translate: query => translateFirst(translators(), query),
  pinyin: cedictPinyinIndex,
  insert: insertText,
  log: line => console.log(`Lookup: ${line}`),
};

/** `ES→PT palavra → word (Wiktionary)`, one line per direction that found a translation. */
export function translationLines(
  outcomes: readonly DirectionOutcome[],
): string[] {
  return outcomes.flatMap(outcome =>
    'word' in outcome
      ? [
          `${directionName(outcome.direction)} ${translationText(
            outcome.word,
            outcome.result,
            SOURCE_NAMES,
          )}`,
        ]
      : [],
  );
}

/** The box's text for `query` over `directions`, and whether a translation was found. */
async function textFor(
  query: string,
  directions: readonly Direction[],
  deps: TranslateDeps,
): Promise<{found: boolean; text: string}> {
  if (directions.length === 0) {
    deps.log(`translate: no language pair on for "${query}"`);
    return {found: false, text: copy['translation.noPair'](query)};
  }
  const outcomes = await translateAll(
    query,
    directions,
    deps.translate,
    deps.pinyin,
  );
  for (const outcome of outcomes) {
    const name = directionName(outcome.direction);
    const errors = 'word' in outcome ? outcome.result.errors : outcome.errors;
    errors.forEach(error => deps.log(`translate: ${name}: ${error}`));
  }
  const lines = translationLines(outcomes);
  if (lines.length > 0) {
    return {found: true, text: lines.join('\n')};
  }
  // A lookup that failed may have held the word, so «none» is said only when none failed.
  const failed = outcomes.some(
    outcome => !('word' in outcome) && outcome.errors.length > 0,
  );
  return {
    found: false,
    text: failed
      ? copy['translation.failed'](query)
      : copy['translation.none'](query),
  };
}

export type Translated = {ok: boolean; text: string};

/** One press of «Insert translation»; the value says what was inserted, or why nothing was. */
export async function translateLasso(
  deps: TranslateDeps = DEVICE,
): Promise<Translated> {
  const read = await deps.read();
  if (!read.ok) {
    deps.log(`translate: lasso failed: ${read.code} ${read.message}`);
    return {ok: false, text: read.message};
  }
  const {query, place} = read.value;
  if (!place) {
    deps.log(`translate: no lasso rect for "${query}"`);
    return {ok: false, text: copy['error.place']};
  }
  const directions = enabledDirections(await deps.settings());
  const {found, text} = await textFor(query, directions, deps);
  const placed = await insertBox(
    text,
    place,
    deps.insert,
    deps.log,
    'translate',
  );
  if (!placed.ok) {
    return {
      ok: false,
      text:
        placed.why === 'place'
          ? copy['error.place']
          : copy['translation.insert'],
    };
  }
  deps.log(`translate: inserted "${text}" at ${JSON.stringify(placed.rect)}`);
  return {ok: found, text};
}
