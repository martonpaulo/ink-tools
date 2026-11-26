/**
 * One edit button's press (#136), with no plugin view: the lassoed picture is read through the
 * lasso preview, the only pixel read the host gives (docs/supernote.md, #130), edited by the Java
 * module and put back in place with `modifyPageElements`. Undo and Restore original put back a
 * state `history.ts` kept. Any failure stops before the page changes, and is logged: a text box
 * would write on the owner's page.
 */
import type {Rect} from '@ink-tools/ink-core';
import {
  getCurrentFilePath,
  getCurrentPageNum,
  getLassoElements,
  getPageSize,
  getPluginDirPath,
  lassoImage,
  modifyPageElements,
  PICTURE_TYPE,
  Result,
} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';
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
  stateRect,
  Step,
  undoStep,
} from './history';
import {
  NO_OPTIONS,
  PixelEdit,
  retouchNative,
  RetouchNative,
  StyleId,
  StyleOptions,
} from './native';

/**
 * Retouch's working folder, `work/` in the private plugin folder (`getPluginDirPath`): the one
 * place a plugin reaches that Supernote Cloud sync does not upload (docs/supernote.md › Files and
 * sync, #198). The note app does not read the inserted PNG there: the host copies it into
 * `.data/plugin/` at the write (docs/supernote.md › Plugins, #130).
 * shortcut: an install empties the private folder, so Undo and Restore original forget the
 * pictures edited before an update; move the states if the owner wants them kept across updates.
 */
export const WORK_FOLDER = 'work';

/** The history of every edited picture, in the working folder. */
export const historyPath = (work: string) => `${work}/history.json`;

/** The private plugin folder's `work/`, or the failure of `getPluginDirPath`. */
async function deviceWorkDir(): Promise<Result<string>> {
  const dir = await getPluginDirPath();
  return dir.ok ? {ok: true, value: `${dir.value}/${WORK_FOLDER}`} : dir;
}

/** A lassoed picture element, as `getLassoElements` gives it [measured, #130]. */
export type PictureElement = {
  type: number;
  pageNum?: number;
  layerNum?: number;
  picture: {rect: Rect; picturePath?: string};
};

export type EditDeps = {
  workDir: () => Promise<Result<string>>;
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
  workDir: deviceWorkDir,
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

/** An area inside the picture, in its pixels from its top left: Crop's box (#132). */
export type Box = {left: number; top: number; width: number; height: number};

/**
 * The pen marks Erase clears (#134), in the picture's pixels from its top left (the lasso preview
 * is the picture at its page size, #130): `points` holds x, y of every point in turn, and `ends`
 * the point count after each mark, so mark k is the points from `ends[k - 1]` (0 for the first) to
 * `ends[k]`.
 */
export type Marks = {points: number[]; ends: number[]};

/**
 * A style's two options (#133), the box Crop cuts to (#132) and the marks Erase clears (#134); the
 * other edits ignore them.
 */
export type EditOptions = StyleOptions & {box?: Box; marks?: Marks};

/**
 * What a press did, for the log and the tests. An edit gives the picture's new place on the page,
 * so the editor view lassoes it again for the next edit (#226).
 */
export type Done =
  | {kind: 'edited'; edit: EditId | StyleId; ms: number; quad?: string; rect?: Rect}
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
  trim: 'trim',
  background: 'background',
  sticker: 'sticker',
  document: 'document',
  crop: 'crop',
  erase: 'erase',
  photo: 'photo',
  line_art: 'line_art',
  black_white: 'black_white',
  dither: 'dither',
  atkinson: 'atkinson',
};

/** Why a press changed nothing; src/press.ts turns each into its toast (#170). */
export const NOT_ONE_PICTURE = 'the lasso is not one picture';
export const NOT_EDITED = 'Retouch has not edited this picture';

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

/** Deletes `path`; a failure is logged, never thrown, so the press goes on (#182). */
export async function removeFile(path: string, deps: EditDeps): Promise<void> {
  const removed = await deps.native.deleteFile(path);
  if (!removed.ok) {
    deps.log(why(`delete ${path}`, removed));
  }
}

/** A picture's size on the page in whole pixels, the size of its lasso preview (#130). */
export const sizeOf = (rect: Rect) => ({
  width: Math.round(rect.right - rect.left),
  height: Math.round(rect.bottom - rect.top),
});

/**
 * Runs `edit`, or a style with its `options` (#133), on the lassoed picture and logs the outcome.
 * Crop runs only with its box (#132), which src/crop.ts takes from the pen's rectangle, and Erase
 * only with its marks (#134), which src/erase.ts takes from the pen.
 */
export async function runEdit(
  edit: EditId | StyleId,
  deps: EditDeps = DEVICE,
  options: EditOptions = NO_OPTIONS,
): Promise<Done> {
  const started = deps.now();
  const done = await editOnce(edit, deps, options);
  const ms = deps.now() - started;
  deps.log(
    done.kind === 'edited'
      ? `${edit}: done in ${ms} ms${done.quad ? `; page quad ${done.quad}` : ''}`
      : `${edit}: ${done.kind}: ${done.why}`,
  );
  return done.kind === 'edited' ? {...done, ms} : done;
}

async function editOnce(
  edit: EditId | StyleId,
  deps: EditDeps,
  options: EditOptions,
): Promise<Done> {
  const lassoed = await deps.lassoElements();
  if (!lassoed.ok) {
    return {kind: 'failed', why: why('getLassoElements', lassoed)};
  }
  const element = onePicture(lassoed.value);
  if (!element) {
    return {kind: 'nothing', why: NOT_ONE_PICTURE};
  }
  const note = await deps.notePath();
  if (!note.ok) {
    return {kind: 'failed', why: why('getCurrentFilePath', note)};
  }
  const page = await deps.pageNum();
  if (!page.ok) {
    return {kind: 'failed', why: why('getCurrentPageNum', page)};
  }
  const work = await deps.workDir();
  if (!work.ok) {
    return {kind: 'failed', why: why('getPluginDirPath', work)};
  }
  const read = await deps.native.readText(historyPath(work.value));
  if (!read.ok) {
    return {kind: 'failed', why: why('read history', read)};
  }
  const history = parseHistory(read.value);
  if (!history) {
    return {
      kind: 'failed',
      why: `${historyPath(work.value)} is not a Retouch history`,
    };
  }
  const place: Place = {
    note: note.value,
    page: page.value,
    rect: element.picture.rect,
  };
  const pixel = PIXEL_EDITS[edit];
  if (pixel) {
    return pixelEdit(pixel, edit, element, place, history, work.value, deps, options);
  }
  const step =
    edit === 'undo' ? undoStep(history, place) : restoreStep(history, place);
  if (!step) {
    return {kind: 'nothing', why: NOT_EDITED};
  }
  return putBack(edit, step, element, place, work.value, deps);
}

async function pixelEdit(
  pixel: PixelEdit,
  edit: EditId | StyleId,
  element: PictureElement,
  place: Place,
  history: History,
  work: string,
  deps: EditDeps,
  options: EditOptions,
): Promise<Done> {
  const box = pixel === 'crop' ? options.box : undefined;
  if (pixel === 'crop' && !box) {
    return {kind: 'failed', why: copy['edit.cropNoBox']};
  }
  const marks = pixel === 'erase' ? options.marks : undefined;
  if (pixel === 'erase' && !marks) {
    return {kind: 'failed', why: copy['edit.eraseNoMarks']};
  }
  const width = await deps.pageWidth(place.note, place.page);
  if (!width.ok) {
    return {kind: 'failed', why: why('getPageSize', width)};
  }
  const stamp = deps.now();
  const previewPath = `${work}/preview-${stamp}.png`;
  const known = findEntry(history, place);
  const originalPath = known ? '' : `${work}/${stamp}-original.png`;
  const resultPath = `${work}/${stamp}-${pixel}.png`;
  const preview = await deps.preview(previewPath);
  if (!preview.ok) {
    return {kind: 'failed', why: why('generateLassoPreview', preview)};
  }
  const keep = new Set<string>();
  try {
    const size = sizeOf(place.rect);
    const edited = marks
      ? await deps.native.erase(
          preview.value,
          originalPath,
          resultPath,
          size.width,
          size.height,
          marks.points,
          marks.ends,
        )
      : box
      ? await deps.native.crop(
          preview.value,
          originalPath,
          resultPath,
          size.width,
          size.height,
          box.left,
          box.top,
          box.width,
          box.height,
        )
      : await deps.native.edit(
          pixel,
          preview.value,
          originalPath,
          resultPath,
          size.width,
          size.height,
          width.value,
          options.transparent,
          options.thick,
        );
    if (!edited.ok) {
      return {kind: 'failed', why: why(`edit ${pixel}`, edited)};
    }
    const {left, top} = edited.value;
    const at = {
      ...place.rect,
      left: place.rect.left + left,
      top: place.rect.top + top,
    };
    const rect = placeAt(at, edited.value, width.value);
    const replaced = await replace(element, resultPath, rect, place, deps);
    if (!replaced.ok) {
      return {kind: 'failed', why: why('modifyPageElements', replaced)};
    }
    const result: State = {
      path: resultPath,
      width: edited.value.width,
      height: edited.value.height,
      left: rect.left,
      top: rect.top,
    };
    const original: State | null = known
      ? null
      : {
          path: originalPath,
          ...size,
          left: place.rect.left,
          top: place.rect.top,
        };
    const change = recordEdit(history, place, rect, result, original, stamp);
    keep.add(resultPath).add(originalPath);
    await save(change, work, deps);
    const {quad} = edited.value;
    return quad === undefined
      ? {kind: 'edited', edit, ms: 0, rect}
      : {kind: 'edited', edit, ms: 0, quad, rect};
  } finally {
    for (const path of [preview.value, originalPath, resultPath]) {
      if (path && !keep.has(path)) {
        await removeFile(path, deps);
      }
    }
  }
}

async function putBack(
  edit: EditId | StyleId,
  step: Step,
  element: PictureElement,
  place: Place,
  work: string,
  deps: EditDeps,
): Promise<Done> {
  const width = await deps.pageWidth(place.note, place.page);
  if (!width.ok) {
    return {kind: 'failed', why: why('getPageSize', width)};
  }
  const rect = placeAt(
    stateRect(place.rect, step.show),
    step.show,
    width.value,
  );
  const replaced = await replace(element, step.show.path, rect, place, deps);
  if (!replaced.ok) {
    return {kind: 'failed', why: why('modifyPageElements', replaced)};
  }
  await save(step.after(rect, deps.now()), work, deps);
  return {kind: 'edited', edit, ms: 0, rect};
}

function replace(
  element: PictureElement,
  path: string,
  rect: Rect,
  place: Place,
  deps: EditDeps,
): Promise<Result<number[]>> {
  // The lassoed element can carry a pageNum below 0, which the SDK's ElementSchema refuses with
  // 107 (#170, measured on beta 7): the page is the one the edit was read on.
  const changed = {
    ...element,
    pageNum: place.page,
    picture: {...element.picture, picturePath: path, rect},
  };
  return deps.modify([changed], place.page, element.layerNum ?? null);
}

/**
 * Writes the history, then removes the files it dropped. A failed write is logged: the page
 * already shows the edit, and the files stay, so nothing is lost but the way back.
 */
async function save(
  change: Change,
  work: string,
  deps: EditDeps,
): Promise<void> {
  const written = await deps.native.writeText(
    historyPath(work),
    JSON.stringify(change.history),
  );
  if (!written.ok) {
    deps.log(why('write history', written));
    return;
  }
  for (const path of change.drop) {
    await removeFile(path, deps);
  }
}
