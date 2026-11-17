/**
 * One edit on every picture of the page (#140): «Enhance All Images» and «Undo All Images». The
 * host gives pixels only through the lasso preview (docs/supernote.md, #130), so each picture is
 * lassoed by its rect in turn and runs through the one-picture edit, `runEdit`. Its check that the
 * lasso holds exactly one picture skips a picture with ink across it, which the rect lasso would
 * take too (#168), so the ink is never baked into the picture. Undo All Images takes back the last
 * step of each picture, so it brings back every picture Enhance All Images changed.
 */
import type {Rect} from '@ink-tools/ink-core';
import {
  getCurrentFilePath,
  getCurrentPageNum,
  getElements,
  lassoElements,
  PICTURE_TYPE,
  recycleElement,
  Result,
} from '@ink-tools/sn-adapter/official';
import {Done, runEdit} from './edit';
import {EditId} from './edits';

/** What a page-wide button runs on each picture. */
export const PAGE_EDITS: Partial<Record<EditId, EditId>> = {
  enhance_all: 'enhance',
  undo_all: 'undo',
};

export type PageDeps = {
  notePath: () => Promise<Result<string>>;
  pageNum: () => Promise<Result<number>>;
  elements: (page: number, note: string) => Promise<Result<object[]>>;
  recycle: (element: object) => Promise<unknown>;
  lasso: (rect: Rect) => Promise<Result<boolean>>;
  edit: (edit: EditId) => Promise<Done>;
  log: (line: string) => void;
};

const DEVICE: PageDeps = {
  notePath: getCurrentFilePath,
  pageNum: getCurrentPageNum,
  elements: getElements,
  recycle: recycleElement,
  lasso: lassoElements,
  edit: edit => runEdit(edit),
  log: line => console.log(`Retouch: ${line}`),
};

/** What one page-wide press did, for its toast. */
export type PageDone =
  | {kind: 'failed'; why: string}
  | {kind: 'done'; pictures: number; edited: number; skipped: string[]};

/** The rect of each picture element on the page, in page order. */
export function pictureRects(elements: object[]): Rect[] {
  return elements.flatMap(element => {
    const each = element as {type?: number; picture?: {rect?: Rect}};
    return each.type === PICTURE_TYPE && each.picture?.rect
      ? [{...each.picture.rect}]
      : [];
  });
}

/** Runs `edit` on every picture of the open page, one after the other. */
export async function runPageEdit(
  edit: EditId,
  deps: PageDeps = DEVICE,
): Promise<PageDone> {
  const note = await deps.notePath();
  if (!note.ok) {
    return {kind: 'failed', why: `getCurrentFilePath: ${note.code} ${note.message}`};
  }
  const page = await deps.pageNum();
  if (!page.ok) {
    return {kind: 'failed', why: `getCurrentPageNum: ${page.code} ${page.message}`};
  }
  const elements = await deps.elements(page.value, note.value);
  if (!elements.ok) {
    return {kind: 'failed', why: `getElements: ${elements.code} ${elements.message}`};
  }
  const rects = pictureRects(elements.value);
  await Promise.all(elements.value.map(element => deps.recycle(element)));
  const skipped: string[] = [];
  let edited = 0;
  for (const rect of rects) {
    const lassoed = await deps.lasso(rect);
    if (!lassoed.ok || lassoed.value !== true) {
      skipped.push(lassoed.ok ? 'lasso: false' : `lasso: ${lassoed.code}`);
      continue;
    }
    const done = await deps.edit(edit);
    if (done.kind === 'edited') {
      edited += 1;
    } else {
      skipped.push(done.why);
    }
  }
  deps.log(
    `${edit} on the page: ${edited} of ${rects.length} pictures` +
      (skipped.length > 0 ? `; skipped: ${skipped.join('; ')}` : ''),
  );
  return {kind: 'done', pictures: rects.length, edited, skipped};
}
