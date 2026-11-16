/**
 * One edit button's press (#136), with no plugin view: the lassoed picture is read through the
 * lasso preview, the only pixel read the host gives (docs/supernote.md, #130), edited by the Java
 * module and put back in place with `modifyPageElements`. Undo and Restore original put back a
 * state `history.ts` kept. Any failure stops before the page changes, and is logged: a text box
 * would write on the owner's page.
 */
import type {Rect} from '@supernote-tools/ink-core';
import {
  getCurrentFilePath,
  getCurrentPageNum,
  getLassoElements,
  getPageSize,
  lassoImage,
  modifyPageElements,
  PICTURE_TYPE,
  Result,
  SHARED_ROOT,
} from '@supernote-tools/sn-adapter/official';
import {EditId} from './edits';
import {
  Change,
  findEntry,
  History,
  parseHistory,
  Place,
  placeAt,
  recordEdit,
  restoreStep,
  State,
  Step,
  undoStep,
} from './history';
import {PixelEdit, retouchNative, RetouchNative} from './native';

/**
 * Retouch's folder in shared storage: the note app reads an inserted PNG only there, not in the
 * private plugin folder (Ink2Pic's brief section 6.6), and its states survive a plugin update.
 */
export const RETOUCH_DIR = `${SHARED_ROOT}/MyStyle/Retouch`;
export const HISTORY_PATH = `${RETOUCH_DIR}/history.json`;

/** A lassoed picture element, as `getLassoElements` gives it [measured, #130]. */
export type PictureElement = {
  type: number;
  layerNum?: number;
  picture: {rect: Rect; picturePath?: string};
};

export type EditDeps = {
  lassoElements: () => Promise<Result<object[]>>;
  notePath: () => Promise<Result<string>>;
  pageNum: () => Promise<Result<number>>;
  pageWidth: (note: string, page: number) => Promise<Result<number>>;
  preview: (pngPath: string) => Promise<Result<string>>;
  modify: (
    elements: object[],
    page: number,
    layer: number | null,
  ) => Promise<Result<number[]>>;
  native: RetouchNative;
  now: () => number;
  log: (line: string) => void;
};

export const DEVICE: EditDeps = {
  lassoElements: getLassoElements,
  notePath: getCurrentFilePath,
  pageNum: getCurrentPageNum,
  pageWidth: async (note, page) => {
    const size = await getPageSize(note, page);
    return size.ok ? {ok: true, value: size.value.width} : size;
  },
  preview: lassoImage,
  modify: modifyPageElements,
  native: retouchNative(),
  now: Date.now,
  log: line => console.log(`Retouch: ${line}`),
};

/** What a press did, for the log and the tests. */
export type Done =
  | {kind: 'edited'; edit: EditId; ms: number}
  | {kind: 'nothing'; why: string}
  | {kind: 'failed'; why: string};

const PIXEL_EDITS: Record<string, PixelEdit> = {
  enhance: 'enhance',
  lighter: 'lighter',
  darker: 'darker',
  rotate: 'rotate',
  mirror: 'mirror',
  flip: 'flip',
  invert: 'invert',
};

/** The lassoed elements when they are exactly one picture, else null. */
export function onePicture(elements: object[]): PictureElement | null {
  if (elements.length !== 1) {
    return null;
  }
  const element = elements[0] as Partial<PictureElement>;
  const rect = element.picture?.rect;
  return element.type === PICTURE_TYPE && rect ? (element as PictureElement) : null;
}

const why = (what: string, result: {code: number; message: string}) =>
  `${what}: ${result.code} ${result.message}`;

const sizeOf = (rect: Rect) => ({
  width: Math.round(rect.right - rect.left),
  height: Math.round(rect.bottom - rect.top),
});

/** Runs `edit` on the lassoed picture and logs the outcome. */
export async function runEdit(
  edit: EditId,
  deps: EditDeps = DEVICE,
): Promise<Done> {
  const started = deps.now();
  const done = await editOnce(edit, deps);
  const ms = deps.now() - started;
  deps.log(
    done.kind === 'edited'
      ? `${edit}: done in ${ms} ms`
      : `${edit}: ${done.kind}: ${done.why}`,
  );
  return done.kind === 'edited' ? {...done, ms} : done;
}

async function editOnce(edit: EditId, deps: EditDeps): Promise<Done> {
  const lassoed = await deps.lassoElements();
  if (!lassoed.ok) {
    return {kind: 'failed', why: why('getLassoElements', lassoed)};
  }
  const element = onePicture(lassoed.value);
  if (!element) {
    return {kind: 'nothing', why: 'the lasso is not one picture'};
  }
  const note = await deps.notePath();
  if (!note.ok) {
    return {kind: 'failed', why: why('getCurrentFilePath', note)};
  }
  const page = await deps.pageNum();
  if (!page.ok) {
    return {kind: 'failed', why: why('getCurrentPageNum', page)};
  }
  const read = await deps.native.readText(HISTORY_PATH);
  if (!read.ok) {
    return {kind: 'failed', why: why('read history', read)};
  }
  const history = parseHistory(read.value);
  if (!history) {
    return {kind: 'failed', why: `${HISTORY_PATH} is not a Retouch history`};
  }
  const place: Place = {
    note: note.value,
    page: page.value,
    rect: element.picture.rect,
  };
  const pixel = PIXEL_EDITS[edit];
  if (pixel) {
    return pixelEdit(pixel, edit, element, place, history, deps);
  }
  const step =
    edit === 'undo' ? undoStep(history, place) : restoreStep(history, place);
  if (!step) {
    return {kind: 'nothing', why: 'Retouch has not edited this picture'};
  }
  return putBack(edit, step, element, place, deps);
}

async function pixelEdit(
  pixel: PixelEdit,
  edit: EditId,
  element: PictureElement,
  place: Place,
  history: History,
  deps: EditDeps,
): Promise<Done> {
  const width = await deps.pageWidth(place.note, place.page);
  if (!width.ok) {
    return {kind: 'failed', why: why('getPageSize', width)};
  }
  const stamp = deps.now();
  const previewPath = `${RETOUCH_DIR}/preview-${stamp}.png`;
  const known = findEntry(history, place);
  const originalPath = known ? '' : `${RETOUCH_DIR}/${stamp}-original.png`;
  const resultPath = `${RETOUCH_DIR}/${stamp}-${pixel}.png`;
  const preview = await deps.preview(previewPath);
  if (!preview.ok) {
    return {kind: 'failed', why: why('generateLassoPreview', preview)};
  }
  const keep = new Set<string>();
  try {
    const size = sizeOf(place.rect);
    const edited = await deps.native.edit(
      pixel,
      preview.value,
      originalPath,
      resultPath,
      size.width,
      size.height,
      width.value,
    );
    if (!edited.ok) {
      return {kind: 'failed', why: why(`edit ${pixel}`, edited)};
    }
    const rect = placeAt(place.rect, edited.value, width.value);
    const replaced = await replace(element, resultPath, rect, place, deps);
    if (!replaced.ok) {
      return {kind: 'failed', why: why('modifyPageElements', replaced)};
    }
    const result: State = {path: resultPath, ...edited.value};
    const original: State | null = known
      ? null
      : {path: originalPath, ...size};
    const change = recordEdit(history, place, rect, result, original, stamp);
    keep.add(resultPath).add(originalPath);
    await save(change, deps);
    return {kind: 'edited', edit, ms: 0};
  } finally {
    for (const path of [preview.value, originalPath, resultPath]) {
      if (path && !keep.has(path)) {
        await deps.native.deleteFile(path);
      }
    }
  }
}

async function putBack(
  edit: EditId,
  step: Step,
  element: PictureElement,
  place: Place,
  deps: EditDeps,
): Promise<Done> {
  const width = await deps.pageWidth(place.note, place.page);
  if (!width.ok) {
    return {kind: 'failed', why: why('getPageSize', width)};
  }
  const rect = placeAt(place.rect, step.show, width.value);
  const replaced = await replace(element, step.show.path, rect, place, deps);
  if (!replaced.ok) {
    return {kind: 'failed', why: why('modifyPageElements', replaced)};
  }
  await save(step.after(rect, deps.now()), deps);
  return {kind: 'edited', edit, ms: 0};
}

function replace(
  element: PictureElement,
  path: string,
  rect: Rect,
  place: Place,
  deps: EditDeps,
): Promise<Result<number[]>> {
  const changed = {
    ...element,
    picture: {...element.picture, picturePath: path, rect},
  };
  return deps.modify([changed], place.page, element.layerNum ?? null);
}

/**
 * Writes the history, then removes the files it dropped. A failed write is logged: the page
 * already shows the edit, and the files stay, so nothing is lost but the way back.
 */
async function save(change: Change, deps: EditDeps): Promise<void> {
  const written = await deps.native.writeText(
    HISTORY_PATH,
    JSON.stringify(change.history),
  );
  if (!written.ok) {
    deps.log(why('write history', written));
    return;
  }
  for (const path of change.drop) {
    const removed = await deps.native.deleteFile(path);
    if (!removed.ok) {
      deps.log(why(`delete ${path}`, removed));
    }
  }
}
