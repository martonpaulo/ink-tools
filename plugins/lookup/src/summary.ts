/**
 * «Insert Summary» (#114): the lassoed term's short encyclopedic summary, a 3-sentence bio of a
 * person or the opening of a topic's article, from ink-core's Wikipedia extract, inserted as a text
 * box below the word with no plugin view, in the same box as «Insert Definition» (`textBox.ts`). A
 * term with no article, or a Wikipedia that cannot be reached, inserts a sentence that says so;
 * never a guess.
 *
 * Each step is logged with its time as `Lookup: summary: …`, so a device round reads the
 * recognition, the Wikipedia wait and the insert from `inkctl logs --plugin Lookup`.
 */
import {
  LanguageCode,
  LassoQuery,
  Outcome,
  Summary,
  SummaryResult,
} from '@supernote-tools/ink-core';
import {
  CallFailure,
  insertText,
  Result,
  TextBoxInput,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';
import {LANGUAGES} from './definition';
import {summarize} from './dictionaries';
import {FIRST_BUTTON_ID} from './modes';
import {insertBox, readLasso} from './textBox';

/**
 * A block of its own, far after the translation buttons, whose ids grow with each new pair of
 * ink-core's `PAIRS` (src/modes.ts): no new pair ever takes this id.
 */
export const SUMMARY_BUTTON_ID = FIRST_BUTTON_ID + 100;

export type SummaryDeps = {
  read: () => Promise<Outcome<LassoQuery, CallFailure>>;
  summarize: (
    term: string,
    languages: readonly LanguageCode[],
  ) => Promise<SummaryResult>;
  insert: (box: TextBoxInput) => Promise<Result<boolean>>;
  log: (line: string) => void;
  now: () => number;
};

const DEVICE: SummaryDeps = {
  read: readLasso,
  summarize: (term, languages) => summarize(term, languages),
  insert: insertText,
  log: line => console.log(`Lookup: ${line}`),
  now: Date.now,
};

/** The text box's text: the article's title, its summary, then the source, as a dictionary entry. */
export function summaryText(summary: Summary): string {
  return [summary.title, summary.text, copy['summary.source']].join('\n');
}

export type Summarized = {ok: boolean; text: string};

/** One press of «Insert Summary»; the value says what was inserted, or why nothing was. */
export async function summaryLasso(
  deps: SummaryDeps = DEVICE,
): Promise<Summarized> {
  const started = deps.now();
  const read = await deps.read();
  if (!read.ok) {
    deps.log(`summary: lasso failed: ${read.code} ${read.message}`);
    return {ok: false, text: read.message};
  }
  const {query, place} = read.value;
  const recognized = deps.now();
  deps.log(
    `summary: "${query}", lasso and recognition ${recognized - started} ms`,
  );
  if (!place) {
    deps.log(`summary: no lasso rect for "${query}"`);
    return {ok: false, text: copy['error.place']};
  }
  const {summary, errors} = await deps.summarize(query, LANGUAGES);
  const answered = deps.now();
  errors.forEach(error => deps.log(`summary: ${error}`));
  deps.log(
    summary
      ? `summary: «${summary.title}» from ${summary.language} in ${
          answered - recognized
        } ms`
      : `summary: none for "${query}" in ${LANGUAGES.join(', ')}, ${
          answered - recognized
        } ms`,
  );
  const text = summary
    ? summaryText(summary)
    : errors.length > 0
    ? copy['summary.failed'](query)
    : copy['summary.none'](query);
  const placed = await insertBox(text, place, deps.insert, deps.log, 'summary');
  if (!placed.ok) {
    return {
      ok: false,
      text:
        placed.why === 'place' ? copy['error.place'] : copy['summary.insert'],
    };
  }
  deps.log(
    `summary: inserted at ${JSON.stringify(placed.rect)}, insert ${
      deps.now() - answered
    } ms, total ${deps.now() - started} ms`,
  );
  return {ok: summary !== null, text};
}
