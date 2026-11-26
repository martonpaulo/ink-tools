/**
 * The word-end rule (#185, research note `docs/research/2026-11-live-handwriting-to-text.md` §3):
 * strokes arrive one pen-up at a time and a word is handed on only once it is certainly finished.
 * Position closes a word, not time alone: on the owner's tablet the pauses inside a word (130 to
 * 656 ms) and between words (578 to 1122 ms) overlap (Ink2Pic brief › 8.11 The last word). Every
 * distance is a ratio of the writer's own letter height and letter gaps, as Ink2Pic's grouping
 * measured; the clock is passed in, so the rule runs with no timer. A stroke's own pen times
 * (`Stroke.recognPoints`, #296) add one signal beside position, never alone: a long pause before a
 * stroke closes the word only when its gap is already wider than a letter gap.
 */
import type {Rect} from '../lasso';

export type Point = {x: number; y: number};

/** One stroke the pen ended: its host id, its bounds and its points, in page pixels. */
export type InkStroke<E = unknown> = {
  id: string;
  rect: Rect;
  points: Point[];
  /** The host's element, handed on to recognition and freed after. */
  element?: E;
  /** When the pen drew it, from its recognition points; absent when the host gave none (#296). */
  times?: {startedAt: number; endedAt: number};
};

/** A finished word: its strokes in writing order, their bounds and the line's letter height. */
export type Word<E = unknown> = {
  strokes: InkStroke<E>[];
  rect: Rect;
  letterHeight: number;
};

export type WordOptions = {
  /** Word spacing: Tight 0.7, Normal 1, Wide 1.4, as Ink2Pic's setting. */
  spacing: number;
  /** No stroke for this long closes the open word: longer than the 656 ms pause inside a word. */
  idleMs: number;
  /** A closed word waits this long for an accent, an i-dot or a tilde before it is handed on. */
  graceMs: number;
};

/** [inference] defaults, tuned in the device round (#185). */
export const DEFAULT_WORD_OPTIONS: WordOptions = {
  spacing: 1,
  idleMs: 2000,
  graceMs: 600,
};

/** Ink2Pic's ratios (brief › 8.11). */
export const LINE_OVERLAP_SHARE = 0.3;
export const MARK_SHARE = 0.6;
export const MARK_REACH = 1;
export const WORD_GAP_SHARE = 0.8;
export const LETTER_GAP_RATIO = 3;
/** A gap at most this share of the letter height counts as a letter gap. */
export const LETTER_GAP_SHARE = 0.8;
/** A mark joins the word whose x range, widened by this share of the letter height, holds it. */
export const MARK_SIDE_SHARE = 0.5;
/** The letters a line's measures are taken from: the newest ones. */
export const LINE_MEMORY = 30;
/**
 * A pen-up pause at least this long, in ms, counts toward a word end (#296): longer than the 656 ms
 * pause measured inside a word (brief › 8.11). sn-adapter's `strokeTimes` answers in ms, from the
 * registry's stroke time unit (`pen.digitizer-units`).
 */
export const WORD_PAUSE_MS = 700;

type Open<E> = {strokes: InkStroke<E>[]; rect: Rect; lastAt: number; endedAt?: number};
type Pending<E> = {word: Open<E>; closedAt: number; letterHeight: number};

export function rectOf(points: readonly Point[]): Rect | null {
  if (points.length === 0) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const {x, y} of points) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return {left, top, right, bottom};
}

export function union(a: Rect, b: Rect): Rect {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const heightOf = (rect: Rect) => rect.bottom - rect.top;

/**
 * A stroke over the letters (#206): shorter than a letter, its foot no lower than a share of the
 * letter height into the band whose top is `bandTop`. An ascender («f», «l») ends at the baseline,
 * so it is never one.
 */
export function isAccent(rect: Rect, bandTop: number, letterHeight: number): boolean {
  return (
    heightOf(rect) < letterHeight && rect.bottom <= bandTop + LINE_OVERLAP_SHARE * letterHeight
  );
}

/**
 * Follows one writer's strokes. `add` takes each pen-up, `tick` the clock; both return the words
 * that are finished, in writing order. `nextDeadline` says when `tick` has something to close.
 */
export class WordTracker<E = unknown> {
  private open: Open<E> | null = null;
  private pending: Pending<E>[] = [];
  /** The current line's letters, newest last: their rects and the gaps between them. */
  private letters: Rect[] = [];
  private gaps: number[] = [];

  constructor(private readonly options: WordOptions = DEFAULT_WORD_OPTIONS) {}

  /** The line's letter height: the median of its letters; 0 before the first letter. */
  letterHeight(): number {
    return median(this.letters.map(heightOf));
  }

  /** The gap that ends a word: `spacing × max(0.8 × letter height, 3 × median letter gap)`. */
  wordGap(): number {
    const height = this.letterHeight();
    return (
      this.options.spacing *
      Math.max(WORD_GAP_SHARE * height, LETTER_GAP_RATIO * median(this.gaps))
    );
  }

  /** The band of the line: the median top and bottom of its letters. */
  private band(): Rect | null {
    if (this.letters.length === 0) {
      return null;
    }
    return {
      left: Math.min(...this.letters.map(r => r.left)),
      right: Math.max(...this.letters.map(r => r.right)),
      top: median(this.letters.map(r => r.top)),
      bottom: median(this.letters.map(r => r.bottom)),
    };
  }

  private onLine(rect: Rect, band: Rect): boolean {
    const overlap = Math.min(rect.bottom, band.bottom) - Math.max(rect.top, band.top);
    const lower = Math.min(heightOf(rect), heightOf(band));
    return overlap >= LINE_OVERLAP_SHARE * Math.max(1, lower);
  }

  /**
   * A short stroke above or on the line: an accent, an i-dot, a tilde, a bar. A stroke sitting on
   * top of the line's band is a mark up to a full letter height: the owner's accent on «café» is
   * 27 px over 40 to 44 px letters (#206), more than MARK_SHARE of them.
   */
  private isMark(rect: Rect, band: Rect): boolean {
    const height = this.letterHeight();
    const reach = rect.bottom <= band.bottom && rect.bottom >= band.top - MARK_REACH * height;
    const narrow = rect.right - rect.left < 2 * height;
    return reach && narrow && (heightOf(rect) < MARK_SHARE * height || isAccent(rect, band.top, height));
  }

  /** The open or waiting word whose x range holds the mark's centre; the nearest first. */
  private markTarget(rect: Rect): Open<E> | null {
    const side = MARK_SIDE_SHARE * this.letterHeight();
    const centre = (rect.left + rect.right) / 2;
    const words = [
      ...(this.open ? [this.open] : []),
      ...this.pending.map(each => each.word),
    ];
    return (
      words.find(
        word => centre >= word.rect.left - side && centre <= word.rect.right + side,
      ) ?? null
    );
  }

  private remember(rect: Rect): void {
    this.letters.push(rect);
    if (this.letters.length > LINE_MEMORY) {
      this.letters.shift();
    }
  }

  private close(now: number): void {
    if (this.open) {
      this.pending.push({word: this.open, closedAt: now, letterHeight: this.letterHeight()});
      this.open = null;
    }
  }

  private startLine(): void {
    this.letters = [];
    this.gaps = [];
  }

  add(stroke: InkStroke<E>, now: number): Word<E>[] {
    const ready = this.tick(now);
    const band = this.band();
    if (band && this.isMark(stroke.rect, band)) {
      const target = this.markTarget(stroke.rect);
      if (target) {
        target.strokes.push(stroke);
        target.rect = union(target.rect, stroke.rect);
        target.lastAt = now;
        // The word waits its grace again: a second accent or a tilde may follow.
        this.pending
          .filter(each => each.word === target)
          .forEach(each => (each.closedAt = now));
        return ready;
      }
    }
    if (!band || !this.onLine(stroke.rect, band)) {
      this.close(now);
      this.startLine();
    } else if (this.open) {
      const gap = stroke.rect.left - this.open.rect.right;
      const back = this.open.rect.left - stroke.rect.right;
      const wordGap = this.wordGap();
      if (gap >= wordGap || back >= wordGap || this.pausedApart(stroke, gap)) {
        this.close(now);
      } else if (gap > 0 && gap <= LETTER_GAP_SHARE * this.letterHeight()) {
        this.gaps.push(gap);
      }
    }
    this.remember(stroke.rect);
    if (this.open) {
      this.open.strokes.push(stroke);
      this.open.rect = union(this.open.rect, stroke.rect);
      this.open.lastAt = now;
      this.open.endedAt = stroke.times?.endedAt;
    } else {
      this.open = {strokes: [stroke], rect: stroke.rect, lastAt: now, endedAt: stroke.times?.endedAt};
    }
    return ready;
  }

  /**
   * The second signal (#296): a gap wider than a letter gap, though under the word gap, with a pen
   * pause of at least WORD_PAUSE_MS since the open word's last stroke ended. Without both strokes'
   * times it is false, so the rule is position alone.
   */
  private pausedApart(stroke: InkStroke<E>, gap: number): boolean {
    const endedAt = this.open?.endedAt;
    if (endedAt === undefined || stroke.times === undefined) {
      return false;
    }
    return (
      gap > LETTER_GAP_SHARE * this.letterHeight() &&
      stroke.times.startedAt - endedAt >= WORD_PAUSE_MS
    );
  }

  /** The words finished by `now`: a waiting word past its grace, an open word past the idle time. */
  tick(now: number): Word<E>[] {
    if (this.open && now - this.open.lastAt >= this.options.idleMs) {
      // The idle time is longer than the grace: the word is handed on at once.
      this.pending.push({
        word: this.open,
        closedAt: now - this.options.graceMs,
        letterHeight: this.letterHeight(),
      });
      this.open = null;
    }
    const done = this.pending.filter(each => now - each.closedAt >= this.options.graceMs);
    this.pending = this.pending.filter(each => !done.includes(each));
    return done.map(({word, letterHeight}) => ({
      strokes: word.strokes,
      rect: word.rect,
      letterHeight,
    }));
  }

  /** When `tick` next has a word to hand on; null when nothing waits. */
  nextDeadline(): number | null {
    const times = [
      ...this.pending.map(each => each.closedAt + this.options.graceMs),
      ...(this.open ? [this.open.lastAt + this.options.idleMs] : []),
    ];
    return times.length ? Math.min(...times) : null;
  }

  /** Every stroke held, open or waiting, for the caller to free; the tracker starts empty. */
  reset(): InkStroke<E>[] {
    const held = [
      ...(this.open ? this.open.strokes : []),
      ...this.pending.flatMap(each => each.word.strokes),
    ];
    this.open = null;
    this.pending = [];
    this.startLine();
    return held;
  }
}
