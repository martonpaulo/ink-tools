/**
 * Placement at the lassoed word (#109, from Ink2Pic #20, #39, #70): a Picture element just below
 * the word, never over it, inserted with insertPageElements; beside it, or in place of it, when
 * the person chose so. When anything fails, the caller falls back to the host's own placement.
 */
import {loggerOf, type LassoPlace, type Logged, type Rect, type Size} from './lasso';
import type {Outcome} from './outcome';

/** Space between the word and the picture, in page pixels. */
export const PLACE_GAP = 24;
/**
 * The smallest band a picture is placed in: the host's own insertImage minimum per side. A lower
 * band would shrink the picture out of sight.
 */
export const MIN_PLACE_BAND = 100;

/** Where the picture goes, the person's setting; below the word is the default. */
export type Placement = 'below' | 'replace' | 'beside';

type Picture = {width: number; height: number};

/**
 * The picture's rect, left-aligned with the word: just below it, else just above it, so it never
 * covers the handwriting. When it fits neither, it shrinks, keeping its proportions, into the
 * larger free band; it also shrinks to the page width. Null when that band is lower than
 * MIN_PLACE_BAND, so the caller falls back to insertImage.
 */
function belowRect(lasso: Rect, picture: Picture, page: Size): Rect | null {
  const below = lasso.bottom + PLACE_GAP;
  const aboveRoom = Math.max(0, lasso.top - PLACE_GAP);
  const belowRoom = Math.max(0, page.height - below);
  const fitWidth = Math.min(1, page.width / picture.width);
  let height = picture.height * fitWidth;
  const goesBelow = height <= belowRoom || belowRoom >= aboveRoom;
  const room = goesBelow ? belowRoom : aboveRoom;
  if (room < MIN_PLACE_BAND) {
    return null;
  }
  const scale = fitWidth * Math.min(1, room / height);
  const width = Math.round(picture.width * scale);
  height = Math.round(picture.height * scale);
  const left = Math.max(0, Math.min(lasso.left, page.width - width));
  const top = goesBelow ? below : aboveRoom - height;
  return {left, top, right: left + width, bottom: top + height};
}

/** The picture scaled down, keeping its proportions, to fit `width` x `height`; never up. */
function fitInto(picture: Picture, width: number, height: number): Picture {
  const scale = Math.min(1, width / picture.width, height / picture.height);
  return {
    width: Math.round(picture.width * scale),
    height: Math.round(picture.height * scale),
  };
}

/**
 * In place of the word: from the word's top-left corner, the handwriting the caller then deletes;
 * shrunk to the page. Null when less than MIN_PLACE_BAND is left below the word's top.
 */
function inPlaceRect(lasso: Rect, picture: Picture, page: Size): Rect | null {
  const room = page.height - lasso.top;
  if (room < MIN_PLACE_BAND) {
    return null;
  }
  const size = fitInto(picture, page.width, room);
  const left = Math.max(0, Math.min(lasso.left, page.width - size.width));
  return {
    left,
    top: lasso.top,
    right: left + size.width,
    bottom: lasso.top + size.height,
  };
}

/**
 * Beside the word: to its right, top-aligned, else to its left when that side has more room;
 * shrunk into that band. Null when neither side has MIN_PLACE_BAND, so the caller places it below.
 */
function besideRect(lasso: Rect, picture: Picture, page: Size): Rect | null {
  const rightRoom = Math.max(0, page.width - lasso.right - PLACE_GAP);
  const leftRoom = Math.max(0, lasso.left - PLACE_GAP);
  const goesRight = picture.width <= rightRoom || rightRoom >= leftRoom;
  const size = fitInto(
    picture,
    goesRight ? rightRoom : leftRoom,
    Math.max(0, page.height - lasso.top),
  );
  if (size.width < MIN_PLACE_BAND || size.height < MIN_PLACE_BAND) {
    return null;
  }
  const left = goesRight
    ? lasso.right + PLACE_GAP
    : lasso.left - PLACE_GAP - size.width;
  const top = Math.max(0, Math.min(lasso.top, page.height - size.height));
  return {left, top, right: left + size.width, bottom: top + size.height};
}

/** True when the two rects share area; touching edges do not count. */
function crosses(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** True when no occupied rect crosses `rect`. */
export function isFree(rect: Rect, occupied: readonly Rect[]): boolean {
  return !occupied.some(other => crosses(rect, other));
}

/**
 * The first free place for `rect`'s size near the word (#152): moved down past each occupied rect
 * it crosses, PLACE_GAP below it, until it is free or leaves the page; else the same upwards from
 * PLACE_GAP above the word. Null when neither direction has a free place of that size; it never
 * shrinks the rect.
 */
export function freeRect(
  lasso: Rect,
  rect: Rect,
  page: Size,
  occupied: readonly Rect[],
): Rect | null {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const at = (top: number): Rect => ({
    left: rect.left,
    top,
    right: rect.left + width,
    bottom: top + height,
  });
  for (let top = lasso.bottom + PLACE_GAP; top + height <= page.height; ) {
    const hits = occupied.filter(other => crosses(at(top), other));
    if (hits.length === 0) {
      return at(top);
    }
    top = Math.max(...hits.map(hit => hit.bottom)) + PLACE_GAP;
  }
  for (let bottom = lasso.top - PLACE_GAP; bottom - height >= 0; ) {
    const hits = occupied.filter(other => crosses(at(bottom - height), other));
    if (hits.length === 0) {
      return at(bottom - height);
    }
    bottom = Math.min(...hits.map(hit => hit.top)) - PLACE_GAP;
  }
  return null;
}

/** Today's below rect moved into free space when the page's ink is known; else it as it is. */
function freeBelowRect(
  lasso: Rect,
  picture: Picture,
  page: Size,
  occupied: readonly Rect[],
): Rect | null {
  const rect = belowRect(lasso, picture, page);
  if (!rect || isFree(rect, occupied)) {
    return rect;
  }
  return freeRect(lasso, rect, page, occupied) ?? rect;
}

/**
 * The picture's rect for the person's placement; null when it fits nowhere near the word.
 * `occupied` holds the page's other strokes, pictures and text boxes (#152): below and beside
 * avoid them when a free place exists, else keep today's rect; `replace` covers the word on purpose.
 */
export function placeRect(
  lasso: Rect,
  picture: Picture,
  page: Size,
  placement: Placement = 'below',
  occupied: readonly Rect[] = [],
): Rect | null {
  switch (placement) {
    case 'replace':
      return inPlaceRect(lasso, picture, page);
    case 'beside': {
      const beside = besideRect(lasso, picture, page);
      return beside && isFree(beside, occupied)
        ? beside
        : freeBelowRect(lasso, picture, page, occupied);
    }
    case 'below':
      return freeBelowRect(lasso, picture, page, occupied);
  }
}

/** The plugin's SDK calls and failure shape that placeAtLasso needs. */
export type PlaceHost<F extends {ok: false; message: string}> = {
  /** The SDK's picture element type. */
  pictureType: number;
  createElement(type: number): Promise<Outcome<Record<string, unknown>, F>>;
  insertPageElements(
    elements: object[],
    page: number,
    layer: number,
  ): Promise<Outcome<boolean, F>>;
  failure(message: string): F;
  logged?: Logged<F>;
  /** One line for the plugin's log. */
  log?: (line: string) => void;
};

/** Inserts the picture beside the lasso; its value is the rect the picture was placed at. */
export async function placeAtLasso<F extends {ok: false; message: string}>(
  host: PlaceHost<F>,
  path: string,
  picture: Picture,
  place: LassoPlace,
  placement: Placement = 'below',
): Promise<Outcome<Rect, F>> {
  const logged = loggerOf(host);
  const occupied = place.occupied ?? [];
  const rect = placeRect(place.rect, picture, place.pageSize, placement, occupied);
  if (!rect) {
    return host.failure(`no band of ${MIN_PLACE_BAND} px beside the lasso`);
  }
  if (!isFree(rect, occupied)) {
    host.log?.(`place: no free place of ${rect.right - rect.left} x ${rect.bottom - rect.top} px, today's place over the ink`);
  }
  const created = await logged('createElement(picture)', () =>
    host.createElement(host.pictureType),
  );
  if (!created.ok) {
    return created;
  }
  const element = {
    ...created.value,
    type: host.pictureType,
    pageNum: place.page,
    layerNum: 0,
    picture: {picturePath: path, rect},
  };
  const inserted = await logged(
    `insertPageElements(picture at ${JSON.stringify(rect)})`,
    () => host.insertPageElements([element], place.page, 0),
  );
  if (!inserted.ok) {
    return inserted;
  }
  return inserted.value
    ? {ok: true, value: rect}
    : host.failure('insertPageElements answered false');
}
