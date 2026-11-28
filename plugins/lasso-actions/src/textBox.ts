/**
 * The text box a text button writes below the lassoed word, and the device lasso read it starts
 * from, shared by «Insert definition» (#115) and «Insert translation» (#158).
 */
import {ToastAndroid} from 'react-native';
import {
  checkLookup,
  isFree,
  LassoPlace,
  LassoQuery,
  Outcome,
  placeRect,
  readLassoQuery,
  Rect,
} from '@ink-tools/ink-core';
import {
  CallFailure,
  EMPTY_LASSO_CODE,
  fail,
  getCurrentFilePath,
  getCurrentPageNum,
  getLassoElements,
  getLassoRect,
  getPageSize,
  occupiedRects,
  recognizeElements,
  Result,
  TextBoxInput,
  THROWN_CODE,
  whyNot,
} from '@ink-tools/sn-adapter/official';
import type {Problem} from '@ink-tools/ui-kit';
import {copy} from './copy';

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

/** Why a host call did not answer true; sn-adapter owns it, the runs import it from here. */
export {whyNot};

/** One line of Lookup's log. */
export const lookupLog = (line: string) => console.log(`Lookup: ${line}`);

/** The lassoed word and its place, read on the tablet. */
export function readLasso(): Promise<Outcome<LassoQuery, CallFailure>> {
  return readLassoQuery<CallFailure>({
    getLassoElements,
    getLassoRect,
    getCurrentFilePath,
    getCurrentPageNum,
    getPageSize,
    recognizeElements,
    getOccupied: (path, page) => occupiedRects(path, page, lookupLog),
    log: lookupLog,
    emptyLasso: message => fail(EMPTY_LASSO_CODE, message),
    failure: message => fail(THROWN_CODE, message),
  });
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
    place.occupied,
  );
}

export type Placed =
  | {ok: true; rect: Rect}
  | {ok: false; why: 'place' | 'insert'};

/**
 * Writes `text` in its box below the word. Each step is logged under `tag`; a box over the ink
 * is still written, and logged, as there is no free place near the word.
 */
export async function insertBox(
  text: string,
  place: LassoPlace,
  insert: (box: TextBoxInput) => Promise<Result<boolean>>,
  log: (line: string) => void,
  tag: string,
): Promise<Placed> {
  const rect = boxRect(text, place);
  if (!rect) {
    log(`${tag}: no room below the lasso`);
    return {ok: false, why: 'place'};
  }
  if (place.occupied && !isFree(rect, place.occupied)) {
    log(`${tag}: no free place below or above the word: over the ink`);
  }
  const inserted = await insert({text, rect, fontSize: FONT_SIZE});
  if (!inserted.ok || !inserted.value) {
    log(`${tag}: insertText ${whyNot(inserted)}`);
    return {ok: false, why: 'insert'};
  }
  return {ok: true, rect};
}

/** A short toast at the bottom of the note (docs/supernote.md, «What a plugin can show»). */
export function showToast(text: string): void {
  ToastAndroid.show(text, ToastAndroid.SHORT);
}

/** The Error state of a lasso that is a pasted piece with no place on the page yet (#165, #428). */
export const UNPLACED: Problem = {
  what: copy['error.unplacedWhat'],
  reason: copy['error.unplaced'],
};

/** The Error state of a word under the note's page bar, where nothing can be placed (#577). */
export const UNDER_BAR: Problem = {
  what: copy['error.underBarWhat'],
  reason: copy['error.underBar'],
};

/** The Error state a refused read holds, or null for a read with no word, which writes a note. */
export function refusalProblem(why: 'unplaced' | 'underBar' | 'unreadable'): Problem | null {
  return why === 'unplaced' ? UNPLACED : why === 'underBar' ? UNDER_BAR : null;
}

/** What a text button's press needs to stop on a read it may not use (#165, #166). */
export type CheckDeps = {
  insert: (box: TextBoxInput) => Promise<Result<boolean>>;
  log: (line: string) => void;
  /** Holds a failure on ui-kit's Error state, which opens the view (#256, #428). */
  fail: (problem: Problem) => void;
};

/**
 * The read as a text button uses it, through ink-core's `checkLookup`: its words and a place on
 * the page; else why the press stops. A rect that is not on the page places nothing and holds the
 * Error state (#165, #428); a recognition with no word writes so below the selection, before any lookup (#166).
 */
export async function checkedRead(
  read: Outcome<LassoQuery, CallFailure>,
  deps: CheckDeps,
  tag: string,
): Promise<{ok: true; value: LassoQuery} | {ok: false; text: string}> {
  if (!read.ok) {
    deps.log(`${tag}: lasso failed: ${read.code} ${read.message}`);
    return {ok: false, text: read.message};
  }
  const checked = checkLookup(read.value);
  if (checked.ok) {
    return checked;
  }
  deps.log(`${tag}: ${checked.why}, ${checked.message}`);
  const problem = refusalProblem(checked.why);
  if (problem) {
    deps.fail(problem);
    return {ok: false, text: copy[checked.why === 'underBar' ? 'error.underBar' : 'error.unplaced']};
  }
  if (checked.place) {
    await insertBox(
      copy['error.unreadable'],
      checked.place,
      deps.insert,
      deps.log,
      tag,
    );
  }
  return {ok: false, text: copy['error.unreadable']};
}
