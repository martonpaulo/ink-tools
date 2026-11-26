/**
 * The Ink Notebook Editor's tablet helper (#312): the action `edit` that inkctl sends through the
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
  MAX_STROKE_POINTS,
  PICTURE_TYPE,
  pluginDataFolder,
  SHARED_ROOT,
  type ActionResult,
  type EditRect,
  type NewElement,
  type Result,
} from '@ink-tools/sn-adapter/official';
import {CUSTOM_TEMPLATE_FOLDER, isCustomTemplatePath} from './templates';

/** Device Link's folder in the hidden `.data/plugin/`: inkctl writes the request and the pictures there. */
export const EDITOR_FOLDER = `${pluginDataFolder('inktools-device-link')}/`;
/** The only folder a request may name a note in. */
export const NOTES_FOLDER = `${SHARED_ROOT}/Note/`;
/** The most a request may hold: operations, elements in one operation, and a text box's characters. */
export const LIMITS = {operations: 64, elements: 64, text: 500};
export const FONT_SIZES = {min: 8, max: 200};
export const THICKNESS = {min: 100, max: 5000};
/** The page's size in pixels on the Manta (docs/supernote.md › Screen and units). */
export const PAGE = {width: 1920, height: 2560};
/** The Manta's four pen tones (docs/supernote.md › Greys and colours): no other colour enters a note. */
export const PEN_TONES = [0x00, 0x9d, 0xc9, 0xfe];

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
  | {op: 'insertElements'; page: number; elements: NewElement[]}
  | {op: 'modifyElements'; page: number; num: number; rect: EditRect; file?: string}
  | {op: 'deleteElements'; page: number; nums: number[]}
  | {op: 'insertPage'; page: number; template: string}
  | {op: 'removePage'; page: number}
  | {op: 'openNote'};

export type EditRequest = {path: string; ops: Operation[]};

/** What the helper needs of the tablet, in our words; `device.ts` maps each to sn-adapter. */
export interface EditHost {
  openNote(): Promise<Result<string>>;
  saveOpenNote(): Promise<Result<boolean>>;
  pageCount(path: string): Promise<Result<number>>;
  build(spec: NewElement): Promise<Result<object>>;
  getElement(path: string, page: number, num: number): Promise<Result<object>>;
  place(element: object, page: number, rect: EditRect): Promise<Result<object>>;
  insertOpen(page: number, elements: object[]): Promise<Result<unknown>>;
  insertByPath(path: string, page: number, elements: object[]): Promise<Result<unknown>>;
  modifyOpen(page: number, elements: object[]): Promise<Result<unknown>>;
  modifyByPath(path: string, page: number, elements: object[]): Promise<Result<unknown>>;
  deleteOpen(page: number, nums: number[]): Promise<Result<unknown>>;
  deleteByPath(path: string, page: number, nums: number[]): Promise<Result<unknown>>;
  insertPage(path: string, page: number, template: string): Promise<Result<unknown>>;
  removePage(path: string, page: number): Promise<Result<unknown>>;
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

function parseElement(value: unknown): NewElement {
  const raw = (value ?? {}) as Record<string, unknown>;
  switch (raw.kind) {
    case 'stroke': {
      const points = raw.points;
      check(Array.isArray(points) && points.length >= 2 && points.length <= MAX_STROKE_POINTS, `a stroke needs 2 to ${MAX_STROKE_POINTS} points`);
      check(PEN_TONES.includes(raw.penColor as number), 'penColor must be a pen tone: 0, 157, 201 or 254');
      check(wholeIn(raw.thickness, THICKNESS.min, THICKNESS.max), `thickness must be a whole number from ${THICKNESS.min} to ${THICKNESS.max}`);
      return {
        kind: 'stroke',
        points: (points as unknown[]).map(point => {
          const [x, y] = Array.isArray(point) ? point : [];
          check(typeof x === 'number' && typeof y === 'number' && x >= 0 && y >= 0 && x <= PAGE.width && y <= PAGE.height, 'a point is not [x, y] on the page');
          return {x: Math.round(x), y: Math.round(y)};
        }),
        penColor: raw.penColor as number,
        thickness: raw.thickness as number,
      };
    }
    case 'text':
      check(typeof raw.text === 'string' && raw.text.trim().length > 0 && raw.text.length <= LIMITS.text, `text must hold 1 to ${LIMITS.text} characters`);
      check(wholeIn(raw.fontSize, FONT_SIZES.min, FONT_SIZES.max), `fontSize must be a whole number from ${FONT_SIZES.min} to ${FONT_SIZES.max}`);
      return {kind: 'text', text: raw.text as string, rect: parseRect(raw.rect), fontSize: raw.fontSize as number};
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
      return {op: 'insertElements', page: parsePage(raw.page), elements: (raw.elements as unknown[]).map(parseElement)};
    case 'modifyElements':
      check(wholeIn(raw.num, 1, Number.MAX_SAFE_INTEGER), 'num must be an element number from 1');
      return {
        op: 'modifyElements',
        page: parsePage(raw.page),
        num: raw.num as number,
        rect: parseRect(raw.rect),
        ...(raw.file === undefined ? {} : {file: parsePictureFile(raw.file)}),
      };
    case 'deleteElements': {
      const nums = raw.nums;
      check(Array.isArray(nums) && nums.length > 0 && nums.length <= LIMITS.elements && nums.every(num => wholeIn(num, 1, Number.MAX_SAFE_INTEGER)), `nums must hold 1 to ${LIMITS.elements} element numbers from 1`);
      return {op: 'deleteElements', page: parsePage(raw.page), nums: nums as number[]};
    }
    case 'insertPage':
      // A system template by its name, or a custom one by the full path of its PNG in MyStyle/ (#451).
      check(
        (typeof raw.template === 'string' && /^[a-z0-9_]+$/.test(raw.template)) || isCustomTemplatePath(raw.template),
        `template must be a system template name such as style_white, or a .png straight in ${CUSTOM_TEMPLATE_FOLDER}/`,
      );
      return {op: 'insertPage', page: parsePage(raw.page), template: raw.template as string};
    case 'removePage':
      return {op: 'removePage', page: parsePage(raw.page)};
    case 'openNote':
      return {op: 'openNote'};
    default:
      throw new BadRequest(`unknown op: ${String(raw.op)}`);
  }
}

/** The note's path, a `.note` in NOTES_FOLDER with no `.` or `..` part. */
function isNotePath(value: unknown): value is string {
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
  constructor(readonly refusal: string, message: string, readonly sdkCode?: number) {
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
      await must('insert', open ? host.insertOpen(operation.page, built) : host.insertByPath(path, operation.page, built));
      return {page: operation.page, inserted: built.length};
    }
    case 'modifyElements': {
      const element = await must(`element ${operation.num}`, host.getElement(path, operation.page, operation.num), REFUSAL.noElement);
      if ((element as {type?: number}).type === PICTURE_TYPE) {
        return movePicture(operation, path, open, host);
      }
      const placed = await must('place', host.place(element, operation.page, operation.rect));
      await must('modify', open ? host.modifyOpen(operation.page, [placed]) : host.modifyByPath(path, operation.page, [placed]));
      return {page: operation.page, num: operation.num, rect: operation.rect};
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
  await must('insert', open ? host.insertOpen(page, [picture]) : host.insertByPath(path, page, [picture]));
  await must(`delete of the old picture ${num}, after the moved one was inserted`, open ? host.deleteOpen(page, [num]) : host.deleteByPath(path, page, [num]));
  return {page, num, rect, replaced: true};
}

/** The open note's path, or null when none is open or the call failed. */
async function openNotePath(host: EditHost): Promise<string | null> {
  const open = await host.openNote();
  return open.ok && open.value ? open.value : null;
}

/** Operations whose read or write of the open note needs its newest ink in the file first. */
const SAVES_FIRST = new Set<Operation['op']>(['modifyElements', 'insertPage', 'removePage']);

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
      for (const operation of ops) {
        const started = now();
        const result = await runOne(operation, path, open, host);
        results.push({ok: true, op: operation.op, ms: now() - started, ...result});
      }
    } catch (error) {
      if (!(error instanceof Stopped)) {
        throw error;
      }
      const detail = {refusal: error.refusal, openNote, path, step: results.length + 1, results, sdkCode: error.sdkCode};
      const code = error.refusal === REFUSAL.tabletRefused ? ACTION_FAILED : undefined;
      throw new ActionRefused(`${error.refusal}: operation ${results.length + 1} (${ops[results.length].op}): ${error.message}`, code, detail);
    }
    return {line: `DeviceLink: edit: ${results.length} operations applied to ${path}`, path, open, openNote, results};
  };
}
