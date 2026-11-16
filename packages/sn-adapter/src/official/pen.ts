/**
 * The pen and the page's strokes, for the #75 spike: pen-up and motion events, the last element,
 * the page's elements, and the pen in use. Read from sn-plugin-lib 0.2.3
 * and docs.supernote.com (PluginManager.registerEventListener and registerMotionListener,
 * PluginFileAPI.getLastElement and getElements, PluginCommAPI.getPenInfo).
 */
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {readAll} from './elements';
import {attempt, fail, fromResponse, ok, Result, THROWN_CODE} from './result';

/** The only plugin event the docs list: its message is the Element[] just written. */
const PEN_UP_EVENT = 'event_pen_up';
/** registerType 1: normal order among the plugins that listen (0 first, 2 last). */
const NORMAL_ORDER = 1;
export {MAX_STROKE_POINTS} from './elements';

export type PenPoint = {x: number; y: number};
/** The fields of a MotionEvent the spike reads; x and y are screen pixels (docs, MotionEvent). */
export type Motion = {
  action: number;
  x: number;
  y: number;
  toolType: number;
  eventTime: number;
  downTime: number;
};
/** Pen type 10 fineliner, 16 pressure pen, 11 marker, 15 calligraphy (docs, PenInfo). */
export type PenInfo = {type: number; color: number; width: number};

/** An element as the SDK hands it over: plain fields plus native point accessors. */
type Accessor<T> = {
  size(): Promise<number>;
  getRange(start: number, count: number): Promise<T[]>;
};
type SdkRect = {left: number; top: number; right: number; bottom: number};
type SdkElement = {
  uuid?: string;
  type?: number;
  stroke?: {points?: Accessor<PenPoint>} | null;
  picture?: {rect?: SdkRect} | null;
  textBox?: {textRect?: SdkRect} | null;
  geometry?: {points?: PenPoint[]} | null;
  recycle?: () => Promise<void>;
};

/**
 * The time pageOccupied may take before it answers with what it has (#152). The read runs while
 * the handwriting is recognized (0.9 to 2.6 s on the tablet, docs/supernote.md), so only the part
 * past the recognition adds to the press.
 */
export const OCCUPIED_BUDGET_MS = 1500;

function thrown(error: unknown): Result<never> {
  return fail(
    THROWN_CODE,
    error instanceof Error ? error.message : String(error),
  );
}

function subscribe(register: () => {remove: () => void}): Result<() => void> {
  try {
    const subscription = register();
    return ok(() => subscription.remove());
  } catch (error) {
    return thrown(error);
  }
}

/** Calls `listener` with the elements of each stroke the person ends; returns the stop function. */
export function onPenUp(
  listener: (elements: object[]) => void,
): Result<() => void> {
  return subscribe(() =>
    PluginManager.registerEventListener(PEN_UP_EVENT, NORMAL_ORDER, {
      onMsg: (msg: unknown) => listener(Array.isArray(msg) ? msg : []),
    }),
  );
}

/** Calls `listener` with each touch or pen motion; returns the stop function. */
export function onMotion(
  listener: (motion: Motion) => void,
): Result<() => void> {
  return subscribe(() =>
    PluginManager.registerMotionListener(NORMAL_ORDER, {
      onMsg: (msg: Motion) => listener(msg),
    }),
  );
}

/** The last element of the current note page; null when the page is empty. */
export function getLastElement(): Promise<Result<object | null>> {
  return attempt(() => PluginFileAPI.getLastElement());
}

/** Every element of a page: strokes, pictures, titles, links, text boxes. */
export function getElements(
  page: number,
  notePath: string,
): Promise<Result<object[]>> {
  return attempt(() => PluginFileAPI.getElements(page, notePath));
}

/**
 * The docs answer an APIResponse; the 0.2.3 source passes the native answer through untyped, so a
 * bare PenInfo counts too, and the log shows which one the host sends.
 */
export function getPenInfo(): Promise<Result<PenInfo>> {
  return attempt(
    () => PluginCommAPI.getPenInfo(),
    raw =>
      raw !== null && typeof raw === 'object' && !('success' in raw)
        ? ok(raw as PenInfo)
        : fromResponse<PenInfo>(raw),
  );
}

/** A stroke's sample points in page pixels, at most MAX_STROKE_POINTS; empty for other types. */
export function strokePoints(element: object): Promise<Result<PenPoint[]>> {
  return readAll((element as SdkElement).stroke?.points);
}

/** Frees the element's native point cache (docs, Element Caching and Release). */
export async function recycleElement(element: object): Promise<Result<true>> {
  try {
    await (element as SdkElement).recycle?.();
    return ok(true);
  } catch (error) {
    return thrown(error);
  }
}

/** The smallest rect around the points; null for none. */
function pointsRect(points: readonly PenPoint[]): SdkRect | null {
  if (points.length === 0) {
    return null;
  }
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/** Where one element is on the page, in page pixels; null for a kind with no known bounds. */
async function elementRect(element: SdkElement): Promise<Result<SdkRect | null>> {
  if (element.picture?.rect) {
    return ok(element.picture.rect);
  }
  if (element.textBox?.textRect) {
    return ok(element.textBox.textRect);
  }
  if (element.geometry?.points) {
    return ok(pointsRect(element.geometry.points));
  }
  // Titles and links mark strokes, which are read as strokes; maxX and maxY are deprecated and in
  // EMR units (sn-plugin-lib 0.2.3, Element.d.ts), so a stroke's bounds come from its points.
  const points = await strokePoints(element);
  return points.ok ? ok(pointsRect(points.value)) : points;
}

/**
 * What a page read found: the rects, how many of the page's elements they come from, and whether
 * every element was read. A partial read still helps the placement, but no lasso may trust it.
 */
export type OccupiedRead = {rects: SdkRect[]; complete: boolean};

type Occupied = OccupiedRead & {elements: number; read: number; ms: number};

/** True when `work` ends within `ms`, false once `ms` has passed first; the timer never lingers. */
async function within(work: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), Math.max(0, ms));
  });
  try {
    return await Promise.race([work.then(() => true as const), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The rects of every stroke, picture, text box and shape on a page (#152), for a placement that
 * avoids the person's ink. The elements are read all at once, not one after the other: each
 * stroke costs two bridge calls, and one by one a page of 70 to 90 elements took past 700 ms
 * (8 to 11 ms each, docs/supernote.md). Once `budgetMs` has passed it answers with the rects read
 * so far, marked incomplete. An element whose read fails makes the read incomplete. Every element
 * is recycled once its read ends.
 */
async function pageOccupied(
  page: number,
  notePath: string,
  budgetMs: number,
  now: () => number,
): Promise<Result<Occupied>> {
  const started = now();
  const elements = await getElements(page, notePath);
  if (!elements.ok) {
    return elements;
  }
  const all = elements.value as SdkElement[];
  const rects: SdkRect[] = [];
  let read = 0;
  let failed = 0;
  const reads = Promise.all(
    all.map(async element => {
      const rect = await elementRect(element).catch(thrown);
      if (rect.ok) {
        read += 1;
        if (rect.value) {
          rects.push(rect.value);
        }
      } else {
        failed += 1;
      }
    }),
  );
  // Recycled once every read ends, also after the budget answered.
  reads.then(() => Promise.all(all.map(element => recycleElement(element)))).catch(() => {});
  const finished = await within(reads, budgetMs - (now() - started));
  return ok({
    rects: [...rects],
    complete: finished && failed === 0,
    elements: all.length,
    read,
    ms: now() - started,
  });
}

/**
 * pageOccupied as a lasso host's `getOccupied` (#152): the rects, with one line for the log that
 * says how many elements took how long, and whether the read was cut by its budget.
 */
export async function occupiedRects(
  notePath: string,
  page: number,
  log: (line: string) => void = () => {},
  budgetMs: number = OCCUPIED_BUDGET_MS,
  now: () => number = Date.now,
): Promise<Result<OccupiedRead>> {
  const read = await pageOccupied(page, notePath, budgetMs, now);
  if (!read.ok) {
    log(`place: ${read.message}: today's placement`);
    return read;
  }
  const {rects, complete, elements, ms} = read.value;
  log(
    complete
      ? `place: page read ${elements} elements in ${ms} ms`
      : `place: page read ${read.value.read} of ${elements} elements in ${ms} ms: partial, placed by what was read`,
  );
  return ok({rects, complete});
}
