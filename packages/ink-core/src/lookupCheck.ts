/**
 * What a lookup may use from a lasso read, one rule for every Lookup button (#165, #166): the
 * recognized words only, and a lasso rect only when it is on the page.
 */
import type {LassoPlace, LassoQuery, Rect, Size} from './lasso';
import {writableSize} from './pageArea';

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
 * pasted selection answers its own local rect (#165, docs/supernote.md), with a negative side
 * (`{-40, 0, 140, 181}`, Nomad) or at the page's corner (`{0, 0, 214, 180}`, Manta, device round 6).
 * With the page read's element rects (`occupied`, #152), a rect that touches none of them is
 * refused too: the lassoed elements are on the page, so a true lasso rect touches them.
 * shortcut: the rect is checked against every element of the page, not the lassoed ones, which cost
 * two bridge calls per stroke; a local rect over other ink still passes; read the lassoed elements'
 * own rects once that is seen.
 */
export function rectProblem(rect: Rect, pageSize: Size, occupied?: Rect[]): string | null {
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
  if (occupied && occupied.length > 0 && !occupied.some(element => touches(rect, element))) {
    return `the lasso rect ${text} touches no element of the page`;
  }
  return null;
}

/**
 * True when the rect is a lasso on the page whose middle lies in the note's page bar's band (#577,
 * #589): the word has no room below or above it that a tool may use. A lasso pads its ink, so a
 * word in the page's lowest 100 px has a rect past the page's bottom edge (ink at y 2472-2512 gave
 * `{top: 2403, bottom: 2583}` on a 2560 px page, tablet row 139); only its bottom may pass the page.
 * A pasted selection's local rect stays at the page's top or has a negative side, never here.
 */
export function underPageBar(rect: Rect, pageSize: Size): boolean {
  const onPage =
    rect.left >= 0 && rect.top >= 0 && rect.left < rect.right && rect.top < rect.bottom &&
    rect.right <= pageSize.width && rect.top < pageSize.height;
  return onPage && (rect.top + rect.bottom) / 2 >= writableSize(pageSize).height;
}

/** True when the two rects overlap or share an edge. */
function touches(a: Rect, b: Rect): boolean {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
}

export type LookupRefusal = {
  /**
   * `unplaced`: the rect cannot place anything; `underBar`: the word sits under the page bar;
   * `unreadable`: no word was recognized.
   */
  why: 'unplaced' | 'underBar' | 'unreadable';
  /** For the log. */
  message: string;
  /** Where a note may be written below the selection; null when the rect is not on the page. */
  place: LassoPlace | null;
};

/** The read as a lookup uses it: its words and a usable place, or why the press stops. */
export function checkLookup(
  read: LassoQuery,
): {ok: true; value: LassoQuery} | ({ok: false} & LookupRefusal) {
  if (read.place && underPageBar(read.place.rect, read.place.pageSize)) {
    return {
      ok: false,
      why: 'underBar',
      message: `the lasso rect ${JSON.stringify(read.place.rect)} sits under the page bar`,
      place: null,
    };
  }
  const problem = read.place
    ? rectProblem(read.place.rect, read.place.pageSize, read.place.occupied)
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
