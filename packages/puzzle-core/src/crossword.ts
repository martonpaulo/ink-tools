/**
 * Crossword with clues (#400): a European-style grid of 5 x 5 to 13 x 13 in EN, PT, ES, DE or FR,
 * filled from the language's clue bank (`clues/<lang>.json`, written by us), with the answers
 * crossing and every other cell a block.
 *
 * The fill places the bank's answers one by one where they cross the most letters already placed;
 * a new letter never touches a parallel neighbour, so every run of two or more letters is a placed
 * answer. The shared solver then proves one solution: each slot may hold any bank answer of its
 * length printed with the same clue and matching the given letters, and the crossings must agree.
 *
 * The band sets how many letters are printed as givens: a quarter for `easy`, a tenth for
 * `medium`, none for `hard`.
 */

import { type Difficulty, type PuzzleId } from './code';
import { checkCells, readCells, type CheckResult, type InkStroke, type Recognize } from './check';
import { type Grid } from './page/grid';
import { childSeed, createRandom, type Random } from './random';
import { WORD_LANGUAGES, gridPattern, type WordLanguage } from './words';

export interface ClueEntry {
  /** In the language's grid letters (the word lists of #381). */
  answer: string;
  clue: string;
}

export interface ClueBank {
  language: WordLanguage;
  entries: ClueEntry[];
}

export type CrosswordDirection = 'across' | 'down';

export interface CrosswordSlot {
  /** The number printed in its first cell, shared by an across and a down slot that start there. */
  number: number;
  direction: CrosswordDirection;
  answer: string;
  clue: string;
  /** The grid cells of its letters, first letter first (row * size + column). */
  cells: number[];
}

export interface Crossword {
  id: PuzzleId;
  language: WordLanguage;
  size: number;
  /** One letter per cell, row by row, or null for a block. */
  letters: (string | null)[];
  /** The cells whose letter is printed on the page, in grid order. */
  givens: number[];
  /** Across slots first, then down, each by number. */
  slots: CrosswordSlot[];
}

export const CROSSWORD_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const CROSSWORD_LIMITS = { minSide: 5, maxSide: 13, minWord: 3 } as const;
/** The share of letter cells printed as givens. */
export const CROSSWORD_GIVEN_SHARE: Readonly<Record<string, number>> = { easy: 0.25, medium: 0.1, hard: 0 };

const CROSSWORD_ATTEMPTS = 8;
/** An attempt is kept only when its answers fill at least this share of the cells. */
const FILLED_CELLS_FLOOR = 0.34;
/** The first answer spans at least this share of the side, so the fill grows from the middle. */
const FIRST_ANSWER_SHARE = 0.6;
const SIZE_AND_LANGUAGE = /^(\d{1,2})([A-Z]{2})$/;

/** The size token of a puzzle code: the side and the language, `13EN`. */
export function crosswordSizeToken(size: number, language: WordLanguage): string {
  return `${size}${language.toUpperCase()}`;
}

/** The side and the language a size token names, or an error. */
export function parseCrosswordSize(size: string): { size: number; language: WordLanguage } {
  const match = SIZE_AND_LANGUAGE.exec(size.toUpperCase());
  const language = match?.[2].toLowerCase() as WordLanguage | undefined;
  if (!match || !language || !WORD_LANGUAGES.includes(language)) throw new RangeError(`«${size}» is not a crossword size such as 13EN`);
  return { size: Number(match[1]), language };
}

const STEP: Readonly<Record<CrosswordDirection, readonly [number, number]>> = { across: [0, 1], down: [1, 0] };
const DIRECTIONS: readonly CrosswordDirection[] = ['across', 'down'];

interface Fill {
  size: number;
  letters: (string | null)[];
  /** Whether a cell already belongs to an across or a down answer. */
  used: Record<CrosswordDirection, boolean[]>;
  placed: { entry: ClueEntry; direction: CrosswordDirection; cells: number[] }[];
}

function emptyFill(size: number): Fill {
  const cells = size * size;
  return {
    size,
    letters: new Array<string | null>(cells).fill(null),
    used: { across: new Array<boolean>(cells).fill(false), down: new Array<boolean>(cells).fill(false) },
    placed: [],
  };
}

const at = (fill: Fill, row: number, col: number): string | null =>
  row < 0 || col < 0 || row >= fill.size || col >= fill.size ? null : fill.letters[row * fill.size + col];

/**
 * The answer's cells from a start, and how many letters it crosses, or null when it leaves the
 * grid, clashes with a letter, runs on into a letter or sits beside a parallel letter.
 */
function placement(fill: Fill, chars: readonly string[], row: number, col: number, direction: CrosswordDirection): { cells: number[]; crossings: number } | null {
  const [dr, dc] = STEP[direction];
  const length = chars.length;
  if (row < 0 || col < 0 || row + dr * (length - 1) >= fill.size || col + dc * (length - 1) >= fill.size) return null;
  if (at(fill, row - dr, col - dc) !== null || at(fill, row + dr * length, col + dc * length) !== null) return null;
  const cells: number[] = [];
  let crossings = 0;
  for (let i = 0; i < length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const cell = r * fill.size + c;
    const letter = fill.letters[cell];
    if (letter !== null) {
      if (letter !== chars[i] || fill.used[direction][cell]) return null;
      crossings++;
    } else if (at(fill, r - dc, c - dr) !== null || at(fill, r + dc, c + dr) !== null) {
      return null;
    }
    cells.push(cell);
  }
  return { cells, crossings };
}

function place(fill: Fill, entry: ClueEntry, direction: CrosswordDirection, cells: readonly number[]): void {
  const chars = [...entry.answer];
  cells.forEach((cell, i) => {
    fill.letters[cell] = chars[i];
    fill.used[direction][cell] = true;
  });
  fill.placed.push({ entry, direction, cells: [...cells] });
}

/** The best place for the answer: the most crossings, the first found on a tie; null for none. */
function bestPlacement(fill: Fill, entry: ClueEntry): { direction: CrosswordDirection; cells: number[] } | null {
  const chars = [...entry.answer];
  let best: { direction: CrosswordDirection; cells: number[]; crossings: number } | null = null;
  for (let cell = 0; cell < fill.letters.length; cell++) {
    const letter = fill.letters[cell];
    if (letter === null) continue;
    const row = Math.floor(cell / fill.size);
    const col = cell % fill.size;
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] !== letter) continue;
      for (const direction of DIRECTIONS) {
        const [dr, dc] = STEP[direction];
        const found = placement(fill, chars, row - dr * i, col - dc * i, direction);
        if (found && found.crossings > 0 && (!best || found.crossings > best.crossings)) best = { direction, ...found };
      }
    }
  }
  return best;
}

/** One fill: the first answer long enough across the middle row, then every answer that crosses. */
function fillGrid(size: number, entries: readonly ClueEntry[], random: Random): Fill {
  const fill = emptyFill(size);
  const order = random.shuffle([...entries]);
  const longest = Math.max(...order.map(entry => [...entry.answer].length));
  const firstLength = Math.min(longest, Math.ceil(size * FIRST_ANSWER_SHARE));
  const first = order.findIndex(entry => [...entry.answer].length >= firstLength);
  const [opening] = order.splice(first, 1);
  const length = [...opening.answer].length;
  const row = Math.floor(size / 2);
  const col = random.int(size - length + 1);
  const start = placement(fill, [...opening.answer], row, col, 'across');
  if (!start) throw new Error(`«${opening.answer}» does not fit across a ${size}-cell row`);
  place(fill, opening, 'across', start.cells);
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < order.length; i++) {
      const found = bestPlacement(fill, order[i]);
      if (!found) continue;
      place(fill, order[i], found.direction, found.cells);
      order.splice(i, 1);
      i--;
      progress = true;
    }
  }
  return fill;
}

/** Every run of two or more letters, across then down, as cell lists. */
function letterRuns(size: number, letters: readonly (string | null)[]): { direction: CrosswordDirection; cells: number[] }[] {
  const runs: { direction: CrosswordDirection; cells: number[] }[] = [];
  for (const direction of DIRECTIONS) {
    for (let line = 0; line < size; line++) {
      let run: number[] = [];
      for (let i = 0; i <= size; i++) {
        const cell = direction === 'across' ? line * size + i : i * size + line;
        if (i < size && letters[cell] !== null) {
          run.push(cell);
          continue;
        }
        if (run.length > 1) runs.push({ direction, cells: run });
        run = [];
      }
    }
  }
  return runs;
}

/** Numbers the slots in reading order of their first cell, the way printed crosswords do. */
function numberSlots(size: number, fill: Fill): CrosswordSlot[] {
  const starts = [...new Set(fill.placed.map(p => p.cells[0]))].sort((a, b) => a - b);
  const numberOf = new Map(starts.map((cell, i) => [cell, i + 1]));
  const slots = fill.placed.map(p => ({
    number: numberOf.get(p.cells[0]) as number,
    direction: p.direction,
    answer: p.entry.answer,
    clue: p.entry.clue,
    cells: p.cells,
  }));
  slots.sort((a, b) => (a.direction === b.direction ? a.number - b.number : a.direction === 'across' ? -1 : 1));
  if (letterRuns(size, fill.letters).length !== slots.length) throw new Error('a crossword fill left a run of letters that is not an answer');
  return slots;
}

/**
 * How many fills the solver finds, up to the limit: each slot takes a bank answer of its length
 * printed with its clue, agreeing with the givens and with every crossing slot.
 */
export function countCrosswordSolutions(
  puzzle: Pick<Crossword, 'size' | 'letters' | 'givens' | 'slots'>,
  bank: ClueBank,
  limit = 2,
): number {
  const byClue = new Map<string, string[][]>();
  for (const entry of bank.entries) {
    const list = byClue.get(entry.clue);
    if (list) list.push([...entry.answer]);
    else byClue.set(entry.clue, [[...entry.answer]]);
  }
  const grid = new Array<string | null>(puzzle.size * puzzle.size).fill(null);
  for (const cell of puzzle.givens) grid[cell] = puzzle.letters[cell];
  const domains = puzzle.slots.map(slot =>
    (byClue.get(slot.clue) ?? []).filter(chars => chars.length === slot.cells.length && slot.cells.every((cell, i) => grid[cell] === null || grid[cell] === chars[i])),
  );
  // The most constrained slots first, ties by their place in the list, so the search is the same everywhere.
  const order = puzzle.slots.map((_, i) => i).sort((a, b) => domains[a].length - domains[b].length || a - b);
  let found = 0;
  const search = (depth: number): void => {
    if (found >= limit) return;
    if (depth === order.length) {
      found++;
      return;
    }
    const slot = puzzle.slots[order[depth]];
    for (const chars of domains[order[depth]]) {
      if (!slot.cells.every((cell, i) => grid[cell] === null || grid[cell] === chars[i])) continue;
      // Only the cells this answer filled are cleared again: givens and crossings stay.
      const filled = slot.cells.filter(cell => grid[cell] === null);
      slot.cells.forEach((cell, i) => (grid[cell] = chars[i]));
      search(depth + 1);
      for (const cell of filled) grid[cell] = null;
      if (found >= limit) return;
    }
  };
  search(0);
  return found;
}

/** The bank answers that fit a side, in the language's grid letters; throws on a stray letter. */
function usableEntries(bank: ClueBank, size: number): ClueEntry[] {
  const pattern = gridPattern(bank.language);
  for (const entry of bank.entries) {
    if (!pattern.test(entry.answer)) throw new RangeError(`«${entry.answer}» is not in the ${bank.language} grid letters`);
  }
  return bank.entries.filter(entry => {
    const length = [...entry.answer].length;
    return length >= CROSSWORD_LIMITS.minWord && length <= size;
  });
}

/**
 * A crossword of the given side and band from the seed and the bank. The fullest of the attempts
 * with exactly one solution wins, the first on a tie. Throws on a side or band out of range, or
 * when no attempt fills enough of the grid with one solution.
 */
export function generateCrossword(seed: string, size: number, difficulty: Difficulty, bank: ClueBank): Crossword {
  if (!Number.isInteger(size) || size < CROSSWORD_LIMITS.minSide || size > CROSSWORD_LIMITS.maxSide) {
    throw new RangeError(`a crossword side is ${CROSSWORD_LIMITS.minSide} to ${CROSSWORD_LIMITS.maxSide} cells, not ${size}`);
  }
  if (!CROSSWORD_BANDS.includes(difficulty)) throw new RangeError(`a crossword offers ${CROSSWORD_BANDS.join(', ')}, not ${difficulty}`);
  const entries = usableEntries(bank, size);
  if (entries.length === 0) throw new RangeError(`the ${bank.language} clue bank has no answer of ${CROSSWORD_LIMITS.minWord} to ${size} letters`);
  const id: PuzzleId = { game: 'crossword', size: crosswordSizeToken(size, bank.language), difficulty, seed };

  let best: Crossword | null = null;
  let bestLetters = 0;
  for (let attempt = 0; attempt < CROSSWORD_ATTEMPTS; attempt++) {
    const random = createRandom(childSeed(seed, attempt));
    const fill = fillGrid(size, entries, random);
    const letterCells = fill.letters.flatMap((letter, cell) => (letter === null ? [] : [cell]));
    if (letterCells.length < FILLED_CELLS_FLOOR * size * size || letterCells.length <= bestLetters) continue;
    const givenCount = Math.round(letterCells.length * CROSSWORD_GIVEN_SHARE[difficulty]);
    const givens = random.shuffle([...letterCells]).slice(0, givenCount).sort((a, b) => a - b);
    const puzzle: Crossword = { id, language: bank.language, size, letters: fill.letters, givens, slots: numberSlots(size, fill) };
    if (countCrosswordSolutions(puzzle, bank) !== 1) continue;
    best = puzzle;
    bestLetters = letterCells.length;
  }
  if (!best) throw new Error(`no ${size} x ${size} ${bank.language} crossword from seed «${seed}» filled ${Math.ceil(FILLED_CELLS_FLOOR * size * size)} cells with one solution in ${CROSSWORD_ATTEMPTS} attempts`);
  return best;
}

/** Spanish keeps Ñ as its own letter; every other accent is dropped, as the grid writes it. */
function gridLetter(text: string, language: WordLanguage): string {
  return [...text.normalize('NFC')]
    .map(ch => (language === 'es' && ch === 'Ñ' ? ch : ch.normalize('NFD').replace(/\p{M}/gu, '')))
    .join('');
}

/**
 * «Check»: reads the letters the player wrote in the cells that are not givens, one recogniser
 * call per row (#382), folds each read into the grid's letters and names the wrong cells. Letters
 * are best effort: a cell the recogniser cannot read is `unread`, never `wrong`.
 */
export async function checkCrossword<E>(puzzle: Crossword, grid: Grid, strokes: readonly InkStroke<E>[], recognize: Recognize<E>): Promise<CheckResult> {
  if (grid.columns !== puzzle.size || grid.rows !== puzzle.size) throw new Error(`the grid is ${grid.columns} x ${grid.rows}, not the puzzle's ${puzzle.size} x ${puzzle.size}`);
  const expected = new Map<number, string>();
  puzzle.letters.forEach((letter, cell) => {
    if (letter !== null && !puzzle.givens.includes(cell)) expected.set(cell, letter);
  });
  const reads = await readCells(grid, strokes, [...expected.keys()], recognize, 'letter');
  const folded = reads.map(read => (read.status === 'read' ? { ...read, text: gridLetter(read.text, puzzle.language) } : read));
  return checkCells(expected, folded, 'letter');
}
