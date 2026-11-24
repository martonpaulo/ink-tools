/**
 * The conversion (#187): while the mode is on, each pen-up feeds the word rule (src/words.ts); a
 * finished word that src/shapes.ts lets through is recognized at the page size, from the page's own
 * elements (#206), and ONE
 * batchUpdatePageElements call deletes its strokes and inserts a text box at its place, so the
 * page changes once per word. Nothing runs during a stroke: the work starts at pen-up, and words
 * convert one at a time. Any failure keeps the handwriting and is logged.
 */
import type {Rect, Size} from '@ink-tools/ink-core';
import {
  type EmrRange,
  emrToPage,
  fail,
  offPage,
  ok,
  type Result,
  type SavedStroke,
  type TextBoxInput,
  THROWN_CODE,
} from '@ink-tools/sn-adapter/official';
import {answerKept, wordKept} from './shapes';
import {setLastConversion} from './undo';
import {InkStroke, Point, rectOf, Word, WordOptions, WordTracker} from './words';

/** The text size for a line's letter height [inference: a typed x-height near the written one]. */
export const FONT_PER_LETTER = 1.4;
export const MIN_FONT_SIZE = 24;
/** A line of text is this many font sizes high, as Lookup's box [inference]. */
export const LINE_SHARE = 1.5;
/** About how wide one character is, as a share of the font size (Lookup's box) [inference]. */
export const CHAR_WIDTH = 0.55;

/**
 * Logs, once per mode start, the first pen-up stroke's unit, point count, first point, raw and page
 * bounds and the page size, so the device round proves the unit (#206). On until that round.
 */
export const LOG_PEN_UP_UNIT = true;

/** The fields of a host element this module reads. */
export type HostElement = {uuid?: string; type?: number; numInPage?: number};

/** The SDK calls the conversion makes, each through sn-adapter; tests pass a fake. */
export type ConvertHost = {
  onPenUp(listener: (elements: object[]) => void): Result<() => void>;
  strokePoints(element: object): Promise<Result<Point[]>>;
  saveStroke(element: object): Promise<Result<SavedStroke>>;
  recycleElement(element: object): Promise<Result<true>>;
  getCurrentFilePath(): Promise<Result<string>>;
  getCurrentPageNum(): Promise<Result<number>>;
  getPageSize(path: string, page: number): Promise<Result<Size>>;
  emrRange(size: Size): Result<EmrRange>;
  recognizeElements(elements: object[], size: Size): Promise<Result<string>>;
  getElements(page: number, path: string): Promise<Result<object[]>>;
  createTextBox(box: TextBoxInput): Promise<Result<object>>;
  batchUpdatePageElements(
    deleteNums: number[],
    elements: object[],
    page: number,
  ): Promise<Result<boolean>>;
  now(): number;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(timer: unknown): void;
  log(line: string): void;
};

/** The text box for `text` written where `word` was: from its top-left, one line high. */
export function textBoxFor(text: string, word: Word, page: Size): TextBoxInput {
  const fontSize = Math.max(MIN_FONT_SIZE, Math.round(word.letterHeight * FONT_PER_LETTER));
  const textWidth = Math.ceil([...text].length * fontSize * CHAR_WIDTH);
  // One font size more than the text needs, so the host never wraps the word [inference].
  // Whole pixels: the word's rect comes from converted EMR points and is fractional (#206).
  const boxWidth = Math.ceil(Math.max(word.rect.right - word.rect.left, textWidth)) + fontSize;
  const left = Math.max(0, Math.min(Math.round(word.rect.left), page.width - boxWidth));
  const top = Math.max(0, Math.round(word.rect.top));
  const rect: Rect = {
    left,
    top,
    right: Math.min(page.width, left + boxWidth),
    bottom: Math.min(page.height, top + Math.round(fontSize * LINE_SHARE)),
  };
  return {text, rect, fontSize};
}

export class Converter {
  private tracker: WordTracker<object>;
  private stop: (() => void) | null = null;
  private timer: unknown = null;
  private queue: Promise<void> = Promise.resolve();
  /** Pen-ups are read in the order they came, each at the time it came. */
  private reading: Promise<void> = Promise.resolve();
  /** The page size, read at the first pen-up of a mode start. */
  private size: Promise<Result<Size>> | null = null;
  /** Set once a pen-up stroke proved its points are EMR units (#206). */
  private emr: EmrRange | null = null;
  private unitLogged = false;
  private matchLogged = false;
  /** When the last stroke whose points could not be read came, or a stroke kept after it (#229). */
  private unreadAt: number | null = null;

  constructor(private readonly host: ConvertHost, private readonly options: WordOptions) {
    this.tracker = new WordTracker<object>(options);
  }

  get running(): boolean {
    return this.stop !== null;
  }

  /** Listens for pen-up; a failed listener is the result, never a silent «on». */
  start(): Result<true> {
    if (this.stop) {
      return ok(true);
    }
    const listening = this.host.onPenUp(elements => this.onPenUp(elements));
    if (!listening.ok) {
      return listening;
    }
    this.stop = listening.value;
    // shortcut: the page size and the unit are read once per mode start; a note of another page
    // size opened while the mode stays on keeps the first one, until turning the mode off and on.
    this.size = null;
    this.emr = null;
    this.unreadAt = null;
    this.unitLogged = false;
    this.matchLogged = false;
    return ok(true);
  }

  /**
   * Stops listening at once, so a drawing made next is never touched; the words still open are
   * dropped, as their handwriting is the person's, and their elements freed.
   */
  turnOff(): void {
    this.stop?.();
    this.stop = null;
    if (this.timer !== null) {
      this.host.clearTimer(this.timer);
      this.timer = null;
    }
    this.free(this.tracker.reset().map(stroke => stroke.element));
  }

  /** Resolves once every word handed on so far is converted or kept. */
  async idle(): Promise<void> {
    await this.reading;
    await this.queue;
  }

  private free(elements: (object | undefined)[]): void {
    elements.forEach(element => {
      if (element) {
        this.host.recycleElement(element).catch(() => {});
      }
    });
  }

  private onPenUp(elements: object[]): void {
    const at = this.host.now();
    this.reading = this.reading
      .then(() => this.read(elements, at))
      .catch(error =>
        this.host.log(`pen-up: ${error instanceof Error ? error.message : String(error)}`),
      );
  }

  private async read(elements: object[], at: number): Promise<void> {
    for (const element of elements) {
      const {uuid, type} = element as HostElement;
      if (type !== 0 || !uuid) {
        this.free([element]);
        continue;
      }
      const raw = await this.host.strokePoints(element);
      if (!raw.ok || this.afterUnread(at)) {
        this.keepAroundUnread(element, at, raw.ok ? 'a stroke near one not read' : raw.message);
        continue;
      }
      const points = await this.toPage(raw.value);
      const rect = points.ok ? rectOf(points.value) : null;
      if (!points.ok || !rect || !this.stop) {
        this.host.log(points.ok ? 'pen-up: a stroke with no points' : `pen-up: ${points.message}`);
        this.free([element]);
        continue;
      }
      const stroke: InkStroke<object> = {id: uuid, rect, points: points.value, element};
      this.handOn(this.tracker.add(stroke, at));
    }
    this.schedule();
  }

  /** Whether `at` comes within the idle time of a stroke whose points could not be read (#229). */
  private afterUnread(at: number): boolean {
    return this.unreadAt !== null && at - this.unreadAt < this.options.idleMs;
  }

  /**
   * A stroke whose points could not be read, such as one over MAX_STROKE_POINTS, may belong to the
   * word being written: converting the rest would leave it beside a text box, and an Undo Conversion
   * could not give it back. So that word, the words still waiting, and every stroke written within
   * the idle time after it stay on the page as written (#229).
   */
  private keepAroundUnread(element: object, at: number, why: string): void {
    this.unreadAt = at;
    const held = this.tracker.reset().map(stroke => stroke.element);
    this.free([element, ...held]);
    this.host.log(`kept: ${why}, ${held.length + 1} strokes left as written`);
  }

  /**
   * A pen-up stroke's points in page pixels, the unit words.ts and shapes.ts measure in (#206).
   * The pen-up event may hand over EMR units, while getElements gives page pixels: a point off the
   * page proves EMR, and from then on every stroke of this mode start is converted with the SDK's
   * own range for the page size.
   */
  private async toPage(raw: Point[]): Promise<Result<Point[]>> {
    this.size ??= this.readPageSize();
    const size = await this.size;
    if (!size.ok) {
      this.size = null;
      return fail(size.code, `page size: ${size.message}`);
    }
    if (!this.emr && offPage(raw, size.value)) {
      const range = this.host.emrRange(size.value);
      if (!range.ok) {
        return fail(range.code, `EMR range: ${range.message}`);
      }
      this.emr = range.value;
    }
    const points = this.emr ? emrToPage(raw, size.value, this.emr) : raw;
    if (LOG_PEN_UP_UNIT && !this.unitLogged && raw.length > 0) {
      this.unitLogged = true;
      this.host.log(unitLine(raw, points, size.value, this.emr !== null));
    }
    return ok(points);
  }

  private async readPageSize(): Promise<Result<Size>> {
    const path = await this.host.getCurrentFilePath();
    if (!path.ok) {
      return path;
    }
    const page = await this.host.getCurrentPageNum();
    if (!page.ok) {
      return page;
    }
    return this.host.getPageSize(path.value, page.value);
  }

  /**
   * The page bounds of the strokes the word may be, for the strokes no uuid matched (#206): on the
   * tablet a pen-up uuid is the native cache key of that one event, and a getElements read hands
   * out new ones. The newest MATCH_WINDOW strokes of the page are read, at once.
   */
  private async candidateRects(
    word: Word,
    page: readonly object[],
  ): Promise<Map<object, Rect>> {
    const rects = new Map<object, Rect>();
    const ids = new Set(word.strokes.map(stroke => stroke.id));
    const candidates = (page as HostElement[])
      .filter(each => each.type === 0 && each.numInPage !== undefined && !ids.has(each.uuid ?? ''))
      .sort((a, b) => (b.numInPage as number) - (a.numInPage as number))
      .slice(0, Math.max(MATCH_WINDOW, word.strokes.length));
    if (candidates.length === 0 || word.strokes.every(stroke => uuidIn(page, stroke.id))) {
      return rects;
    }
    await Promise.all(
      candidates.map(async element => {
        const points = await this.host.strokePoints(element);
        const rect = points.ok ? rectOf(points.value) : null;
        if (rect) {
          rects.set(element, rect);
        }
      }),
    );
    return rects;
  }

  /** The one line LOG_MATCH_SHAPES asks for: both shapes of the word's first stroke. */
  private async matchLine(word: Word<object>, matched: object | undefined): Promise<string> {
    const [first] = word.strokes;
    const raw = first?.element ? await this.host.strokePoints(first.element) : null;
    const pagePoints = matched ? await this.host.strokePoints(matched) : null;
    return matchShapes(
      first?.element,
      raw?.ok ? raw.value : [],
      this.emr !== null,
      matched,
      pagePoints?.ok ? pagePoints.value : [],
    );
  }

  private schedule(): void {
    if (this.timer !== null) {
      this.host.clearTimer(this.timer);
      this.timer = null;
    }
    const deadline = this.tracker.nextDeadline();
    if (deadline === null || !this.stop) {
      return;
    }
    this.timer = this.host.setTimer(() => {
      this.timer = null;
      this.handOn(this.tracker.tick(this.host.now()));
      this.schedule();
    }, Math.max(0, deadline - this.host.now()));
  }

  private handOn(words: Word<object>[]): void {
    for (const word of words) {
      this.queue = this.queue.then(() =>
        this.convert(word).catch(error =>
          this.host.log(`convert: ${error instanceof Error ? error.message : String(error)}`),
        ),
      );
    }
  }

  /** One word: kept, or replaced in one page change. Its elements are freed either way. */
  private async convert(word: Word<object>): Promise<void> {
    const elements = word.strokes.map(stroke => stroke.element as object);
    try {
      await this.replace(word, elements);
    } finally {
      this.free(elements);
    }
  }

  private async replace(word: Word<object>, elements: object[]): Promise<void> {
    const {log} = this.host;
    const shape = wordKept(word);
    if (shape) {
      // The heights say which stroke kept it, as numbers only, for the device round (#206).
      const heights = word.strokes.map(({rect}) => Math.round(rect.bottom - rect.top)).join(',');
      log(`kept: ${shape}, ${word.strokes.length} strokes, heights ${heights} px`);
      return;
    }
    const path = await this.host.getCurrentFilePath();
    const page = await this.host.getCurrentPageNum();
    if (!path.ok || !page.ok) {
      log(`kept: ${path.ok ? (page as {message: string}).message : path.message}`);
      return;
    }
    const size = await this.host.getPageSize(path.value, page.value);
    if (!size.ok) {
      log(`kept: getPageSize ${size.message}`);
      return;
    }
    // Recognition reads the page's own elements, never the pen-up ones (#206): a pen-up element's
    // native points are EMR units, while recognizeElements takes page pixels at the page size, as
    // Lookup's lassoed elements are. On the tablet every pen-up word failed with «Recognition
    // failed», while the same handwriting lassoed was read.
    const read = await this.host.getElements(page.value, path.value);
    if (!read.ok) {
      log(`kept: getElements ${read.message}`);
      return;
    }
    try {
      const rects = await this.candidateRects(word, read.value);
      const found = pageStrokesOf(word, read.value, rects);
      if (LOG_MATCH_SHAPES && !this.matchLogged) {
        this.matchLogged = true;
        log(await this.matchLine(word, found.ok ? found.value.elements[0] : undefined));
      }
      if (!found.ok) {
        log(`kept: ${found.message}`);
        return;
      }
      log(elementShape(found.value.elements, read.value.length));
      const text = await this.host.recognizeElements(found.value.elements, size.value);
      if (!text.ok) {
        log(`kept: recognizeElements ${text.message}`);
        return;
      }
      const answer = answerKept(text.value, word);
      if (answer) {
        log(`kept: ${answer} answer`);
        return;
      }
      // Kept for «Undo Conversion» before the strokes leave the page (#188).
      const saved: SavedStroke[] = [];
      for (const [index, element] of elements.entries()) {
        const one = await this.host.saveStroke(element);
        if (!one.ok) {
          log(`kept: saveStroke ${one.message}`);
          return;
        }
        // The rebuild writes page pixels (#148), so it keeps the converted points, not the raw ones.
        saved.push({...one.value, points: word.strokes[index].points});
      }
      const box = textBoxFor(text.value.trim(), word, size.value);
      const made = await this.host.createTextBox(box);
      if (!made.ok) {
        log(`kept: createTextBox ${made.message}`);
        return;
      }
      const nums = found.value.nums;
      const written = await this.host.batchUpdatePageElements(nums, [made.value], page.value);
      if (!written.ok || !written.value) {
        log(`kept: batchUpdatePageElements ${written.ok ? 'answered false' : written.message}`);
        return;
      }
      setLastConversion({path: path.value, page: page.value, box, strokes: saved});
      log(`converted ${[...box.text].length} characters from ${nums.length} strokes`);
    } finally {
      // The page read is freed only now: it may share its native cache with the word's strokes.
      this.free(read.value);
    }
  }
}

function bounds(points: readonly Point[]): string {
  const rect = rectOf(points);
  return rect
    ? `${Math.round(rect.left)},${Math.round(rect.top)} to ${Math.round(rect.right)},${Math.round(rect.bottom)}`
    : 'none';
}

/** The one unit line LOG_PEN_UP_UNIT asks for. */
export function unitLine(
  raw: readonly Point[],
  points: readonly Point[],
  size: Size,
  emr: boolean,
): string {
  const [first] = raw;
  return (
    `pen-up unit: ${emr ? 'EMR' : 'page px'}, ${raw.length} points, first ${first.x},${first.y}, ` +
    `raw ${bounds(raw)}, page ${bounds(points)}, page size ${size.width} x ${size.height}`
  );
}

/** The word's strokes as the page holds them: their numbers and their page elements. */
export type PageStrokes = {nums: number[]; elements: object[]};

/**
 * The page strokes a word's strokes are looked for in, by bounds, newest first (#206). A word is
 * matched just after its idle time, so its strokes are among the newest of the page.
 * shortcut: a word written before more than MATCH_WINDOW newer strokes is kept unmatched; raise it
 * if the log shows such a word.
 */
export const MATCH_WINDOW = 40;
/**
 * The most, in page pixels, one edge of a pen-up stroke's converted bounds may differ from the
 * page's own bounds of the same stroke [inference: the EMR conversion rounds to below one pixel].
 */
export const MATCH_TOLERANCE_PX = 4;

/**
 * Logs, once per mode start, both shapes of a word's first stroke: the pen-up element and the page
 * element it matched, their field names, point counts and first points, each in its unit (#206).
 * On until the device round proves the match.
 */
export const LOG_MATCH_SHAPES = true;

function uuidIn(page: readonly object[], uuid: string): boolean {
  return (page as HostElement[]).some(each => each.uuid === uuid && each.numInPage !== undefined);
}

/** The largest distance between two rects' matching edges. */
export function edgeDistance(a: Rect, b: Rect): number {
  return Math.max(
    Math.abs(a.left - b.left),
    Math.abs(a.top - b.top),
    Math.abs(a.right - b.right),
    Math.abs(a.bottom - b.bottom),
  );
}

/**
 * The word's strokes in a page read, in the word's order: an earlier conversion deleted strokes
 * before them and moved the numbers. A stroke is found by its uuid, else by the page stroke whose
 * bounds (`rects`, page pixels) are nearest its own, within MATCH_TOLERANCE_PX, each page stroke
 * taken once: on the tablet the pen-up uuid is not the one getElements gives (#206). A stroke found
 * neither way keeps the word.
 */
export function pageStrokesOf(
  word: Word,
  page: readonly object[],
  rects: ReadonlyMap<object, Rect> = new Map(),
): Result<PageStrokes> {
  const byId = new Map<string, HostElement>();
  for (const element of page as HostElement[]) {
    if (element.uuid !== undefined && element.numInPage !== undefined) {
      byId.set(element.uuid, element);
    }
  }
  const found: (HostElement | undefined)[] = word.strokes.map(stroke => byId.get(stroke.id));
  const used = new Set<object>(found.filter(each => each !== undefined) as object[]);
  word.strokes.forEach((stroke, index) => {
    if (found[index]) {
      return;
    }
    let best: object | undefined;
    let bestDistance = MATCH_TOLERANCE_PX;
    for (const [element, rect] of rects) {
      const distance = edgeDistance(stroke.rect, rect);
      if (!used.has(element) && distance <= bestDistance) {
        best = element;
        bestDistance = distance;
      }
    }
    if (best) {
      used.add(best);
      found[index] = best as HostElement;
    }
  });
  const missing = found.filter(element => element === undefined).length;
  if (missing > 0) {
    return fail(
      THROWN_CODE,
      `${missing} of ${word.strokes.length} strokes of the word are not in the page read of ` +
        `${page.length} elements`,
    );
  }
  const elements = found as HostElement[];
  return ok({nums: elements.map(element => element.numInPage as number), elements});
}

function firstPoint(points: readonly Point[]): string {
  const [first] = points;
  return first ? `${Math.round(first.x)},${Math.round(first.y)}` : 'none';
}

/** One side of the match line: field names, numInPage, stroke field names, point count, first point. */
function sideShape(element: object | undefined, points: readonly Point[], unit: string): string {
  if (!element) {
    return 'none';
  }
  const {numInPage} = element as HostElement;
  const stroke = (element as {stroke?: unknown}).stroke;
  return (
    `fields ${fieldNames([element])}, numInPage ${numInPage ?? 'none'}, ` +
    `stroke fields ${fieldNames([stroke])}, ${points.length} points, first ${firstPoint(points)} ${unit}`
  );
}

/**
 * The one line LOG_MATCH_SHAPES asks for (#206): the pen-up element and the page element of the
 * same stroke, field names, counts and the first point only, never the ink or the text.
 */
export function matchShapes(
  penUp: object | undefined,
  penUpPoints: readonly Point[],
  emr: boolean,
  page: object | undefined,
  pagePoints: readonly Point[],
): string {
  const same =
    penUp && page ? String((penUp as HostElement).uuid === (page as HostElement).uuid) : 'none';
  return (
    `match: pen-up ${sideShape(penUp, penUpPoints, emr ? 'EMR' : 'page px')}; ` +
    `page ${sideShape(page, pagePoints, 'page px')}; same uuid ${same}`
  );
}

function fieldNames(objects: readonly unknown[]): string {
  const names = new Set<string>();
  for (const each of objects) {
    if (each !== null && typeof each === 'object') {
      Object.keys(each).forEach(name => names.add(name));
    }
  }
  return names.size > 0 ? [...names].sort().join(',') : 'none';
}

/**
 * The one line saying what recognition is sent (#206): how many elements, their types, and the
 * names of their fields and stroke fields. Field names and counts only, never points or text.
 */
export function elementShape(elements: readonly object[], pageCount: number): string {
  const types = new Map<string, number>();
  for (const {type} of elements as HostElement[]) {
    const key = String(type ?? 'none');
    types.set(key, (types.get(key) ?? 0) + 1);
  }
  const typeList = [...types].map(([type, count]) => `${type}:${count}`).join(' ');
  const strokes = (elements as {stroke?: unknown}[]).map(element => element.stroke);
  return (
    `recognize: ${elements.length} page elements of ${pageCount} read, types ${typeList || 'none'}, ` +
    `fields ${fieldNames(elements)}, stroke fields ${fieldNames(strokes)}`
  );
}
