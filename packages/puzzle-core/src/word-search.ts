/**
 * Word search (#380): the given words placed in a square grid, the other cells filled, and the
 * grid checked so each word can be found exactly once. The words come already written in the
 * language's grid letters (the word lists of #381); this module never folds accents itself.
 *
 * The band sets the directions: `easy` right and down, `medium` adds both forward diagonals,
 * `hard` all eight, backwards included.
 */

import { type Difficulty, type PuzzleId } from './code';
import { childSeed, createRandom, type Random } from './random';

/** Row and column steps, by compass name. */
export const DIRECTIONS = {
  E: [0, 1],
  S: [1, 0],
  SE: [1, 1],
  NE: [-1, 1],
  W: [0, -1],
  N: [-1, 0],
  NW: [-1, -1],
  SW: [1, -1],
} as const;
export type Direction = keyof typeof DIRECTIONS;

export const WORD_SEARCH_DIRECTIONS: Readonly<Record<string, readonly Direction[]>> = {
  easy: ['E', 'S'],
  medium: ['E', 'S', 'SE', 'NE'],
  hard: ['E', 'S', 'SE', 'NE', 'W', 'N', 'NW', 'SW'],
};
export const WORD_SEARCH_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const WORD_SEARCH_LIMITS = { minSide: 5, maxSide: 30, minWord: 2 } as const;
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface PlacedWord {
  word: string;
  direction: Direction;
  /** The grid cells of its letters, first letter first (row * size + column). */
  cells: number[];
}

export interface WordSearch {
  id: PuzzleId;
  size: number;
  /** One letter per cell, row by row. */
  letters: string[];
  words: PlacedWord[];
}

export interface WordSearchOptions {
  /** The letters of the grid and of the filler, A to Z by default; Spanish adds Ñ. */
  alphabet?: string;
  /**
   * Words the filler letters must never spell, in any of the eight directions: the language's
   * offensive words (`words/avoid.json`). A reading inside the placed words alone is left as it is.
   */
  avoid?: readonly string[];
}

const WORD_SEARCH_ATTEMPTS = 40;
const PLACE_TRIES = 175;
const FILL_TRIES = 20;
/** How many times the filler cells of an avoided reading are drawn again before the fill is dropped. */
const REPAIR_TRIES = 80;

function cellsOf(size: number, row: number, col: number, direction: Direction, length: number): number[] | null {
  const [dr, dc] = DIRECTIONS[direction];
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (r < 0 || c < 0 || r >= size || c >= size) return null;
    out.push(r * size + c);
  }
  return out;
}

/** Each distinct set of cells that spells the word in any of the eight directions. */
export function findWord(size: number, letters: readonly string[], word: string): number[][] {
  const seen = new Set<string>();
  const found: number[][] = [];
  const chars = [...word];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (const direction of Object.keys(DIRECTIONS) as Direction[]) {
        const cells = cellsOf(size, row, col, direction, chars.length);
        if (!cells || !cells.every((cell, i) => letters[cell] === chars[i])) continue;
        // A palindrome read both ways is one find, not two.
        const key = cells.slice().sort((a, b) => a - b).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(cells);
      }
    }
  }
  return found;
}

interface AvoidIndex {
  words: ReadonlySet<string>;
  shortest: number;
  longest: number;
}

function avoidIndex(avoid: readonly string[]): AvoidIndex | null {
  const words = avoid.filter(word => word.length > 0);
  if (words.length === 0) return null;
  const lengths = words.map(word => [...word].length);
  return { words: new Set(words), shortest: Math.min(...lengths), longest: Math.max(...lengths) };
}

/** The cells of the first avoided word the grid spells through at least one filler cell, or null. */
export function avoidedReading(size: number, letters: readonly string[], filler: readonly boolean[], avoid: readonly string[]): number[] | null {
  const index = avoidIndex(avoid);
  return index && firstAvoided(size, letters, filler, index);
}

function firstAvoided(size: number, letters: readonly string[], filler: readonly boolean[], index: AvoidIndex): number[] | null {
  for (let start = 0; start < size * size; start++) {
    for (const [dr, dc] of Object.values(DIRECTIONS)) {
      let text = '';
      let touchesFiller = false;
      const cells: number[] = [];
      for (let i = 0; i < index.longest; i++) {
        const r = Math.floor(start / size) + dr * i;
        const c = (start % size) + dc * i;
        if (r < 0 || c < 0 || r >= size || c >= size) break;
        const cell = r * size + c;
        cells.push(cell);
        text += letters[cell];
        touchesFiller ||= filler[cell];
        if (touchesFiller && cells.length >= index.shortest && index.words.has(text)) return cells;
      }
    }
  }
  return null;
}

/** Draws the filler cells of each avoided reading again until none is left; false when it never clears. */
function clearFiller(size: number, letters: string[], filler: readonly boolean[], index: AvoidIndex, alphabet: readonly string[], random: Random): boolean {
  for (let t = 0; t < REPAIR_TRIES; t++) {
    const hit = firstAvoided(size, letters, filler, index);
    if (!hit) return true;
    for (const cell of hit) if (filler[cell]) letters[cell] = random.pick(alphabet);
  }
  return false;
}

function placeAll(size: number, words: readonly string[], directions: readonly Direction[], random: Random): { letters: string[]; placed: PlacedWord[] } | string {
  const letters = new Array<string>(size * size).fill('');
  const placed: PlacedWord[] = [];
  for (const word of words) {
    const chars = [...word];
    let done = false;
    for (let t = 0; t < PLACE_TRIES && !done; t++) {
      const direction = random.pick(directions);
      const cells = cellsOf(size, random.int(size), random.int(size), direction, chars.length);
      if (!cells || !cells.every((cell, i) => letters[cell] === '' || letters[cell] === chars[i])) continue;
      cells.forEach((cell, i) => (letters[cell] = chars[i]));
      placed.push({ word, direction, cells });
      done = true;
    }
    if (!done) return word;
  }
  return { letters, placed };
}

/**
 * A word search of the given side and band from the seed, holding every word given. Throws on a
 * word with a letter outside the alphabet, a word longer than the side, a word inside another one,
 * or when the words do not fit in the attempts.
 */
export function generateWordSearch(seed: string, size: number, difficulty: Difficulty, words: readonly string[], options: WordSearchOptions = {}): WordSearch {
  const alphabet = [...(options.alphabet ?? LATIN)];
  if (!Number.isInteger(size) || size < WORD_SEARCH_LIMITS.minSide || size > WORD_SEARCH_LIMITS.maxSide) {
    throw new RangeError(`a word search side is ${WORD_SEARCH_LIMITS.minSide} to ${WORD_SEARCH_LIMITS.maxSide} cells, not ${size}`);
  }
  if (!WORD_SEARCH_BANDS.includes(difficulty)) throw new RangeError(`a word search offers ${WORD_SEARCH_BANDS.join(', ')}, not ${difficulty}`);
  if (words.length === 0) throw new RangeError('a word search needs at least one word');
  for (const word of words) {
    const chars = [...word];
    if (chars.length < WORD_SEARCH_LIMITS.minWord) throw new RangeError(`«${word}» is shorter than ${WORD_SEARCH_LIMITS.minWord} letters`);
    if (chars.length > size) throw new RangeError(`«${word}» is longer than the ${size}-cell side`);
    const stray = chars.find(ch => !alphabet.includes(ch));
    if (stray) throw new RangeError(`«${word}» has «${stray}», which is not in the grid's alphabet`);
  }
  for (const word of words) {
    const reversed = [...word].reverse().join('');
    const host = words.find(other => other !== word && (other.includes(word) || other.includes(reversed)));
    if (host) throw new RangeError(`«${word}» is inside «${host}», so it could never be found only once`);
    if (words.indexOf(word) !== words.lastIndexOf(word)) throw new RangeError(`«${word}» is in the list twice`);
  }
  // Longest first, ties in the given order, so the long words find room while the grid is empty.
  const order = words.map((word, index) => ({ word, index }));
  order.sort((a, b) => [...b.word].length - [...a.word].length || a.index - b.index);
  const sorted = order.map(o => o.word);
  const directions = WORD_SEARCH_DIRECTIONS[difficulty];
  const avoid = avoidIndex(options.avoid ?? []);

  let failed = '';
  for (let i = 0; i < WORD_SEARCH_ATTEMPTS; i++) {
    const random = createRandom(childSeed(seed, i));
    const result = placeAll(size, sorted, directions, random);
    if (typeof result === 'string') {
      failed = result;
      continue;
    }
    const filler = result.letters.map(letter => letter === '');
    for (let f = 0; f < FILL_TRIES; f++) {
      const letters = result.letters.map(letter => letter || random.pick(alphabet));
      if (avoid && !clearFiller(size, letters, filler, avoid, alphabet, random)) continue;
      if (words.every(word => findWord(size, letters, word).length === 1)) {
        return { id: { game: 'word-search', size: String(size), difficulty, seed }, size, letters, words: result.placed };
      }
    }
  }
  throw new Error(
    failed
      ? `«${failed}» found no place in a ${size} x ${size} word search from seed «${seed}» in ${WORD_SEARCH_ATTEMPTS} attempts`
      : `no ${size} x ${size} word search from seed «${seed}» left each word only once, with no avoided word, in ${WORD_SEARCH_ATTEMPTS} attempts`,
  );
}
