/**
 * What a lookup may use from a lasso read, one rule for every Lookup button (#165, #166): the
 * recognized words only, and a lasso rect only when it is on the page.
 */
import type {LassoPlace, LassoQuery, Rect, Size} from './lasso';

/**
 * The recognized text reduced to its words: a word holds at least one letter of any script, and
 * loses the punctuation at its ends; a word's inner hyphen or apostrophe stays. Null when no word
 * is left: a sticker read as «• :.\n÷» names nothing to look up (#166).
 */
export function lookupWords(text: string): string | null {
  const words = text
    .normalize('NFC')
    .split(/\s+/u)
    .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(word => /\p{L}/u.test(word));
  return words.length > 0 ? words.join(' ') : null;
}

/**
 * Why a lasso rect is not where the selection is on the page, or null when it can be used: a
 * pasted selection answers its own local rect, with a negative side (#165, docs/supernote.md).
 * shortcut: the rect is checked against the page only, not against the lassoed elements' own
 * rects, which cost two bridge calls per stroke; add that once a local rect with no negative side
 * is measured.
 */
export function rectProblem(rect: Rect, pageSize: Size): string | null {
  const text = JSON.stringify(rect);
  if (rect.left < 0 || rect.top < 0) {
    return `the lasso rect ${text} has a negative side`;
  }
  if (rect.right <= rect.left || rect.bottom <= rect.top) {
    return `the lasso rect ${text} is empty`;
  }
  if (rect.right > pageSize.width || rect.bottom > pageSize.height) {
    return `the lasso rect ${text} is past the page`;
  }
  return null;
}

export type LookupRefusal = {
  /** `unplaced`: the rect cannot place anything; `unreadable`: no word was recognized. */
  why: 'unplaced' | 'unreadable';
  /** For the log. */
  message: string;
  /** Where a note may be written below the selection; null when the rect is not on the page. */
  place: LassoPlace | null;
};

/** The read as a lookup uses it: its words and a usable place, or why the press stops. */
export function checkLookup(
  read: LassoQuery,
): {ok: true; value: LassoQuery} | ({ok: false} & LookupRefusal) {
  const problem = read.place
    ? rectProblem(read.place.rect, read.place.pageSize)
    : null;
  if (problem) {
    return {ok: false, why: 'unplaced', message: problem, place: null};
  }
  const words = lookupWords(read.query);
  if (!words) {
    return {
      ok: false,
      why: 'unreadable',
      message: `no word in ${JSON.stringify(read.query)}`,
      place: read.place,
    };
  }
  return {ok: true, value: {...read, query: words}};
}
