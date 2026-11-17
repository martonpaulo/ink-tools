/**
 * The conversion (#187): while the mode is on, each pen-up feeds the word rule (src/words.ts); a
 * finished word that src/shapes.ts lets through is recognized at the page size, and ONE
 * batchUpdatePageElements call deletes its strokes and inserts a text box at its place, so the
 * page changes once per word. Nothing runs during a stroke: the work starts at pen-up, and words
 * convert one at a time. Any failure keeps the handwriting and is logged.
 */
import type {Rect, Size} from '@supernote-tools/ink-core';
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
} from '@supernote-tools/sn-adapter/official';
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
  const boxWidth = Math.max(word.rect.right - word.rect.left, textWidth) + fontSize;
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

  constructor(private readonly host: ConvertHost, options: WordOptions) {
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
    this.unitLogged = false;
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
      const points = raw.ok ? await this.toPage(raw.value) : raw;
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
      log(`kept: ${shape}, ${word.strokes.length} strokes`);
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
    const text = await this.host.recognizeElements(elements, size.value);
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
    const read = await this.host.getElements(page.value, path.value);
    if (!read.ok) {
      log(`kept: getElements ${read.message}`);
      return;
    }
    try {
      const nums = numbersOf(word, read.value);
      if (!nums.ok) {
        log(`kept: ${nums.message}`);
        return;
      }
      const box = textBoxFor(text.value.trim(), word, size.value);
      const made = await this.host.createTextBox(box);
      if (!made.ok) {
        log(`kept: createTextBox ${made.message}`);
        return;
      }
      const written = await this.host.batchUpdatePageElements(nums.value, [made.value], page.value);
      if (!written.ok || !written.value) {
        log(`kept: batchUpdatePageElements ${written.ok ? 'answered false' : written.message}`);
        return;
      }
      setLastConversion({path: path.value, page: page.value, box, strokes: saved});
      log(`converted ${[...box.text].length} characters from ${nums.value.length} strokes`);
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

/**
 * The word's strokes' numbers in a page read, found by their ids: an earlier conversion deleted
 * strokes before them and moved the numbers. A stroke no longer there keeps the word.
 */
export function numbersOf(word: Word, page: readonly object[]): Result<number[]> {
  const byId = new Map<string, number>();
  for (const element of page as HostElement[]) {
    if (element.uuid !== undefined && element.numInPage !== undefined) {
      byId.set(element.uuid, element.numInPage);
    }
  }
  const nums = word.strokes.map(stroke => byId.get(stroke.id));
  if (nums.some(num => num === undefined)) {
    return fail(THROWN_CODE, 'a stroke of the word is no longer on the page');
  }
  return ok(nums as number[]);
}
