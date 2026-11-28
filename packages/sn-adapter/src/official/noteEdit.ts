/**
 * The file API calls the Note Editor's tablet helper makes (#312): elements of a note by its
 * path, one element by its number, page removal, and the element building and placing for a move or
 * a resize. The open-note calls it routes to live beside their other callers: `insertPageElements`
 * (page.ts), `modifyPageElements` (image.ts), `deletePageElements` (shapes.ts), `insertNotePage`
 * (file.ts) and `saveCurrentNote` (openPage.ts, which every open-page write runs first, #524). A
 * keyword goes in and out by path, the open note too (#346).
 */
import {PluginFileAPI} from 'sn-plugin-lib';
import {createTextBox, readAll, rebuildStroke, STROKE_TYPE, TEXT_TYPE, textStyleFields} from './elements';
import type {TextBoxInput, TextStyle} from './note';
import {createElement, PICTURE_TYPE} from './page';
import type {PenPoint} from './pen';
import {attempt, fail, ok, Result, THROWN_CODE} from './result';

export type EditRect = TextBoxInput['rect'];

/** The tablet's shape kinds, sn-plugin-lib 0.2.3 `Geometry.type` (#463). */
export const GEOMETRY_SHAPES = ['straightLine', 'GEO_polygon', 'GEO_circle', 'GEO_ellipse'] as const;
export type GeometryShape = (typeof GEOMETRY_SHAPES)[number];

/** A circle's or an ellipse's centre and radii in page pixels; `major` along x at angle 0, as Smart Pen draws a circle. */
export type EllipseSpec = {center: PenPoint; major: number; minor: number; angle: number};

/** An element the Mac asks for, in our words (#312); the helper checks every field before this. */
export type NewElement =
  | {kind: 'stroke'; points: PenPoint[]; penColor: number; thickness: number}
  | {kind: 'text'; text: string; rect: EditRect; fontSize: number; style?: TextStyle}
  | {kind: 'picture'; file: string; rect: EditRect}
  | {kind: 'geometry'; shape: GeometryShape; points: PenPoint[]; ellipse: EllipseSpec | null; penColor: number; penWidth: number};

/** `Element.TYPE_GEO` in sn-plugin-lib 0.2.3: a line, polygon, circle or ellipse the tablet keeps as a shape (#463). */
export const GEOMETRY_TYPE = 700;

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

/** Adds `keyword` to `page` (from 0) of the note at `notePath`, with no place on the page (#346). */
export function insertKeyWord(notePath: string, page: number, keyword: string): Promise<Result<boolean>> {
  return attempt(() => PluginFileAPI.insertKeyWord(notePath, page, keyword));
}

/**
 * Removes the keyword at `index` of `page` (from 0) of the note at `notePath` (#346).
 * shortcut: the index's base and order (footer order or place) are not measured; the device round of #346 settles them.
 */
export function deleteKeyWord(notePath: string, page: number, index: number): Promise<Result<boolean>> {
  return attempt(() => PluginFileAPI.deleteKeyWord(notePath, page, index));
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
      return createTextBox({text: spec.text, rect: spec.rect, fontSize: spec.fontSize, style: spec.style});
    case 'picture': {
      const made = await createElement(PICTURE_TYPE);
      if (!made.ok) {
        return made;
      }
      made.value.picture = {picturePath: spec.file, rect: spec.rect};
      return made;
    }
    case 'geometry': {
      const made = await createElement(GEOMETRY_TYPE);
      if (!made.ok) {
        return made;
      }
      // The fields of sn-plugin-lib 0.2.3's `Geometry`, as Smart Pen's insertGeometry sends them (#463).
      made.value.geometry = {
        type: spec.shape,
        penColor: spec.penColor,
        penType: FINELINER,
        penWidth: spec.penWidth,
        points: spec.points,
        ellipseCenterPoint: spec.ellipse?.center ?? null,
        ellipseMajorAxisRadius: spec.ellipse?.major ?? 0,
        ellipseMinorAxisRadius: spec.ellipse?.minor ?? 0,
        ellipseAngle: spec.ellipse?.angle ?? 0,
        showLassoAfterInsert: false,
      };
      return made;
    }
  }
}

type Placed = {
  type?: number;
  pageNum?: number;
  /** The stored outline the lasso selects by, rings of float page pixels (docs/research/2026-11-note-format.md). */
  contoursSrc?: {size(): Promise<number>; getRange(start: number, count: number): Promise<PenPoint[][]>; setRange?(index: number, end: number, values: PenPoint[][]): Promise<boolean>} | null;
  /** The stored box the lasso tests first, in page pixels; only a modify of a closed note makes it again (#452). */
  recognizeResult?: StoredBox | null;
  picture?: {rect?: EditRect} | null;
  textBox?: {textRect?: EditRect; textContentFull?: string; fontSize?: number} | null;
  geometry?: StoredGeometry | null;
  stroke?: {
    points?: {size(): Promise<number>; getRange(start: number, count: number): Promise<PenPoint[]>; setRange?(index: number, end: number, values: PenPoint[]): Promise<boolean>};
  } | null;
};

type StoredBox = {up_left_point_x?: number; up_left_point_y?: number; down_right_point_x?: number; down_right_point_y?: number};

/** A shape's fields as a read answers them, sn-plugin-lib 0.2.3 `Geometry` (#463). */
type StoredGeometry = {
  type?: string;
  points?: PenPoint[] | null;
  ellipseCenterPoint?: PenPoint | null;
  ellipseMajorAxisRadius?: number;
  ellipseMinorAxisRadius?: number;
  ellipseAngle?: number;
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

/** A point's new place, sample points rounded to whole pixels when `round`. */
type PointMap = (point: PenPoint, round: boolean) => PenPoint;

/**
 * Moves the stroke's stored outline with its points: the tablet does not make it again, and the
 * lasso selects by it, so a stroke moved without it is lassoed at its old place (device round 13,
 * #325). A stroke with no outline has nothing to move.
 */
async function moveOutline(element: Placed, map: PointMap): Promise<Result<true>> {
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
  const moved = read.value.map(ring => ring.map(point => map(point, false)));
  return (await outline.setRange(0, moved.length, moved)) ? ok(true) : fail(THROWN_CODE, 'setRange did not write the outline');
}

/**
 * Moves the stroke's stored box (`recognizeResult`) with its points: the bounds of its four mapped
 * corners, rounded outward, so a rotation keeps the ink inside. A modify of the open note keeps the
 * box it is sent, so a stroke moved without it is lassoed only by a rect that holds both places; a
 * modify of a closed note makes the box again (device round, Manta, #452).
 */
function moveBox(element: Placed, map: PointMap): void {
  const box = element.recognizeResult;
  const sides = [box?.up_left_point_x, box?.up_left_point_y, box?.down_right_point_x, box?.down_right_point_y];
  if (!box || !sides.every(side => typeof side === 'number' && Number.isFinite(side))) {
    return;
  }
  const [left, top, right, bottom] = sides as number[];
  const corners = [
    {x: left, y: top},
    {x: right, y: top},
    {x: right, y: bottom},
    {x: left, y: bottom},
  ].map(corner => map(corner, false));
  const bounds = boundsOf(corners);
  box.up_left_point_x = Math.floor(bounds.left);
  box.up_left_point_y = Math.floor(bounds.top);
  box.down_right_point_x = Math.ceil(bounds.right);
  box.down_right_point_y = Math.ceil(bounds.bottom);
}

/** Writes a stroke's sample points from index 0. */
type WritePoints = (values: PenPoint[]) => Promise<boolean>;

/** The stroke's sample points and their writer, or why it cannot be moved. */
async function strokePoints(placed: Placed): Promise<Result<{write: WritePoints; read: PenPoint[]}>> {
  const points = placed.stroke?.points;
  const setRange = points?.setRange;
  if (placed.type !== STROKE_TYPE || !points || !setRange) {
    return fail(THROWN_CODE, `an element of type ${String(placed.type)} cannot be moved`);
  }
  const read = await readAll(points);
  if (!read.ok) {
    return read;
  }
  if (!read.value.length) {
    return fail(THROWN_CODE, 'the stroke has no points');
  }
  return ok({write: values => setRange.call(points, 0, values.length, values), read: read.value});
}

/**
 * Writes a stroke's points back with one `setRange` (sn-plugin-lib 0.2.3 `ElementDataAccessor`),
 * its stored outline (`contoursSrc`) with another, and its stored box (`recognizeResult`), each
 * through `map`.
 * shortcut: setRange's end index is read as exclusive, as getRange counts; the device round checks it.
 */
async function writeStroke(placed: Placed, write: WritePoints, read: PenPoint[], map: PointMap): Promise<Result<object>> {
  const moved = read.map(point => map(point, true));
  try {
    if (!(await write(moved))) {
      return fail(THROWN_CODE, 'setRange did not write the points');
    }
    const outline = await moveOutline(placed, map);
    if (!outline.ok) {
      return outline;
    }
    moveBox(placed, map);
    return ok(placed);
  } catch (error) {
    return fail(THROWN_CODE, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Sets a text box read by `getElement` to `text` at `fontSize`, in place, for a modify call: the
 * Mac's edit of a text box made on the tablet (#264). Refused for any other element.
 */
export function retextElement(element: object, text: string, fontSize: number): Result<object> {
  const placed = element as Placed;
  if (placed.type !== TEXT_TYPE || !placed.textBox) {
    return fail(THROWN_CODE, 'the element is not a text box');
  }
  placed.textBox.textContentFull = text;
  placed.textBox.fontSize = fontSize;
  return ok(element);
}

/**
 * Sets a text box read by `getElement` to `style`, in place, for a modify call (#404): each field
 * left out goes back to the host's default. Refused for any other element.
 */
export function restyleElement(element: object, style: TextStyle): Result<object> {
  const placed = element as Placed;
  if (placed.type !== TEXT_TYPE || !placed.textBox) {
    return fail(THROWN_CODE, 'the element is not a text box');
  }
  Object.assign(placed.textBox, textStyleFields(style));
  return ok(element);
}

/**
 * Moves and sizes an element read by `getElement` to `rect` on `page`, in place, for a modify call.
 * `pageNum` is set to `page`: a read answers -1, -2 or 0 for the same element, and a modify below 0
 * is refused, code 107 (device round 13, #312). A picture's or text box's rect, or a stroke's points,
 * outline and box mapped from the points' bounds to `rect` (`writeStroke`).
 */
export async function placeElement(element: object, page: number, rect: EditRect): Promise<Result<object>> {
  const placed = element as Placed;
  placed.pageNum = page;
  if (placed.type === PICTURE_TYPE && placed.picture) {
    placed.picture.rect = rect;
    return ok(element);
  }
  if (placed.type === TEXT_TYPE && placed.textBox) {
    placed.textBox.textRect = rect;
    return ok(element);
  }
  if (placed.type === GEOMETRY_TYPE && placed.geometry) {
    return placeGeometry(placed, placed.geometry, rect);
  }
  const stroke = await strokePoints(placed);
  if (!stroke.ok) {
    return stroke;
  }
  const from = boundsOf(stroke.value.read);
  return writeStroke(placed, stroke.value.write, stroke.value.read, (point, round) => mapPoint(point, from, rect, round));
}

/**
 * Moves and sizes a shape to `rect` (#463): a line's or polygon's points mapped from their bounds,
 * or an ellipse's centre and radii; a circle sized to a rect that is not square becomes an ellipse.
 * The angle goes back in the insert's convention (`insertAngle`), so the shape keeps its look. A
 * circle looks the same at any angle, so it goes back at 0: Smart Pen's circles are stored turned
 * (45.5 measured on the Manta, #459), and a circle sized to a rect that is not square becomes an
 * ellipse along the rect.
 * shortcut: a turned ellipse (an angle not near 0 or 90) is refused, since its box needs the angle's sense; the device round settles it.
 */
function placeGeometry(placed: Placed, geometry: StoredGeometry, rect: EditRect): Result<object> {
  const center = geometry.ellipseCenterPoint;
  const isEllipse = geometry.type === 'GEO_circle' || geometry.type === 'GEO_ellipse';
  if (isEllipse) {
    const major = geometry.ellipseMajorAxisRadius ?? 0;
    const minor = geometry.ellipseMinorAxisRadius ?? 0;
    if (!center || !(major > 0) || !(minor > 0)) {
      return fail(THROWN_CODE, 'the shape has no centre or radii');
    }
    const circle = major === minor;
    if (!circle && !isUnturned(geometry.ellipseAngle)) {
      return fail(THROWN_CODE, `a turned ellipse cannot be moved yet (ellipseAngle ${JSON.stringify(geometry.ellipseAngle)})`);
    }
    const from = {left: center.x - major, top: center.y - minor, right: center.x + major, bottom: center.y + minor};
    const map: PointMap = (point, round) => mapPoint(point, from, rect, round);
    geometry.ellipseCenterPoint = map(center, true);
    geometry.ellipseMajorAxisRadius = Math.round((rect.right - rect.left) / 2);
    geometry.ellipseMinorAxisRadius = Math.round((rect.bottom - rect.top) / 2);
    if (geometry.ellipseMajorAxisRadius !== geometry.ellipseMinorAxisRadius) {
      geometry.type = 'GEO_ellipse';
    }
    geometry.ellipseAngle = circle ? 0 : insertAngle(geometry.ellipseAngle);
    moveBox(placed, map);
    return ok(placed);
  }
  const points = geometry.points ?? [];
  if (points.length < 2) {
    return fail(THROWN_CODE, 'the shape has no points');
  }
  const from = boundsOf(points);
  const map: PointMap = (point, round) => mapPoint(point, from, rect, round);
  geometry.points = points.map(point => map(point, true));
  moveBox(placed, map);
  return ok(placed);
}

/**
 * Whether a read ellipse angle is an unturned ellipse's (#463). A read may answer it as a string,
 * and the tablet stores the angle 0 of an insert as about 90 (90.0027 measured on the Manta), so 0
 * and 90 both mean not turned, to the nearest degree; any other value is refused with what came.
 */
function isUnturned(angle: unknown): boolean {
  const degrees = Math.round(Number(angle ?? 0));
  return degrees === 0 || degrees === UNTURNED_STORED_ANGLE;
}

/**
 * The read angle in the convention a modify takes, the insert's (#463): a modify that wrote back the
 * read 90.0027 drew the ellipse turned by 90° on the Manta, so a stored angle about 90 goes back
 * less 90, keeping its float noise, and one about 0 as it came.
 */
function insertAngle(angle: unknown): number {
  const degrees = Number(angle ?? 0);
  return Math.round(degrees) === UNTURNED_STORED_ANGLE ? degrees - UNTURNED_STORED_ANGLE : degrees;
}

/** The angle the tablet stores for an ellipse inserted at angle 0, measured on the Manta (#463). */
const UNTURNED_STORED_ANGLE = 90;

/** An affine map of page pixels, as CoreGraphics orders it: x' = a x + c y + tx, y' = b x + d y + ty. */
export type Matrix = [a: number, b: number, c: number, d: number, tx: number, ty: number];

/** The page a transformed stroke must stay on, in pixels. */
export type PageSize = {width: number; height: number};

/**
 * Scales, rotates or flips a stroke read by `getElement` through `matrix`, in place, for a modify
 * call (#326): its points, outline and box, as `placeElement` maps them through a rect. A stroke
 * the matrix takes off the page is refused before anything is written. Only a stroke: a rect is
 * all a picture or a text box holds, so the Mac sends those a rect.
 */
export async function transformElement(element: object, page: number, matrix: Matrix, size: PageSize): Promise<Result<object>> {
  const placed = element as Placed;
  placed.pageNum = page;
  const stroke = await strokePoints(placed);
  if (!stroke.ok) {
    return stroke;
  }
  const [a, b, c, d, tx, ty] = matrix;
  const map: PointMap = (point, round) => {
    const x = a * point.x + c * point.y + tx;
    const y = b * point.x + d * point.y + ty;
    return round ? {x: Math.round(x), y: Math.round(y)} : {x, y};
  };
  const off = stroke.value.read.map(point => map(point, true)).find(point => point.x < 0 || point.y < 0 || point.x > size.width || point.y > size.height);
  if (off) {
    return fail(THROWN_CODE, `the transform takes the stroke off the page, to ${off.x}, ${off.y}`);
  }
  return writeStroke(placed, stroke.value.write, stroke.value.read, map);
}
