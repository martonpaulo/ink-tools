/**
 * Fill-in, or criss-cross (#398): the words of a list placed across and down in a grid, crossing
 * one another, and the player writes each word of the printed list into its place. No clue is
 * needed, so the game works in every language of the word lists (#381).
 *
 * The generator places words from the language's list, most frequent first, each crossing a word
 * already placed, with no letter touching another word side by side. The solver counts the ways
 * the list fills the slots; while it finds a second way, the generator prints one letter where the
 * two ways differ, so the printed puzzle has exactly one solution. Easy and medium also print one
 * word in place to start from.
 */

import { type Difficulty, type PuzzleId } from './code';
import { childSeed, createRandom, type Random } from './random';
import { gridPattern, type WordList } from './words';

export type FillInDirection = 'across' | 'down';

export interface FillInSlot {
  word: string;
  direction: FillInDirection;
  /** The grid cells of its letters, first letter first (row * width + column). */
  cells: number[];
}

export interface FillInBand {
  /** The side of the square the words are placed in; the puzzle is that square cropped to its words. */
  side: number;
  /** The fewest and the most words a puzzle of the band holds. */
  minWords: number;
  maxWords: number;
  /** The shortest and the longest word the band uses. */
  minLength: number;
  maxLength: number;
  /** Whether one word is printed in place to start from. */
  starter: boolean;
}

export const FILL_IN_BANDS: Readonly<Partial<Record<Difficulty, FillInBand>>> = {
  easy: { side: 9, minWords: 8, maxWords: 10, minLength: 3, maxLength: 6, starter: true },
  medium: { side: 11, minWords: 12, maxWords: 15, minLength: 3, maxLength: 8, starter: true },
  hard: { side: 13, minWords: 18, maxWords: 22, minLength: 3, maxLength: 10, starter: false },
};

export interface FillIn {
  id: PuzzleId;
  width: number;
  height: number;
  /** The solution: one letter per cell, row by row, and '' for a cell outside every word. */
  solution: string[];
  slots: FillInSlot[];
  /** The printed list: every word once, shortest first, then in alphabetical order. */
  words: string[];
  /** The cells printed with their letter, in increasing order. */
  givens: number[];
  rating: FillInRating;
}

export interface FillInRating {
  /** How many letters are printed, the starter word's included. */
  givens: number;
  /** How many letters the solver needed printed, beyond the starter word, for one solution. */
  revealed: number;
}

export interface FillInSolveResult {
  /** Solutions found, never more than the limit. */
  count: number;
  /** The first solutions found, as letter grids, at most the limit. */
  solutions: string[][];
}

/** Only the most frequent words of a list are used, so a player knows them. */
const POOL_SIZE = 3500;
const FILL_IN_ATTEMPTS = 30;
/** Candidate words tried per attempt before the grid is taken as full. */
const CANDIDATE_TRIES = 360;
const STEPS: Record<FillInDirection, readonly [number, number]> = { across: [0, 1], down: [1, 0] };
const OTHER: Record<FillInDirection, FillInDirection> = { across: 'down', down: 'across' };

interface Placement {
  row: number;
  col: number;
  direction: FillInDirection;
  crossings: number;
}

/** The square board a puzzle is built on, before it is cropped. */
class Board {
  readonly letters: string[];
  /** Which directions already cover each cell. */
  readonly covered: Set<FillInDirection>[];
  readonly placed: { word: string; row: number; col: number; direction: FillInDirection }[] = [];

  constructor(readonly side: number) {
    this.letters = new Array<string>(side * side).fill('');
    this.covered = Array.from({ length: side * side }, () => new Set<FillInDirection>());
  }

  private inside(row: number, col: number): boolean {
    return row >= 0 && col >= 0 && row < this.side && col < this.side;
  }

  private letterAt(row: number, col: number): string {
    return this.inside(row, col) ? this.letters[row * this.side + col] : '';
  }

  /** The number of letters the word would cross there, or -1 when it may not go there. */
  crossings(word: readonly string[], row: number, col: number, direction: FillInDirection): number {
    const [dr, dc] = STEPS[direction];
    const [pr, pc] = STEPS[OTHER[direction]];
    const endRow = row + dr * (word.length - 1);
    const endCol = col + dc * (word.length - 1);
    if (!this.inside(row, col) || !this.inside(endRow, endCol)) return -1;
    // The cells just before and after the word stay empty, so it does not run into another word.
    if (this.letterAt(row - dr, col - dc) !== '' || this.letterAt(endRow + dr, endCol + dc) !== '') return -1;
    let crossings = 0;
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const cell = r * this.side + c;
      const letter = this.letters[cell];
      if (letter !== '') {
        if (letter !== word[i] || this.covered[cell].has(direction)) return -1;
        crossings++;
      } else if (this.letterAt(r - pr, c - pc) !== '' || this.letterAt(r + pr, c + pc) !== '') {
        // A new letter beside another word would spell a run that is not in the list.
        return -1;
      }
    }
    return crossings;
  }

  place(word: string, row: number, col: number, direction: FillInDirection): void {
    const [dr, dc] = STEPS[direction];
    [...word].forEach((letter, i) => {
      const cell = (row + dr * i) * this.side + col + dc * i;
      this.letters[cell] = letter;
      this.covered[cell].add(direction);
    });
    this.placed.push({ word, row, col, direction });
  }

  /** Every placement of the word that crosses at least one letter, with the most crossings. */
  bestPlacements(word: readonly string[]): Placement[] {
    let best: Placement[] = [];
    let most = 1;
    const seen = new Set<string>();
    for (let cell = 0; cell < this.letters.length; cell++) {
      const letter = this.letters[cell];
      if (letter === '') continue;
      const row = Math.floor(cell / this.side);
      const col = cell % this.side;
      for (const direction of ['across', 'down'] as const) {
        if (this.covered[cell].has(direction)) continue;
        const [dr, dc] = STEPS[direction];
        for (let i = 0; i < word.length; i++) {
          if (word[i] !== letter) continue;
          const start = { row: row - dr * i, col: col - dc * i };
          const key = `${start.row},${start.col},${direction}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const crossings = this.crossings(word, start.row, start.col, direction);
          if (crossings < most) continue;
          if (crossings > most) {
            most = crossings;
            best = [];
          }
          best.push({ ...start, direction, crossings });
        }
      }
    }
    return best;
  }
}

/** The words of the list a band may use: its length range, its alphabet, each once, most frequent first. */
function poolOf(list: WordList, band: FillInBand): string[] {
  const pattern = gridPattern(list.language);
  const pool: string[] = [];
  const seen = new Set<string>();
  for (const word of list.words) {
    if (pool.length >= POOL_SIZE) break;
    const length = [...word].length;
    if (length < band.minLength || length > band.maxLength || !pattern.test(word) || seen.has(word)) continue;
    seen.add(word);
    pool.push(word);
  }
  return pool;
}

function build(pool: readonly string[], band: FillInBand, random: Random): Board | null {
  const board = new Board(band.side);
  const order = random.shuffle(pool.slice());
  const used = new Set<string>();
  // The first word goes across the middle row, centred, so the others can cross it both ways.
  const first = order.find(word => [...word].length >= Math.min(band.maxLength, band.side) - 1) ?? order[0];
  const firstLength = [...first].length;
  board.place(first, Math.floor(band.side / 2), Math.floor((band.side - firstLength) / 2), 'across');
  used.add(first);
  let tries = 0;
  for (const word of order) {
    if (board.placed.length >= band.maxWords || tries >= CANDIDATE_TRIES) break;
    if (used.has(word)) continue;
    tries++;
    const placements = board.bestPlacements([...word]);
    if (placements.length === 0) continue;
    const { row, col, direction } = random.pick(placements);
    board.place(word, row, col, direction);
    used.add(word);
  }
  return board.placed.length >= band.minWords ? board : null;
}

/** The board cropped to the rows and columns its words use. */
function crop(board: Board): { width: number; height: number; solution: string[]; slots: FillInSlot[] } {
  const { side } = board;
  let top = side;
  let left = side;
  let bottom = -1;
  let right = -1;
  board.letters.forEach((letter, cell) => {
    if (letter === '') return;
    const row = Math.floor(cell / side);
    const col = cell % side;
    top = Math.min(top, row);
    bottom = Math.max(bottom, row);
    left = Math.min(left, col);
    right = Math.max(right, col);
  });
  const width = right - left + 1;
  const height = bottom - top + 1;
  const solution: string[] = [];
  for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) solution.push(board.letters[row * side + col]);
  const slots = board.placed.map(({ word, row, col, direction }) => {
    const [dr, dc] = STEPS[direction];
    const cells = [...word].map((_, i) => (row - top + dr * i) * width + (col - left + dc * i));
    return { word, direction, cells };
  });
  return { width, height, solution, slots };
}

/**
 * Counts the ways the words fill the slots, up to `limit`, with the given letters fixed in place.
 * Each word goes in exactly one slot of its length; crossing slots share their letter.
 */
export function solveFillIn(
  slots: readonly Pick<FillInSlot, 'cells'>[],
  words: readonly string[],
  givens: ReadonlyMap<number, string>,
  limit: number,
): FillInSolveResult {
  const size = Math.max(0, ...slots.flatMap(slot => slot.cells)) + 1;
  const letters = new Array<string>(size).fill('');
  for (const [cell, letter] of givens) letters[cell] = letter;
  const split = words.map(word => [...word]);
  const used = new Array<boolean>(words.length).fill(false);
  const filled = new Array<boolean>(slots.length).fill(false);
  const result: FillInSolveResult = { count: 0, solutions: [] };
  if (words.length !== slots.length) return result;

  const fits = (slot: number, word: number): boolean => {
    const { cells } = slots[slot];
    const chars = split[word];
    return chars.length === cells.length && cells.every((cell, i) => letters[cell] === '' || letters[cell] === chars[i]);
  };

  const search = (): void => {
    // The open slot with the fewest words that fit it goes first; a slot none fits ends the branch.
    let pick = -1;
    let options: number[] = [];
    for (let slot = 0; slot < slots.length; slot++) {
      if (filled[slot]) continue;
      const fitting: number[] = [];
      for (let word = 0; word < split.length; word++) if (!used[word] && fits(slot, word)) fitting.push(word);
      if (fitting.length === 0) return;
      if (pick === -1 || fitting.length < options.length) {
        pick = slot;
        options = fitting;
        if (fitting.length === 1) break;
      }
    }
    if (pick === -1) {
      result.count++;
      result.solutions.push(letters.slice());
      return;
    }
    const { cells } = slots[pick];
    for (const word of options) {
      const before = cells.map(cell => letters[cell]);
      cells.forEach((cell, i) => (letters[cell] = split[word][i]));
      used[word] = true;
      filled[pick] = true;
      search();
      filled[pick] = false;
      used[word] = false;
      cells.forEach((cell, i) => (letters[cell] = before[i]));
      if (result.count >= limit) return;
    }
  };
  search();
  return result;
}

/** The printed list's order: shortest first, then alphabetical by code point, the same everywhere. */
function listOrder(a: string, b: string): number {
  return [...a].length - [...b].length || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * A fill-in from the seed, in the list's language, at the band's size. Throws on a band fill-in
 * does not offer, or when no grid of the band comes out of the attempts.
 */
export function generateFillIn(seed: string, difficulty: Difficulty, list: WordList): FillIn {
  const band = FILL_IN_BANDS[difficulty];
  if (!band) throw new RangeError(`a fill-in offers ${Object.keys(FILL_IN_BANDS).join(', ')}, not ${difficulty}`);
  const pool = poolOf(list, band);
  if (pool.length < band.maxWords) throw new RangeError(`the ${list.language} list has only ${pool.length} words of ${band.minLength} to ${band.maxLength} letters`);

  for (let attempt = 0; attempt < FILL_IN_ATTEMPTS; attempt++) {
    const random = createRandom(childSeed(seed, attempt));
    const board = build(pool, band, random);
    if (!board) continue;
    const { width, height, solution, slots } = crop(board);
    const words = slots.map(slot => slot.word).sort(listOrder);
    const givens = new Map<number, string>();
    if (band.starter) {
      const starter = random.pick(slots);
      for (const cell of starter.cells) givens.set(cell, solution[cell]);
    }
    const starterCount = givens.size;
    // Each second solution is cut off by printing one letter it gets wrong; the puzzle's own
    // solution always remains, so the loop ends.
    for (;;) {
      const solved = solveFillIn(slots, words, givens, 2);
      if (solved.count === 1) break;
      const other = solved.solutions.find(grid => grid.some((letter, cell) => letter !== solution[cell]));
      if (!other) throw new Error(`the solver lost the fill-in's own solution from seed «${seed}»`);
      const differing = other.map((letter, cell) => (letter !== solution[cell] ? cell : -1)).filter(cell => cell >= 0);
      const cell = random.pick(differing);
      givens.set(cell, solution[cell]);
    }
    return {
      id: { game: 'fill-in', size: list.language.toUpperCase(), difficulty, seed },
      width,
      height,
      solution,
      slots,
      words,
      givens: [...givens.keys()].sort((a, b) => a - b),
      rating: { givens: givens.size, revealed: givens.size - starterCount },
    };
  }
  throw new Error(`no ${difficulty} fill-in from seed «${seed}» held ${band.minWords} words in ${FILL_IN_ATTEMPTS} attempts`);
}
