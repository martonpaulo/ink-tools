/**
 * The pen guide of Crop (#132) and Erase (#134): the person draws with the pen over a picture,
 * lassoes the picture and the strokes together, and presses the button. A pen stroke over a picture
 * joins the same lasso [measured, #132], so the strokes are read from `getLassoElements` and no
 * plugin view needs the pen. The guide strokes are deleted first, so the lasso preview no longer
 * shows their ink; then the picture is lassoed alone by its rect, as page.ts does, and the edit runs.
 * shortcut: every stroke in the lasso counts as the guide, so other ink lassoed with the picture
 * joins the guide and is deleted too; and an edit that fails after the delete leaves the picture as
 * it was without its guide. Save and put back the strokes (elements.ts) if the device round shows
 * either case matters.
 */
import type {Rect} from '@ink-tools/ink-core';
import {
  batchUpdatePageElements,
  readEmrRange,
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
} from '@ink-tools/sn-adapter/official';
import type {Done} from './edit';

type Lassoed = {
  type?: number;
  numInPage?: number;
  picture?: {rect?: Rect};
};

/** The lasso's one picture and its guide strokes. */
export type Guided = {picture: Rect; guides: object[]};

/** Each edit's reasons for a lasso that is not one picture and its guide; press.ts toasts them. */
export type GuideReasons = {
  /** The lasso holds the picture and no stroke. */
  none: string;
  /** The lasso is not exactly one picture and at least one stroke. */
  mixed: string;
};

/**
 * The lassoed picture and the strokes drawn on it, or the reason the lasso is not that: exactly
 * one picture, at least one stroke, and nothing else.
 */
export function splitGuides(elements: object[], reasons: GuideReasons): Guided | string {
  const pictures: Rect[] = [];
  const guides: object[] = [];
  for (const element of elements) {
    const each = element as Lassoed;
    if (each.type === PICTURE_TYPE && each.picture?.rect) {
      pictures.push(each.picture.rect);
    } else if (each.type === STROKE_TYPE) {
      guides.push(element);
    } else {
      return reasons.mixed;
    }
  }
  if (pictures.length !== 1) {
    return reasons.mixed;
  }
  return guides.length === 0 ? reasons.none : {picture: pictures[0], guides};
}

/**
 * A lassoed stroke's points in page pixels. Page reads give pixels (docs/supernote.md › Screen and
 * units); a lasso read is taken to give them too [inference, #132], so EMR units are caught as a
 * pen-up stroke's are: a point off the page.
 */
export async function pagePoints(
  points: readonly PenPoint[],
  size: Size,
  range: () => Promise<Result<EmrRange>>,
): Promise<Result<{points: PenPoint[]; emr: boolean}>> {
  if (!offPage(points, size)) {
    return {ok: true, value: {points: [...points], emr: false}};
  }
  const emr = await range();
  return emr.ok
    ? {ok: true, value: {points: emrToPage(points, size, emr.value), emr: true}}
    : emr;
}

export type GuideDeps = {
  lassoed: () => Promise<Result<object[]>>;
  notePath: () => Promise<Result<string>>;
  pageNum: () => Promise<Result<number>>;
  pageSize: (note: string, page: number) => Promise<Result<Size>>;
  points: (element: object) => Promise<Result<PenPoint[]>>;
  /** The EMR range of the screen, read through its display size (#269). */
  range: () => Promise<Result<EmrRange>>;
  remove: (nums: number[], page: number) => Promise<Result<boolean>>;
  recycle: (element: object) => Promise<unknown>;
  lasso: (rect: Rect) => Promise<Result<boolean>>;
  log: (line: string) => void;
};

export const GUIDE_DEVICE: GuideDeps = {
  lassoed: getLassoElements,
  notePath: getCurrentFilePath,
  pageNum: getCurrentPageNum,
  pageSize: getPageSize,
  points: strokePoints,
  range: readEmrRange,
  // An empty insert list: batchUpdatePageElements only deletes [inference, #132].
  remove: (nums, page) => batchUpdatePageElements(nums, [], page),
  recycle: recycleElement,
  lasso: lassoElements,
  log: line => console.log(`Retouch: ${line}`),
};

/** The guide as read: the picture's rect and each stroke's points in page pixels. */
export type Guide = {picture: Rect; strokes: PenPoint[][]; emr: boolean};

/**
 * What an edit makes of its guide: the edit to run once the guide is gone, or the reason it changes
 * nothing, which leaves the guide on the page.
 */
export type GuidePlan = (() => Promise<Done>) | string;

const why = (what: string, result: {code: number; message: string}) =>
  `${what}: ${result.code} ${result.message}`;

/**
 * Reads the lassoed picture and its guide, lets `plan` judge it, then deletes the guide, lassoes
 * the picture alone and runs the planned edit. Every lassoed element is recycled at the end.
 */
export async function runGuided(
  deps: GuideDeps,
  reasons: GuideReasons,
  plan: (guide: Guide) => GuidePlan,
): Promise<Done> {
  const lassoed = await deps.lassoed();
  if (!lassoed.ok) {
    return {kind: 'failed', why: why('getLassoElements', lassoed)};
  }
  try {
    return await guided(lassoed.value, deps, reasons, plan);
  } finally {
    await Promise.all(lassoed.value.map(element => deps.recycle(element)));
  }
}

async function guided(
  elements: object[],
  deps: GuideDeps,
  reasons: GuideReasons,
  plan: (guide: Guide) => GuidePlan,
): Promise<Done> {
  const split = splitGuides(elements, reasons);
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
  const strokes: PenPoint[][] = [];
  const nums: number[] = [];
  let emr = false;
  for (const element of split.guides) {
    const read = await deps.points(element);
    if (!read.ok) {
      return {kind: 'failed', why: why('stroke points', read)};
    }
    const onPage = await pagePoints(read.value, size.value, deps.range);
    if (!onPage.ok) {
      return {kind: 'failed', why: why('EMR range', onPage)};
    }
    strokes.push(onPage.value.points);
    emr = emr || onPage.value.emr;
    const num = (element as Lassoed).numInPage;
    if (typeof num !== 'number') {
      return {kind: 'failed', why: 'a guide stroke has no numInPage'};
    }
    nums.push(num);
  }
  const edit = plan({picture: split.picture, strokes, emr});
  if (typeof edit === 'string') {
    return {kind: 'nothing', why: edit};
  }
  const removed = await deps.remove(nums, page.value);
  if (!removed.ok || removed.value === false) {
    // No edit runs: the picture and its guide stay as they were, and the view says so (#556).
    return {
      kind: 'failed',
      why: removed.ok ? 'the guide was not deleted' : why('delete the guide', removed),
      cause: 'guide-kept',
    };
  }
  const relassoed = await deps.lasso(split.picture);
  if (!relassoed.ok || relassoed.value !== true) {
    return {
      kind: 'failed',
      why: relassoed.ok ? 'the picture could not be lassoed again' : why('lasso', relassoed),
    };
  }
  return edit();
}
