/**
 * What stays handwriting (#186, research note §3): a drawing, an arrow, an underline or a scribble
 * never becomes text, and neither does an answer that is not a word. Every ratio is to the line's
 * letter height and an [inference] default, tuned in the device round.
 */
import type {Rect} from '@supernote-tools/ink-core';
import {MARK_SHARE, median, type InkStroke, type Point, type Word} from './words';

/** A stroke taller than this many letter heights is a drawing. */
export const TALL_SHARE = 2.5;
/** A stroke wider than this many letter heights and flatter than FLAT_SHARE is a line or an arrow. */
export const LONG_SHARE = 6;
export const FLAT_SHARE = 0.5;
/** A stroke that crosses itself this often is a scribble. */
export const SCRIBBLE_CROSSINGS = 8;
/** The points a crossing count reads at most, so a long stroke stays cheap. */
export const CROSSING_POINTS = 200;
/**
 * A line whose letters are taller than this, in page pixels, is a drawing: the owner's x-height
 * is about 35 to 40 px (Ink2Pic brief › 8.11) [inference: a word is never written this large].
 */
export const MAX_LETTER_PX = 240;
/** A one-character answer for ink wider than this many letter heights is a shape («O» for a circle). */
export const ONE_CHAR_SHARE = 2;

export type Kept =
  | 'tall'
  | 'long'
  | 'scribble'
  | 'large'
  | 'empty'
  | 'no letter'
  | 'one character';

const width = (rect: Rect) => rect.right - rect.left;
const height = (rect: Rect) => rect.bottom - rect.top;

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** How often the stroke crosses itself, over at most CROSSING_POINTS of its points. */
export function selfCrossings(points: readonly Point[]): number {
  const step = Math.max(1, Math.ceil(points.length / CROSSING_POINTS));
  const sampled = points.filter((_, index) => index % step === 0);
  let count = 0;
  for (let i = 0; i + 1 < sampled.length; i += 1) {
    for (let j = i + 2; j + 1 < sampled.length; j += 1) {
      if (crosses(sampled[i], sampled[i + 1], sampled[j], sampled[j + 1])) {
        count += 1;
      }
    }
  }
  return count;
}

/** Why one stroke stays handwriting, or null when it may be a letter. */
export function strokeKept(stroke: InkStroke, letterHeight: number): Kept | null {
  const {rect} = stroke;
  if (letterHeight > 0 && height(rect) > TALL_SHARE * letterHeight) {
    return 'tall';
  }
  const base = Math.max(letterHeight, height(rect));
  if (width(rect) > LONG_SHARE * base && height(rect) < FLAT_SHARE * base) {
    return 'long';
  }
  if (selfCrossings(stroke.points) >= SCRIBBLE_CROSSINGS) {
    return 'scribble';
  }
  return null;
}

/** Why the word stays handwriting before recognition, or null when it goes on. */
export function wordKept(word: Word): Kept | null {
  if (word.letterHeight > MAX_LETTER_PX) {
    return 'large';
  }
  for (const stroke of word.strokes) {
    // Weighed against the word's other letters, marks left out: a drawing among few letters pulls
    // the line's median up.
    const all = word.strokes.filter(other => other !== stroke).map(other => height(other.rect));
    const others = all.filter(each => each >= MARK_SHARE * median(all));
    const kept = strokeKept(stroke, others.length ? median(others) : word.letterHeight);
    if (kept) {
      return kept;
    }
  }
  return null;
}

/** Why a recognition answer keeps the strokes, or null when it is a word to write. */
export function answerKept(text: string, word: Word): Kept | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'empty';
  }
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    return 'no letter';
  }
  if (
    [...trimmed].length === 1 &&
    width(word.rect) > ONE_CHAR_SHARE * Math.max(1, word.letterHeight)
  ) {
    return 'one character';
  }
  return null;
}
