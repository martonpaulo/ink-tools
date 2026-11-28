/**
 * The Note Editor's tablet helper (#312): the action `edit` that inkctl sends through the
 * action channel of #283 with no screen tap. A request names one note in `Note/` and 1 to
 * LIMITS.operations operations, run in order; the first that fails stops the rest, and the answer
 * names it. Every answer carries `openNote`, the open note's path, for the Mac's open-note guard.
 *
 * Routes: on the note open on screen, elements go through the open-note calls, so the tablet's next
 * save keeps them; a page insert or removal saves the open note first, as an insert on an unsaved
 * open note drops its newest ink (#263). On any other note, the file API by path.
 */
import {
  ACTION_FAILED,
  ActionRefused,
  GEOMETRY_SHAPES,
  type GeometryShape,
  MAX_STROKE_POINTS,
  PICTURE_TYPE,
  pluginDataFolder,
  SHARED_ROOT,
  type ActionResult,
  STROKE_TYPE,
  TEXT_ALIGNS,
  TEXT_TYPE,
  type EditRect,
  type TextStyle,
  type Matrix,
  type NewElement,
  type Result,
} from '@ink-tools/sn-adapter/official';
import {CUSTOM_TEMPLATE_FOLDER, isCustomTemplatePath} from './templates';

/** Device Link's folder in the hidden `.data/plugin/`: inkctl writes the request and the pictures there. */
export const EDITOR_FOLDER = `${pluginDataFolder('inktools-device-link')}/`;
/** The only folder a request may name a note in. */
export const NOTES_FOLDER = `${SHARED_ROOT}/Note/`;
/** The most a request may hold: operations, elements in one operation, a text box's and a keyword's characters. */
export const LIMITS = {operations: 64, elements: 64, text: 500, keyword: 100};
export const FONT_SIZES = {min: 8, max: 200};
export const THICKNESS = {min: 100, max: 5000};
/** The page's size in pixels on the Manta (docs/supernote.md › Screen and units). */
export const PAGE = {width: 1920, height: 2560};
/** The Manta's four pen tones (docs/supernote.md › Greys and colours): no other colour enters a note. */
export const PEN_TONES = [0x00, 0x9d, 0xc9, 0xfe];
/** A note page's layers: 0 the main layer, 1 to 3 the custom ones (sn-plugin-lib's `layerNum`, #334). */
export const LAYERS = {min: 0, max: 3};

/** Each refusal's name, which the Mac reads; the message says the rest. */
export const REFUSAL = {
  badRequest: 'bad-request',
  notANote: 'not-a-note',
  pageOutOfRange: 'page-out-of-range',
  noElement: 'no-element',
  penDown: 'pen-down',
  saveFailed: 'save-failed',
  tabletRefused: 'tablet-refused',
} as const;

export type Operation =
  | {op: 'insertElements'; page: number; elements: NewElement[]; layer?: number}
  | {op: 'modifyElements'; page: number; num: number; rect: EditRect; file?: string; text?: TextChange; layer?: number}
  | {op: 'transformElements'; page: number; nums: number[]; matrix: Matrix}
  | {op: 'deleteElements'; page: number; nums: number[]}
  | {op: 'insertPage'; page: number; template: string}
  | {op: 'removePage'; page: number}
  | {op: 'insertKeyword'; page: number; text: string}
  | {op: 'deleteKeyword'; page: number; index: number}
  | {op: 'openNote'};

/**
 * A text box's new text and font size, for the Mac's edit of a text box made on the tablet (#264),
 * and its style when the request names one (#404).
 */
export type TextChange = {text: string; fontSize: number; style?: TextStyle};

export type EditRequest = {path: string; ops: Operation[]};

/** What the helper needs of the tablet, in our words; `device.ts` maps each to sn-adapter. */
export interface EditHost {
  openNote(): Promise<Result<string>>;
  saveOpenNote(): Promise<Result<boolean>>;
  pageCount(path: string): Promise<Result<number>>;
  build(spec: NewElement): Promise<Result<object>>;
  getElement(path: string, page: number, num: number): Promise<Result<object>>;
  place(element: object, page: number, rect: EditRect): Promise<Result<object>>;
  /** Sets a text box's text and font size, refused for any other element (#264). */
  retext(element: object, text: string, fontSize: number): Result<object>;
  /** Sets a text box's style fields, refused for any other element (#404). */
  restyle(element: object, style: TextStyle): Result<object>;
  /** Scales, rotates or flips a stroke through `matrix`, refused when it leaves the page (#326). */
  transform(element: object, page: number, matrix: Matrix): Promise<Result<object>>;
  /** `layer`, when given, is the layer the elements go to (#334); without it the tablet chooses. */
  insertOpen(page: number, elements: object[], layer?: number): Promise<Result<unknown>>;
  insertByPath(path: string, page: number, elements: object[], layer?: number): Promise<Result<unknown>>;
  modifyOpen(page: number, elements: object[], layer?: number): Promise<Result<unknown>>;
  modifyByPath(path: string, page: number, elements: object[], layer?: number): Promise<Result<unknown>>;
  deleteOpen(page: number, nums: number[]): Promise<Result<unknown>>;
  deleteByPath(path: string, page: number, nums: number[]): Promise<Result<unknown>>;
  insertPage(path: string, page: number, template: string): Promise<Result<unknown>>;
  removePage(path: string, page: number): Promise<Result<unknown>>;
  /** Adds a keyword to a page by the note's path, the open note too (#346). */
  insertKeyword(path: string, page: number, text: string): Promise<Result<unknown>>;
  /** Removes a page's keyword by its index in the page (#346). */
  deleteKeyword(path: string, page: number, index: number): Promise<Result<unknown>>;
  /** True once the pen is up and quiet; false when it stayed down past the wait. */
  penIdle(): Promise<boolean>;
}

class BadRequest extends Error {}

function check(condition: boolean, message: string): void {
  if (!condition) {
    throw new BadRequest(message);
  }
}

function wholeIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** A target layer, 0 to 3, when the request names one (#334). */
function parseLayer(value: unknown): {layer?: number} {
  if (value === undefined) {
    return {};
  }
  check(wholeIn(value, LAYERS.min, LAYERS.max), `layer must be a layer number from ${LAYERS.min} to ${LAYERS.max}`);
  return {layer: value as number};
}

/** The trailing `layer` argument of a host call: none when the request names no layer. */
function layerArg(operation: {layer?: number}): [] | [number] {
  return operation.layer === undefined ? [] : [operation.layer];
}

function parseNums(value: unknown): number[] {
  check(
    Array.isArray(value) && value.length > 0 && value.length <= LIMITS.elements && value.every(num => wholeIn(num, 1, Number.MAX_SAFE_INTEGER)),
    `nums must hold 1 to ${LIMITS.elements} element numbers from 1`,
  );
  return value as number[];
}

/** A matrix's six numbers, in their order. */
const MATRIX_PARTS = ['a', 'b', 'c', 'd', 'tx', 'ty'];
/** The smallest determinant a matrix may have: below it, the stroke would fold into a line. */
const FLATTEST = 1e-6;

/** Six finite numbers, a, b, c, d, tx and ty, that do not flatten the stroke (#326). */
function parseMatrix(value: unknown): Matrix {
  check(
    Array.isArray(value) && value.length === MATRIX_PARTS.length && value.every(entry => typeof entry === 'number' && Number.isFinite(entry)),
    `matrix must hold six numbers: ${MATRIX_PARTS.join(', ')}`,
  );
  const [a, b, c, d] = value as number[];
  check(Math.abs(a * d - b * c) >= FLATTEST, 'matrix must not flatten the element');
  return value as Matrix;
}

function parsePage(value: unknown): number {
  check(wholeIn(value, 0, Number.MAX_SAFE_INTEGER), 'page must be a page index from 0');
  return value as number;
}

function parseRect(value: unknown): EditRect {
  const rect = (value ?? {}) as Record<string, unknown>;
  const {left, top, right, bottom} = rect;
  const sides = [left, top, right, bottom];
  check(sides.every(side => typeof side === 'number' && Number.isFinite(side)), 'rect must hold left, top, right and bottom');
  const [l, t, r, b] = sides as number[];
  check(l >= 0 && t >= 0 && r <= PAGE.width && b <= PAGE.height, 'rect must lie on the page');
  check(r > l && b > t, 'rect must have a width and a height');
  return {left: Math.round(l), top: Math.round(t), right: Math.round(r), bottom: Math.round(b)};
}

/** A picture file inkctl copied into EDITOR_FOLDER. */
function parsePictureFile(value: unknown): string {
  const name = typeof value === 'string' && value.startsWith(EDITOR_FOLDER) ? value.slice(EDITOR_FOLDER.length) : '';
  check(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}\.(png|jpe?g)$/i.test(name), `file must be a .png or .jpg in ${EDITOR_FOLDER}`);
  return value as string;
}

/** The fewest and most points a polygon may hold, the last one closing it: a triangle is 4 (#463). */
export const POLYGON_POINTS = {min: 4, max: 64};

/** One `[x, y]` on the page, in whole pixels. */
function parsePoint(point: unknown): {x: number; y: number} {
  const [x, y] = Array.isArray(point) ? point : [];
  check(typeof x === 'number' && typeof y === 'number' && x >= 0 && y >= 0 && x <= PAGE.width && y <= PAGE.height, 'a point is not [x, y] on the page');
  return {x: Math.round(x), y: Math.round(y)};
}

function parsePenColor(value: unknown): number {
  check(PEN_TONES.includes(value as number), 'penColor must be a pen tone: 0, 157, 201 or 254');
  return value as number;
}

/**
 * A shape the tablet keeps as its own (#463): a straight line of 2 points, a closed polygon of 4 to
 * MAX_POLYGON_POINTS, or a circle or ellipse by its centre and radii, wholly on the page.
 */
function parseGeometry(raw: Record<string, unknown>): NewElement {
  check(GEOMETRY_SHAPES.includes(raw.shape as GeometryShape), `shape must be one of ${GEOMETRY_SHAPES.join(', ')}`);
  const shape = raw.shape as GeometryShape;
  const penColor = parsePenColor(raw.penColor);
  check(wholeIn(raw.penWidth, THICKNESS.min, THICKNESS.max), `penWidth must be a whole number from ${THICKNESS.min} to ${THICKNESS.max}`);
  const penWidth = raw.penWidth as number;
  if (shape === 'straightLine' || shape === 'GEO_polygon') {
    check(raw.center === undefined, `a ${shape} has points, not a center`);
    const points = Array.isArray(raw.points) ? raw.points.map(parsePoint) : [];
    if (shape === 'straightLine') {
      check(points.length === 2, 'a straight line needs 2 points');
    } else {
      const [first, last] = [points[0], points[points.length - 1]];
      const closed = points.length >= POLYGON_POINTS.min && first.x === last.x && first.y === last.y;
      check(
        closed && points.length <= POLYGON_POINTS.max,
        `a polygon needs ${POLYGON_POINTS.min} to ${POLYGON_POINTS.max} points, the last equal to the first`,
      );
    }
    return {kind: 'geometry', shape, points, ellipse: null, penColor, penWidth};
  }
  check(raw.points === undefined, `a ${shape} has a center and radii, not points`);
  const center = parsePoint(raw.center);
  const {major, minor, angle} = raw;
  check(wholeIn(major, 1, PAGE.height) && wholeIn(minor, 1, PAGE.height), 'major and minor must be whole radii from 1');
  check(shape === 'GEO_ellipse' || major === minor, 'a circle has major equal to minor');
  check(angle === 0, 'angle must be 0: a turned ellipse waits for the device round');
  const [a, b] = [major as number, minor as number];
  check(center.x - a >= 0 && center.y - b >= 0 && center.x + a <= PAGE.width && center.y + b <= PAGE.height, 'the ellipse must lie on the page');
  return {kind: 'geometry', shape, points: [], ellipse: {center, major: a, minor: b, angle: 0}, penColor, penWidth};
}

/**
 * A text box's style from the request's `bold`, `italic`, `align` and `font` (#404), each optional;
 * undefined when it names none, so a modify keeps the box's own style. A font is a .ttf or .otf file
 * inkctl wrote in EDITOR_FOLDER, as a picture is.
 */
function parseStyle(raw: Record<string, unknown>): TextStyle | undefined {
  const {bold, italic, align, font} = raw;
  if (bold === undefined && italic === undefined && align === undefined && font === undefined) {
    return undefined;
  }
  check(bold === undefined || typeof bold === 'boolean', 'bold must be true or false');
  check(italic === undefined || typeof italic === 'boolean', 'italic must be true or false');
  check(align === undefined || TEXT_ALIGNS.includes(align as never), `align must be one of ${TEXT_ALIGNS.join(', ')}`);
  const name = typeof font === 'string' && font.startsWith(EDITOR_FOLDER) ? font.slice(EDITOR_FOLDER.length) : '';
  check(font === undefined || /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}\.(ttf|otf)$/i.test(name), `font must be a .ttf or .otf in ${EDITOR_FOLDER}`);
  return {
    ...(bold === undefined ? {} : {bold: bold as boolean}),
    ...(italic === undefined ? {} : {italic: italic as boolean}),
    ...(align === undefined ? {} : {align: align as TextStyle['align']}),
    ...(font === undefined ? {} : {fontPath: font as string}),
  };
}

/** A text box's text, 1 to LIMITS.text characters not all blank, its font size and its style, if any. */
function parseText(raw: Record<string, unknown>): TextChange {
  check(typeof raw.text === 'string' && raw.text.trim().length > 0 && raw.text.length <= LIMITS.text, `text must hold 1 to ${LIMITS.text} characters`);
  check(wholeIn(raw.fontSize, FONT_SIZES.min, FONT_SIZES.max), `fontSize must be a whole number from ${FONT_SIZES.min} to ${FONT_SIZES.max}`);
  const style = parseStyle(raw);
  return {text: raw.text as string, fontSize: raw.fontSize as number, ...(style ? {style} : {})};
}

/** A keyword's text: 1 to LIMITS.keyword characters, not all blank, with no line break (#346). */
function parseKeyword(value: unknown): string {
  check(
    typeof value === 'string' && value.trim().length > 0 && value.length <= LIMITS.keyword && !/[\r\n\u2028\u2029]/.test(value),
    `text must hold 1 to ${LIMITS.keyword} characters on one line`,
  );
  return value as string;
}

function parseElement(value: unknown): NewElement {
  const raw = (value ?? {}) as Record<string, unknown>;
  switch (raw.kind) {
    case 'stroke': {
      const points = raw.points;
      check(Array.isArray(points) && points.length >= 2 && points.length <= MAX_STROKE_POINTS, `a stroke needs 2 to ${MAX_STROKE_POINTS} points`);
      const penColor = parsePenColor(raw.penColor);
      check(wholeIn(raw.thickness, THICKNESS.min, THICKNESS.max), `thickness must be a whole number from ${THICKNESS.min} to ${THICKNESS.max}`);
      return {kind: 'stroke', points: (points as unknown[]).map(parsePoint), penColor, thickness: raw.thickness as number};
    }
    case 'geometry':
      return parseGeometry(raw);
    case 'text':
      return {kind: 'text', ...parseText(raw), rect: parseRect(raw.rect)};
    case 'picture':
      return {kind: 'picture', file: parsePictureFile(raw.file), rect: parseRect(raw.rect)};
    default:
      throw new BadRequest(`unknown element kind: ${String(raw.kind)}`);
  }
}

function parseOperation(value: unknown): Operation {
  const raw = (value ?? {}) as Record<string, unknown>;
  switch (raw.op) {
    case 'insertElements':
      check(Array.isArray(raw.elements) && raw.elements.length > 0 && raw.elements.length <= LIMITS.elements, `elements must hold 1 to ${LIMITS.elements}`);
      return {op: 'insertElements', page: parsePage(raw.page), elements: (raw.elements as unknown[]).map(parseElement), ...parseLayer(raw.layer)};
    case 'modifyElements':
      check(wholeIn(raw.num, 1, Number.MAX_SAFE_INTEGER), 'num must be an element number from 1');
      // A new text and font size come together, for a text box only, never with a picture's file (#264).
      check(raw.text === undefined || raw.file === undefined, 'a modify sets a text or a file, not both');
      return {
        op: 'modifyElements',
        page: parsePage(raw.page),
        num: raw.num as number,
        rect: parseRect(raw.rect),
        ...(raw.file === undefined ? {} : {file: parsePictureFile(raw.file)}),
        ...(raw.text === undefined && raw.fontSize === undefined ? {} : {text: parseText(raw)}),
        ...parseLayer(raw.layer),
      };
    case 'transformElements':
      return {op: 'transformElements', page: parsePage(raw.page), nums: parseNums(raw.nums), matrix: parseMatrix(raw.matrix)};
    case 'deleteElements':
      return {op: 'deleteElements', page: parsePage(raw.page), nums: parseNums(raw.nums)};
    case 'insertPage':
      // A system template by its name, or a custom one by the full path of its PNG in MyStyle/ (#451).
      check(
        (typeof raw.template === 'string' && /^[a-z0-9_]+$/.test(raw.template)) || isCustomTemplatePath(raw.template),
        `template must be a system template name such as style_white, or a .png straight in ${CUSTOM_TEMPLATE_FOLDER}/`,
      );
      return {op: 'insertPage', page: parsePage(raw.page), template: raw.template as string};
    case 'removePage':
      return {op: 'removePage', page: parsePage(raw.page)};
    case 'insertKeyword':
      return {op: 'insertKeyword', page: parsePage(raw.page), text: parseKeyword(raw.text)};
    case 'deleteKeyword':
      // shortcut: the index is taken from 0 in the tablet's order; the device round of #346 measures both.
      check(wholeIn(raw.index, 0, Number.MAX_SAFE_INTEGER), 'index must be a keyword index from 0');
      return {op: 'deleteKeyword', page: parsePage(raw.page), index: raw.index as number};
    case 'openNote':
      return {op: 'openNote'};
    default:
      throw new BadRequest(`unknown op: ${String(raw.op)}`);
  }
}

/** The note's path, a `.note` in NOTES_FOLDER with no `.` or `..` part. */
export function isNotePath(value: unknown): value is string {
  const name = typeof value === 'string' && value.startsWith(NOTES_FOLDER) ? value.slice(NOTES_FOLDER.length) : '';
  return name.endsWith('.note') && name.split('/').every(part => part && part !== '.' && part !== '..');
}

/** The request, or a refusal named `bad-request` or `not-a-note`. */
export function parseRequest(args: Record<string, unknown>): EditRequest {
  if (!isNotePath(args.path)) {
    throw Object.assign(new BadRequest(`path must be a .note file in ${NOTES_FOLDER}`), {refusal: REFUSAL.notANote});
  }
  check(Array.isArray(args.ops) && args.ops.length > 0 && args.ops.length <= LIMITS.operations, `ops must hold 1 to ${LIMITS.operations} operations`);
  return {
    path: args.path,
    ops: (args.ops as unknown[]).map((op, index) => {
      try {
        return parseOperation(op);
      } catch (error) {
        throw new BadRequest(`operation ${index + 1}: ${(error as Error).message}`);
      }
    }),
  };
}

/** A step that did not apply: its refusal's name and, for an SDK error, the code it gave. */
class Stopped extends Error {
  constructor(readonly refusal: string, message: string, readonly sdkCode?: number, readonly step?: number) {
    super(message);
  }
}

async function must<T>(what: string, call: Promise<Result<T>>, refusal: string = REFUSAL.tabletRefused): Promise<T> {
  const answer = await call;
  if (!answer.ok) {
    throw new Stopped(refusal, `${what}: ${answer.message}`, answer.code);
  }
  return answer.value;
}

async function runOne(operation: Operation, path: string, open: boolean, host: EditHost): Promise<Record<string, unknown>> {
  if (operation.op === 'openNote') {
    return {};
  }
  const pages = await must('getNoteTotalPageNum', host.pageCount(path));
  const last = operation.op === 'insertPage' ? pages : pages - 1;
  if (operation.page > last) {
    throw new Stopped(REFUSAL.pageOutOfRange, `page ${operation.page} is not in the note, 0 to ${last}`);
  }
  switch (operation.op) {
    case 'insertElements': {
      const built: object[] = [];
      for (const spec of operation.elements) {
        built.push(await must('createElement', host.build(spec)));
      }
      const at = layerArg(operation);
      await must('insert', open ? host.insertOpen(operation.page, built, ...at) : host.insertByPath(path, operation.page, built, ...at));
      return {page: operation.page, inserted: built.length, ...(operation.layer === undefined ? {} : {layer: operation.layer})};
    }
    case 'modifyElements': {
      const element = await must(`element ${operation.num}`, host.getElement(path, operation.page, operation.num), REFUSAL.noElement);
      if ((element as {type?: number}).type === PICTURE_TYPE) {
        return movePicture(operation, path, open, host);
      }
      const {text} = operation;
      if (text && (element as {type?: number}).type !== TEXT_TYPE) {
        throw new Stopped(REFUSAL.badRequest, `element ${operation.num} is not a text box: only a text box takes a text`);
      }
      const placed = await must('place', host.place(element, operation.page, operation.rect));
      // A style the request names is set first, in place; a text with none keeps the box's own (#404).
      if (text?.style) {
        await must('restyle', Promise.resolve(host.restyle(placed, text.style)));
      }
      const changed = text ? await must('retext', Promise.resolve(host.retext(placed, text.text, text.fontSize))) : placed;
      const at = layerArg(operation);
      await must('modify', open ? host.modifyOpen(operation.page, [changed], ...at) : host.modifyByPath(path, operation.page, [changed], ...at));
      return {
        page: operation.page,
        num: operation.num,
        rect: operation.rect,
        ...(text ? {retexted: true} : {}),
        ...(operation.layer === undefined ? {} : {layer: operation.layer}),
      };
    }
    case 'transformElements': {
      // Strokes only: a picture or a text box is sent a rect by modifyElements (#326).
      const transformed: object[] = [];
      for (const num of operation.nums) {
        const element = await must(`element ${num}`, host.getElement(path, operation.page, num), REFUSAL.noElement);
        if ((element as {type?: number}).type !== STROKE_TYPE) {
          throw new Stopped(REFUSAL.badRequest, `element ${num} is not a stroke: a picture or a text box is sent a rect`);
        }
        transformed.push(await must(`transform of element ${num}`, host.transform(element, operation.page, operation.matrix)));
      }
      await must('modify', open ? host.modifyOpen(operation.page, transformed) : host.modifyByPath(path, operation.page, transformed));
      return {page: operation.page, transformed: transformed.length};
    }
    case 'deleteElements':
      await must('delete', open ? host.deleteOpen(operation.page, operation.nums) : host.deleteByPath(path, operation.page, operation.nums));
      return {page: operation.page, deleted: operation.nums.length};
    case 'insertPage':
      await must('insertNotePage', host.insertPage(path, operation.page, operation.template));
      return {page: operation.page, pages: pages + 1};
    case 'removePage':
      await must('removeNotePage', host.removePage(path, operation.page));
      return {page: operation.page, pages: pages - 1};
    case 'insertKeyword':
      await must('insertKeyWord', host.insertKeyword(path, operation.page, operation.text));
      return {page: operation.page, keyword: true};
    case 'deleteKeyword':
      await must(`deleteKeyWord of keyword ${operation.index}`, host.deleteKeyword(path, operation.page, operation.index));
      return {page: operation.page, index: operation.index};
  }
}

/**
 * A picture moves as a new picture at the rect, then the old one deleted. A modify cannot move it:
 * the path a read answers names no file, and a modify with a file that exists left the old picture
 * drawn at its old place beside the moved one (device round 13, #312). So the request names the
 * picture's file, and the insert comes first, so a failure never loses the picture.
 */
async function movePicture(
  operation: Extract<Operation, {op: 'modifyElements'}>,
  path: string,
  open: boolean,
  host: EditHost,
): Promise<Record<string, unknown>> {
  if (!operation.file) {
    throw new Stopped(REFUSAL.badRequest, `element ${operation.num} is a picture: a picture moves only with its file`);
  }
  const {page, num, rect} = operation;
  const picture = await must('createElement', host.build({kind: 'picture', file: operation.file, rect}));
  const at = layerArg(operation);
  await must('insert', open ? host.insertOpen(page, [picture], ...at) : host.insertByPath(path, page, [picture], ...at));
  await must(`delete of the old picture ${num}, after the moved one was inserted`, open ? host.deleteOpen(page, [num]) : host.deleteByPath(path, page, [num]));
  return {page, num, rect, replaced: true};
}

/**
 * Every refusal that a read of the note can foretell, before any write (#470): a transform of an
 * element that is no stroke, a modify of a text box that is none, a picture moved without its file.
 * An element a read cannot find is left to its own step, since an earlier operation may add it.
 */
async function precheck(ops: Operation[], path: string, host: EditHost): Promise<void> {
  for (const [index, operation] of ops.entries()) {
    const refuse = (message: string) => new Stopped(REFUSAL.badRequest, message, undefined, index + 1);
    if (operation.op === 'transformElements') {
      for (const num of operation.nums) {
        const element = await host.getElement(path, operation.page, num);
        if (element.ok && (element.value as {type?: number}).type !== STROKE_TYPE) {
          throw refuse(`element ${num} is not a stroke: a picture or a text box is sent a rect`);
        }
      }
    } else if (operation.op === 'modifyElements') {
      const element = await host.getElement(path, operation.page, operation.num);
      const type = element.ok ? (element.value as {type?: number}).type : undefined;
      if (type === PICTURE_TYPE && !operation.file) {
        throw refuse(`element ${operation.num} is a picture: a picture moves only with its file`);
      }
      if (type !== undefined && type !== PICTURE_TYPE && operation.text && type !== TEXT_TYPE) {
        throw refuse(`element ${operation.num} is not a text box: only a text box takes a text`);
      }
    }
  }
}

/** The open note's path, or null when none is open or the call failed. */
async function openNotePath(host: EditHost): Promise<string | null> {
  const open = await host.openNote();
  return open.ok && open.value ? open.value : null;
}

/**
 * Operations whose read or write of the open note needs its newest ink in the file first. A keyword
 * call writes the file by path, as a page change does (#346).
 */
const SAVES_FIRST = new Set<Operation['op']>(['modifyElements', 'transformElements', 'insertPage', 'removePage', 'insertKeyword', 'deleteKeyword']);

/** The action `edit`: never a success for an operation that did not apply. */
export function editAction(host: EditHost, now: () => number = Date.now) {
  return async (args: Record<string, unknown>): Promise<ActionResult> => {
    const openNote = await openNotePath(host);
    let request: EditRequest;
    try {
      request = parseRequest(args);
    } catch (error) {
      const refusal = (error as {refusal?: string}).refusal ?? REFUSAL.badRequest;
      throw new ActionRefused(`${refusal}: ${(error as Error).message}`, undefined, {refusal, openNote});
    }
    if (!(await host.penIdle())) {
      throw new ActionRefused(`${REFUSAL.penDown}: the pen stayed on the page; nothing was applied`, undefined, {refusal: REFUSAL.penDown, openNote});
    }
    const {path, ops} = request;
    const open = openNote === path;
    const results: object[] = [];
    try {
      if (open && ops.some(operation => SAVES_FIRST.has(operation.op))) {
        const saved = await host.saveOpenNote();
        if (!saved.ok || saved.value !== true) {
          throw new Stopped(REFUSAL.saveFailed, 'saveCurrentNote did not save the open note; nothing was applied');
        }
      }
      await precheck(ops, path, host);
      for (const operation of ops) {
        const started = now();
        const result = await runOne(operation, path, open, host);
        results.push({ok: true, op: operation.op, ms: now() - started, ...result});
      }
    } catch (error) {
      if (!(error instanceof Stopped)) {
        throw error;
      }
      const step = error.step ?? results.length + 1;
      const written = error.step === undefined ? results.length : 0;
      const detail = {refusal: error.refusal, openNote, path, step, written, results, sdkCode: error.sdkCode};
      const code = error.refusal === REFUSAL.tabletRefused ? ACTION_FAILED : undefined;
      // Name what the tablet kept, so the editor undoes only the rest (#470).
      const kept = error.step !== undefined ? '; nothing was written' : written > 0 ? (written === 1 ? '; operation 1 was written' : `; operations 1 to ${written} were written`) : '';
      throw new ActionRefused(`${error.refusal}: operation ${step} (${ops[step - 1].op}): ${error.message}${kept}`, code, detail);
    }
    return {line: `DeviceLink: edit: ${results.length} operations applied to ${path}`, path, open, openNote, results};
  };
}
