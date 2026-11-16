/**
 * The text box a text button writes below the lassoed word, and the device lasso read it starts
 * from, shared by «Insert definition» (#115) and «Insert translation» (#158).
 */
import {
  isFree,
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
  occupiedRects,
  recognizeElements,
  Result,
  TextBoxInput,
  THROWN_CODE,
} from '@supernote-tools/sn-adapter/official';

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

/** The lassoed word and its place, read on the tablet. */
export function readLasso(): Promise<Outcome<LassoQuery, CallFailure>> {
  return readLassoQuery<CallFailure>({
    getLassoElements,
    getLassoRect,
    getCurrentFilePath,
    getCurrentPageNum,
    getPageSize,
    recognizeElements,
    getOccupied: (path, page) =>
      occupiedRects(path, page, line => console.log(`Lookup: ${line}`)),
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
    const why = inserted.ok
      ? 'answered false'
      : `${inserted.code} ${inserted.message}`;
    log(`${tag}: insertText ${why}`);
    return {ok: false, why: 'insert'};
  }
  return {ok: true, rect};
}
