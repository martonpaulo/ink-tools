/**
 * The command channel inkctl drives (#148): inkctl pushes one JSON command to COMMAND_PATH, presses
 * the «Run Command» sidebar button in the open note, and reads the answer from logcat. This module
 * owns the command's shape and the answer's lines; `noteApi.ts` is the thin glue to sn-plugin-lib.
 * The CLI owns every rule (text to strokes, rect arithmetic, refusals); this side only executes.
 */

/** Where inkctl pushes the command; `cli/inkctl/src/inkctl` names the same path. */
export const COMMAND_PATH = '/storage/emulated/0/MyStyle/Probe/command.json';
/** Every answer line starts with this, then the command id, the chunk number and the count. */
export const ANSWER_MARK = 'SNPROBE answer';
/** The id of an answer whose command carries none it could read. */
export const UNKNOWN_ID = 'unknown';
/** A logcat line holds about 4 KB; a longer answer goes in chunks of this many characters. */
export const ANSWER_CHUNK = 3000;
/** The page's size in pixels on the owner's tablet (docs/supernote.md › Screen and units). */
export const PAGE_WIDTH = 1920;
export const PAGE_HEIGHT = 2560;
/** Room around the last element, so its whole outline lies inside the lasso. */
export const LASSO_MARGIN = 8;
/** At most this many points in one command, so one press stays within a few seconds. */
export const MAX_POINTS = 5000;

export type Point = {x: number; y: number};
export type Rect = {left: number; top: number; right: number; bottom: number};

/** What the note can do for a command, as `noteApi.ts` wraps sn-plugin-lib. Each call throws a HelperError. */
export interface HelperApi {
  pageNumber(): Promise<number>;
  insertStrokes(strokes: Point[][], page: number): Promise<void>;
  lasso(rect: Rect): Promise<Record<string, unknown>>;
  lastElementRect(): Promise<Rect>;
  lassoStrokes(): Promise<Point[][]>;
  jumpToPage(page: number): Promise<void>;
}

export class HelperError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

/** inkctl's command id: hex, as uuid4().hex. */
const ID_PATTERN = /^[0-9a-f]{8,64}$/;
/** A command that is not one of these shapes is refused before any note call. */
const USAGE = 2;

type Command =
  | {id: string; op: 'insertStrokes'; strokes: Point[][]}
  | {id: string; op: 'lassoRect'; rect: Rect}
  | {id: string; op: 'lassoLast'}
  | {id: string; op: 'readLasso'}
  | {id: string; op: 'jumpToPage'; page: number};

function onPage(x: unknown, y: unknown): boolean {
  return (
    typeof x === 'number' && typeof y === 'number' && x >= 0 && y >= 0 && x <= PAGE_WIDTH && y <= PAGE_HEIGHT
  );
}

function parseStrokes(value: unknown): Point[][] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HelperError(USAGE, 'strokes must be a non-empty list');
  }
  let count = 0;
  const strokes = value.map(stroke => {
    if (!Array.isArray(stroke) || stroke.length < 2) {
      throw new HelperError(USAGE, 'each stroke needs two points or more');
    }
    return stroke.map(point => {
      if (!Array.isArray(point) || !onPage(point[0], point[1])) {
        throw new HelperError(USAGE, `a point is not [x, y] on the page: ${JSON.stringify(point)}`);
      }
      count += 1;
      return {x: Math.round(point[0]), y: Math.round(point[1])};
    });
  });
  if (count > MAX_POINTS) {
    throw new HelperError(USAGE, `${count} points is more than ${MAX_POINTS}`);
  }
  return strokes;
}

/** A page index, from 0, as `PluginCommAPI.jumpToPage` takes it. */
function parsePage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new HelperError(USAGE, 'page must be a page index from 0');
  }
  return value;
}

function parseRect(value: unknown): Rect {
  const rect = value as Rect;
  if (!rect || !onPage(rect.left, rect.top) || !onPage(rect.right, rect.bottom)) {
    throw new HelperError(USAGE, 'rect must hold left, top, right and bottom on the page');
  }
  if (rect.right <= rect.left || rect.bottom <= rect.top) {
    throw new HelperError(USAGE, 'rect must have a width and a height');
  }
  return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom};
}

/** The command's id and shape, or a HelperError; the id is kept whenever it can be read. */
export function parseCommand(text: string): Command {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HelperError(USAGE, 'the command is not JSON');
  }
  const id = typeof raw?.id === 'string' ? raw.id : '';
  if (!ID_PATTERN.test(id)) {
    throw new HelperError(USAGE, 'the command has no hex id');
  }
  switch (raw.op) {
    case 'insertStrokes':
      return {id, op: 'insertStrokes', strokes: parseStrokes(raw.strokes)};
    case 'lassoRect':
      return {id, op: 'lassoRect', rect: parseRect(raw.rect)};
    case 'lassoLast':
    case 'readLasso':
      return {id, op: raw.op};
    case 'jumpToPage':
      return {id, op: 'jumpToPage', page: parsePage(raw.page)};
    default:
      throw new HelperError(USAGE, `unknown op: ${String(raw.op)}`);
  }
}

/** The smallest rect holding every point. */
export function boundsOf(strokes: Point[][]): Rect {
  const points = strokes.flat();
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)};
}

/** A rect grown by LASSO_MARGIN on each side and kept on the page. */
export function padded(rect: Rect): Rect {
  return {
    left: Math.max(0, rect.left - LASSO_MARGIN),
    top: Math.max(0, rect.top - LASSO_MARGIN),
    right: Math.min(PAGE_WIDTH, rect.right + LASSO_MARGIN),
    bottom: Math.min(PAGE_HEIGHT, rect.bottom + LASSO_MARGIN),
  };
}

async function execute(command: Command, api: HelperApi): Promise<Record<string, unknown>> {
  switch (command.op) {
    case 'insertStrokes': {
      const page = await api.pageNumber();
      await api.insertStrokes(command.strokes, page);
      return {page, strokes: command.strokes.length, rect: boundsOf(command.strokes)};
    }
    case 'lassoRect':
      return {rect: command.rect, counts: await api.lasso(command.rect)};
    case 'lassoLast': {
      const rect = padded(await api.lastElementRect());
      return {rect, counts: await api.lasso(rect)};
    }
    case 'readLasso': {
      const strokes = await api.lassoStrokes();
      return {strokes: strokes.map(stroke => stroke.map(point => [point.x, point.y]))};
    }
    case 'jumpToPage': {
      // The note app ignores `note open`'s page extra for a note opened before (#220); the answer's
      // page is read after the jump, so inkctl proves the page the note shows.
      await api.jumpToPage(command.page);
      return {page: await api.pageNumber()};
    }
  }
}

/**
 * Run one command text and answer it as JSON: `{ok: true, op, ms, ...}` or `{ok: false, code,
 * message}`. Never throws: a failure is an answer, so inkctl always learns the outcome.
 */
export async function runCommand(text: string, api: HelperApi, now: () => number = Date.now) {
  const started = now();
  let id = '';
  try {
    const command = parseCommand(text);
    id = command.id;
    const result = await execute(command, api);
    return {id, answer: {ok: true, op: command.op, ms: now() - started, ...result}};
  } catch (error) {
    const code = error instanceof HelperError ? error.code : 1;
    const raw = (() => {
      try {
        return JSON.parse(text)?.id;
      } catch {
        return '';
      }
    })();
    id = id || (typeof raw === 'string' && ID_PATTERN.test(raw) ? raw : UNKNOWN_ID);
    return {id, answer: {ok: false, code, message: (error as Error).message}};
  }
}

/** The logcat lines of one answer: `SNPROBE answer <id> <n>/<count> <chunk>`, in order. */
export function answerLines(id: string, answer: object): string[] {
  const text = JSON.stringify(answer);
  const count = Math.max(1, Math.ceil(text.length / ANSWER_CHUNK));
  const lines: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const chunk = text.slice(index * ANSWER_CHUNK, (index + 1) * ANSWER_CHUNK);
    lines.push(`${ANSWER_MARK} ${id} ${index + 1}/${count} ${chunk}`);
  }
  return lines;
}
