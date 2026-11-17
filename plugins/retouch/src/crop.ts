/**
 * Crop with the pen (#132): the person draws a rectangle with the pen over a picture, lassoes the
 * picture and the rectangle together, and presses Crop. A pen stroke over a picture joins the same
 * lasso [measured, #132], so the rectangle is read from `getLassoElements` and no plugin view needs
 * the pen. The guide strokes are deleted first, so the lasso preview no longer shows their ink;
 * then the picture is lassoed alone by its rect, as page.ts does, and `runEdit` cuts it to the box.
 * shortcut: every stroke in the lasso counts as the guide, so other ink lassoed with the picture
 * widens the box and is deleted too; and a crop that fails after the delete leaves the picture as
 * it was without its guide. Save and put back the strokes (elements.ts) if the device round shows
 * either case matters.
 */
import type {Rect} from '@supernote-tools/ink-core';
import {
  batchUpdatePageElements,
  emrRange,
  EmrRange,
  emrToPage,
  getCurrentFilePath,
  getCurrentPageNum,
  getLassoElements,
  getPageSize,
  lassoElements,
  offPage,
  PenPoint,
  PICTURE_TYPE,
  recycleElement,
  Result,
  Size,
  STROKE_TYPE,
  strokePoints,
} from '@supernote-tools/sn-adapter/official';
import {Box, Done, runEdit, sizeOf} from './edit';
import {NO_OPTIONS} from './native';

/** Why a Crop press changed nothing; src/press.ts turns each into its toast. */
export const NO_GUIDE = 'the lasso holds no rectangle drawn on the picture';
export const NOT_PICTURE_AND_GUIDE = 'the lasso is not one picture and its rectangle';
export const GUIDE_OUTSIDE = 'the rectangle is not on the picture';

/**
 * The smallest side of a crop, in page pixels (about 1.4 mm on the Manta): a smaller box is a slip
 * of the pen, not a rectangle.
 */
export const MIN_CROP_PX = 16;

type Lassoed = {
  type?: number;
  numInPage?: number;
  picture?: {rect?: Rect};
};

/** The lasso's one picture and its guide strokes. */
export type Guided = {picture: Rect; guides: object[]};

/**
 * The lassoed picture and the strokes drawn on it, or the reason the lasso is not that: exactly
 * one picture, at least one stroke, and nothing else.
 */
export function splitLasso(elements: object[]): Guided | string {
  const pictures: Rect[] = [];
  const guides: object[] = [];
  for (const element of elements) {
    const each = element as Lassoed;
    if (each.type === PICTURE_TYPE && each.picture?.rect) {
      pictures.push(each.picture.rect);
    } else if (each.type === STROKE_TYPE) {
      guides.push(element);
    } else {
      return NOT_PICTURE_AND_GUIDE;
    }
  }
  if (pictures.length !== 1) {
    return NOT_PICTURE_AND_GUIDE;
  }
  return guides.length === 0 ? NO_GUIDE : {picture: pictures[0], guides};
}

/**
 * The box the guide's points draw, in the picture's pixels from its top left: the lasso preview is
 * the picture at its page size (#130), so a page pixel maps to the picture by its rect's top left.
 * The box is cut to the picture; null when it leaves less than MIN_CROP_PX on a side.
 */
export function cropBox(picture: Rect, points: readonly PenPoint[]): Box | null {
  if (points.length === 0) {
    return null;
  }
  const size = sizeOf(picture);
  const clamp = (value: number, most: number) => Math.min(Math.max(value, 0), most);
  const xs = points.map(point => point.x - picture.left);
  const ys = points.map(point => point.y - picture.top);
  const left = clamp(Math.floor(Math.min(...xs)), size.width);
  const top = clamp(Math.floor(Math.min(...ys)), size.height);
  const right = clamp(Math.ceil(Math.max(...xs)), size.width);
  const bottom = clamp(Math.ceil(Math.max(...ys)), size.height);
  const width = right - left;
  const height = bottom - top;
  return width < MIN_CROP_PX || height < MIN_CROP_PX
    ? null
    : {left, top, width, height};
}

/**
 * A lassoed stroke's points in page pixels. Page reads give pixels (docs/supernote.md › Screen and
 * units); a lasso read is taken to give them too [inference, #132], so EMR units are caught as a
 * pen-up stroke's are: a point off the page.
 */
export function pagePoints(
  points: readonly PenPoint[],
  size: Size,
  range: () => Result<EmrRange>,
): Result<{points: PenPoint[]; emr: boolean}> {
  if (!offPage(points, size)) {
    return {ok: true, value: {points: [...points], emr: false}};
  }
  const emr = range();
  return emr.ok
    ? {ok: true, value: {points: emrToPage(points, size, emr.value), emr: true}}
    : emr;
}

export type CropDeps = {
  lassoed: () => Promise<Result<object[]>>;
  notePath: () => Promise<Result<string>>;
  pageNum: () => Promise<Result<number>>;
  pageSize: (note: string, page: number) => Promise<Result<Size>>;
  points: (element: object) => Promise<Result<PenPoint[]>>;
  range: (size: Size) => Result<EmrRange>;
  remove: (nums: number[], page: number) => Promise<Result<boolean>>;
  recycle: (element: object) => Promise<unknown>;
  lasso: (rect: Rect) => Promise<Result<boolean>>;
  crop: (box: Box) => Promise<Done>;
  log: (line: string) => void;
};

const DEVICE: CropDeps = {
  lassoed: getLassoElements,
  notePath: getCurrentFilePath,
  pageNum: getCurrentPageNum,
  pageSize: getPageSize,
  points: strokePoints,
  range: emrRange,
  // An empty insert list: batchUpdatePageElements only deletes [inference, #132].
  remove: (nums, page) => batchUpdatePageElements(nums, [], page),
  recycle: recycleElement,
  lasso: lassoElements,
  crop: box => runEdit('crop', undefined, {...NO_OPTIONS, box}),
  log: line => console.log(`Retouch: ${line}`),
};

const why = (what: string, result: {code: number; message: string}) =>
  `${what}: ${result.code} ${result.message}`;

/** Crops the lassoed picture to the rectangle drawn on it, then the guide is gone. */
export async function runCrop(deps: CropDeps = DEVICE): Promise<Done> {
  const lassoed = await deps.lassoed();
  if (!lassoed.ok) {
    return {kind: 'failed', why: why('getLassoElements', lassoed)};
  }
  try {
    return await cropGuided(lassoed.value, deps);
  } finally {
    await Promise.all(lassoed.value.map(element => deps.recycle(element)));
  }
}

async function cropGuided(elements: object[], deps: CropDeps): Promise<Done> {
  const split = splitLasso(elements);
  if (typeof split === 'string') {
    return {kind: 'nothing', why: split};
  }
  const note = await deps.notePath();
  if (!note.ok) {
    return {kind: 'failed', why: why('getCurrentFilePath', note)};
  }
  const page = await deps.pageNum();
  if (!page.ok) {
    return {kind: 'failed', why: why('getCurrentPageNum', page)};
  }
  const size = await deps.pageSize(note.value, page.value);
  if (!size.ok) {
    return {kind: 'failed', why: why('getPageSize', size)};
  }
  const points: PenPoint[] = [];
  const nums: number[] = [];
  let emr = false;
  for (const guide of split.guides) {
    const read = await deps.points(guide);
    if (!read.ok) {
      return {kind: 'failed', why: why('stroke points', read)};
    }
    const onPage = pagePoints(read.value, size.value, () => deps.range(size.value));
    if (!onPage.ok) {
      return {kind: 'failed', why: why('EMR range', onPage)};
    }
    points.push(...onPage.value.points);
    emr = emr || onPage.value.emr;
    const num = (guide as Lassoed).numInPage;
    if (typeof num !== 'number') {
      return {kind: 'failed', why: 'a guide stroke has no numInPage'};
    }
    nums.push(num);
  }
  const box = cropBox(split.picture, points);
  deps.log(
    `crop: ${split.guides.length} guide strokes, ${points.length} points` +
      ` in ${emr ? 'EMR' : 'page px'}, box ${box ? JSON.stringify(box) : 'none'}`,
  );
  if (!box) {
    return {kind: 'nothing', why: GUIDE_OUTSIDE};
  }
  const removed = await deps.remove(nums, page.value);
  if (!removed.ok || removed.value === false) {
    return {
      kind: 'failed',
      why: removed.ok ? 'the guide was not deleted' : why('delete the guide', removed),
    };
  }
  const relassoed = await deps.lasso(split.picture);
  if (!relassoed.ok || relassoed.value !== true) {
    return {
      kind: 'failed',
      why: relassoed.ok ? 'the picture could not be lassoed again' : why('lasso', relassoed),
    };
  }
  return deps.crop(box);
}
