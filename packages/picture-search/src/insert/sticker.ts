/**
 * «Insert Sticker» (#35, owner D32 A, D62 A): the found drawing becomes a Supernote sticker
 * through the SDK's own calls. The tablet makes a sticker only from strokes and geometries, never
 * from a picture element (error 205, docs/supernote.md), so the drawing is first turned into pen
 * strokes (`./strokes`): the outlines of its SVG original when the search has one, else the traced
 * outline of the prepared picture's ink. `convertElement2Sticker` writes those strokes as a
 * `.sticker` file, and `insertSticker` pastes it where the host puts it, as its own Sticker plugin
 * does; that plugin leaves the pasted sticker selected (docs/supernote.md), so Lookup has no rect
 * to lasso (#139 keeps it lassoed through the host's own selection, a device check of #35).
 * The `.sticker` file is kept in the plugin's `stickers` folder under the shared storage
 * (`stickersDir`), where the built-in Sticker plugin's import finds it again (#35).
 * An SVG original that embeds raster pictures is refused: its outlines are only a frame
 * (device round 6), so the caller inserts the picture and says why (`PICTURE_SVG_MESSAGE`).
 */
import {log, logged} from '../log/memory';
import {deleteFile, downloadToFile, readText} from '../storage/files';
import {readInkMask} from '../storage/image';
import {insertDownloadPath, stickersDir} from '../storage/paths';
import {pluginFolder} from '../storage/session';
import type {SearchResult} from '../types';
import {
  fitPolylines,
  maskFromRows,
  type Polyline,
  strokeBudget,
  svgEmbedsPictures,
  svgPolylines,
  traceMask,
} from './strokes';
import {
  convertElement2Sticker,
  createElement,
  fail,
  getDeviceType,
  insertSticker,
  makeFolder,
  ok,
  rebuildStroke,
  Result,
  THROWN_CODE,
} from '@ink-tools/sn-adapter/official';

/**
 * The `.sticker` file of a prepared picture, named after it in `dir`: `.../apple.png` gives
 * `<dir>/apple.sticker`.
 */
export function stickerPath(picturePath: string, dir: string): string {
  const name = picturePath.slice(picturePath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return `${dir}/${name}.sticker`;
}

/** Why a drawing gives no sticker: its SVG original is raster pictures in a frame (#35). */
export const PICTURE_SVG_MESSAGE = 'the SVG original holds raster pictures, not lines';

/**
 * The pen a sticker stroke is written with: the probe stroke of #148 showed as ink with
 * `penType` 10 and `thickness` 400; `penColor` 0 is black [unverified on a sticker].
 */
export const STICKER_PEN = {penType: 10, penColor: 0, thickness: 400};

/** A sticker is at most this many times as tall as it is wide. */
const MAX_ASPECT = 2;

/** Where a sticker's strokes came from, for the log and the device check. */
export type StrokeSource = 'svg' | 'trace';

/** The drawing's SVG original, or null when the search has none (Commons drawings only). */
export function vectorUrl(result: SearchResult): string | null {
  const url = result.original?.url;
  return result.mime === 'image/svg+xml' && url && /\.svg(?:$|\?)/i.test(url) ? url : null;
}

/**
 * The SVG original's outlines, downloaded to a temporary file and read back; null when there is
 * none to read, and a failure when it embeds raster pictures.
 */
async function svgStrokes(
  result: SearchResult,
  width: number,
): Promise<Result<Polyline[]> | null> {
  const url = vectorUrl(result);
  if (!url) {
    return null;
  }
  const dir = await pluginFolder();
  if (!dir.ok) {
    return null;
  }
  const path = insertDownloadPath(dir.value, `${result.id}-vector`, 'svg');
  const bytes = await logged(`downloadToFile(${url} -> ${path})`, () =>
    downloadToFile(url, path),
  );
  const text = bytes.ok ? await logged(`readText(${path})`, () => readText(path)) : null;
  await logged(`deleteFile(${path})`, () => deleteFile(path));
  if (!text?.ok || !text.value) {
    return null;
  }
  if (svgEmbedsPictures(text.value)) {
    return fail(THROWN_CODE, PICTURE_SVG_MESSAGE);
  }
  const strokes = strokeBudget(fitPolylines(svgPolylines(text.value), width, width * MAX_ASPECT));
  return strokes.length > 0 ? ok(strokes) : null;
}

/** The traced outline of the prepared picture's ink, at the sticker's width. */
async function tracedStrokes(picturePath: string, width: number): Promise<Result<Polyline[]>> {
  const mask = await logged(`readInkMask(${picturePath})`, () => readInkMask(picturePath, width));
  if (!mask.ok) {
    return mask;
  }
  try {
    const {width: w, height: h, rows} = mask.value;
    const strokes = strokeBudget(
      fitPolylines(traceMask(maskFromRows(w, h, rows)), w, h),
    );
    return strokes.length > 0 ? ok(strokes) : fail(THROWN_CODE, 'the picture has no ink to trace');
  } catch (error) {
    return fail(THROWN_CODE, String(error));
  }
}

/**
 * The drawing as sticker strokes: its SVG original's outlines first, else its traced ink. An SVG
 * original of raster pictures refuses the sticker.
 */
export async function stickerStrokes(
  result: SearchResult,
  picturePath: string,
  width: number,
): Promise<Result<{strokes: Polyline[]; source: StrokeSource}>> {
  const vector = await svgStrokes(result, width);
  if (vector) {
    return vector.ok ? ok({strokes: vector.value, source: 'svg'}) : vector;
  }
  const traced = await tracedStrokes(picturePath, width);
  return traced.ok ? ok({strokes: traced.value, source: 'trace'}) : traced;
}

/** Writes `strokes` as the `.sticker` file at `path` and pastes it; the host places it. */
export async function insertStrokeSticker(
  strokes: Polyline[],
  path: string,
): Promise<Result<null>> {
  const machine = await logged('getDeviceType', getDeviceType);
  if (!machine.ok) {
    return machine;
  }
  const elements: object[] = [];
  for (const points of strokes) {
    const element = await rebuildStroke({...STICKER_PEN, points, pressures: []}, createElement);
    if (!element.ok) {
      return element;
    }
    elements.push({...element.value, layerNum: 0});
  }
  const converted = await logged(`convertElement2Sticker(${path})`, () =>
    convertElement2Sticker(machine.value, elements, path),
  );
  if (!converted.ok) {
    return converted;
  }
  if (converted.value !== true) {
    return fail(THROWN_CODE, 'convertElement2Sticker answered false');
  }
  const inserted = await logged(`insertSticker(${path})`, () => insertSticker(path));
  if (!inserted.ok) {
    return inserted;
  }
  if (inserted.value !== true) {
    return fail(THROWN_CODE, 'insertSticker answered false');
  }
  return ok(null);
}

/**
 * Inserts the found drawing as a sticker made of pen strokes; the host places it, so the value is
 * null. A failure is the caller's cue to insert the picture instead.
 */
export async function insertAsSticker(
  result: SearchResult,
  picturePath: string,
  width: number,
): Promise<Result<null>> {
  const made = await stickerStrokes(result, picturePath, width);
  if (!made.ok) {
    return made;
  }
  const {strokes, source} = made.value;
  const points = strokes.reduce((n, line) => n + line.length, 0);
  log(`sticker: ${strokes.length} strokes, ${points} points, from ${source}`);
  const dir = stickersDir();
  if (!dir) {
    return fail(THROWN_CODE, 'the plugin folder is not one the Sticker import lists');
  }
  const folder = await logged(`makeFolder(${dir})`, () => makeFolder(dir));
  if (!folder.ok || !folder.value) {
    return folder.ok ? fail(THROWN_CODE, `${dir} could not be made`) : folder;
  }
  const path = stickerPath(picturePath, dir);
  const pasted = await insertStrokeSticker(strokes, path);
  if (pasted.ok) {
    log(`sticker: ${path} pasted`);
  }
  return pasted;
}
