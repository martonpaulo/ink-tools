/**
 * The file API calls the Ink Notebook Editor's tablet helper makes (#312): elements of a note by its
 * path, one element by its number, page removal, and the element building and placing for a move or
 * a resize. The open-note calls it routes to live beside their other callers: `insertPageElements`
 * (page.ts), `modifyPageElements` (image.ts), `deletePageElements` (shapes.ts), `insertNotePage`
 * (file.ts) and `saveCurrentNote` (note.ts).
 */
import {PluginFileAPI} from 'sn-plugin-lib';
import {createTextBox, readAll, rebuildStroke, STROKE_TYPE, TEXT_TYPE} from './elements';
import type {TextBoxInput} from './note';
import {createElement, PICTURE_TYPE} from './page';
import type {PenPoint} from './pen';
import {attempt, fail, ok, Result, THROWN_CODE} from './result';

export type EditRect = TextBoxInput['rect'];

/** An element the Mac asks for, in our words (#312); the helper checks every field before this. */
export type NewElement =
  | {kind: 'stroke'; points: PenPoint[]; penColor: number; thickness: number}
  | {kind: 'text'; text: string; rect: EditRect; fontSize: number}
  | {kind: 'picture'; file: string; rect: EditRect};

/** The fineliner, sn-plugin-lib 0.2.3's pen type 10: a new stroke's penType 0 is refused (code 302, #249). */
const FINELINER = 10;

export function insertElements(notePath: string, page: number, elements: object[]): Promise<Result<boolean>> {
  return attempt(() => PluginFileAPI.insertElements(notePath, page, elements));
}

/** Answers the changed elements' in-page numbers, as `modifyPageElements` does. */
export function modifyElements(notePath: string, page: number, elements: object[]): Promise<Result<number[]>> {
  return attempt(() => PluginFileAPI.modifyElements(notePath, page, elements));
}

export function deleteElements(notePath: string, page: number, numsInPage: number[]): Promise<Result<boolean>> {
  return attempt(() => PluginFileAPI.deleteElements(notePath, page, numsInPage));
}

export function removeNotePage(notePath: string, page: number): Promise<Result<boolean>> {
  return attempt(() => PluginFileAPI.removeNotePage(notePath, page));
}

export function getNoteTotalPageNum(notePath: string): Promise<Result<number>> {
  return attempt(() => PluginFileAPI.getNoteTotalPageNum(notePath));
}

/**
 * One element of a page by its in-page number, from 1: a single read, never the whole page, which
 * crashed NOTE on a page of 540 strokes (docs/supernote.md › Plugins). An empty answer is a failure.
 */
export async function getElement(notePath: string, page: number, num: number): Promise<Result<object>> {
  const read = await attempt<object | null>(() => PluginFileAPI.getElement(notePath, page, num));
  if (!read.ok) {
    return read;
  }
  return read.value ? ok(read.value) : fail(THROWN_CODE, `page ${page} has no element ${num}`);
}

/** A new SDK element for `spec`, ready for an insert. */
export async function buildElement(spec: NewElement): Promise<Result<object>> {
  switch (spec.kind) {
    case 'stroke':
      return rebuildStroke(
        {points: spec.points, pressures: [], penType: FINELINER, penColor: spec.penColor, thickness: spec.thickness},
        createElement,
      );
    case 'text':
      return createTextBox({text: spec.text, rect: spec.rect, fontSize: spec.fontSize});
    case 'picture': {
      const made = await createElement(PICTURE_TYPE);
      if (!made.ok) {
        return made;
      }
      made.value.picture = {picturePath: spec.file, rect: spec.rect};
      return made;
    }
  }
}

type Placed = {
  type?: number;
  /** The stored outline the lasso selects by, rings of float page pixels (docs/research/2026-11-note-format.md). */
  contoursSrc?: {size(): Promise<number>; getRange(start: number, count: number): Promise<PenPoint[][]>; setRange?(index: number, end: number, values: PenPoint[][]): Promise<boolean>} | null;
  picture?: {rect?: EditRect} | null;
  textBox?: {textRect?: EditRect} | null;
  stroke?: {
    points?: {size(): Promise<number>; getRange(start: number, count: number): Promise<PenPoint[]>; setRange?(index: number, end: number, values: PenPoint[]): Promise<boolean>};
  } | null;
};

function boundsOf(points: PenPoint[]): EditRect {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)};
}

/**
 * `point` of `from` at the same place in `to`; a line with no width or height keeps that side.
 * Sample points are whole pixels; the outline keeps its float points (`round` false).
 */
function mapPoint(point: PenPoint, from: EditRect, to: EditRect, round = true): PenPoint {
  const width = from.right - from.left;
  const height = from.bottom - from.top;
  const x = width ? to.left + ((point.x - from.left) * (to.right - to.left)) / width : point.x + to.left - from.left;
  const y = height ? to.top + ((point.y - from.top) * (to.bottom - to.top)) / height : point.y + to.top - from.top;
  return round ? {x: Math.round(x), y: Math.round(y)} : {x, y};
}

/**
 * Moves the stroke's stored outline with its points: the tablet does not make it again, and the
 * lasso selects by it, so a stroke moved without it is lassoed at its old place (device round 13,
 * #325). A stroke with no outline has nothing to move.
 */
async function moveOutline(element: Placed, from: EditRect, to: EditRect): Promise<Result<true>> {
  const outline = element.contoursSrc;
  if (!outline) {
    return ok(true);
  }
  const read = await readAll(outline);
  if (!read.ok) {
    return read;
  }
  if (!read.value.length) {
    return ok(true);
  }
  if (!outline.setRange) {
    return fail(THROWN_CODE, 'the stroke outline cannot be written');
  }
  const moved = read.value.map(ring => ring.map(point => mapPoint(point, from, to, false)));
  return (await outline.setRange(0, moved.length, moved)) ? ok(true) : fail(THROWN_CODE, 'setRange did not write the outline');
}

/**
 * Moves and sizes an element read by `getElement` to `rect`, in place, for a modify call: a
 * picture's or text box's rect, or a stroke's points mapped from their bounds to `rect`. The stroke
 * writes its points back with one `setRange` (sn-plugin-lib 0.2.3 `ElementDataAccessor`), and its
 * stored outline (`contoursSrc`) with another, by the same mapping.
 * shortcut: setRange's end index is read as exclusive, as getRange counts; the device round checks it.
 */
export async function placeElement(element: object, rect: EditRect): Promise<Result<object>> {
  const placed = element as Placed;
  if (placed.type === PICTURE_TYPE && placed.picture) {
    placed.picture.rect = rect;
    return ok(element);
  }
  if (placed.type === TEXT_TYPE && placed.textBox) {
    placed.textBox.textRect = rect;
    return ok(element);
  }
  const points = placed.stroke?.points;
  if (placed.type !== STROKE_TYPE || !points?.setRange) {
    return fail(THROWN_CODE, `an element of type ${String(placed.type)} cannot be moved`);
  }
  const read = await readAll(points);
  if (!read.ok) {
    return read;
  }
  if (!read.value.length) {
    return fail(THROWN_CODE, 'the stroke has no points');
  }
  const from = boundsOf(read.value);
  const moved = read.value.map(point => mapPoint(point, from, rect));
  try {
    if (!(await points.setRange(0, moved.length, moved))) {
      return fail(THROWN_CODE, 'setRange did not write the points');
    }
    const outline = await moveOutline(placed, from, rect);
    return outline.ok ? ok(element) : outline;
  } catch (error) {
    return fail(THROWN_CODE, error instanceof Error ? error.message : String(error));
  }
}

