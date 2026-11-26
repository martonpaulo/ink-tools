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

/** `point` of `from` at the same place in `to`; a line with no width or height keeps that side. */
function mapPoint(point: PenPoint, from: EditRect, to: EditRect): PenPoint {
  const width = from.right - from.left;
  const height = from.bottom - from.top;
  return {
    x: Math.round(width ? to.left + ((point.x - from.left) * (to.right - to.left)) / width : point.x + to.left - from.left),
    y: Math.round(height ? to.top + ((point.y - from.top) * (to.bottom - to.top)) / height : point.y + to.top - from.top),
  };
}

/**
 * Moves and sizes an element read by `getElement` to `rect`, in place, for a modify call: a
 * picture's or text box's rect, or a stroke's points mapped from their bounds to `rect`. The stroke
 * writes its points back with one `setRange` (sn-plugin-lib 0.2.3 `ElementDataAccessor`).
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
    return (await points.setRange(0, moved.length, moved)) ? ok(element) : fail(THROWN_CODE, 'setRange did not write the points');
  } catch (error) {
    return fail(THROWN_CODE, error instanceof Error ? error.message : String(error));
  }
}

