/**
 * «Insert definition» (#115), moved here from Ink2Pic, which is being retired: the lassoed word's
 * monolingual definition, from the shared `DictionaryProvider` chain of ink-core, inserted as a text
 * box below the word, with no plugin view. As Lingo's translate press (#128), a word with no
 * definition, or a dictionary that cannot be reached, inserts a sentence that says so; never a guess.
 *
 * Each step is logged with its time as `Lookup: …`, so a device round reads the recognition, the
 * dictionary wait and the insert from `inkctl logs --plugin Lookup`.
 */
import {
  defineFirst,
  DefinitionResult,
  DEFINED_LANGUAGES,
  LanguageCode,
  LassoQuery,
  Outcome,
} from '@supernote-tools/ink-core';
import {
  CallFailure,
  insertText,
  Result,
  TextBoxInput,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';
import {definers, SOURCE_NAMES} from './dictionaries';
import {FIRST_BUTTON_ID, MODES} from './modes';
import {insertBox, readLasso} from './textBox';

export {BOX_WIDTH, boxRect, FONT_SIZE} from './textBox';

/** After the picture modes' ids, so every Lookup button keeps its own (src/modes.ts). */
export const DEFINE_BUTTON_ID = FIRST_BUTTON_ID + MODES.length;

/**
 * The languages a word is defined in, and the picture modes search in, in this order. shortcut:
 * fixed, as Lookup's settings file (#142) holds only its switches; read the person's languages once
 * Lookup's Settings has a languages choice.
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
  read: readLasso,
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
  deps.log(
    `define: "${query}", lasso and recognition ${recognized - started} ms`,
  );
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
      ? `define: ${result.definitions.length} from ${result.providerId} ${
          result.language
        } in ${answered - recognized} ms`
      : `define: none for "${query}" in ${LANGUAGES.join(', ')}, ${
          answered - recognized
        } ms`,
  );
  const text = found
    ? definitionText(query, result)
    : result.errors.length > 0
    ? copy['definition.failed'](query)
    : copy['definition.none'](query);
  const placed = await insertBox(text, place, deps.insert, deps.log, 'define');
  if (!placed.ok) {
    return {
      ok: false,
      text: placed.why === 'place' ? copy['error.place'] : copy['error.insert'],
    };
  }
  deps.log(
    `define: inserted at ${JSON.stringify(placed.rect)}, insert ${
      deps.now() - answered
    } ms, total ${deps.now() - started} ms`,
  );
  return {ok: found, text};
}
