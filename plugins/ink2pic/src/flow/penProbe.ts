/**
 * The #75 device spike: logs what the pen, the page and a plugin-made lasso really give, so the
 * one-button flow is designed from the device and not from the type definitions. Log only; it
 * never changes or deletes a stroke. Every line starts with «probe» so the report finds them.
 *
 * Once armed (by Probe in the Log view), each pen-up logs the last element and the pen; a circle
 * drawn around earlier strokes is lassoed natively. The page is read again at each pen-up, so a
 * page or note change is followed. The listeners stop with Stop probe or when the view closes
 * (lifecycle 3), so the probe never costs SDK calls or lassoes a closed «o» once the view is gone. Probe also lassoes the
 * page's last picture and reads the lasso back, then closes the view, so the person sees whether
 * the native lasso stays.
 *
 * The calls made: getCurrentFilePath, getCurrentPageNum, getPageSize, getElements,
 * getLastElement, the stroke points' size and getRange, recycle, getPenInfo, lassoElements,
 * getLassoRect, getLassoElements, closePluginView and the two listeners. None deletes, inserts or
 * changes an element.
 */
import {brief, log, logged} from '../profile';
import {
  getLassoElements,
  getLassoRect,
  lassoElements,
  Rect,
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  getElements,
  getLastElement,
  getPenInfo,
  Motion,
  onMotion,
  onPenUp,
  PenPoint,
  recycleElement,
  strokePoints,
  LifeState,
  onLifecycle,
  closePluginView,
} from '@ink-tools/sn-adapter/official';
import {
  boundsOf,
  isClosedLoop,
  PageSize,
  PageStroke,
  WordChoice,
  wordInCircle,
} from './selectWord';

/** `Element.TYPE_STROKE` and `TYPE_PICTURE` (docs, Element). */
const STROKE_TYPE = 0;
const PICTURE_TYPE = 200;
/** Android MotionEvent actions (docs, MotionEvent). */
const ACTION_DOWN = 0;
const ACTION_UP = 1;
const ACTION_MOVE = 2;
const ACTION_CANCEL = 3;
/** The newest strokes of the page whose points the word rules read: a few lines' worth. */
export const PROBE_STROKES = 60;
/** Points a log line shows of a circle, spread over the whole loop. */
const SAMPLE_POINTS = 8;
/** Long enough for a picture's path and rect on one line. */
const FIELDS_MAX = 400;

type PageContext = {path: string; page: number; size: PageSize};
type SdkElement = {
  uuid?: string;
  type?: number;
  numInPage?: number;
  picture?: {picturePath?: string; rect?: Rect} | null;
};

let stops: (() => void)[] = [];
/** When the last pen-up arrived, for the pause the log shows. */
let lastAt: number | null = null;
let motion: {points: PenPoint[]; toolType: number} | null = null;
/** Pen-ups are handled one after another, in the order they arrive. */
let queue: Promise<void> = Promise.resolve();
/** The arming under way: a second Probe tap waits for it instead of registering again (#111). */
let arming: Promise<void> | null = null;
/**
 * Counts the Stop probes (#111): a pen-up whose handling began before the last stop lassoes
 * nothing.
 */
let generation = 0;

const armedListeners = new Set<(armed: boolean) => void>();

export function probeArmed(): boolean {
  return stops.length > 0;
}

/** Calls `listener` when the probe is armed or stopped; returns the stop function. */
export function onProbeArmed(listener: (armed: boolean) => void): () => void {
  armedListeners.add(listener);
  return () => armedListeners.delete(listener);
}

function tellArmed(): void {
  armedListeners.forEach(listener => listener(probeArmed()));
}

/** Stops listening and forgets the strokes: Stop probe, the view's close, and tests. */
export function stopPenProbe(): void {
  const wasArmed = probeArmed();
  generation++;
  stops.forEach(stop => stop());
  stops = [];
  lastAt = null;
  motion = null;
  queue = Promise.resolve();
  if (wasArmed) {
    log('probe: listeners off');
    tellArmed();
  }
}

/** Resolves when every pen-up received so far is handled (tests). */
export function probeIdle(): Promise<void> {
  return queue;
}

async function readContext(): Promise<PageContext | null> {
  const path = await logged('getCurrentFilePath', getCurrentFilePath);
  const page = await logged('getCurrentPageNum', getCurrentPageNum);
  if (!path.ok || !page.ok) {
    return null;
  }
  const size = await logged('getPageSize', () =>
    getPageSize(path.value, page.value),
  );
  if (!size.ok) {
    return null;
  }
  return {path: path.value, page: page.value, size: size.value};
}

function sample(points: PenPoint[]): PenPoint[] {
  if (points.length <= SAMPLE_POINTS) {
    return points;
  }
  const step = (points.length - 1) / (SAMPLE_POINTS - 1);
  return Array.from({length: SAMPLE_POINTS}, (_, i) => {
    const point = points[Math.round(i * step)];
    return {x: Math.round(point.x), y: Math.round(point.y)};
  });
}

function describe(element: object): string {
  const e = element as SdkElement;
  const picture =
    e.type === PICTURE_TYPE ? ` picture ${brief(e.picture, FIELDS_MAX)}` : '';
  return `type ${e.type} #${e.numInPage} uuid ${e.uuid}${picture}`;
}

function typeCounts(elements: object[]): string {
  const counts: Record<string, number> = {};
  for (const element of elements) {
    const type = String((element as SdkElement).type);
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return brief(counts);
}

/**
 * Lassoes the rect natively and reads it back, with the pen before and after: answers whether
 * lassoElements selects what the rect holds, what a lassoed picture carries, and whether the
 * lasso changes the pen.
 */
async function lassoAndRead(rect: Rect, expected: string): Promise<boolean> {
  await logged('getPenInfo (before the lasso)', getPenInfo);
  log(`probe lasso: rect ${brief(rect)}, expected ${expected}`);
  const lassoed = await logged('lassoElements', () => lassoElements(rect));
  if (!lassoed.ok || !lassoed.value) {
    log(
      'probe lasso: lassoElements did not take the rect; nothing more is read',
    );
    return false;
  }
  await logged('getLassoRect', getLassoRect);
  const held = await logged('getLassoElements', getLassoElements);
  if (held.ok) {
    log(
      `probe lasso holds ${held.value.length}: types ${typeCounts(held.value)}`,
    );
    held.value
      .filter(element => (element as SdkElement).type === PICTURE_TYPE)
      .forEach(element =>
        log(
          `probe lasso picture: keys ${brief(
            Object.keys(element),
            FIELDS_MAX,
          )}; ${describe(element)}`,
        ),
      );
  }
  await logged('getPenInfo (after the lasso)', getPenInfo);
  return true;
}

async function handlePenUp(
  elements: object[],
  at: number,
  /** The generation the pen-up arrived in (#111). */
  armedIn: number,
): Promise<void> {
  const pause = lastAt === null ? 'first' : `${at - lastAt} ms after the last`;
  lastAt = at;
  log(
    `probe pen-up: ${elements.length} element(s), ${pause}; ${elements
      .map(describe)
      .join('; ')}`,
  );
  // Read at each pen-up: the person may have turned the page or opened another note.
  const page = await readContext();
  const last = await logged('getLastElement', getLastElement);
  if (!last.ok || last.value === null) {
    return;
  }
  const value = last.value;
  const element = value as SdkElement;
  const points = await logged('strokePoints', () => strokePoints(value));
  await logged('recycleElement', () => recycleElement(value));
  const rect = points.ok ? boundsOf(points.value) : null;
  log(
    `probe last element: ${describe(element)}, rect ${brief(rect)}, ${
      points.ok ? points.value.length : 0
    } points, at ${at}`,
  );
  await logged('getPenInfo', getPenInfo);
  if (
    element.type !== STROKE_TYPE ||
    !points.ok ||
    page === null ||
    !isClosedLoop(points.value)
  ) {
    return;
  }
  const circle = {num: element.numInPage ?? -1, points: points.value};
  const word = wordInCircle(await readPageStrokes(page), circle, page.size);
  logWord(word);
  if (word !== null) {
    log(
      `probe circle: ${points.value.length} points, rect ${brief(
        rect,
      )}, sample ${brief(sample(points.value), FIELDS_MAX)}`,
    );
    if (armedIn !== generation) {
      log('probe circle: the probe stopped meanwhile; nothing is lassoed');
      return;
    }
    await lassoAndRead(
      word.rect,
      `${word.strokes} stroke(s) inside the circle`,
    );
  }
}

/** Bridge calls at a time while reading or releasing a page's strokes (#102). */
export const STROKE_READS_PARALLEL = 4;

/** `run` over every item, at most `limit` at a time; the answers keep the items' order. */
async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const answers: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      answers[i] = await run(items[i]);
    }
  };
  await Promise.all(
    Array.from({length: Math.min(limit, items.length)}, worker),
  );
  return answers;
}

/**
 * The page's newest PROBE_STROKES strokes with their points, oldest first, read
 * STROKE_READS_PARALLEL at a time (#102). Every element read is then recycled, as the SDK asks
 * (docs, Element Caching and Release): in the background, since nothing waits for it.
 */
async function readPageStrokes(page: PageContext): Promise<PageStroke[]> {
  const started = Date.now();
  const all = await logged('getElements', () =>
    getElements(page.page, page.path),
  );
  if (!all.ok) {
    return [];
  }
  const kept: PageStroke[] = [];
  try {
    const strokes = all.value
      .map(element => element as SdkElement)
      .filter(element => element.type === STROKE_TYPE)
      .sort((a, b) => (a.numInPage ?? 0) - (b.numInPage ?? 0))
      .slice(-PROBE_STROKES);
    const read = await mapLimited(strokes, STROKE_READS_PARALLEL, strokePoints);
    read.forEach((points, i) => {
      if (points.ok) {
        kept.push({num: strokes[i].numInPage ?? 0, points: points.value});
      }
    });
  } finally {
    mapLimited(all.value, STROKE_READS_PARALLEL, recycleElement).catch(
      () => {},
    );
  }
  log(
    `probe page strokes: ${all.value.length} element(s), ${
      kept.length
    } stroke(s) read, ${Date.now() - started} ms`,
  );
  return kept;
}

/** The choice, then every stroke the rule weighed: the next device round's replay data (#79). */
function logWord(word: WordChoice | null, spacing = ''): void {
  if (word === null) {
    log('probe word: none');
    return;
  }
  const {height, letterGap, wordGap} = word.measures;
  log(
    `probe word: rule ${word.rule}, ${word.strokes} stroke(s), rect ${brief(
      word.rect,
    )}, letter height ${Math.round(height)}, letter gap ${Math.round(
      letterGap,
    )}, word gap ${Math.round(wordGap)}${spacing}`,
  );
  word.verdicts.forEach(verdict =>
    log(
      `probe line stroke #${verdict.num} rect ${brief(verdict.rect)} ${
        verdict.part
      }, ${verdict.kept ? 'kept' : 'left out'}`,
    ),
  );
}

/** One line per pen or finger contact, at its end: the motion moves are not logged one by one. */
function handleMotion(event: Motion): void {
  if (event.action === ACTION_DOWN) {
    motion = {points: [{x: event.x, y: event.y}], toolType: event.toolType};
    return;
  }
  if (motion === null) {
    return;
  }
  motion.points.push({x: event.x, y: event.y});
  if (event.action === ACTION_MOVE) {
    return;
  }
  if (event.action === ACTION_UP || event.action === ACTION_CANCEL) {
    log(
      `probe motion ${event.action === ACTION_UP ? 'up' : 'cancel'}: tool ${
        motion.toolType
      }, ${motion.points.length} points, screen rect ${brief(
        boundsOf(motion.points),
      )}, ${event.eventTime - event.downTime} ms, sample ${brief(
        sample(motion.points),
        FIELDS_MAX,
      )}`,
    );
    motion = null;
  }
}

/**
 * Starts the pen-up and motion listeners once; a failed registration is logged. A call while an
 * arming is under way waits for it (#111).
 */
function arm(): Promise<void> {
  if (arming) {
    log('probe: already arming');
    return arming;
  }
  if (probeArmed()) {
    log('probe: already listening');
    return Promise.resolve();
  }
  arming = register().finally(() => {
    arming = null;
  });
  return arming;
}

async function register(): Promise<void> {
  const armedIn = generation;
  await logged('getPenInfo (armed)', getPenInfo);
  if (armedIn !== generation) {
    log('probe: stopped while arming; no listener is registered');
    return;
  }
  const penUp = onPenUp(elements => {
    const at = Date.now();
    const arrivedIn = generation;
    queue = queue.then(() =>
      handlePenUp(elements, at, arrivedIn).catch(error =>
        log(`probe pen-up failed: ${String(error)}`),
      ),
    );
  });
  log(
    penUp.ok
      ? 'probe: pen-up listener on'
      : `probe: pen-up listener failed: ${penUp.code} ${penUp.message}`,
  );
  const moves = onMotion(handleMotion);
  log(
    moves.ok
      ? 'probe: motion listener on'
      : `probe: motion listener failed: ${moves.code} ${moves.message}`,
  );
  stops = [penUp, moves].flatMap(result => (result.ok ? [result.value] : []));
  if (stops.length > 0) {
    // The view closed: the listeners go with it (lifecycle 3, official docs).
    const life = onLifecycle(state => {
      if (state === LifeState.stop) {
        stopPenProbe();
      }
    });
    stops.push(life);
    tellArmed();
  }
}

/**
 * Probe: arms the listeners, logs the page's elements and every picture's fields, lassoes the
 * last picture and reads the lasso back, then closes the view.
 */
export async function runProbe(): Promise<void> {
  await arm();
  const page = await readContext();
  if (page === null) {
    return;
  }
  const all = await logged('getElements', () =>
    getElements(page.page, page.path),
  );
  if (all.ok) {
    log(
      `probe page: ${all.value.length} element(s), types ${typeCounts(
        all.value,
      )}`,
    );
    const pictures = all.value.filter(
      element => (element as SdkElement).type === PICTURE_TYPE,
    );
    pictures.forEach(element =>
      log(`probe page picture: ${describe(element)}`),
    );
    const lastPicture = pictures[pictures.length - 1] as SdkElement | undefined;
    if (lastPicture?.picture?.rect) {
      await lassoAndRead(
        lastPicture.picture.rect,
        `picture #${lastPicture.numInPage}`,
      );
    } else {
      log('probe page: no picture to lasso');
    }
    for (const element of all.value) {
      await recycleElement(element);
    }
  }
  await logged('closePluginView', closePluginView);
}
