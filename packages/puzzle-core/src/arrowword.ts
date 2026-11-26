/**
 * Arrowword (#401): a square grid whose clue cells hold the clues, each with an arrow to its answer
 * (palavras cruzadas diretas, Schwedenrätsel, mots fléchés, autodefinido). The top row and the left
 * column are clue cells; the clue cells inside the grid break the rows and columns into answers.
 * Every answer starts right after its clue cell: an across answer to its right, a down answer below
 * it, so a clue cell holds at most two clues. Every letter cell is in at least one answer.
 *
 * The words and clues come from a clue bank (`ClueBank`): the words already in the language's grid
 * letters, as the word lists of #381 hold them, each with a short clue written by us. A puzzle is
 * kept only when the solver, which knows only the clues and the answer lengths, finds exactly one
 * way to fill the grid.
 */

import { type Difficulty, type PuzzleId } from './code';
import { childSeed, createRandom, type Random } from './random';
import { type WordLanguage } from './words';

export interface ClueEntry {
  /** The answer, in the language's grid letters. */
  word: string;
  clue: string;
}

export interface ClueBank {
  language: WordLanguage;
  /** Every letter an answer may hold. */
  alphabet: string;
  entries: ClueEntry[];
}

export type ArrowDirection = 'across' | 'down';

export interface ArrowwordSlot {
  /** The clue cell that holds the clue (row * columns + column). */
  clueCell: number;
  direction: ArrowDirection;
  /** The answer's cells, first letter first. */
  cells: number[];
  clue: string;
  word: string;
}

export interface Arrowword {
  id: PuzzleId;
  language: WordLanguage;
  columns: number;
  rows: number;
  /** One letter per cell, row by row; '' for a clue cell. */
  solution: string[];
  /** Across slots first, then down, each in cell order. */
  slots: ArrowwordSlot[];
}

/** The grid side (clue frame included), the chance of a clue cell inside and the longest answer, by band. */
export const ARROWWORD_BANDS: Readonly<Record<string, { side: number; clueChance: number; maxWord: number }>> = {
  easy: { side: 7, clueChance: 30, maxWord: 5 },
  medium: { side: 8, clueChance: 26, maxWord: 6 },
  hard: { side: 9, clueChance: 24, maxWord: 6 },
};
export const ARROWWORD_DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const MIN_WORD = 2;

const ATTEMPTS = 157;
const PATTERN_TRIES = 233;
/** The search steps one fill or one solution count may take before it gives up. */
const FILL_BUDGET = 1600;
const COUNT_BUDGET = 24000;
/** The solver stops at two: one is the only count a puzzle may have. */
const COUNT_LIMIT = 2;

interface Shape {
  columns: number;
  rows: number;
  clue: boolean[];
  slots: { clueCell: number; direction: ArrowDirection; cells: number[] }[];
}

/** The runs of letter cells in each row and column, two cells or more: the answers a pattern makes. */
function runsOf(columns: number, rows: number, clue: readonly boolean[]): Shape['slots'] {
  const slots: Shape['slots'] = [];
  const lines: [ArrowDirection, number, number, number][] = [];
  for (let r = 0; r < rows; r++) lines.push(['across', r * columns, 1, columns]);
  for (let c = 0; c < columns; c++) lines.push(['down', c, columns, rows]);
  for (const [direction, start, step, length] of lines) {
    let i = 0;
    while (i < length) {
      if (clue[start + i * step]) {
        i++;
        continue;
      }
      const cells: number[] = [];
      while (i < length && !clue[start + i * step]) cells.push(start + i++ * step);
      if (cells.length >= MIN_WORD) slots.push({ clueCell: cells[0] - step, direction, cells });
    }
  }
  return slots;
}

/**
 * The answers a clue pattern makes, or null when it breaks a rule of the grid: the top row and the
 * left column are clue cells, every letter cell is in an answer, and no answer is longer than
 * `maxWord`. A clue cell inside may hold no clue; the page shades it.
 */
export function arrowwordSlots(columns: number, rows: number, clue: readonly boolean[], maxWord = Infinity): Shape['slots'] | null {
  for (let cell = 0; cell < columns * rows; cell++) {
    if ((cell < columns || cell % columns === 0) && !clue[cell]) return null;
  }
  const slots = runsOf(columns, rows, clue);
  if (slots.some(slot => slot.cells.length > maxWord)) return null;
  const covered = new Set(slots.flatMap(slot => slot.cells));
  if (clue.some((isClue, cell) => !isClue && !covered.has(cell))) return null;
  return slots;
}

/** A clue cell that holds no clue, the corner included. */
export function emptyClueCells(puzzle: Pick<Arrowword, 'columns' | 'rows' | 'solution' | 'slots'>): number[] {
  const holding = new Set(puzzle.slots.map(slot => slot.clueCell));
  return puzzle.solution.flatMap((letter, cell) => (letter === '' && !holding.has(cell) ? [cell] : []));
}

/**
 * A random pattern of the band, repaired: a run longer than the longest answer gets a clue cell at
 * a random place two or more cells from its ends, and a letter cell in no answer becomes a clue
 * cell. A pattern with more empty clue cells than the side is drawn again.
 */
function drawShape(side: number, clueChance: number, maxWord: number, random: Random): Shape | null {
  const total = side * side;
  for (let t = 0; t < PATTERN_TRIES; t++) {
    const clue = new Array<boolean>(total).fill(false);
    for (let cell = 0; cell < total; cell++) clue[cell] = cell < side || cell % side === 0 || random.chance(clueChance);
    for (let round = 0; round < total; round++) {
      const slots = runsOf(side, side, clue);
      const long = slots.find(slot => slot.cells.length > maxWord);
      if (long) {
        clue[long.cells[MIN_WORD + random.int(long.cells.length - 2 * MIN_WORD)]] = true;
        continue;
      }
      const covered = new Set(slots.flatMap(slot => slot.cells));
      const lone = clue.findIndex((isClue, cell) => !isClue && !covered.has(cell));
      if (lone < 0) break;
      clue[lone] = true;
    }
    const slots = arrowwordSlots(side, side, clue, maxWord);
    if (!slots) continue;
    const holding = new Set(slots.map(slot => slot.clueCell));
    const empty = clue.filter((isClue, cell) => isClue && !holding.has(cell)).length;
    if (empty <= side) return { columns: side, rows: side, clue, slots };
  }
  return null;
}

/** For each slot, the other slots it crosses: [its position, the other slot, the other's position]. */
function crossingsOf(slots: readonly { cells: readonly number[] }[]): [number, number, number][][] {
  const byCell = new Map<number, [number, number][]>();
  slots.forEach((slot, s) => slot.cells.forEach((cell, p) => byCell.set(cell, [...(byCell.get(cell) ?? []), [s, p]])));
  return slots.map((slot, s) =>
    slot.cells.flatMap((cell, p) => (byCell.get(cell) ?? []).filter(([other]) => other !== s).map(([other, q]) => [p, other, q] as [number, number, number])),
  );
}

interface SearchOptions {
  limit: number;
  budget: number;
  /** When set, the candidates are tried in a shuffled order and no word is used twice. */
  random?: Random;
}

/**
 * Fills the slots from their candidate words, crossing letters agreeing: the most constrained slot
 * first, each choice narrowing its crossing slots. Answers the solutions found, at most `limit`,
 * and whether it ran out of steps first.
 */
function searchSlots(domains: readonly string[][], crossings: readonly [number, number, number][][], options: SearchOptions): { solutions: string[][]; exhausted: boolean } {
  const count = domains.length;
  const chosen = new Array<string>(count).fill('');
  const used = new Set<string>();
  const solutions: string[][] = [];
  let steps = 0;
  let exhausted = false;

  const visit = (current: string[][], filled: number): void => {
    if (solutions.length >= options.limit || exhausted) return;
    if (filled === count) {
      solutions.push(chosen.slice());
      return;
    }
    let best = -1;
    for (let s = 0; s < count; s++) {
      if (chosen[s] === '' && (best < 0 || current[s].length < current[best].length)) best = s;
    }
    const candidates = options.random ? options.random.shuffle(current[best].slice()) : current[best];
    for (const word of candidates) {
      if (options.random && used.has(word)) continue;
      if (++steps > options.budget) {
        exhausted = true;
        return;
      }
      const next = current.slice();
      let dead = false;
      for (const [p, other, q] of crossings[best]) {
        if (chosen[other] !== '') continue;
        const narrowed = next[other].filter(candidate => candidate[q] === word[p]);
        if (narrowed.length === 0) {
          dead = true;
          break;
        }
        next[other] = narrowed;
      }
      if (dead) continue;
      chosen[best] = word;
      used.add(word);
      visit(next, filled + 1);
      chosen[best] = '';
      used.delete(word);
      if (solutions.length >= options.limit || exhausted) return;
    }
  };
  visit(domains.map(domain => domain.slice()), 0);
  return { solutions, exhausted };
}

/** Letters are compared by code unit, so the alphabet holds one per letter (Ñ is one). */
function checkBank(bank: ClueBank): void {
  const alphabet = [...bank.alphabet];
  if (alphabet.some(ch => ch.length !== 1)) throw new RangeError('an arrowword alphabet holds one code unit per letter');
  for (const { word, clue } of bank.entries) {
    if (word.length < MIN_WORD) throw new RangeError(`«${word}» is shorter than ${MIN_WORD} letters`);
    const stray = [...word].find(ch => !alphabet.includes(ch));
    if (stray) throw new RangeError(`«${word}» has «${stray}», which is not in the grid's alphabet`);
    if (clue.trim() === '') throw new RangeError(`«${word}» has an empty clue`);
  }
}

/**
 * The number of ways to fill the puzzle's grid from the clue bank, knowing only each slot's clue
 * and length: 0, 1, or 2 for two or more. Throws when the search runs out of steps, so an unproved
 * puzzle is never taken as unique.
 */
export function countArrowwordSolutions(puzzle: Pick<Arrowword, 'slots'>, bank: ClueBank): number {
  const byClue = new Map<string, string[]>();
  for (const { word, clue } of bank.entries) {
    const list = byClue.get(clue) ?? [];
    if (!list.includes(word)) list.push(word);
    byClue.set(clue, list);
  }
  const domains = puzzle.slots.map(slot => (byClue.get(slot.clue) ?? []).filter(word => word.length === slot.cells.length));
  const result = searchSlots(domains, crossingsOf(puzzle.slots), { limit: COUNT_LIMIT, budget: COUNT_BUDGET });
  if (result.exhausted) throw new Error(`the solver ran out of ${COUNT_BUDGET} steps before it counted the solutions`);
  return result.solutions.length;
}

/**
 * An arrowword of the band from the seed and the clue bank, with exactly one solution. Throws on a
 * bank word outside the alphabet or too short, or when no grid with one solution is found in the
 * attempts.
 */
export function generateArrowword(seed: string, difficulty: Difficulty, bank: ClueBank): Arrowword {
  const band = ARROWWORD_BANDS[difficulty];
  if (!band || !ARROWWORD_DIFFICULTIES.includes(difficulty)) throw new RangeError(`an arrowword offers ${ARROWWORD_DIFFICULTIES.join(', ')}, not ${difficulty}`);
  checkBank(bank);
  const byLength = new Map<number, string[]>();
  const cluesOf = new Map<string, string[]>();
  for (const { word, clue } of bank.entries) {
    const clues = cluesOf.get(word);
    if (clues) {
      if (!clues.includes(clue)) clues.push(clue);
      continue;
    }
    cluesOf.set(word, [clue]);
    byLength.set(word.length, [...(byLength.get(word.length) ?? []), word]);
  }

  let reason = 'no clue pattern fitted the band';
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const random = createRandom(childSeed(seed, attempt));
    const shape = drawShape(band.side, band.clueChance, band.maxWord, random);
    if (!shape) continue;
    const domains = shape.slots.map(slot => byLength.get(slot.cells.length) ?? []);
    if (domains.some(domain => domain.length === 0)) {
      reason = 'the bank has no word of a length the grid needs';
      continue;
    }
    const fill = searchSlots(domains, crossingsOf(shape.slots), { limit: 1, budget: FILL_BUDGET, random });
    if (fill.solutions.length === 0) {
      reason = 'no fill of the grid from the bank was found';
      continue;
    }
    const words = fill.solutions[0];
    const slots = shape.slots.map((slot, s) => ({ ...slot, word: words[s], clue: random.pick(cluesOf.get(words[s]) ?? []) }));
    let solutions: number;
    try {
      solutions = countArrowwordSolutions({ slots }, bank);
    } catch {
      reason = 'the solver could not prove one solution';
      continue;
    }
    if (solutions !== 1) {
      reason = 'every fill had more than one solution';
      continue;
    }
    const solution = new Array<string>(shape.columns * shape.rows).fill('');
    for (const slot of slots) slot.cells.forEach((cell, i) => (solution[cell] = slot.word[i]));
    return {
      id: { game: 'arrowword', size: `${bank.language.toUpperCase()}${shape.columns}X${shape.rows}`, difficulty, seed },
      language: bank.language,
      columns: shape.columns,
      rows: shape.rows,
      solution,
      slots,
    };
  }
  throw new Error(`no ${difficulty} arrowword from seed «${seed}» in ${ATTEMPTS} attempts: ${reason}`);
}

/** The letter each letter cell expects, for «Check» and «Show solution». */
export function arrowwordAnswers(puzzle: Pick<Arrowword, 'solution'>): Map<number, string> {
  const answers = new Map<number, string>();
  puzzle.solution.forEach((letter, cell) => letter !== '' && answers.set(cell, letter));
  return answers;
}
